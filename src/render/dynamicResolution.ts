/**
 * Dynamische Auflösung (Renderer-Watchdog).
 * Fällt die Bildrate mehrere Sekunden unter 50 fps, rechnet das Spiel mit etwas weniger Pixeln (in Schritten von
 * etwa 12 %, nie unter 0,75 × Pixelverhältnis); läuft es wieder lange flüssig, geht die Auflösung zurück bis
 * zum Wert der Grafikstufe – nie darüber.
 *
 * Schutz gegen unnötige Unschärfe: Jede Absenkung ist ein Versuch. Bringt sie keine messbar höhere Bildrate
 * (z. B. Handy im Stromsparmodus mit festen 30 fps oder der Prozessor statt der Grafikkarte bremst), wird sie
 * zurückgenommen und erst nach einer immer längeren Pause (45 s, 90 s … bis 10 min) erneut probiert.
 */
export class DynamicResolution {
  /** Faktor auf das Pixelverhältnis der Grafikstufe (1 = volle Auflösung der Stufe) */
  scale = 1;
  /** kleinster erlaubter Faktor (aus der Untergrenze 0,75 × Pixelverhältnis) */
  private min = 1;
  private clock = 0;
  private warm = 0;
  private acc = 0;
  private frames = 0;
  private lowWins = 0;
  private highWins = 0;
  private lastChange = -99;
  /** laufender Versuch: vorheriger Faktor, Bildrate davor, Richtung */
  private probe: { from: number; fps: number; wins: number; down: boolean } | null = null;
  private blockDownUntil = 0;
  private blockUpUntil = 0;
  private downFails = 0;

  static readonly LOW_FPS = 50;
  static readonly HIGH_FPS = 57;
  static readonly FLOOR = 0.75;

  /** Nach Stufenwechsel, Laden oder Szenenwechsel: neu messen (Shader-Übersetzung verfälscht die ersten Sekunden) */
  reset(basePixelRatio: number) {
    this.scale = 1;
    this.min = Math.min(1, DynamicResolution.FLOOR / Math.max(0.01, basePixelRatio));
    this.warm = 0; this.acc = 0; this.frames = 0; this.lowWins = 0; this.highWins = 0; this.probe = null;
  }

  /** Messung neu beginnen, Faktor behalten (nach Pause, Ladebildschirm) */
  rewarm() { this.warm = 0; this.acc = 0; this.frames = 0; this.lowWins = 0; this.highWins = 0; this.probe = null; }

  /** Kann die Auflösung noch weiter sinken? (Solange ja, senkt das Spiel nicht gleich die ganze Grafikstufe) */
  get hasRoom() { return this.scale > this.min + 0.001 && this.clock >= this.blockDownUntil; }

  /** Je Bild aufrufen; Rückgabe true = Faktor geändert (Renderer muss die Größe neu setzen) */
  sample(frameDt: number): boolean {
    if (frameDt <= 0 || frameDt > 0.2 || document.hidden) return false;
    this.clock += frameDt;
    this.warm += frameDt;
    if (this.warm < 4) return false;
    this.acc += frameDt;
    this.frames++;
    if (this.acc < 1) return false;
    const fps = this.frames / this.acc;
    this.acc = 0; this.frames = 0;

    // Ergebnis eines Versuchs nach zwei Messfenstern auswerten
    if (this.probe) {
      const p = this.probe;
      if (++p.wins < 2) return false;
      this.probe = null;
      if (p.down && fps < p.fps + 3 && fps < DynamicResolution.LOW_FPS) {
        // weniger Pixel haben nicht geholfen: zurück, länger warten bis zum nächsten Versuch
        this.scale = p.from;
        this.downFails++;
        this.blockDownUntil = this.clock + Math.min(600, 45 * Math.pow(2, this.downFails - 1));
        this.lastChange = this.clock;
        return true;
      }
      if (!p.down && fps < DynamicResolution.LOW_FPS) {
        // höher ging nicht: zurück und eine Minute nicht erneut versuchen
        this.scale = p.from;
        this.blockUpUntil = this.clock + 60;
        this.lastChange = this.clock;
        return true;
      }
      if (p.down) this.downFails = 0;
      return false;
    }

    this.lowWins = fps < DynamicResolution.LOW_FPS ? this.lowWins + 1 : 0;
    this.highWins = fps >= DynamicResolution.HIGH_FPS ? this.highWins + 1 : 0;
    if (this.clock - this.lastChange < 1.5) return false;

    if (this.lowWins >= 2 && this.hasRoom) {
      const next = Math.max(this.min, Math.round(this.scale * 0.87 * 20) / 20);
      if (next < this.scale - 0.001) return this.change(next, fps, true);
    }
    if (this.highWins >= 6 && this.scale < 1 && this.clock >= this.blockUpUntil) {
      const next = Math.min(1, Math.round((this.scale + 0.08) * 20) / 20);
      return this.change(next, fps, false);
    }
    return false;
  }

  private change(next: number, fps: number, down: boolean) {
    this.probe = { from: this.scale, fps, wins: 0, down };
    this.scale = next;
    this.lowWins = 0; this.highWins = 0;
    this.lastChange = this.clock;
    return true;
  }
}
