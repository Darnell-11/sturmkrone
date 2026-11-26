// Phase 4.7D – PrologueDirector: die filmreife 7-Szenen-Kino-Inszenierung als reine Zustandsmaschine (kein three.js, kein DOM, kein
// Math.random, nichts Neues je Schritt). Das Drehbuch steht als Daten in data/prologue.ts (`PROLOGUE_SCRIPT`): Taktschläge je Szene mit
// Untertiteln, Musik-Einsätzen, Kamera-Einstellungen, Lichtstimmungen, Effekten, Kinobalken, Zeitlupe und Schwarzblenden.
//
// Die Regie läuft in ECHTZEIT (die Musik spielt in Echtzeit; die Zeitlupe der Welt verlangsamt nur die Spielzeit). Szene 4 ist ab
// `DECK_PLAY.from` spielbar: sie endet, sobald die Welt meldet, dass der Schiffsjunge an seiner Kanone steht (`reached`), plus kurzes
// Gefechtsbereit-Halten – oder nach `DECK_PLAY.autoAfter` von selbst (der Prolog lässt sich nicht verlieren). Szene 7 endet mit `done`.
//
// Die Welt (world/prologueLive.ts) setzt die Ereignisse um; Anzeige, Musik und Kamera fragen den Zustand ab (Balken, Zeitmaß, Musiklage).
import {
  DECK_HINT_AFTER, DECK_PLAY, PROLOGUE_SCENES, PROLOGUE_SCENE_IDS, PROLOGUE_SCRIPT, SCORE_CUE_IDS,
  type Beat, type BeatKind, type PrologueSceneId, type ScoreCue,
} from '../data/prologue';

export type PrologueEventType = BeatKind | 'scene' | 'play' | 'ready' | 'hint' | 'auto' | 'done';

/** Ein Ereignis (vorab angelegt, je Schritt überschrieben) */
export interface PrologueEvent {
  type: PrologueEventType;
  /** Szene, Zeile, Stück, Einstellung, Stimmung, Effekt */
  id: string;
  /** Wert (Ziel-Lautstärke, Balken, Zeitmaß, Schwarz, Nummer) und Dauer (s) */
  v: number;
  d: number;
  /** Szene (Nummer 1 … 7) und Szenenzeit beim Auslösen */
  scene: number;
  at: number;
}

const ev = (): PrologueEvent => ({ type: 'scene', id: '', v: 0, d: 0, scene: 0, at: 0 });

/** Ausgabe eines Schritts: feste Plätze, `n` = belegt */
export class PrologueOut {
  readonly events: PrologueEvent[] = Array.from({ length: 48 }, ev);
  n = 0;
  push(type: PrologueEventType): PrologueEvent {
    const e = this.events[Math.min(this.n, this.events.length - 1)];
    if (this.n < this.events.length) this.n++;
    e.type = type; e.id = ''; e.v = 0; e.d = 0; e.scene = 0; e.at = 0;
    return e;
  }
}

/** Lage der Spielfigur in Szene 4 (die Welt meldet sie je Schritt) */
export interface PrologueGeo {
  /** steht an der freien Kanone */
  reached: boolean;
}

/** Eine weich überblendete Größe (Kinobalken, Zeitmaß, Schwarzblende) */
interface Ramp { from: number; to: number; t: number; d: number }

/** Lautstärke-Lage eines Stücks (für Prüfungen und die Synchronisierung der Musik) */
export interface CueState { on: boolean; gain: number; from: number; to: number; t: number; d: number; /** Echtzeit seit dem Start (s) */ pos: number }

/** Zustand (JSON-tauglich) */
export interface PrologueState {
  /** Szene 0 … 6 (Index in PROLOGUE_SCENES); 7 = fertig */
  scene: number;
  /** Zeit seit Prologbeginn und in der Szene (s, Echtzeit) */
  t: number;
  sceneT: number;
  /** nächster Taktschlag der Szene */
  beat: number;
  /** Szene 4: Steuerung frei, Ziel erreicht (Szenenzeit), Hinweis gegeben, Zeit abgelaufen */
  play: boolean;
  readyAt: number;
  hint: boolean;
  auto: boolean;
  bars: Ramp;
  time: Ramp;
  black: Ramp;
  cues: Record<ScoreCue, CueState>;
  /** absolute Stille (nach dem Stopp in Szene 1) */
  silent: boolean;
  done: boolean;
  /** Abfolge der gezeigten Zeilen (Prüfungen) */
  lines: number;
}

const ramp = (v: number): Ramp => ({ from: v, to: v, t: 0, d: 0 });
const smooth = (k: number) => { const x = k < 0 ? 0 : k > 1 ? 1 : k; return x * x * (3 - 2 * x); };
const rampValue = (r: Ramp): number => (r.d <= 0 || r.t >= r.d ? r.to : r.from + (r.to - r.from) * smooth(r.t / r.d));
const setRamp = (r: Ramp, to: number, d: number) => { r.from = rampValue(r); r.to = to; r.t = 0; r.d = Math.max(0, d); };
const stepRamp = (r: Ramp, dt: number) => { if (r.t < r.d) r.t = Math.min(r.d, r.t + dt); };

export function newPrologueState(): PrologueState {
  const cues = {} as Record<ScoreCue, CueState>;
  for (const c of SCORE_CUE_IDS) cues[c] = { on: false, gain: 0, from: 0, to: 0, t: 0, d: 0, pos: 0 };
  return {
    scene: 0, t: 0, sceneT: 0, beat: 0, play: false, readyAt: -1, hint: false, auto: false,
    bars: ramp(1), time: ramp(1), black: ramp(1), cues, silent: false, done: false, lines: 0,
  };
}

export const sceneOf = (st: PrologueState): PrologueSceneId | 'fertig' => PROLOGUE_SCENE_IDS[st.scene] ?? 'fertig';

/** Gesamtdauer aller reinen Film-Szenen (ohne den spielbaren Teil von Szene 4) – für Anzeige und Prüfungen */
export const FILM_SECONDS = PROLOGUE_SCENES.reduce((s, d) => s + (d.film ? d.dur : DECK_PLAY.from), 0);

/**
 * Die Regie. `step(dt, geo, out)` rechnet einen Echtzeit-Schritt (die Welt ruft ihn je gezeichnetem Bild, nicht im Pausenmenü) und schreibt
 * die fälligen Ereignisse nach `out`. Alles andere sind Abfragen.
 */
export class PrologueDirector {
  readonly state: PrologueState;

  constructor(state?: PrologueState) { this.state = state ?? newPrologueState(); }

  get scene(): PrologueSceneId | 'fertig' { return sceneOf(this.state); }
  get sceneNr(): number { return this.state.scene + 1; }
  get done(): boolean { return this.state.done; }
  /** Spielbar: Szene 4 ab `DECK_PLAY.from`, bis das Ziel erreicht ist */
  get playable(): boolean { return this.state.play && this.state.readyAt < 0 && !this.state.done; }
  /** 21:9-Kinobalken (0 … 1) */
  get bars(): number { return this.state.done ? 0 : rampValue(this.state.bars); }
  /** Zeitmaß der Welt (Zeitlupe in Szene 5) */
  get timeScale(): number { return this.state.done ? 1 : rampValue(this.state.time); }
  /** Schwarzblende (0 … 1) */
  get blackout(): number { return this.state.done ? 0 : rampValue(this.state.black); }
  /** Lautstärke eines Stücks (0 … 1) */
  cueGain(c: ScoreCue): number { const s = this.state.cues[c]; return s.on ? (s.d <= 0 || s.t >= s.d ? s.to : s.from + (s.to - s.from) * (s.t / s.d)) : 0; }
  /** Abspielposition eines Stücks in Echtzeit (s seit dem Start) */
  cuePos(c: ScoreCue): number { return this.state.cues[c].pos; }
  /** Läuft irgendein Stück hörbar? (die 1,2-s-Stille nach Szene 1 ist hörbar still) */
  get musicAudible(): boolean { for (const c of SCORE_CUE_IDS) if (this.cueGain(c) > 0.001) return true; return false; }

  /** Ein Echtzeit-Schritt */
  step(dt: number, geo: PrologueGeo, out: PrologueOut): number {
    out.n = 0;
    const st = this.state;
    if (st.done) return 0;
    if (st.t === 0 && st.sceneT === 0 && st.beat === 0) this.enterScene(out);
    st.t += dt;
    st.sceneT += dt;
    stepRamp(st.bars, dt); stepRamp(st.time, dt); stepRamp(st.black, dt);
    for (const c of SCORE_CUE_IDS) {
      const s = st.cues[c];
      if (!s.on) continue;
      s.pos += dt;
      if (s.t < s.d) s.t = Math.min(s.d, s.t + dt);
      // ausgeblendet: aus
      if (s.to <= 0 && s.t >= s.d) { s.on = false; s.gain = 0; } else s.gain = this.cueGain(c);
    }
    this.fireBeats(out);
    const def = PROLOGUE_SCENES[st.scene];
    if (def.id === 'gegenangriff') this.stepDeck(geo, out);
    else if (st.sceneT >= def.dur) this.nextScene(out);
    return out.n;
  }

  /** Fällige Taktschläge der Szene auslösen (in Reihenfolge) */
  private fireBeats(out: PrologueOut) {
    const st = this.state;
    const script = PROLOGUE_SCRIPT[PROLOGUE_SCENES[st.scene].id];
    while (st.beat < script.length && script[st.beat].at <= st.sceneT) this.fire(script[st.beat++], out);
  }

  private fire(bt: Beat, out: PrologueOut) {
    const st = this.state;
    switch (bt.kind) {
      case 'music': this.music(bt.id, bt.v ?? 1, bt.d ?? 0); break;
      case 'bars': setRamp(st.bars, bt.v ?? 0, bt.d ?? 0); break;
      case 'time': setRamp(st.time, bt.v ?? 1, bt.d ?? 0); break;
      case 'black': setRamp(st.black, bt.v ?? 0, bt.d ?? 0); break;
      case 'amb': st.silent = bt.id === 'stille'; break;
      case 'line': st.lines++; break;
      default: break;
    }
    const e = out.push(bt.kind);
    e.id = bt.id; e.v = bt.v ?? 0; e.d = bt.d ?? 0; e.scene = st.scene + 1; e.at = bt.at;
  }

  /** Musik: `stop` schneidet alles hart ab; sonst ein Stück auf Ziel-Lautstärke `v` (Start bei 0 aus dem Stand) */
  private music(id: string, v: number, d: number) {
    const st = this.state;
    if (id === 'stop') {
      for (const c of SCORE_CUE_IDS) { const s = st.cues[c]; s.on = false; s.gain = 0; s.to = 0; s.from = 0; s.t = s.d = 0; }
      return;
    }
    const s = st.cues[id as ScoreCue];
    if (!s) return;
    if (!s.on) {
      if (v <= 0) return;
      s.on = true; s.pos = 0; s.from = d > 0 ? 0 : v; s.to = v; s.t = 0; s.d = d;
      s.gain = this.cueGain(id as ScoreCue);
      return;
    }
    s.from = this.cueGain(id as ScoreCue); s.to = v; s.t = 0; s.d = d;
  }

  /** Szene 4: Steuerung ab `DECK_PLAY.from`, Ziel → gefechtsbereit halten → Szene 5; Hinweis und Zeitgrenze */
  private stepDeck(geo: PrologueGeo, out: PrologueOut) {
    const st = this.state;
    if (!st.play && st.sceneT >= DECK_PLAY.from) { st.play = true; const e = out.push('play'); e.scene = 4; e.at = st.sceneT; }
    if (!st.play) return;
    if (st.readyAt < 0) {
      if (geo.reached) {
        st.readyAt = st.sceneT;
        const e = out.push('ready'); e.scene = 4; e.at = st.sceneT;
        return;
      }
      const playT = st.sceneT - DECK_PLAY.from;
      if (!st.hint && playT >= DECK_HINT_AFTER) { st.hint = true; const e = out.push('hint'); e.id = 'hinweis'; e.scene = 4; e.at = st.sceneT; }
      if (playT >= DECK_PLAY.autoAfter) {
        // die Zeit lief ab: die Welt setzt die Figur an ihre Kanone (kein Festhängen)
        st.auto = true;
        st.readyAt = st.sceneT;
        const a = out.push('auto'); a.scene = 4; a.at = st.sceneT;
        const r = out.push('ready'); r.scene = 4; r.at = st.sceneT;
      }
      return;
    }
    if (st.sceneT >= st.readyAt + DECK_PLAY.hold) this.nextScene(out);
  }

  private nextScene(out: PrologueOut) {
    const st = this.state;
    // nicht ausgelöste Taktschläge der Szene noch nachholen (Zeitsprung, sehr langes Bild): kein Untertitel und kein Einsatz geht verloren
    this.fireBeats(out);
    st.scene++;
    st.sceneT = 0;
    st.beat = 0;
    st.play = false;
    if (st.scene >= PROLOGUE_SCENES.length) { this.finish(out); return; }
    this.enterScene(out);
  }

  private enterScene(out: PrologueOut) {
    const st = this.state;
    const e = out.push('scene');
    e.id = PROLOGUE_SCENES[st.scene].id; e.v = st.scene + 1; e.scene = st.scene + 1;
    // Taktschläge zum Zeitpunkt 0 sofort
    this.fireBeats(out);
  }

  private finish(out: PrologueOut) {
    const st = this.state;
    if (st.done) return;
    st.done = true;
    st.scene = PROLOGUE_SCENES.length;
    for (const c of SCORE_CUE_IDS) { st.cues[c].on = false; st.cues[c].gain = 0; }
    out.push('done');
  }

  /** Prolog überspringen: sofort fertig (die Welt räumt die Bühne ab und blendet die Musik aus) */
  skip(out: PrologueOut) {
    out.n = 0;
    if (this.state.done) return;
    this.finish(out);
  }

  /** Zu einer Szene springen (Prüfungen, Entwicklung): alle Taktschläge davor gelten als ausgelöst, Musik und Rampen wie am Szenenbeginn */
  jumpTo(id: PrologueSceneId, out: PrologueOut) {
    const st = this.state;
    const idx = PROLOGUE_SCENE_IDS.indexOf(id);
    if (idx < 0) return;
    out.n = 0;
    for (const c of SCORE_CUE_IDS) { st.cues[c].on = false; st.cues[c].gain = 0; }
    st.scene = idx; st.sceneT = 0; st.beat = 0; st.play = false; st.readyAt = -1; st.hint = false; st.auto = false; st.silent = false;
    this.enterScene(out);
  }
}

/** Alle Ereignisse eines vollständigen Durchlaufs (Prüfungen und Werkzeuge): `reachAt` = Szenenzeit, zu der die Figur die Kanone erreicht */
export function simulatePrologue(dt = 1 / 60, reachAt = 16, maxT = 400): { t: number; scene: number; sceneT: number; type: PrologueEventType; id: string; v: number; d: number }[] {
  const d = new PrologueDirector();
  const out = new PrologueOut();
  const geo: PrologueGeo = { reached: false };
  const list: { t: number; scene: number; sceneT: number; type: PrologueEventType; id: string; v: number; d: number }[] = [];
  for (let i = 0; i < maxT / dt && !d.done; i++) {
    geo.reached = d.scene === 'gegenangriff' && d.state.play && d.state.sceneT >= reachAt;
    const n = d.step(dt, geo, out);
    for (let k = 0; k < n; k++) { const e = out.events[k]; list.push({ t: d.state.t, scene: e.scene || d.sceneNr, sceneT: e.at, type: e.type, id: e.id, v: e.v, d: e.d }); }
  }
  return list;
}
