import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { detailCanvas, texDetail } from './texDetail';
import { markShared } from './dispose';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

let hullCache: CanvasTexture | null = null;

/**
 * Rumpfplanken der zweiten Schiffsfassung: hell und neutral (Mittelgrau um 200), damit die Vertexfarben des Rumpfs
 * (Rumpffarbe, Schmuckband, Berghölzer) sauber durchkommen. Zeigt Plankengänge mit Stoßfugen und Nagelreihen,
 * feine Maserung und wenige Astlöcher, aber kaum Salzstreifen (die kommen aus den Vertexfarben).
 * Eine Kachel deckt in der Rumpf-UV 4 m Länge und 1,8 m Höhe ab, acht Gänge von je 0,23 m.
 */
export function hullPlankTexture(): CanvasTexture {
  if (hullCache) return hullCache;
  const { c, g } = detailCanvas(256, 256);
  const r = rng(53);
  g.fillStyle = '#c8c8c8';
  g.fillRect(0, 0, 256, 256);
  const rows = 8, h = 256 / rows;
  for (let i = 0; i < rows; i++) {
    const tone = 188 + Math.floor(r() * 30);
    g.fillStyle = `rgb(${tone},${tone},${tone})`;
    g.fillRect(0, i * h, 256, h);
    // Maserung
    for (let k = 0; k < 6; k++) {
      const y = i * h + 3 + r() * (h - 6);
      const dk = r() < 0.4;
      g.strokeStyle = dk ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.05)';
      g.lineWidth = dk ? 1.1 : 0.9;
      g.beginPath();
      g.moveTo(0, y);
      const ph = r() * 6, amp = 0.5 + r() * 1.3;
      for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.04 + ph) * amp);
      g.stroke();
    }
    if (r() < 0.35) {
      const kx = 16 + r() * 224, ky = i * h + h * 0.5;
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.beginPath(); g.ellipse(kx, ky, 4 + r() * 3, 2.4 + r() * 1.4, 0, 0, Math.PI * 2); g.fill();
    }
    // Stoßfugen versetzt, je Gang eigener Abstand
    const off = (i * 53 + Math.floor(r() * 40)) % 128;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let x = off; x < 256; x += 128) g.fillRect(x, i * h, 1.6, h);
    // Holznägel an den Stößen
    g.fillStyle = 'rgba(0,0,0,0.34)';
    for (let x = off + 5; x < 256; x += 128) { g.fillRect(x, i * h + 5, 2.4, 2.4); g.fillRect(x, i * h + h - 8, 2.4, 2.4); }
    // Plankenfuge mit Pech (dunkel) und heller Kante darüber
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(0, i * h + h - 2.4, 256, 2.4);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, i * h, 256, 1.2);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = texDetail.aniso;
  hullCache = markShared(t);
  return t;
}
