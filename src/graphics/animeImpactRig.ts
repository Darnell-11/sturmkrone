// Phase 4.6B – Anime-Impact-Frames; 4.6I – Doppel-Impact-Frame mit Hit-Stop.
// Rein (ohne three.js-Szene, ohne Speicheranforderungen je Bild): zählt die 2 – 4 Impact-Bilder im Treffermoment in GEZEICHNETEN Bildern –
// erst ein invertiertes Bild, dann harte Schwarz-Weiß-Tusche mit radialen Speedlines („Doppel-Impact-Frame“), bei 3 – 4 Bildern bleibt die
// Tusche länger stehen. Solange noch Impact-Bilder ausstehen, steht die Spielzeit (Hit-Stop: `framesLeft` > 0, die Kino-Regie in
// `graphics/ultimateCinematics.ts` hält dann die Zeit an). Die Bildwirkung entsteht über einen leichten Vollbild-Overlay (CSS-Filter auf dem
// Canvas, `ui/animeImpactOverlay.ts`) – keine neuen Material-Shader.
// 4.6I: Die frühere Einheits-Nahaufnahme (eine Gesichts-/Untersicht-/Himmels-Einstellung für alle Ultimates) ist durch die maßgeschneiderte
// 3-Akt-Choreografie ersetzt; hier bleiben nur die Impact-Bilder.

export type ImpactMode = 'none' | 'invert' | 'ink';

/** Zahl der Impact-Bilder je Treffermoment */
export const IMPACT = {
  framesMin: 2, framesMax: 4,
} as const;

export class AnimeImpactRig {
  /** Bildwirkung des aktuellen Bilds */
  mode: ImpactMode = 'none';
  private frames = 0;
  private frameIdx = 0;
  /** Anzahl der Impact-Folgen (Prüfungen) */
  impacts = 0;

  /** Laufen noch Impact-Bilder? */
  get active(): boolean { return this.frames > 0; }
  /** 4.6I: noch zu zeichnende Impact-Bilder – solange > 0, steht die Spielzeit (Hit-Stop im Treffermoment) */
  get framesLeft(): number { return this.frames; }

  /**
   * Treffermoment: 2 – 4 Impact-Bilder (das erste invertiert, dann Tusche mit radialen Speedlines). 4.91: `soft` = nur Tusche (Formen I – VII
   * kommen alle paar Sekunden – ohne das grelle invertierte Bild); ein laufendes stärkeres Impact wird nie von einem schwächeren abgelöst.
   */
  impact(frames: number, soft = false) {
    const n = Math.min(IMPACT.framesMax, Math.max(IMPACT.framesMin, Math.round(Number.isFinite(frames) ? frames : IMPACT.framesMin)));
    if (this.frames > 0 && (soft || n < this.frames)) return;
    this.frames = n;
    this.frameIdx = soft ? 1 : 0;
    this.impacts++;
  }

  /** Je GEZEICHNETEM Bild: Bildwirkung dieses Bilds (zählt die Impact-Frames herunter) */
  frame(): ImpactMode {
    if (this.frames <= 0) { this.mode = 'none'; return this.mode; }
    this.mode = this.frameIdx === 0 ? 'invert' : 'ink';
    this.frameIdx++;
    this.frames--;
    return this.mode;
  }

  /** Abbrechen (Szenenwechsel, K.O.) */
  reset() { this.frames = 0; this.frameIdx = 0; this.mode = 'none'; }
}
