// Phase 4.6B – In-Engine Mini-Zwischensequenz und Anime-Impact-Frames.
// Rein (ohne three.js-Szene, ohne Speicheranforderungen je Bild): ein Zustandsautomat, der in ECHTER Zeit läuft (die Spielzeit steht während der
// Zwischensequenz fast still: Zeitlupe 0,14 für 0,75 s, nur lokal beim Auslöser – eine Server-Simulation spielt sie nie mit). Er liefert
//  - den Kamera-Blend zur filmreifen Einstellung (Gesicht und Augen, Untersicht, Profil, Himmel) und zurück in die freie 3D-Kamera,
//  - die 2 – 4 Impact-Frames im Treffermoment (erst invertiert, dann harte Schwarz-Weiß-Tusche; gezählt in GEZEICHNETEN Bildern),
//  - die Stärke von Augen-Leuchten, Himmelssäule und Aura-Blitzen für die Effekte der Welt.
// Die Bildwirkung entsteht über einen leichten Vollbild-Overlay (CSS-Filter, `ui/animeImpactOverlay.ts`) – keine neuen Material-Shader.

export type ImpactMode = 'none' | 'invert' | 'ink';
export type ShotKind = 'face' | 'low' | 'side' | 'sky';

/** Zeiten in echten Sekunden */
export const IMPACT = {
  /** Dauer der Zwischensequenz (aus den Daten, eingegrenzt) */
  cineMin: 0.65, cineMax: 0.85,
  /** Zeitlupe während des Aufladens */
  slow: 0.14, slowDur: 0.75,
  /** Zahl der Impact-Frames */
  framesMin: 2, framesMax: 4,
  /** Kamera fährt in so vielen Sekunden heran bzw. weich zurück */
  camIn: 0.16, camOut: 0.5,
} as const;

/** Kamera-Lage der Einstellung: Position und Blickpunkt (Welt) und Sichtfeld (Grad) */
export interface RigPose { px: number; py: number; pz: number; lx: number; ly: number; lz: number; fov: number }

const smooth = (t: number) => { const k = t < 0 ? 0 : t > 1 ? 1 : t; return k * k * (3 - 2 * k); };

/** Einstellungen: Abstand, Höhe der Kamera relativ zum Kopf, seitlicher Winkel (rad), Blickhöhe, Sichtfeld, Heranfahren */
const SHOTS: Record<ShotKind, { dist: number; dy: number; side: number; look: number; fov: number; dolly: number; orbit: number }> = {
  face: { dist: 1.35, dy: -0.04, side: 0.22, look: -0.02, fov: 30, dolly: 0.28, orbit: 0.35 },
  low: { dist: 2.7, dy: -1.15, side: 0.5, look: 0.1, fov: 46, dolly: 0.5, orbit: 0.25 },
  side: { dist: 2.3, dy: -0.35, side: 1.45, look: -0.25, fov: 38, dolly: 0.4, orbit: 0.15 },
  sky: { dist: 3.4, dy: -1.25, side: 2.6, look: 1.6, fov: 54, dolly: 0.6, orbit: 0.4 },
};

export class AnimeImpactRig {
  phase: 'idle' | 'cine' | 'return' = 'idle';
  /** Zeit in der Phase (echte s) */
  t = 0;
  dur: number = IMPACT.slowDur;
  shot: ShotKind = 'face';
  /** Überblendung freie Kamera → Einstellung (0 … 1) */
  camK = 0;
  /** Augen-Leuchten, Himmelssäule, Aura-Blitze (0 … 1) */
  glow = 0;
  /** Bildwirkung des aktuellen Bilds */
  mode: ImpactMode = 'none';
  private frames = 0;
  private frameIdx = 0;
  /** Anzahl der Zwischensequenzen und Impact-Folgen (Prüfungen) */
  cuts = 0;
  impacts = 0;

  get active(): boolean { return this.phase !== 'idle' || this.frames > 0; }

  /** Zwischensequenz beginnen (Ultimate wird ausgelöst): Kamera fährt heran, Leuchten steigt */
  startCutscene(shot: ShotKind, dur: number = IMPACT.slowDur) {
    this.phase = 'cine';
    this.t = 0;
    this.shot = shot;
    this.dur = Math.min(IMPACT.cineMax, Math.max(IMPACT.cineMin, dur));
    this.cuts++;
  }

  /** Treffermoment: 2 – 4 Impact-Frames (erstes invertiert, dann Tusche); die Kamera kehrt zurück */
  impact(frames: number) {
    this.frames = Math.min(IMPACT.framesMax, Math.max(IMPACT.framesMin, Math.round(frames)));
    this.frameIdx = 0;
    this.impacts++;
    if (this.phase === 'cine') { this.phase = 'return'; this.t = 0; }
  }

  /** Je Bild in echter Zeit */
  update(realDt: number) {
    const dt = Math.max(0, Math.min(0.1, realDt));
    if (this.phase === 'cine') {
      this.t += dt;
      this.camK = smooth(this.t / IMPACT.camIn);
      this.glow = smooth(this.t / (this.dur * 0.6));
      if (this.t >= this.dur) { this.phase = 'return'; this.t = 0; }
    } else if (this.phase === 'return') {
      this.t += dt;
      const k = 1 - smooth(this.t / IMPACT.camOut);
      this.camK = Math.min(this.camK, k);
      this.glow = Math.min(this.glow, k);
      if (this.t >= IMPACT.camOut) { this.phase = 'idle'; this.camK = 0; this.glow = 0; }
    }
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
  reset() { this.phase = 'idle'; this.t = 0; this.camK = 0; this.glow = 0; this.frames = 0; this.mode = 'none'; }

  /**
   * Kamera der Einstellung um den Kopf (hx, hy, hz) einer Figur mit Blickrichtung `yaw`: vor dem Gesicht (leicht seitlich, fährt langsam heran),
   * Untersicht, Profil oder Himmel. Schreibt in `out` (kein neues Objekt).
   */
  pose(hx: number, hy: number, hz: number, yaw: number, out: RigPose): RigPose {
    const s = SHOTS[this.shot];
    const u = this.phase === 'cine' ? Math.min(1, this.t / this.dur) : 1;
    const ang = yaw + s.side + (u - 0.5) * s.orbit;
    const dist = s.dist * (1 - s.dolly * smooth(u) * 0.5);
    out.px = hx + Math.sin(ang) * dist;
    out.pz = hz + Math.cos(ang) * dist;
    out.py = hy + s.dy;
    out.lx = hx; out.lz = hz;
    out.ly = hy + s.look;
    out.fov = s.fov;
    return out;
  }
}
