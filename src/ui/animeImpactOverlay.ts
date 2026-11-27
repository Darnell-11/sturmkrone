// Phase 4.6B – Vollbild-Schicht der Anime-Impact-Frames und Mini-Zwischensequenzen (ohne WebGL-Shader: CSS-Filter auf dem Spiel-Bild).
//  - Impact-Frames: erst ein invertiertes Bild, dann harte Schwarz-Weiß-Tusche (Graustufen + starker Kontrast) mit schwarzen
//    Manga-Speedlines, je GEZEICHNETEM Bild umgeschaltet (2 – 4 Bilder, `AnimeImpactRig.frame()`). Der Filter liegt direkt auf dem Canvas
//    (`filter`): Mischmodi und `backdrop-filter` einer Schicht darüber erreichen das WebGL-Bild nicht zuverlässig (eigener Stapelkontext).
//  - Zwischensequenz: Kinobalken oben und unten, Aura-Glühen am Rand in der Farbe des Ultimates.
//  - Glas-Risse (Iaijutsu): SVG-Linien vom Bildmittelpunkt, zerspringen und verblassen.
// Bei „Bewegung reduzieren“ entfallen das invertierte Bild und die Speedlines (Schutz vor Lichtblitzen).
// 4.93A (Kino-Endgame-Regie): zeitgesteuerte Manga-Impact-Frames in drei Stilen – Schwarz-Weiß-Tusche (`ink`), invertierte Schwarz-Weiß-Tusche
// (`inkInv`) und blau-weiße Tusche (`inkBlue`) – sowie radiale Speedlines am Bildrand während der Entladung (Phase 2, Stärke 0 … 1). Alles
// bleibt CSS auf dem Canvas bzw. in dieser Schicht: kein Shader, kein neues Programm.
import type { ImpactMode } from '../graphics/animeImpactRig';

/** größte Aufhellung vor der Tusche-Schwelle (Faktor − 1) bei `lift` = 1 */
export const IMPACT_LIFT = 1.6;

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
    this.root.innerHTML = '<div class="ai-bars"><i></i><i></i></div><div class="ai-glow"></div><div class="ai-speed"></div><div class="ai-lines"></div><div class="ai-flash"></div>';
    this.cracksEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.cracksEl.setAttribute('class', 'ai-cracks');
    this.cracksEl.setAttribute('viewBox', '-50 -50 100 100');
    this.cracksEl.setAttribute('preserveAspectRatio', 'none');
    this.root.appendChild(this.cracksEl);
    parent.prepend(this.root);
    this.reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** 4.93A: Zähler der zeitgesteuerten Impact-Frames je Stil (Prüfungen) */
  inkInvShown = 0;
  inkBlueShown = 0;
  private speedKey = '';
  private punchSeq = 0;
  private zoomOn = false;
  /** Zahl der Lichtblitze mit Zoom-Stoß (Prüfungen) */
  punches = 0;

  /**
   * CSS-Filter des Canvas je Bildwirkung (rein, getestet). `lift` (0 … 1, in Zwanzigsteln) hellt das Bild vor der Tusche-Schwelle auf:
   * unter verdunkeltem Himmel, in der Dämmerung und bei Nacht läge sonst alles unter der Schwelle (ein fast einfarbiges Bild ohne Formen).
   */
  static filterOf(m: ImpactMode, lift = 0): string {
    const k = 1 + IMPACT_LIFT * (Math.round(Math.max(0, Math.min(1, Number.isFinite(lift) ? lift : 0)) * 20) / 20);
    const b = (x: number) => (Math.round(x * k * 100) / 100).toString();
    switch (m) {
      case 'invert': return 'invert(1) contrast(1.4)';
      // 4.6I: Tusche dunkler gestimmt (helles Meer, Himmel und Effekte wurden sonst fast ganz weiß): Schiffe, Figuren und Meer werden zu
      // schwarzer Tusche, Himmel und Energie zu Weiß
      case 'ink': return `grayscale(1) brightness(${b(0.8)}) contrast(6.5)`;
      // 4.93A: invertierte Schwarz-Weiß-Tusche (Himmel und Energie schwarz, Figuren und Schiffe weiß) und blau-weiße Tusche
      case 'inkInv': return `grayscale(1) brightness(${b(0.82)}) contrast(6) invert(1)`;
      case 'inkBlue': return `grayscale(1) brightness(${b(0.86)}) contrast(5.5) sepia(1) hue-rotate(172deg) saturate(4.2)`;
      case 'inkBlueInv': return `grayscale(1) brightness(${b(0.86)}) contrast(5.5) invert(1) sepia(1) hue-rotate(172deg) saturate(4.2)`;
      default: return '';
    }
  }

  /**
   * Je gezeichnetem Bild: Bildwirkung (aus dem Rig), Zwischensequenz-Stärke 0 … 1, Aura-Farbe, Echtzeit; 4.93A: Speedlines am Bildrand
   * (Stärke 0 … 1) in der Farbe der laufenden Regie-Aktion.
   */
  apply(mode: ImpactMode, cineK: number, glow: number, color: string, realDt: number, speedK = 0, speedColor = '#ffffff', punchSeq = 0, lift = 0) {
    let m = mode;
    if (this.reduce && (m === 'invert' || m === 'inkInv')) m = 'ink';
    if (this.reduce && m === 'inkBlueInv') m = 'inkBlue';
    if (m !== this.mode) {
      const inv = m === 'invert' || m === 'inkInv' || m === 'inkBlueInv';
      this.root.classList.toggle('m-ink', m === 'ink' || m === 'inkBlue');
      this.root.classList.toggle('m-inv', inv);
      this.root.classList.toggle('m-blue', m === 'inkBlue' || m === 'inkBlueInv');
      this.root.classList.toggle('lines', m !== 'none' && !this.reduce);
      if (this.canvas) this.canvas.style.filter = AnimeImpactOverlay.filterOf(m, lift);
      this.mode = m;
    }
    if (m !== 'none') {
      this.framesShown++;
      if (m === 'ink') this.inkShown++; else if (m === 'invert') this.invertShown++; else if (m === 'inkInv') this.inkInvShown++; else this.inkBlueShown++;
    }
    // 4.93A: je zeitgesteuertem Impact-Frame einmal Lichtblitz und Zoom-Stoß des Bildes (das Canvas springt um 6 % heran und federt zurück) –
    // erst dadurch wirkt der Frame wie ein Schlag; bei „Bewegung reduzieren“ entfällt beides
    if (punchSeq !== this.punchSeq) {
      this.punchSeq = punchSeq;
      if (!this.reduce && punchSeq > 0) {
        this.punches++;
        this.root.classList.remove('punch');
        void this.root.offsetWidth;
        this.root.classList.add('punch');
        if (this.canvas) { this.canvas.style.transition = 'none'; this.canvas.style.transform = 'scale(1.06)'; this.zoomOn = true; }
      }
    }
    if (this.zoomOn && m === 'none' && this.canvas) {
      this.zoomOn = false;
      this.canvas.style.transition = 'transform 0.16s cubic-bezier(0.2, 0.9, 0.3, 1)';
      this.canvas.style.transform = '';
    }
    // Speedlines der Entladung: nur bei einer Änderung schreiben (20 Stufen)
    const sk = this.reduce ? 0 : Math.round(Math.max(0, Math.min(1, speedK)) * 20);
    const sKey = sk > 0 ? `${sk}|${speedColor}` : '';
    if (sKey !== this.speedKey) {
      this.speedKey = sKey;
      this.root.style.setProperty('--sk', (sk / 20).toFixed(2));
      if (sk > 0) this.root.style.setProperty('--sc', speedColor);
      this.root.classList.toggle('speed', sk > 0);
    }
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
    this.apply('none', 0, 0, '#fff', 0, 0, '#ffffff', this.punchSeq);
    this.root.classList.remove('punch');
    if (this.canvas) { this.canvas.style.transition = 'none'; this.canvas.style.transform = ''; this.zoomOn = false; }
    this.crackT = 0;
    this.cracksEl.classList.remove('on', 'shatter');
    this.cracksEl.replaceChildren();
  }
}
