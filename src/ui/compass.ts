import { drawPoi, type PoiKind } from './minimap';

/** Ein Punkt für die Kompassleiste: Richtung als Winkel wie in der Welt (atan2(dx, dz)) und Entfernung in Metern */
export interface CompassPoi { bearing: number; dist: number; kind: PoiKind; name?: string }

const W = 420;
const H = 46;
/** Sichtfeld der Leiste: ± so viele Radiant um die Blickrichtung */
const HALF = (100 * Math.PI) / 180;

/**
 * Kompassleiste am oberen Bildschirmrand: Himmelsrichtungen, Gradskala und Orientierungspunkte
 * (rote Punkte = Feinde, Totenkopf = Boss, ! = Auftragsperson, ? = Abgabe, Stern = Ziel).
 * Osten liegt in dieser Welt bei −x: schaut man nach Norden (+z), liegt rechts Osten.
 */
export class Compass {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private last = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('canvas');
    this.el.className = 'compass';
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.el.width = W * dpr;
    this.el.height = H * dpr;
    this.el.style.setProperty('--cw', `${W}px`);
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.ctx = this.el.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
  }

  setVisible(v: boolean) { this.el.hidden = !v; }

  /** yaw: Blickrichtung der Kamera (Welt, wie cameraYaw). Zeichnet nur bei Änderung. */
  update(yaw: number, pois: CompassPoi[]) {
    if (this.el.hidden) return;
    const key = yaw.toFixed(3) + pois.map((p) => `${p.kind}${p.bearing.toFixed(2)}${Math.round(p.dist / 5)}`).join();
    if (key === this.last) return;
    this.last = key;
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    // Winkel relativ zur Blickrichtung, rechts positiv
    const x = (rel: number) => W / 2 + (rel / HALF) * (W / 2);
    // Hintergrundband mit weichen Rändern
    const bg = g.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0, 'rgba(11,15,20,0)'); bg.addColorStop(0.12, 'rgba(11,15,20,0.62)'); bg.addColorStop(0.88, 'rgba(11,15,20,0.62)'); bg.addColorStop(1, 'rgba(11,15,20,0)');
    g.fillStyle = bg;
    g.fillRect(0, 12, W, 30);
    // Skala: alle 15°, Beschriftung alle 45° (Kompasswinkel = −Weltwinkel)
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 15) {
      // Kompasswinkel deg (im Uhrzeigersinn von Norden) entspricht Weltwinkel −deg; rechts positiv: r = deg + yaw
      const r = wrap((deg * Math.PI) / 180 + yaw);
      if (Math.abs(r) > HALF) continue;
      const px = x(r);
      const alpha = 1 - Math.abs(r) / HALF * 0.7;
      const card = deg % 90 === 0;
      g.strokeStyle = `rgba(244,226,184,${(card ? 0.95 : 0.55) * alpha})`;
      g.lineWidth = card ? 2 : 1;
      g.beginPath(); g.moveTo(px, deg % 45 === 0 ? 30 : 34); g.lineTo(px, 41); g.stroke();
      if (deg % 45 === 0) {
        const label = deg === 0 ? 'N' : deg === 90 ? 'O' : deg === 180 ? 'S' : deg === 270 ? 'W' : deg === 45 ? 'NO' : deg === 135 ? 'SO' : deg === 225 ? 'SW' : 'NW';
        g.font = card ? '900 15px sans-serif' : '700 10px sans-serif';
        g.fillStyle = deg === 0 ? `rgba(255,209,102,${alpha})` : `rgba(244,226,184,${alpha})`;
        g.fillText(label, px, 21);
      }
    }
    // Mittenmarke (Blickrichtung)
    g.fillStyle = '#E3B04B';
    g.beginPath(); g.moveTo(W / 2 - 5, 3); g.lineTo(W / 2 + 5, 3); g.lineTo(W / 2, 11); g.closePath(); g.fill();
    // Orientierungspunkte; weit entfernte Feinde blenden aus, außerhalb des Sichtfelds klemmt Ziel/Boss/Auftrag am Rand
    for (const p of pois) {
      const rel = wrap(yaw - p.bearing);
      const inside = Math.abs(rel) <= HALF;
      if (!inside && p.kind !== 'target' && p.kind !== 'boss' && p.kind !== 'quest' && p.kind !== 'turnin') continue;
      const px = inside ? x(rel) : (rel > 0 ? W - 14 : 14);
      const fade = p.kind === 'enemy' ? Math.max(0.35, 1 - p.dist / 260) : 1;
      g.globalAlpha = inside ? fade : 0.55;
      drawPoi(g, px, 33, p.kind, p.kind === 'enemy' ? 0.8 : 1);
      g.globalAlpha = 1;
      if (inside && (p.kind === 'target' || p.kind === 'boss' || p.kind === 'quest' || p.kind === 'turnin') && p.dist > 25) {
        g.font = '700 9px sans-serif'; g.fillStyle = '#F4EEDC'; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 2.5;
        const t = p.dist >= 1000 ? `${(p.dist / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(p.dist / 10) * 10} m`;
        g.strokeText(t, px, 45); g.fillText(t, px, 45);
      }
    }
    g.textBaseline = 'alphabetic';
  }
}
