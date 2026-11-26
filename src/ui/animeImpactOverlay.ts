// Phase 4.6B – Vollbild-Schicht der Anime-Impact-Frames und Mini-Zwischensequenzen (ohne WebGL-Shader: CSS-Filter auf dem Spiel-Bild).
//  - Impact-Frames: erst ein invertiertes Bild, dann harte Schwarz-Weiß-Tusche (Graustufen + starker Kontrast) mit schwarzen
//    Manga-Speedlines, je GEZEICHNETEM Bild umgeschaltet (2 – 4 Bilder, `AnimeImpactRig.frame()`). Der Filter liegt direkt auf dem Canvas
//    (`filter`): Mischmodi und `backdrop-filter` einer Schicht darüber erreichen das WebGL-Bild nicht zuverlässig (eigener Stapelkontext).
//  - Zwischensequenz: Kinobalken oben und unten, Aura-Glühen am Rand in der Farbe des Ultimates.
//  - Glas-Risse (Iaijutsu): SVG-Linien vom Bildmittelpunkt, zerspringen und verblassen.
// Bei „Bewegung reduzieren“ entfallen das invertierte Bild und die Speedlines (Schutz vor Lichtblitzen).
import type { ImpactMode } from '../graphics/animeImpactRig';

export class AnimeImpactOverlay {
  readonly root: HTMLElement;
  private readonly cracksEl: SVGSVGElement;
  private mode: ImpactMode = 'none';
  private cineK = -1;
  private glowKey = '';
  private crackT = 0;
  private readonly reduce: boolean;
  /** Anzahl gezeigter Impact-Bilder (Prüfungen) */
  framesShown = 0;
  inkShown = 0;
  invertShown = 0;

  /** Spiel-Canvas (Filter der Impact-Frames); ohne Canvas bleiben nur Speedlines und Balken */
  private readonly canvas: HTMLElement | null;

  constructor(parent: HTMLElement, canvas: HTMLElement | null = null) {
    this.canvas = canvas;
    this.root = document.createElement('div');
    this.root.className = 'anime-impact';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = '<div class="ai-bars"><i></i><i></i></div><div class="ai-glow"></div><div class="ai-lines"></div>';
    this.cracksEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.cracksEl.setAttribute('class', 'ai-cracks');
    this.cracksEl.setAttribute('viewBox', '-50 -50 100 100');
    this.cracksEl.setAttribute('preserveAspectRatio', 'none');
    this.root.appendChild(this.cracksEl);
    parent.prepend(this.root);
    this.reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Je gezeichnetem Bild: Bildwirkung (aus dem Rig), Zwischensequenz-Stärke 0 … 1, Aura-Farbe, Echtzeit */
  apply(mode: ImpactMode, cineK: number, glow: number, color: string, realDt: number) {
    let m = mode;
    if (this.reduce && m === 'invert') m = 'ink';
    if (m !== this.mode) {
      this.root.classList.toggle('m-ink', m === 'ink');
      this.root.classList.toggle('m-inv', m === 'invert');
      this.root.classList.toggle('lines', m !== 'none' && !this.reduce);
      // 4.6I: Tusche dunkler gestimmt (helles Meer, Himmel und Effekte wurden sonst fast ganz weiß): Schiffe, Figuren und Meer werden zu
      // schwarzer Tusche, Himmel und Energie zu Weiß
      if (this.canvas) this.canvas.style.filter = m === 'invert' ? 'invert(1) contrast(1.4)' : m === 'ink' ? 'grayscale(1) brightness(0.8) contrast(6.5)' : '';
      this.mode = m;
    }
    if (m !== 'none') { this.framesShown++; if (m === 'ink') this.inkShown++; else this.invertShown++; }
    const k = Math.round(Math.max(0, Math.min(1, cineK)) * 100) / 100;
    if (k !== this.cineK) {
      this.cineK = k;
      this.root.style.setProperty('--ck', String(k));
      this.root.classList.toggle('cine', k > 0);
    }
    const gk = glow > 0.01 ? `${color}|${Math.round(glow * 20)}` : '';
    if (gk !== this.glowKey) {
      this.glowKey = gk;
      this.root.style.setProperty('--ac', color);
      this.root.style.setProperty('--ag', (Math.round(glow * 20) / 20).toFixed(2));
    }
    if (this.crackT > 0) {
      this.crackT -= realDt;
      if (this.crackT <= 0) { this.cracksEl.classList.remove('on', 'shatter'); this.cracksEl.replaceChildren(); }
      else if (this.crackT < 0.45 && !this.cracksEl.classList.contains('shatter')) this.cracksEl.classList.add('shatter');
    }
  }

  /** Glas-Risse über dem Bild (Iaijutsu-Weltenbruch): `n` Hauptrisse mit Verästelungen */
  cracks(n: number) {
    const svg = this.cracksEl;
    svg.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      let x = (Math.random() - 0.5) * 8, y = (Math.random() - 0.5) * 8;
      let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
      let ang = a;
      for (let s = 0; s < 6; s++) {
        ang += (Math.random() - 0.5) * 0.7;
        const len = 7 + Math.random() * 9;
        x += Math.cos(ang) * len; y += Math.sin(ang) * len;
        d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
        if (Math.random() < 0.45) {
          const b = document.createElementNS(ns, 'path');
          const ba = ang + (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.6), bl = 4 + Math.random() * 8;
          b.setAttribute('d', `M${x.toFixed(1)} ${y.toFixed(1)} L${(x + Math.cos(ba) * bl).toFixed(1)} ${(y + Math.sin(ba) * bl).toFixed(1)}`);
          b.setAttribute('class', 'br');
          svg.appendChild(b);
        }
      }
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
    svg.classList.remove('shatter');
    svg.classList.add('on');
    this.crackT = 1.1;
  }

  /** Sofort alles ausblenden (Szenenwechsel) */
  clear() {
    this.apply('none', 0, 0, '#fff', 0);
    this.crackT = 0;
    this.cracksEl.classList.remove('on', 'shatter');
    this.cracksEl.replaceChildren();
  }
}
