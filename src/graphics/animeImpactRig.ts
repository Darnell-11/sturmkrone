// Phase 4.6B – Anime-Impact-Frames; 4.6I – Doppel-Impact-Frame mit Hit-Stop; 4.93A – Impact-Frames nach Millisekunden.
// Rein (ohne three.js-Szene, ohne Speicheranforderungen je Bild). Zwei Arten:
//  - gezählt in GEZEICHNETEN Bildern (4.6I, die Ultimates der älteren 3-Akt-Regie): 2 – 4 Bilder, erst ein invertiertes Bild, dann harte
//    Schwarz-Weiß-Tusche mit radialen Speedlines („Doppel-Impact-Frame“). Solange Bilder ausstehen, steht die Spielzeit (`framesLeft` > 0).
//  - nach ECHTZEIT (4.93A, Kino-Endgame-Regie): ein Manga-Impact-Frame von 70 – 180 ms als hartes DOPPELBILD – die erste Hälfte im Stil der
//    Aktion (invertierte Schwarz-Weiß-Tusche, blau-weiße Tusche oder Schwarz-Weiß-Tusche), die zweite im Gegenbild (`IMPACT_FLIP`). Der harte
//    Wechsel mitten im Standbild macht den Treffer unübersehbar (die erste Fassung mit 35 – 95 ms in einem Stil ging im Spiel unter). Die
//    Regie (`graphics/endgameDirector.ts`) hält die Spielzeit währenddessen mit dem Hit-Stop-Zeitmaß 0,04 fast an.
// Die Bildwirkung entsteht über einen leichten Vollbild-Overlay (CSS-Filter auf dem Canvas, `ui/animeImpactOverlay.ts`) – keine neuen
// Material-Shader, kein neues Programm.

export type ImpactMode = 'none' | 'invert' | 'ink' | 'inkInv' | 'inkBlue' | 'inkBlueInv';
/** Stile der zeitgesteuerten Impact-Frames (4.93A) */
export type TimedImpactStyle = 'ink' | 'inkInv' | 'inkBlue';

/** Zahl der Impact-Bilder je Treffermoment (gezählte Art) und Dauer der zeitgesteuerten Art (ms) */
export const IMPACT = {
  framesMin: 2, framesMax: 4,
  msMin: 30, msMax: 200,
  /** Anteil des zeitgesteuerten Impact-Frames, nach dem das Bild ins Gegenbild umschlägt */
  flipAt: 0.5,
} as const;

/** Gegenbild der zweiten Hälfte eines zeitgesteuerten Impact-Frames: invertiert → Tusche, Tusche → invertiert, blau-weiß → blau invertiert */
export const IMPACT_FLIP: Readonly<Record<TimedImpactStyle, ImpactMode>> = { inkInv: 'ink', ink: 'inkInv', inkBlue: 'inkBlueInv' };

export class AnimeImpactRig {
  /** Bildwirkung des aktuellen Bilds */
  mode: ImpactMode = 'none';
  private frames = 0;
  private frameIdx = 0;
  /** zeitgesteuerter Impact-Frame: Rest (ms), ganze Dauer (ms) und Stil */
  private ms = 0;
  private msAll = 0;
  private msMode: TimedImpactStyle = 'ink';
  /** laufende Nummer des zeitgesteuerten Impact-Frames (die Bildschicht löst je Nummer einmal Lichtblitz und Zoom-Stoß aus) */
  timedSeq = 0;
  /** Aufhellung der Tusche-Schwelle des laufenden zeitgesteuerten Frames (0 = heller Tag … 1 = dunkle Szene) */
  lift = 0;
  /** Anzahl der Impact-Folgen (Prüfungen) und der zeitgesteuerten Impact-Frames samt ihrer zuletzt verlangten Dauer */
  impacts = 0;
  timed = 0;
  lastMs = 0;
  /** tatsächlich gezeigte Dauer des letzten zeitgesteuerten Impact-Frames (ms, Prüfungen) */
  shownMs = 0;

  /** Laufen noch Impact-Bilder? */
  get active(): boolean { return this.frames > 0 || this.ms > 0; }
  /** 4.6I: noch zu zeichnende Impact-Bilder der gezählten Art – solange > 0, steht die Spielzeit (Hit-Stop im Treffermoment) */
  get framesLeft(): number { return this.frames; }
  /** 4.93A: Rest des zeitgesteuerten Impact-Frames (ms) */
  get msLeft(): number { return this.ms; }

  /**
   * Treffermoment: 2 – 4 Impact-Bilder (das erste invertiert, dann Tusche mit radialen Speedlines). 4.91: `soft` = nur Tusche (Formen I – VII
   * kommen alle paar Sekunden – ohne das grelle invertierte Bild); ein laufendes stärkeres Impact wird nie von einem schwächeren abgelöst.
   */
  impact(frames: number, soft = false) {
    // ein zeitgesteuerter Impact-Frame der Kino-Endgame-Regie hat Vorrang: nie zwei Bildwirkungen übereinander
    if (this.ms > 0) return;
    const n = Math.min(IMPACT.framesMax, Math.max(IMPACT.framesMin, Math.round(Number.isFinite(frames) ? frames : IMPACT.framesMin)));
    if (this.frames > 0 && (soft || n < this.frames)) return;
    this.frames = n;
    this.frameIdx = soft ? 1 : 0;
    this.impacts++;
  }

  /**
   * 4.93A: Manga-Impact-Frame von `ms` Millisekunden Echtzeit im Stil `style`. Ersetzt jede laufende gezählte Folge (die Regie besitzt das
   * Bild); ein längerer laufender zeitgesteuerter Frame bleibt stehen. `lift` (0 … 1) hellt die Tusche-Schwelle für dunkle Szenen auf.
   */
  impactFor(ms: number, style: TimedImpactStyle, lift = 0) {
    const d = Math.min(IMPACT.msMax, Math.max(IMPACT.msMin, Number.isFinite(ms) ? ms : IMPACT.msMin));
    if (this.ms >= d) return;
    this.lift = Number.isFinite(lift) ? Math.min(1, Math.max(0, lift)) : 0;
    this.frames = 0; this.frameIdx = 0;
    this.ms = d; this.msAll = d; this.msMode = style;
    this.lastMs = d; this.shownMs = 0;
    this.timed++;
    this.timedSeq++;
    this.impacts++;
  }

  /**
   * Je GEZEICHNETEM Bild: Bildwirkung dieses Bilds. Gezählte Folgen zählen ein Bild herunter; ein zeitgesteuerter Frame zeigt sich, solange
   * mehr als ein halbes Bild seiner Dauer übrig ist (so trifft die gezeigte Zeit die Vorgabe auf ein halbes Bild genau), und zieht `realDt` ab.
   */
  frame(realDt = 1 / 60): ImpactMode {
    if (this.ms > 0) {
      // höchstens zwei Bilder (34 ms) je Schritt anrechnen: ein einzelnes langes Bild (Effekte des Einschlags) verschluckt den Frame nicht
      const step = Math.max(1, Math.min(34, (Number.isFinite(realDt) ? realDt : 1 / 60) * 1000));
      if (this.ms > step * 0.5) {
        // Doppelbild: erste Hälfte im Stil der Aktion, zweite im Gegenbild
        this.mode = this.ms > this.msAll * (1 - IMPACT.flipAt) ? this.msMode : IMPACT_FLIP[this.msMode];
        this.ms -= step;
        this.shownMs += step;
        if (this.ms < 0) this.ms = 0;
        return this.mode;
      }
      this.ms = 0;
    }
    if (this.frames <= 0) { this.mode = 'none'; return this.mode; }
    this.mode = this.frameIdx === 0 ? 'invert' : 'ink';
    this.frameIdx++;
    this.frames--;
    return this.mode;
  }

  /** Abbrechen (Szenenwechsel, K.O.) */
  reset() { this.frames = 0; this.frameIdx = 0; this.ms = 0; this.msAll = 0; this.mode = 'none'; }
}
