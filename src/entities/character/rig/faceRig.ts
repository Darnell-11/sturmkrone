// Phase 4.6F: lebendige Anime-Gesichter – Blinzeln in unregelmäßigen Abständen (auch doppelt oder halb), weiche Mimik zwischen Hafen-Blick,
// Kampf-Blick und entschlossenem Grinsen, Mundbewegung beim Sprechen und ein Leuchten der Augen im Sturm-Erwachen.
// Reine Rechnung ohne three.js, eigener Zufall (kein Math.random): gleiche Saat = gleiche Abfolge (Tests, Wiederholbarkeit).
import { BLINK, EXPRESSIONS, FACE_CHANNELS, FACE_MORPH, FACE_SPEED, FACE_TRAITS, TALK, type ExpressionId, type FaceChannel } from '../../../data/characterRig';

export const NCH = FACE_CHANNELS.length;
const CH = Object.fromEntries(FACE_CHANNELS.map((c, i) => [c, i])) as Record<FaceChannel, number>;
/** Index eines Kanals */
export function channelIndex(c: FaceChannel) { return CH[c]; }

/** Kleiner, schneller Zufall (Mulberry32) mit eigener Saat */
export function rngOf(seed: number) {
  let s = (seed | 0) ^ 0x9e3779b9;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type BlinkPhase = 0 | 1 | 2 | 3; // offen, schließt, hält, öffnet

/**
 * Lidschlag: unregelmäßige Pausen (gestreckt um den Mittelwert, nie unter `min`/über `max`), gelegentlich ein Doppel- oder Halb-Blinzeln.
 * `value` 0 = offen … 1 = geschlossen. Blickwechsel können ein Blinzeln auslösen (`saccade`).
 */
export class BlinkScheduler {
  value = 0;
  /** Zahl der begonnenen Lidschläge und kürzeste/längste Pause (für Prüfungen) */
  count = 0;
  minGap = Infinity;
  maxGap = 0;
  private phase: BlinkPhase = 0;
  private t: number;
  private gap = 0;
  private depth = 1;
  private pendingDouble = false;
  private readonly rnd: () => number;

  constructor(seed: number) {
    this.rnd = rngOf(seed);
    this.t = this.nextGap(1);
  }

  /** nächste Pause: Mittelwert × e^(Normalverteilung · 0,45), begrenzt */
  private nextGap(k: number) {
    const u = Math.max(1e-6, this.rnd()), v = this.rnd();
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
    return Math.min(BLINK.max, Math.max(BLINK.min, BLINK.mean * k * Math.exp(n * 0.45)));
  }

  /** Blinzeln auslösen (Blicksprung, Schreck), sofern die Augen gerade offen sind */
  trigger() {
    if (this.phase === 0 && this.gap > 0.35) this.start();
  }

  private start() {
    this.phase = 1;
    this.t = BLINK.close;
    this.count++;
    if (this.gap > 0) { this.minGap = Math.min(this.minGap, this.gap); this.maxGap = Math.max(this.maxGap, this.gap); }
    this.gap = 0;
    this.depth = this.pendingDouble ? 1 : this.rnd() < BLINK.half ? BLINK.halfAmount : 1;
  }

  /** combat: Kampf-Blick (seltener blinzeln); hold: Augen gerade ganz zu (Jubel, K.o.) – dann ruht das Blinzeln */
  update(dt: number, combat = false, hold = false): number {
    if (!(dt > 0)) return this.value;
    if (hold) { this.value = 0; this.phase = 0; this.t = Math.max(this.t, 0.4); return 0; }
    this.gap += dt;
    this.t -= dt;
    switch (this.phase) {
      case 0:
        if (this.t <= 0) { this.pendingDouble = false; this.start(); }
        break;
      case 1:
        this.value = this.depth * (1 - Math.max(0, this.t) / BLINK.close);
        if (this.t <= 0) { this.phase = 2; this.t = BLINK.hold; this.value = this.depth; }
        break;
      case 2:
        this.value = this.depth;
        if (this.t <= 0) { this.phase = 3; this.t = BLINK.open; }
        break;
      case 3: {
        // öffnet langsamer, mit weichem Auslauf
        const u = 1 - Math.max(0, this.t) / BLINK.open;
        this.value = this.depth * (1 - u * u * (3 - 2 * u));
        if (this.t <= 0) {
          this.value = 0;
          this.phase = 0;
          if (!this.pendingDouble && this.rnd() < BLINK.double) { this.pendingDouble = true; this.t = 0.09 + this.rnd() * 0.08; }
          else { this.pendingDouble = false; this.t = this.nextGap(combat ? BLINK.combat : 1); }
        }
        break;
      }
    }
    return this.value;
  }
}

/** Grundzüge aus dem Editor in Kanalgewichte (unbekannte Werte = neutral) */
export function traitWeights(eyes: string | undefined, brows: string | undefined, mouth: string | undefined, out = new Float32Array(NCH)): Float32Array {
  out.fill(0);
  for (const e of [FACE_TRAITS.eyes[eyes ?? ''], FACE_TRAITS.brows[brows ?? ''], FACE_TRAITS.mouth[mouth ?? '']]) {
    if (!e) continue;
    for (const [k, v] of Object.entries(e)) out[CH[k as FaceChannel]] += v as number;
  }
  return out;
}

const EXPR_W = new Map<ExpressionId, Float32Array>();
function exprWeights(id: ExpressionId): Float32Array {
  let w = EXPR_W.get(id);
  if (!w) {
    w = new Float32Array(NCH);
    for (const [k, v] of Object.entries(EXPRESSIONS[id].w)) w[CH[k as FaceChannel]] = v as number;
    EXPR_W.set(id, w);
  }
  return w;
}

const BROW = new Set(['browAngry', 'browJoy', 'browSorrow', 'browSurprised', 'browFun']);
const MOUTH_START = CH.mouthAngry;
const EYE_CLOSE = CH.eyeClose;
const VISEMES = [CH.mouthA, CH.mouthI, CH.mouthU, CH.mouthE, CH.mouthO];
const EYE_CH = [CH.eyeAngry, CH.eyeJoy, CH.eyeSorrow, CH.eyeSurprised, CH.eyeSpread, CH.eyeFun];

/**
 * Mischpult der Mimik: Grundzüge (Editor) + Ausdruck (Stimmung) + Sprechen + Blinzeln → Gewicht je Kanal (0 … 1).
 * Kein Speicher je Bild; `weights` ist das Ergebnis.
 */
export class FaceMixer {
  readonly weights = new Float32Array(NCH);
  private readonly base = new Float32Array(NCH);
  private readonly cur = new Float32Array(NCH);
  readonly blink: BlinkScheduler;
  mood: ExpressionId = 'hafen';
  private moodK = 1;
  /** Leuchten der Augen (0 … 1): Sturm-Erwachen, Ultimates */
  glow = 0;
  private talkT = 0;
  private talkOn = false;
  private visT = 0;
  private vis = 0;
  private visAmp = 0;
  private wordLeft = 0;
  private readonly visCur = new Float32Array(NCH);
  private readonly rnd: () => number;

  constructor(seed: number) {
    this.blink = new BlinkScheduler(seed);
    this.rnd = rngOf(seed * 7 + 3);
  }

  setTraits(eyes?: string, brows?: string, mouth?: string) { traitWeights(eyes, brows, mouth, this.base); }

  /** Ausdruck setzen; strength 0 … 1 (0,5 = angedeutet) */
  setMood(id: ExpressionId, strength = 1) { this.mood = id; this.moodK = Math.max(0, Math.min(1, strength)); }

  /** Sprechen für `sec` Sekunden (0 = aufhören) */
  talk(sec: number) { this.talkT = Math.max(0, sec); this.talkOn = sec > 0; if (!this.talkOn) this.wordLeft = 0; }
  get talking() { return this.talkOn; }

  update(dt: number): Float32Array {
    if (!(dt > 0)) return this.weights;
    const ex = exprWeights(this.mood), mk = this.moodK, b = this.base, cur = this.cur;
    // Augen ganz zu bei Jubel (^^) und K.o.: dann kein Blinzeln
    const closedMood = this.mood === 'ko' || (this.mood === 'jubel' && mk > 0.5);
    const bl = this.blink.update(dt, this.mood === 'kampf' || this.mood === 'entschlossen', closedMood);
    const kb = 1 - Math.exp(-FACE_SPEED.brow * dt), ke = 1 - Math.exp(-FACE_SPEED.eye * dt), km = 1 - Math.exp(-FACE_SPEED.mouth * dt);
    for (let i = 0; i < NCH; i++) {
      // Grundzüge treten zurück, wenn ein starker Ausdruck sie überlagert
      const want = Math.min(1, b[i] * (1 - 0.55 * mk * Math.min(1, ex[i] * 3)) + ex[i] * mk);
      const k = i >= MOUTH_START ? km : BROW.has(FACE_CHANNELS[i]) ? kb : ke;
      cur[i] += (want - cur[i]) * k;
    }
    // Sprechen: Laute im Wechsel, Wörter mit Pausen
    if (this.talkOn) {
      this.talkT -= dt;
      if (this.talkT <= 0) this.talk(0);
      this.visT -= dt;
      if (this.visT <= 0) {
        if (this.wordLeft <= 0) {
          this.wordLeft = TALK.wordMin + Math.floor(this.rnd() * (TALK.wordMax - TALK.wordMin + 1));
          this.visT = TALK.pause * (0.6 + this.rnd() * 0.8);
          this.visAmp = 0;
        } else {
          this.wordLeft--;
          this.vis = VISEMES[Math.floor(this.rnd() * VISEMES.length)];
          this.visAmp = TALK.ampMin + this.rnd() * (TALK.ampMax - TALK.ampMin);
          this.visT = TALK.min + this.rnd() * (TALK.max - TALK.min);
        }
      }
    } else this.visAmp = 0;
    const w = this.weights;
    for (let i = 0; i < NCH; i++) w[i] = cur[i];
    // eigene, schnelle Glättung der Laute (sonst „kaut“ der Mund)
    const kv = 1 - Math.exp(-28 * dt);
    for (const v of VISEMES) {
      const tgt = this.talkOn && v === this.vis ? this.visAmp : 0;
      this.visCur[v] += (tgt - this.visCur[v]) * kv;
      w[v] = Math.min(1, w[v] + this.visCur[v]);
    }
    // Blinzeln liegt über allem; andere Augen-Formen weichen beim Schließen zurück (sonst überschneiden sich die Lider)
    const closed = Math.min(1, w[EYE_CLOSE] + bl * (1 - w[EYE_CLOSE]));
    w[EYE_CLOSE] = closed;
    const keep = 1 - closed;
    for (const e of EYE_CH) w[e] *= keep;
    // Leuchten: Erwachen-Ausdruck bringt es mit, sonst klingt es ab
    const gTgt = EXPRESSIONS[this.mood].glow * mk;
    this.glow += (gTgt - this.glow) * (1 - Math.exp(-(gTgt > this.glow ? 10 : 3) * dt));
    for (let i = 0; i < NCH; i++) { const x = w[i]; w[i] = x < 0 ? 0 : x > 1 ? 1 : x; }
    return w;
  }
}

/**
 * Morph-Ziele der Grundfigur je Kanal: sucht im Wörterbuch des Netzes (Name → Index) den Eintrag, dessen Name auf den Kanalnamen endet
 * (Groß-/Kleinschreibung egal: die weibliche Vorlage schreibt „Fcl_Eye_Fun“). −1 = gibt es nicht.
 */
export function morphMap(dict: Record<string, number> | undefined): Int16Array {
  const out = new Int16Array(NCH).fill(-1);
  if (!dict) return out;
  const names = Object.keys(dict);
  const low = names.map((n) => n.toLowerCase());
  FACE_CHANNELS.forEach((c, i) => {
    // alle Namen beginnen mit „fcl_“: eine Endung trifft nie einen längeren Namen (Fcl_EYE_Close ≠ Fcl_EYE_Close_L)
    const want = FACE_MORPH[c].toLowerCase();
    const j = low.findIndex((n) => n === want || n.endsWith(want));
    out[i] = j >= 0 ? dict[names[j]] : -1;
  });
  return out;
}
