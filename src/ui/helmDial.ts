import { wrapAngle } from '../core/mathUtil';
import type { CompassSector } from './compass';

const S = 120;
const CX = S / 2;
const TAU = Math.PI * 2;

export interface HelmState {
  /** Kurs des Schiffs (Weltwinkel wie `Ship.heading`) */
  heading: number;
  /** Windrichtung relativ zum Bug (Weltwinkel-Unterschied); die Nadel zeigt, wohin der Wind weht */
  windRel: number;
  /** Windstärke 0 … 1 (0 = Flaute) */
  wind: number;
  sector: CompassSector | null;
}

/**
 * Steuerkompass (nur auf See): gedrehte Kompassrose mit Messingring, feste Kurs-Marke oben, Kurs in Grad und Himmelsrichtung,
 * eine klare Windnadel (die Spitze zeigt, wohin der Wind weht) und fünf Stärke-Punkte. Darunter die Plakette des Sektors.
 * Osten liegt in dieser Welt bei −x: der Kompasswinkel ist der negative Weltwinkel.
 */
export class HelmDial {
  readonly root: HTMLElement;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private plate: HTMLElement;
  private key = '';
  private dpr = 1;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud-helm';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Steuerkompass');
    this.root.innerHTML = '<canvas></canvas><div class="helm-sector"><i></i><span></span></div>';
    parent.appendChild(this.root);
    this.cv = this.root.querySelector('canvas')!;
    this.plate = this.root.querySelector('.helm-sector')!;
    this.dpr = Math.min(2.5, devicePixelRatio || 1);
    this.cv.width = this.cv.height = Math.round(S * this.dpr);
    this.ctx = this.cv.getContext('2d')!;
    this.ctx.scale(this.dpr, this.dpr);
  }

  setVisible(v: boolean) { this.root.hidden = !v; }

  update(s: HelmState) {
    const deg = (((-s.heading * 180) / Math.PI) % 360 + 360) % 360;
    const pips = Math.max(0, Math.min(5, Math.round(s.wind * 5)));
    const rel = wrapAngle(s.windRel);
    const key = `${Math.round(deg)}|${Math.round((rel * 180) / Math.PI / 2)}|${pips}|${s.sector?.name ?? ''}`;
    if (key === this.key) return;
    this.key = key;
    this.draw(deg, rel, pips);
    const name = s.sector?.name ?? '';
    const label = this.plate.querySelector('span')!;
    if (label.textContent !== name) label.textContent = name;
    this.plate.hidden = !s.sector;
    if (s.sector) this.plate.style.setProperty('--c', s.sector.color);
  }

  private draw(deg: number, rel: number, pips: number) {
    const g = this.ctx;
    g.clearRect(0, 0, S, S);
    // Messingring
    const ring = g.createLinearGradient(8, 8, S - 8, S - 8);
    ring.addColorStop(0, '#fff3c6'); ring.addColorStop(0.2, '#e8c777'); ring.addColorStop(0.42, '#b88a2e'); ring.addColorStop(0.58, '#f0d58a'); ring.addColorStop(0.8, '#8c6620'); ring.addColorStop(1, '#4e350e');
    g.beginPath(); g.arc(CX, CX, 57, 0, TAU); g.fillStyle = ring; g.fill();
    g.lineWidth = 1.2; g.strokeStyle = '#2a1a07'; g.stroke();
    g.beginPath(); g.arc(CX, CX, 49.5, 0, TAU); g.fillStyle = '#20130a'; g.fill();
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,240,190,0.5)'; g.stroke();
    // Glas der Rose
    const face = g.createRadialGradient(CX - 8, CX - 14, 4, CX, CX, 47);
    face.addColorStop(0, '#2b3f50'); face.addColorStop(0.65, '#142029'); face.addColorStop(1, '#0a0f14');
    g.beginPath(); g.arc(CX, CX, 47, 0, TAU); g.fillStyle = face; g.fill();

    // Rose: dreht sich so, dass der Kurs oben liegt
    g.save();
    g.translate(CX, CX);
    g.rotate((deg * Math.PI) / 180 * -1);
    // Windrose: acht Zacken, die Nordspitze ist rot
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const long = i % 2 === 0;
      const len = long ? 36 : 24, w = long ? 5.2 : 3.4;
      g.save(); g.rotate(a);
      g.beginPath(); g.moveTo(0, -len); g.lineTo(w, 0); g.lineTo(0, 4); g.lineTo(-w, 0); g.closePath();
      g.fillStyle = i === 0 ? '#c4452f' : long ? 'rgba(232,199,119,0.5)' : 'rgba(232,199,119,0.25)';
      g.fill();
      g.restore();
    }
    // Teilstriche alle 5°, Beschriftung alle 90°
    for (let i = 0; i < 72; i++) {
      const a = (i * 5 * Math.PI) / 180;
      const long = i % 18 === 0, mid = i % 6 === 0;
      const r1 = 46, r0 = long ? 38.5 : mid ? 41 : 43.5;
      g.beginPath(); g.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0); g.lineTo(Math.sin(a) * r1, -Math.cos(a) * r1);
      g.strokeStyle = long ? '#f4e2ab' : 'rgba(244,226,171,0.62)'; g.lineWidth = long ? 1.8 : 1; g.stroke();
    }
    g.font = "700 11px 'Barlow Semi Condensed', 'Alegreya Sans', sans-serif";
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // Kompass-Beschriftung: Osten = O (deutsch); mit der Rose gedreht, aufrecht zum Rand hin
    const letters: [string, number][] = [['N', 0], ['O', 90], ['S', 180], ['W', 270]];
    for (const [t, d] of letters) {
      const a = (d * Math.PI) / 180;
      g.save(); g.translate(Math.sin(a) * 30, -Math.cos(a) * 30); g.rotate(a);
      g.fillStyle = t === 'N' ? '#ff8a6e' : '#f4e2ab';
      g.fillText(t, 0, 0);
      g.restore();
    }
    g.restore();

    // Windnadel: Spitze = Richtung, in die der Wind weht (relativ zum Bug)
    g.save();
    g.translate(CX, CX);
    g.rotate(-rel);
    g.shadowColor = 'rgba(0,0,0,0.65)'; g.shadowBlur = 4; g.shadowOffsetY = 1.5;
    g.beginPath();
    g.moveTo(0, -37); g.lineTo(7.2, -20); g.lineTo(2.6, -20); g.lineTo(2.6, 14); g.lineTo(6.2, 24); g.lineTo(0, 19); g.lineTo(-6.2, 24); g.lineTo(-2.6, 14); g.lineTo(-2.6, -20); g.lineTo(-7.2, -20); g.closePath();
    const needle = g.createLinearGradient(-7, 0, 7, 0);
    needle.addColorStop(0, '#9ccfd8'); needle.addColorStop(0.5, '#f6f1dc'); needle.addColorStop(1, '#6fb0bd');
    g.fillStyle = needle; g.fill();
    g.shadowColor = 'transparent';
    g.lineWidth = 1.3; g.strokeStyle = '#10222a'; g.lineJoin = 'round'; g.stroke();
    g.restore();
    // Nabe
    const hub = g.createRadialGradient(CX - 1.5, CX - 2, 0.5, CX, CX, 5);
    hub.addColorStop(0, '#fff7d8'); hub.addColorStop(0.55, '#d7ae52'); hub.addColorStop(1, '#6c4b14');
    g.beginPath(); g.arc(CX, CX, 4.4, 0, TAU); g.fillStyle = hub; g.fill(); g.lineWidth = 1; g.strokeStyle = '#2a1a07'; g.stroke();

    // Kurs-Marke oben (fest) und Zahl
    g.beginPath(); g.moveTo(CX - 6, 3.5); g.lineTo(CX + 6, 3.5); g.lineTo(CX, 14); g.closePath();
    g.fillStyle = '#c4452f'; g.fill(); g.lineWidth = 1.3; g.strokeStyle = '#2a0c06'; g.stroke();
    const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
    const card = dirs[Math.round(deg / 45) % 8];
    g.font = "700 15px 'Barlow Semi Condensed', 'Alegreya Sans', sans-serif";
    g.textBaseline = 'alphabetic';
    g.lineWidth = 3; g.strokeStyle = 'rgba(8,5,3,0.85)'; g.fillStyle = '#fff1c0';
    const txt = `${String(Math.round(deg) % 360).padStart(3, '0')}° ${card}`;
    g.strokeText(txt, CX, CX + 28); g.fillText(txt, CX, CX + 28);
    // Windstärke: fünf Punkte
    for (let i = 0; i < 5; i++) {
      g.beginPath(); g.arc(CX - 12 + i * 6, CX + 35, 1.9, 0, TAU);
      g.fillStyle = i < pips ? '#7fd0e0' : 'rgba(255,255,255,0.18)'; g.fill();
    }
  }
}
