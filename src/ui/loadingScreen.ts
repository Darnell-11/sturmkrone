/**
 * Ladebildschirm: Titel, aktuelle Phase, Fortschrittsbalken mit Prozent und wechselnde Tipps.
 * Der Balken läuft weich auf den echten Fortschritt zu (kein Springen) und wird über transform gezeichnet.
 * Er verschwindet erst, wenn alles geladen UND alle Shader vorbereitet sind.
 */
const TIPS = [
  'Halte den schweren Angriff gedrückt – aufgeladen trifft er mit voller Wucht.',
  'Eine Rolle macht dich kurz unverwundbar. Gedrückt während eines Schlags, folgt sie direkt danach.',
  'Breitseiten treffen alles, was im leuchtenden Fächer neben deinem Schiff liegt.',
  'Schwache Schiffe kannst du entern – die Crew kämpft an deiner Seite.',
  'Faji-Fähigkeiten lernst du im Faji-Baum (Stern oben rechts).',
  'Im Sturm sind die Wellen höher – und die Beute fetter.',
  'In Tavernen hört man Gerüchte über Schätze und Legenden.',
];

export class LoadingScreen {
  private el: HTMLElement;
  private bar: HTMLElement;
  private pct: HTMLElement;
  private phase: HTMLElement;
  private tip: HTMLElement;
  private target = 0;
  private shown = 0;
  private raf = 0;
  private tipT = 0;
  private tipI = Math.floor(Math.random() * TIPS.length);
  private last = performance.now();

  constructor(parent: HTMLElement = document.body) {
    this.el = document.createElement('div');
    this.el.className = 'loading';
    this.el.setAttribute('role', 'progressbar');
    this.el.setAttribute('aria-valuemin', '0');
    this.el.setAttribute('aria-valuemax', '100');
    this.el.innerHTML = `
      <div class="ld-card">
        <div class="fell ld-title">Sturmkrone</div>
        <div class="ld-phase">Die Crew macht sich bereit …</div>
        <div class="bar"><i></i></div>
        <div class="ld-pct">0 %</div>
        <div class="ld-tip"></div>
      </div>`;
    parent.appendChild(this.el);
    this.bar = this.el.querySelector('.bar i')!;
    this.pct = this.el.querySelector('.ld-pct')!;
    this.phase = this.el.querySelector('.ld-phase')!;
    this.tip = this.el.querySelector('.ld-tip')!;
    this.tip.textContent = `Tipp: ${TIPS[this.tipI]}`;
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Echter Fortschritt 0 … 1 und Phase (Text) */
  set(p: number, phase?: string) {
    this.target = Math.max(this.target, Math.min(1, p));
    if (phase && this.phase.textContent !== phase) this.phase.textContent = phase;
  }

  private tick = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // weich nachlaufen, nie rückwärts
    this.shown += (this.target - this.shown) * Math.min(1, dt * 8);
    if (this.target - this.shown < 0.002) this.shown = this.target;
    this.bar.style.transform = `scaleX(${this.shown.toFixed(4)})`;
    const v = Math.floor(this.shown * 100);
    const t = `${v} %`;
    if (this.pct.textContent !== t) { this.pct.textContent = t; this.el.setAttribute('aria-valuenow', String(v)); }
    this.tipT += dt;
    if (this.tipT > 4.5) {
      this.tipT = 0;
      this.tipI = (this.tipI + 1) % TIPS.length;
      this.tip.textContent = `Tipp: ${TIPS[this.tipI]}`;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Auf 100 % laufen lassen, dann sanft ausblenden und entfernen */
  async finish() {
    this.set(1, 'Leinen los!');
    const t0 = performance.now();
    while (this.shown < 0.999 && performance.now() - t0 < 900) await new Promise((r) => setTimeout(r, 30));
    this.el.classList.add('done');
    await new Promise((r) => setTimeout(r, 420));
    cancelAnimationFrame(this.raf);
    this.el.remove();
  }
}
