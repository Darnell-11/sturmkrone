export interface LoopCallbacks {
  /** Feste Schrittweite – Spiellogik läuft auf jedem Gerät gleich schnell. */
  update(dt: number): void;
  /** alpha: Anteil zwischen letztem und nächstem Logikschritt (für weiche Bewegung) */
  render(alpha: number, frameDt: number): void;
}

const MAX_FRAME = 0.25;
const MAX_STEPS = 8;

export class GameLoop {
  readonly step = 1 / 60;
  /** < 1 verlangsamt die Spielzeit (Trefferpausen, Zeitlupe) */
  timeScale = 1;
  fps = 0;
  /** Durchschnittliche Frame-Dauer in ms (für die automatische Grafikstufe) */
  frameMs = 16.7;

  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private fpsFrames = 0;
  private fpsTime = 0;

  constructor(private cb: LoopCallbacks) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Nach Pausen oder Tab-Wechsel: keinen Zeitsprung nachholen. */
  resetClock() {
    this.last = performance.now();
    this.acc = 0;
  }

  /** Einen Frame mit gegebener Dauer (Sekunden) vorrücken. Öffentlich für Tests. */
  advance(frameDt: number): number {
    const dt = Math.min(MAX_FRAME, Math.max(0, frameDt));
    this.acc += dt * this.timeScale;
    let steps = 0;
    while (this.acc >= this.step && steps < MAX_STEPS) {
      this.cb.update(this.step);
      this.acc -= this.step;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    this.cb.render(this.acc / this.step, dt);
    return steps;
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const frameDt = (now - this.last) / 1000;
    this.last = now;

    this.fpsFrames++;
    this.fpsTime += frameDt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.frameMs = (this.fpsTime / this.fpsFrames) * 1000;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.advance(frameDt);
  };
}
