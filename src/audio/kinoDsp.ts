// Phase 4.93A – Kino-DSP: mehrschichtige Web-Audio-Pipeline für die Kino-Endgame-Regie (Formen, Ultimates).
//
// **Wiederverwendete Routing-Knoten (Zero-GC):** alle Oszillatoren, Rauschquellen, Filter, Pegel-, Sättigungs-, Kompressor- und Panorama-Knoten
// entstehen EINMAL in `init` und laufen durch. Ein Klang ist danach nur noch ein Fahrplan aus AudioParam-Automationen (`setValueAtTime`,
// Rampen) auf diesen Knoten – `charge`, `impact` und `play` legen keinen Knoten, kein Feld und kein Objekt an.
//
// **Master-Kette je Stimme** (in dieser Reihenfolge):
//   Schicht-Summe → Stille-Senke → `WaveShaperNode` (subtile harmonische Bass-Sättigung: die Obertöne der 22 – 55 Hz-Sub-Bässe sind auch auf
//   Laptop- und Handy-Lautsprechern zu hören) → `DynamicsCompressorNode` → `StereoPannerNode` (Ortung aus Kamera und Schallquelle)
//   → abgestimmter Ozean-/Insel-Hall (zwei `ConvolverNode` mit eigener Raumantwort, nach dem Ort überblendet) → Effekt-Bus der Klang-Engine.
//
// **Vier Schichten + „Silence before the Storm“** (Rezepte in `kinoCues.ts`):
//   1 Auflade-Sog · 2 Bewegungs-Transient mit Doppler → Stille-Senke (45 ms) → 3 Einschlag (Sub-Bass-Fall, Mitten-Punch, Krachen) · 4 Nachbeben
import { afterFor, crackFor, type KinoCue } from './kinoCues';

/** Reihenfolge der Master-Kette (Knotenarten) – Prüfungen vergleichen sie mit dem gebauten Graphen */
export const KINO_MASTER_CHAIN = ['WaveShaperNode', 'DynamicsCompressorNode', 'StereoPannerNode', 'ConvolverNode'] as const;

export const KINO = {
  /** gleichzeitige Stimmen (eigene Aktion + Mitspieler); sparsam: 2 */
  voices: 3, voicesLite: 2,
  /** Vorlauf für das Planen (s) */
  lead: 0.012,
  /** Hall-Anteil an Land bzw. über dem Meer und Länge der Raumantworten (s) */
  wetIsland: 0.22, wetOcean: 0.4, irIsland: 1.3, irOcean: 2.9,
  /** Sättigung: Antrieb und Anteil gerader Obertöne */
  drive: 1.9, asym: 0.14,
  /** Kompressor der Kette */
  threshold: -16, knee: 10, ratio: 5, attack: 0.003, release: 0.22,
  /** Pegel der ganzen Pipeline */
  out: 0.9,
} as const;

/** Zeiten eines Klangs (s ab Start): Ende der Aufladung, Treffermoment, Gesamtdauer; Stille-Senke (ms) */
export interface KinoTimes { t1: number; t2: number; total: number; silenceMs: number }

/**
 * Kennlinie der Bass-Sättigung: y = tanh(drive · (x + asym · x²)) ÷ tanh(drive). Monoton, |y| ≤ 1, um 0 fast linear (subtil); der tanh-Anteil
 * erzeugt ungerade, der x²-Anteil gerade Obertöne – aus einem 24-Hz-Sinus werden 48, 72, 96, 120 Hz, die kleine Lautsprecher wiedergeben.
 */
export function saturationCurve(n = 2048, drive: number = KINO.drive, asym: number = KINO.asym): Float32Array<ArrayBuffer> {
  const c = new Float32Array(new ArrayBuffer(n * 4));
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.max(-1, Math.min(1, Math.tanh(drive * (x + asym * x * x)) / norm));
  }
  return c;
}

/** Harte Kennlinie des Mitten-Punchs (verzerrt: Rechteck-nah) */
export function punchCurve(n = 1024): Float32Array<ArrayBuffer> {
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(6 * x) * 0.9; }
  return c;
}

/** Deterministischer Zufall (kein `Math.random`: gleiche Puffer bei jedem Start, keine Speicheranforderung) */
function lcg(s: number): number { return (Math.imul(s, 1664525) + 1013904223) >>> 0; }

/** Rauschen in einen Puffer schreiben: weiß, rosa (Paul Kellet) oder braun (integriert) */
export function fillNoise(d: Float32Array, kind: 'white' | 'pink' | 'brown', seed = 1): void {
  let s = seed >>> 0 || 1;
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < d.length; i++) {
    s = lcg(s);
    const w = (s / 4294967296) * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  }
}

/** Raumantwort: abklingendes Rauschen; Ozean lang, dunkel und weit, Insel kürzer mit dichten frühen Reflexionen (Fels, Mauern) */
export function fillImpulse(l: Float32Array, r: Float32Array, rate: number, ocean: boolean): void {
  const n = l.length;
  let s = ocean ? 77 : 311, lpL = 0, lpR = 0;
  const decay = ocean ? 2.4 : 3.6, dark = ocean ? 0.82 : 0.55;
  for (let i = 0; i < n; i++) {
    const t = i / n, env = Math.pow(1 - t, decay);
    s = lcg(s); const a = (s / 4294967296) * 2 - 1;
    s = lcg(s); const b = (s / 4294967296) * 2 - 1;
    // Tiefpass wächst mit der Zeit (der Nachhall wird dunkler), über dem Meer stärker
    const k = Math.min(0.97, dark * (0.35 + 0.65 * t));
    lpL = lpL * k + a * (1 - k); lpR = lpR * k + b * (1 - k);
    const early = i < rate * 0.03 ? 0.55 : 1;
    l[i] = lpL * env * early * 2.2; r[i] = lpR * env * early * 2.2;
  }
  // frühe Reflexionen: an Land dicht (acht Wände), über dem Meer zwei ferne Echos von der Wasserfläche
  const taps = ocean ? 2 : 8;
  for (let k = 0; k < taps; k++) {
    s = lcg(s);
    const at = Math.floor(rate * (ocean ? 0.09 + k * 0.13 : 0.008 + (s / 4294967296) * 0.07));
    if (at < n) { const g = (ocean ? 0.5 : 0.7) * (1 - k / (taps + 1)); if (k % 2) l[at] += g; else r[at] += g; }
  }
}

/** Eine Stimme: alle Knoten der vier Schichten und ihre Master-Kette (einmal gebaut, dann nur noch Automationen) */
interface Voice {
  // Schicht 1
  g1: GainNode; bp1: BiquadFilterNode; sub1: OscillatorNode; gSub: GainNode; lfo: OscillatorNode; lfoDepth: GainNode; pinkIn: GainNode; brownIn: GainNode;
  // Schicht 2
  g2: GainNode; bp2: BiquadFilterNode; dop: OscillatorNode; gDop: GainNode; pan2: StereoPannerNode;
  // Schicht 3
  sub3: OscillatorNode; g3s: GainNode; mid3: OscillatorNode; g3m: GainNode; g3c: GainNode; hp3: BiquadFilterNode; g3b: GainNode; lp3: BiquadFilterNode;
  // Schicht 4
  g4r: GainNode; lp4: BiquadFilterNode; g4c: GainNode; bp4: BiquadFilterNode; g4w: GainNode; bp4w: BiquadFilterNode;
  // Master-Kette
  duck: GainNode; shaper: WaveShaperNode; comp: DynamicsCompressorNode; pan: StereoPannerNode; dry: GainNode; send: GainNode;
  busyUntil: number;
}

export class KinoDsp {
  ctx: AudioContext | null = null;
  private readonly voices: Voice[] = [];
  private revOcean: GainNode | null = null;
  private revIsland: GainNode | null = null;
  private seed = 12345;
  /** Zähler für Prüfungen: geplante Klänge, Einschläge, übernommene Stimmen, gebaute Knoten */
  readonly stats = { charges: 0, impacts: 0, steals: 0, nodes: 0, dips: 0 };

  get ready(): boolean { return this.voices.length > 0; }
  get voiceCount(): number { return this.voices.length; }

  private mk<T extends AudioNode>(n: T): T { this.stats.nodes++; return n; }

  /** Graph einmal aufbauen: geteilte Rauschquellen und Hallräume, je Stimme die vier Schichten und die Master-Kette */
  init(ctx: AudioContext, out: AudioNode, voices: number = KINO.voices): void {
    if (this.ctx) return;
    this.ctx = ctx;
    const rate = ctx.sampleRate;
    // geteilte Rauschquellen (2 s, in Schleife): weiß, rosa, braun
    const src = (kind: 'white' | 'pink' | 'brown', seed: number): AudioBufferSourceNode => {
      const buf = ctx.createBuffer(1, Math.floor(rate * 2), rate);
      fillNoise(buf.getChannelData(0), kind, seed);
      const s = this.mk(ctx.createBufferSource());
      s.buffer = buf; s.loop = true; s.start();
      return s;
    };
    const white = src('white', 7), pink = src('pink', 19), brown = src('brown', 43);
    // Hallräume: Ozean und Insel, über zwei Eingangs-Pegel überblendet
    const outGain = this.mk(ctx.createGain()); outGain.gain.value = KINO.out; outGain.connect(out);
    const room = (ocean: boolean): GainNode => {
      const len = Math.floor(rate * (ocean ? KINO.irOcean : KINO.irIsland));
      const ir = ctx.createBuffer(2, len, rate);
      fillImpulse(ir.getChannelData(0), ir.getChannelData(1), rate, ocean);
      const conv = this.mk(ctx.createConvolver()); conv.buffer = ir;
      const input = this.mk(ctx.createGain()); input.gain.value = ocean ? 0 : 1;
      input.connect(conv); conv.connect(outGain);
      return input;
    };
    this.revOcean = room(true);
    this.revIsland = room(false);
    const sat = saturationCurve(), punch = punchCurve();
    for (let v = 0; v < voices; v++) {
      const g = (val = 0): GainNode => { const n = this.mk(ctx.createGain()); n.gain.value = val; return n; };
      const bq = (type: BiquadFilterType, f: number, q: number): BiquadFilterNode => { const n = this.mk(ctx.createBiquadFilter()); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
      const osc = (type: OscillatorType, f: number): OscillatorNode => { const n = this.mk(ctx.createOscillator()); n.type = type; n.frequency.value = f; n.start(); return n; };
      // Master-Kette: Senke → Sättigung → Kompressor → Panorama → trocken + Hall
      const duck = g(1);
      const shaper = this.mk(ctx.createWaveShaper()); shaper.curve = sat; shaper.oversample = '2x';
      const comp = this.mk(ctx.createDynamicsCompressor());
      comp.threshold.value = KINO.threshold; comp.knee.value = KINO.knee; comp.ratio.value = KINO.ratio; comp.attack.value = KINO.attack; comp.release.value = KINO.release;
      const pan = this.mk(ctx.createStereoPanner());
      const dry = g(1), send = g(KINO.wetIsland);
      duck.connect(shaper); shaper.connect(comp); comp.connect(pan); pan.connect(dry); dry.connect(outGain);
      pan.connect(send); send.connect(this.revOcean); send.connect(this.revIsland);
      // Schicht 1: Rauschen (rosa/braun) → Pegel → Bandpass; Puls-Sub mit LFO auf dem Pegel
      const pinkIn = g(), brownIn = g(), g1 = g(), bp1 = bq('bandpass', 120, 1.5);
      pink.connect(pinkIn); brown.connect(brownIn); pinkIn.connect(g1); brownIn.connect(g1); g1.connect(bp1); bp1.connect(duck);
      const sub1 = osc('sine', 50), gSub = g(), lfo = osc('sine', 6), lfoDepth = g();
      sub1.connect(gSub); gSub.connect(duck); lfo.connect(lfoDepth); lfoDepth.connect(gSub.gain);
      // Schicht 2: Weißrausch-Riss durch einen schnell fallenden Bandpass; Doppler-Ton; eigener Stereo-Schwung
      const g2 = g(), bp2 = bq('bandpass', 3000, 2.2), dop = osc('sawtooth', 600), gDop = g(), bpDop = bq('bandpass', 900, 1.2);
      const pan2 = this.mk(ctx.createStereoPanner());
      white.connect(g2); g2.connect(bp2); bp2.connect(pan2); dop.connect(gDop); gDop.connect(bpDop); bpDop.connect(pan2); pan2.connect(duck);
      // Schicht 3: Sub-Bass-Fall, verzerrter Mitten-Punch, Krachen (Hochpass) mit Körper (Tiefpass auf Braun-Rauschen)
      const sub3 = osc('sine', 90), g3s = g();
      sub3.connect(g3s); g3s.connect(duck);
      const mid3 = osc('triangle', 450), g3m = g(), dist = this.mk(ctx.createWaveShaper()), bp3 = bq('bandpass', 300, 0.9);
      dist.curve = punch;
      mid3.connect(g3m); g3m.connect(dist); dist.connect(bp3); bp3.connect(duck);
      const g3c = g(), hp3 = bq('highpass', 2000, 0.7), g3b = g(), lp3 = bq('lowpass', 400, 0.8);
      white.connect(g3c); g3c.connect(hp3); hp3.connect(duck); brown.connect(g3b); g3b.connect(lp3); lp3.connect(duck);
      // Schicht 4: Tiefbass-Groll, Knistern, prasselndes Wasser
      const g4r = g(), lp4 = bq('lowpass', 80, 0.9), g4c = g(), bp4 = bq('bandpass', 4200, 3), g4w = g(), bp4w = bq('bandpass', 1500, 0.7);
      brown.connect(g4r); g4r.connect(lp4); lp4.connect(duck); white.connect(g4c); g4c.connect(bp4); bp4.connect(duck); pink.connect(g4w); g4w.connect(bp4w); bp4w.connect(duck);
      this.voices.push({ g1, bp1, sub1, gSub, lfo, lfoDepth, pinkIn, brownIn, g2, bp2, dop, gDop, pan2, sub3, g3s, mid3, g3m, g3c, hp3, g3b, lp3, g4r, lp4, g4c, bp4, g4w, bp4w, duck, shaper, comp, pan, dry, send, busyUntil: 0 });
    }
  }

  /** freie Stimme (sonst die, die am längsten fertig ist bzw. am frühesten frei wird) */
  private pick(now: number): Voice {
    let best = this.voices[0];
    for (let i = 1; i < this.voices.length; i++) if (this.voices[i].busyUntil < best.busyUntil) best = this.voices[i];
    if (best.busyUntil > now) this.stats.steals++;
    return best;
  }

  /** Ort und Raum einer Stimme setzen: Panorama −1 … 1, Pegel (Entfernung), Hall nach Meer (1) bzw. Insel (0) */
  private place(v: Voice, t: number, pan: number, sea: number, gain: number) {
    const p = pan < -1 ? -1 : pan > 1 ? 1 : pan, s = sea < 0 ? 0 : sea > 1 ? 1 : sea;
    v.pan.pan.cancelScheduledValues(t); v.pan.pan.setValueAtTime(p, t);
    v.dry.gain.cancelScheduledValues(t); v.dry.gain.setValueAtTime(gain, t);
    v.send.gain.cancelScheduledValues(t); v.send.gain.setValueAtTime(gain * (KINO.wetIsland + (KINO.wetOcean - KINO.wetIsland) * s), t);
    if (this.revOcean && this.revIsland) { this.revOcean.gain.setTargetAtTime(s, t, 0.05); this.revIsland.gain.setTargetAtTime(1 - s, t, 0.05); }
  }

  /**
   * Schicht 1 + 2 und die Stille-Senke planen (Beginn der Aktion). Gibt die Stimme zurück (für `impactOn`), −1 ohne Klangkarte.
   * `tm.t1` = Ende der Aufladung, `tm.t2` = Treffermoment.
   */
  charge(cue: KinoCue, tm: KinoTimes, pan = 0, sea = 0, gain = 1): number {
    const c = this.ctx;
    if (!c || !this.voices.length) return -1;
    const T0 = c.currentTime + KINO.lead, T1 = T0 + tm.t1, T2 = T0 + Math.max(tm.t1 + 0.05, tm.t2);
    const sil = Math.min(tm.silenceMs > 0 ? tm.silenceMs : cue.silenceMs, (T2 - T1) * 500) / 1000;
    const Ts = T2 - sil;
    const v = this.pick(T0);
    v.busyUntil = T0 + tm.total + cue.afterDur + 0.4;
    this.place(v, T0, pan, sea, gain);
    // ----- Schicht 1: Auflade-Sog -----
    const pinkOn = cue.noise === 'pink' ? 1 : 0;
    v.pinkIn.gain.cancelScheduledValues(T0); v.pinkIn.gain.setValueAtTime(pinkOn, T0);
    v.brownIn.gain.cancelScheduledValues(T0); v.brownIn.gain.setValueAtTime(1 - pinkOn, T0);
    v.g1.gain.cancelScheduledValues(T0); v.g1.gain.setValueAtTime(0.0001, T0);
    v.g1.gain.linearRampToValueAtTime(cue.chargeGain, T1);
    v.g1.gain.setValueAtTime(cue.chargeGain, Ts - 0.004); v.g1.gain.linearRampToValueAtTime(0.0001, Ts);
    v.bp1.frequency.cancelScheduledValues(T0); v.bp1.frequency.setValueAtTime(cue.sweepFrom, T0);
    v.bp1.frequency.exponentialRampToValueAtTime(cue.sweepTo, Ts);
    v.sub1.frequency.cancelScheduledValues(T0); v.sub1.frequency.setValueAtTime(cue.pulseHz, T0); v.sub1.frequency.linearRampToValueAtTime(cue.pulseHz * 1.08, T1);
    v.lfo.frequency.cancelScheduledValues(T0); v.lfo.frequency.setValueAtTime(cue.pulseRate, T0); v.lfo.frequency.linearRampToValueAtTime(cue.pulseRate * 1.8, Ts);
    const half = cue.pulseGain * 0.5;
    v.gSub.gain.cancelScheduledValues(T0); v.gSub.gain.setValueAtTime(0.0001, T0); v.gSub.gain.linearRampToValueAtTime(half, T1);
    v.gSub.gain.setValueAtTime(half, Ts - 0.004); v.gSub.gain.linearRampToValueAtTime(0.0001, Ts);
    v.lfoDepth.gain.cancelScheduledValues(T0); v.lfoDepth.gain.setValueAtTime(0, T0); v.lfoDepth.gain.linearRampToValueAtTime(half, T1);
    v.lfoDepth.gain.setValueAtTime(half, Ts - 0.004); v.lfoDepth.gain.linearRampToValueAtTime(0, Ts);
    // ----- Schicht 2: Bewegungs-Transient (Riss mit schneller Tonhöhen-Hüllkurve) und Doppler-Schwung -----
    v.bp2.frequency.cancelScheduledValues(T0); v.bp2.frequency.setValueAtTime(cue.whipFrom, T1);
    v.bp2.frequency.exponentialRampToValueAtTime(cue.whipTo, T1 + 0.11);
    v.g2.gain.cancelScheduledValues(T0); v.g2.gain.setValueAtTime(0.0001, T1 - 0.001);
    v.g2.gain.linearRampToValueAtTime(cue.whipGain, T1 + 0.006); v.g2.gain.exponentialRampToValueAtTime(0.0001, T1 + (cue.double ? 0.06 : 0.16));
    v.pan2.pan.cancelScheduledValues(T0);
    if (cue.double) {
      // Stereo-Doppelknall: links, 70 ms später rechts
      v.pan2.pan.setValueAtTime(-0.85, T1); v.pan2.pan.setValueAtTime(0.85, T1 + 0.066);
      v.bp2.frequency.setValueAtTime(cue.whipFrom * 1.12, T1 + 0.07); v.bp2.frequency.exponentialRampToValueAtTime(cue.whipTo, T1 + 0.18);
      v.g2.gain.setValueAtTime(0.0001, T1 + 0.068); v.g2.gain.linearRampToValueAtTime(cue.whipGain, T1 + 0.076); v.g2.gain.exponentialRampToValueAtTime(0.0001, T1 + 0.22);
    } else {
      v.pan2.pan.setValueAtTime(-0.9 * cue.doppler, T1); v.pan2.pan.linearRampToValueAtTime(0.9 * cue.doppler, Ts);
    }
    const dopF = cue.whipFrom * 0.24;
    v.dop.frequency.cancelScheduledValues(T0); v.dop.frequency.setValueAtTime(dopF, T1); v.dop.frequency.exponentialRampToValueAtTime(Math.max(60, dopF * 0.35), Ts);
    v.gDop.gain.cancelScheduledValues(T0); v.gDop.gain.setValueAtTime(0.0001, T1);
    v.gDop.gain.linearRampToValueAtTime(0.4 * cue.doppler * cue.whipGain, T1 + (Ts - T1) * 0.45); v.gDop.gain.linearRampToValueAtTime(0.0001, Ts);
    // Stakkato-Sub-Bass in Phase 2 (trommelnde Fäuste, Vorhut-Einschläge)
    v.g3s.gain.cancelScheduledValues(T0); v.g3s.gain.setValueAtTime(0.0001, T0);
    v.sub3.frequency.cancelScheduledValues(T0);
    if (cue.staccato > 0 && Ts - T1 > 0.08) {
      const gap = (Ts - T1 - 0.03) / cue.staccato;
      for (let i = 0; i < cue.staccato; i++) {
        const ti = T1 + 0.015 + i * gap;
        v.sub3.frequency.setValueAtTime(74, ti); v.sub3.frequency.exponentialRampToValueAtTime(38, ti + gap * 0.8);
        v.g3s.gain.setValueAtTime(cue.subGain * 0.42, ti); v.g3s.gain.exponentialRampToValueAtTime(0.0001, ti + gap * 0.82);
      }
    }
    // ----- Stille-Senke: unmittelbar vor dem Einschlag schweigt die ganze Stimme -----
    v.duck.gain.cancelScheduledValues(T0); v.duck.gain.setValueAtTime(1, T0);
    if (sil > 0.004) {
      v.duck.gain.setValueAtTime(1, Ts - 0.004); v.duck.gain.linearRampToValueAtTime(0.0001, Ts);
      v.duck.gain.setValueAtTime(0.0001, T2 - 0.001); v.duck.gain.linearRampToValueAtTime(1, T2 + 0.002);
      this.stats.dips++;
    }
    this.stats.charges++;
    return this.voices.indexOf(v);
  }

  /**
   * Schicht 3 + 4 planen: `delay` s ab jetzt (0 = sofort: der Treffer der Welt ist gefallen). `voice` = Stimme aus `charge` (−1: freie Stimme,
   * z. B. für die Aktion eines Mitspielers, die erst im Treffermoment eintrifft).
   */
  impact(cue: KinoCue, voice = -1, pan = 0, sea = 0, gain = 1, delay = 0): number {
    const c = this.ctx;
    if (!c || !this.voices.length) return -1;
    const T2 = c.currentTime + KINO.lead + Math.max(0, delay);
    const v = voice >= 0 && voice < this.voices.length ? this.voices[voice] : this.pick(T2);
    if (voice < 0) {
      this.place(v, T2 - KINO.lead * 0.5, pan, sea, gain);
      v.duck.gain.cancelScheduledValues(T2 - KINO.lead * 0.5); v.duck.gain.setValueAtTime(1, T2 - KINO.lead * 0.5);
    }
    v.busyUntil = Math.max(v.busyUntil, T2 + 0.5 + cue.afterDur * 1.6);
    const seaOn = sea > 0.5;
    // ----- Schicht 3: Sub-Bass-Fall (90 Hz → Ziel in 150 ms) -----
    const dropEnd = T2 + cue.subMs / 1000, tail = 0.4 + cue.afterDur * 0.45;
    v.sub3.frequency.cancelScheduledValues(T2 - 0.001); v.sub3.frequency.setValueAtTime(cue.subFrom, T2);
    v.sub3.frequency.exponentialRampToValueAtTime(cue.subTo, dropEnd);
    v.g3s.gain.cancelScheduledValues(T2 - 0.001); v.g3s.gain.setValueAtTime(0.0001, T2 - 0.0005);
    v.g3s.gain.linearRampToValueAtTime(cue.subGain, T2 + 0.008); v.g3s.gain.setValueAtTime(cue.subGain, dropEnd);
    v.g3s.gain.exponentialRampToValueAtTime(0.0001, dropEnd + tail);
    // verzerrter Mitten-Punch (450 Hz → 180 Hz)
    v.mid3.frequency.cancelScheduledValues(T2 - 0.001); v.mid3.frequency.setValueAtTime(cue.midFrom, T2); v.mid3.frequency.exponentialRampToValueAtTime(cue.midTo, T2 + 0.09);
    v.g3m.gain.cancelScheduledValues(T2 - 0.001); v.g3m.gain.setValueAtTime(0.0001, T2 - 0.0005);
    v.g3m.gain.linearRampToValueAtTime(cue.midGain, T2 + 0.004); v.g3m.gain.exponentialRampToValueAtTime(0.0001, T2 + 0.22);
    // hochfrequentes Krachen mit Körper – Donnerknall, Steinbruch, Wasserfontäne oder Kanonen-Detonation
    const kind = crackFor(cue, seaOn);
    const hp = kind === 'thunder' ? 1800 : kind === 'stone' ? 2600 : kind === 'water' ? 700 : 1200;
    const dec = kind === 'thunder' ? 0.5 : kind === 'stone' ? 0.045 : kind === 'water' ? 0.9 : 0.12;
    const bodyFrom = kind === 'thunder' ? 400 : kind === 'stone' ? 600 : kind === 'water' ? 1200 : 300;
    const bodyTo = kind === 'thunder' ? 90 : kind === 'stone' ? 140 : kind === 'water' ? 300 : 70;
    const bodyDec = kind === 'thunder' ? 1.1 : kind === 'stone' ? 0.5 : kind === 'water' ? 0.9 : 0.45;
    v.hp3.frequency.cancelScheduledValues(T2 - 0.001); v.hp3.frequency.setValueAtTime(hp, T2);
    v.g3c.gain.cancelScheduledValues(T2 - 0.001); v.g3c.gain.setValueAtTime(0.0001, T2 - 0.0005);
    v.g3c.gain.linearRampToValueAtTime(cue.crackGain, T2 + 0.002); v.g3c.gain.exponentialRampToValueAtTime(0.0001, T2 + dec);
    let end = T2 + dec;
    if (kind === 'stone') {
      // Steinbruch: drei harte Brüche kurz hintereinander
      v.g3c.gain.setValueAtTime(cue.crackGain * 0.8, T2 + 0.052); v.g3c.gain.exponentialRampToValueAtTime(0.0001, T2 + 0.094);
      v.g3c.gain.setValueAtTime(cue.crackGain * 0.6, T2 + 0.11); v.g3c.gain.exponentialRampToValueAtTime(0.0001, T2 + 0.19);
      end = T2 + 0.19;
    }
    // mehrstufiger Nachhall des Krachens (Donner rollt nach)
    for (let i = 1; i <= cue.echoes; i++) {
      const te = Math.max(end + 0.01, T2 + 0.19 * i + 0.05 * i * i), ge = cue.crackGain * Math.pow(0.55, i);
      v.g3c.gain.setValueAtTime(ge, te); v.g3c.gain.exponentialRampToValueAtTime(0.0001, te + dec * (0.6 + 0.25 * i));
      end = te + dec * (0.6 + 0.25 * i);
    }
    v.lp3.frequency.cancelScheduledValues(T2 - 0.001); v.lp3.frequency.setValueAtTime(bodyFrom, T2); v.lp3.frequency.exponentialRampToValueAtTime(bodyTo, T2 + bodyDec);
    v.g3b.gain.cancelScheduledValues(T2 - 0.001); v.g3b.gain.setValueAtTime(0.0001, T2 - 0.0005);
    v.g3b.gain.linearRampToValueAtTime(cue.crackGain * 0.9, T2 + 0.006); v.g3b.gain.exponentialRampToValueAtTime(0.0001, T2 + bodyDec);
    // ----- Schicht 4: Nachbeben -----
    const T3 = T2 + 0.06, after = afterFor(cue, seaOn);
    v.lp4.frequency.cancelScheduledValues(T2 - 0.001); v.lp4.frequency.setValueAtTime(cue.rumbleHz, T2);
    v.g4r.gain.cancelScheduledValues(T2 - 0.001); v.g4r.gain.setValueAtTime(0.0001, T2);
    v.g4r.gain.linearRampToValueAtTime(cue.afterGain * (after === 'rumble' ? 1 : 0.45), T2 + 0.16); v.g4r.gain.setTargetAtTime(0, T2 + 0.22, cue.afterDur * 0.33);
    v.g4c.gain.cancelScheduledValues(T2 - 0.001); v.g4c.gain.setValueAtTime(0, T2);
    v.g4w.gain.cancelScheduledValues(T2 - 0.001); v.g4w.gain.setValueAtTime(0, T2);
    if (after === 'crackle') {
      // knisternde Blitze: kurze Stöße zu unregelmäßigen Zeiten (deterministischer Zufall, keine Speicheranforderung)
      const n = Math.max(3, Math.round(cue.afterDur * 16));
      let s = this.seed;
      for (let i = 0; i < n; i++) {
        s = lcg(s);
        const ti = T3 + (i + (s / 4294967296) * 0.8) * (cue.afterDur / n);
        s = lcg(s);
        const gi = cue.afterGain * (0.35 + 0.65 * (s / 4294967296)) * (1 - 0.6 * (i / n));
        v.g4c.gain.setValueAtTime(gi, ti); v.g4c.gain.setTargetAtTime(0, ti + 0.003, 0.009);
      }
      this.seed = s;
    } else if (after === 'water') {
      // prasselnde Wassermassen: breites Rauschen, das langsam verebbt
      v.g4w.gain.linearRampToValueAtTime(cue.afterGain * 0.85, T2 + 0.3); v.g4w.gain.setTargetAtTime(0, T2 + 0.45, cue.afterDur * 0.4);
    }
    this.stats.impacts++;
    return this.voices.indexOf(v);
  }

  /** Ganze Sequenz auf einmal planen (Formen: der Treffermoment liegt fest auf der Zeitachse) */
  play(cue: KinoCue, tm: KinoTimes, pan = 0, sea = 0, gain = 1): number {
    const v = this.charge(cue, tm, pan, sea, gain);
    if (v < 0) return -1;
    return this.impact(cue, v, pan, sea, gain, Math.max(tm.t1 + 0.05, tm.t2));
  }

  /** Alles sofort verstummen lassen (Szenenwechsel, Abbruch) */
  silence(): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    for (const v of this.voices) {
      v.duck.gain.cancelScheduledValues(t); v.duck.gain.setTargetAtTime(0.0001, t, 0.03);
      v.duck.gain.setValueAtTime(0.0001, t + 0.4);
      v.g1.gain.cancelScheduledValues(t); v.g1.gain.setValueAtTime(0, t + 0.2);
      v.gSub.gain.cancelScheduledValues(t); v.gSub.gain.setValueAtTime(0, t + 0.2);
      v.lfoDepth.gain.cancelScheduledValues(t); v.lfoDepth.gain.setValueAtTime(0, t + 0.2);
      v.g2.gain.cancelScheduledValues(t); v.g2.gain.setValueAtTime(0, t + 0.2);
      v.gDop.gain.cancelScheduledValues(t); v.gDop.gain.setValueAtTime(0, t + 0.2);
      v.g3s.gain.cancelScheduledValues(t); v.g3s.gain.setValueAtTime(0, t + 0.2);
      v.g3m.gain.cancelScheduledValues(t); v.g3m.gain.setValueAtTime(0, t + 0.2);
      v.g3c.gain.cancelScheduledValues(t); v.g3c.gain.setValueAtTime(0, t + 0.2);
      v.g3b.gain.cancelScheduledValues(t); v.g3b.gain.setValueAtTime(0, t + 0.2);
      v.g4r.gain.cancelScheduledValues(t); v.g4r.gain.setValueAtTime(0, t + 0.2);
      v.g4c.gain.cancelScheduledValues(t); v.g4c.gain.setValueAtTime(0, t + 0.2);
      v.g4w.gain.cancelScheduledValues(t); v.g4w.gain.setValueAtTime(0, t + 0.2);
      v.busyUntil = 0;
    }
  }
}
