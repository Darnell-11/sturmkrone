// Klang-Engine: komplett mit der Web Audio API erzeugt (keine Audiodateien nötig).
// Musik in Schichten (ruhig, Spannung, Kampf), Umgebungsklang und Soundeffekte.

import { SONGS, type SongId } from './songs';

export type Mood = 'menu' | 'sea' | 'harbor' | 'night' | 'battle' | 'boss' | 'victory';
export type Sfx =
  | 'punch' | 'boom' | 'broadside' | 'splash' | 'hit' | 'heavy' | 'swing' | 'clang' | 'parry' | 'hurt' | 'roll'
  | 'coin' | 'treasure' | 'ui' | 'uiBack' | 'dig' | 'roar' | 'sink' | 'crack' | 'level' | 'win' | 'quest' | 'eat'
  | 'bell' | 'horn' | 'thunder' | 'shard' | 'ko' | 'board' | 'sail' | 'whoosh' | 'crit' | 'cutin';
export type Element = string;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Ambience { waves: number; wind: number; rain: number; town: number; gulls: number; deep: number }

/**
 * Pegelausgleich je Stück (offline gemessen): ruhige Stücke etwas leiser als Kampf, aber alle gut hörbar.
 * Ziel-Effektivpegel etwa: Nacht 0,035 · See/Hafen 0,05 · Kampf/Boss 0,075–0,08 · Menü 0,05
 */
const SONG_TRIM: Partial<Record<SongId, number>> = { sea: 1.3, north: 1.35, ember: 1.3, harbor: 1.08, night: 0.97, abyss: 1.35, battle: 1.04, storm: 1.03, boss: 1.12, menu: 1.3, victory: 1.0 };

/** Eine laufende Musikspur (zum Überblenden laufen zeitweise zwei) */
interface MusicPlayer { id: SongId; gain: GainNode; wet: GainNode; step: number; next: number; fading: boolean; endAt: number }

/** Lautstärken aus den Einstellungen (0 … 1) */
export interface Volumes { master: number; music: number; sfx: number; ambient: number; voice: number }

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private send!: GainNode;
  private noiseBuf!: AudioBuffer;
  private vols: Volumes = { master: 0.8, music: 0.7, sfx: 0.8, ambient: 0.6, voice: 0.8 };
  private throttle: Record<string, number> = {};
  // Umgebung
  private amb: Record<keyof Ambience, { g: GainNode; f?: BiquadFilterNode }> | null = null;
  private ambTarget: Ambience = { waves: 0.6, wind: 0.2, rain: 0, town: 0, gulls: 0.3, deep: 0 };
  private gullT = 2;
  // Musik: mehrere Spuren gleichzeitig, damit Stücke weich ineinander überblenden
  private mood: Mood = 'menu';
  private intensity = 0;
  private players: MusicPlayer[] = [];
  private wantSong: SongId = 'menu';
  private songSince = 0;
  private layerTension = 0;
  private verb!: GainNode;
  private musicMix!: GainNode;
  /** Hörerposition (für Abstand und Stereo) */
  private lx = 0;
  private lz = 0;
  private lyaw = 0;

  /** Beim ersten Tippen/Tastendruck starten (Browser verlangen eine Nutzeraktion) */
  attachUnlock() {
    const go = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, go, { capture: true, passive: true });
  }

  unlock() {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const c: AudioContext = new AC();
    this.ctx = c;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.ambBus = c.createGain(); this.ambBus.connect(this.master);
    // Hall: Echo mit Tiefpass (klingt wie ein Holzschiff unter freiem Himmel)
    const dl = c.createDelay(1); dl.delayTime.value = 0.13;
    const fb = c.createGain(); fb.gain.value = 0.32;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900;
    dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(this.master);
    const dl2 = c.createDelay(1); dl2.delayTime.value = 0.29;
    const fb2 = c.createGain(); fb2.gain.value = 0.22;
    dl2.connect(fb2); fb2.connect(dl2); fb2.connect(lp);
    this.send = c.createGain(); this.send.gain.value = 0.5; this.send.connect(dl); this.send.connect(dl2);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    // Großer Hall für die Musik (erzeugte Raumantwort: wie ein Orchester in einer weiten Halle)
    const conv = c.createConvolver();
    conv.buffer = this.impulse(3.2, 2.6);
    // Pegel des Orchesters: die gefilterten Stimmen sind leise, hier werden sie auf Spielniveau angehoben
    this.musicMix = c.createGain(); this.musicMix.gain.value = 1.4; this.musicMix.connect(this.musicBus);
    const wet = c.createGain(); wet.gain.value = 0.55;
    this.verb = c.createGain();
    this.verb.connect(conv); conv.connect(wet); wet.connect(this.musicMix);
    this.buildAmbience();
    this.applyVolumes();
  }

  /** Stereo-Raumantwort aus abklingendem Rauschen */
  private impulse(sec: number, decay: number): AudioBuffer {
    const c = this.ctx!;
    const n = Math.round(c.sampleRate * sec);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // frühe Reflexionen etwas dichter, dann weicher Nachhall
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < c.sampleRate * 0.02 ? 0.5 : 1);
      }
    }
    return b;
  }

  get running() { return !!this.ctx && this.ctx.state === 'running'; }

  setVolumes(v: Volumes) { this.vols = { ...v }; this.applyVolumes(); }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = this.vols;
    this.master.gain.setTargetAtTime(v.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(v.music * 0.85, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(v.ambient, t, 0.05);
  }

  /** Bei verstecktem Tab alles leise */
  suspend(s: boolean) {
    if (!this.ctx) return;
    if (s) void this.ctx.suspend(); else void this.ctx.resume();
  }

  setListener(x: number, z: number, yaw: number) { this.lx = x; this.lz = z; this.lyaw = yaw; }

  // ---------- Umgebung ----------

  private loopNoise(type: BiquadFilterType, freq: number, q = 1) {
    const c = this.ctx!;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.ambBus);
    s.start(0, Math.random() * 1.5);
    return { g, f };
  }

  private buildAmbience() {
    const c = this.ctx!;
    const waves = this.loopNoise('lowpass', 420);
    // Wellen rollen langsam an und ab
    const lfo = c.createOscillator(); lfo.frequency.value = 0.11;
    const lg = c.createGain(); lg.gain.value = 0.35;
    const wg = c.createGain(); wg.gain.value = 1;
    waves.g.disconnect(); waves.g.connect(wg); wg.connect(this.ambBus);
    lfo.connect(lg); lg.connect(wg.gain); lfo.start();
    const wind = this.loopNoise('bandpass', 700, 0.6);
    const wl = c.createOscillator(); wl.frequency.value = 0.07;
    const wlg = c.createGain(); wlg.gain.value = 260;
    wl.connect(wlg); wlg.connect(wind.f!.frequency); wl.start();
    const rain = this.loopNoise('highpass', 2600, 0.3);
    const town = this.loopNoise('bandpass', 380, 1.4);
    const deep = this.loopNoise('lowpass', 90);
    const gulls = { g: c.createGain() };
    gulls.g.gain.value = 0; gulls.g.connect(this.ambBus);
    this.amb = { waves, wind, rain, town, gulls, deep };
  }

  setAmbience(a: Partial<Ambience>) { Object.assign(this.ambTarget, a); }

  private updateAmbience(dt: number) {
    if (!this.amb || !this.ctx) return;
    const t = this.ctx.currentTime;
    const a = this.ambTarget;
    this.amb.waves.g.gain.setTargetAtTime(0.09 * a.waves, t, 0.4);
    this.amb.wind.g.gain.setTargetAtTime(0.06 * a.wind, t, 0.6);
    this.amb.rain.g.gain.setTargetAtTime(0.05 * a.rain, t, 0.8);
    this.amb.town.g.gain.setTargetAtTime(0.035 * a.town, t, 0.8);
    this.amb.deep.g.gain.setTargetAtTime(0.25 * a.deep, t, 1);
    // Möwen und Stadtrufe
    this.gullT -= dt;
    if (this.gullT <= 0) {
      this.gullT = 3 + Math.random() * 7;
      if (Math.random() < a.gulls) this.gull();
      if (Math.random() < a.town * 0.6) this.townCall();
    }
  }

  private gull() {
    const c = this.ctx!;
    const t = c.currentTime;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(), g = c.createGain();
      const t0 = t + i * (0.18 + Math.random() * 0.1);
      const f = 1400 + Math.random() * 500;
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(f * 1.5, t0 + 0.06);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, t0 + 0.22);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.03, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
      const p = c.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8;
      o.connect(g); g.connect(p); p.connect(this.ambBus);
      const s = c.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(this.send);
      o.start(t0); o.stop(t0 + 0.3);
    }
  }

  private townCall() {
    // Ferne Glocke oder Hammerschlag aus der Stadt
    const c = this.ctx!;
    const t = c.currentTime;
    if (Math.random() < 0.5) this.tone(mtof(76 + Math.floor(Math.random() * 3) * 2), t, 1.2, 'sine', 0.015, 0.6, 0, 0.005, this.ambBus);
    else for (let i = 0; i < 3; i++) this.tone(1800, t + i * 0.32, 0.08, 'square', 0.008, 0.4, 900, 0.002, this.ambBus);
  }

  // ---------- Bausteine ----------

  private tone(f: number, t: number, dur: number, type: OscillatorType, g: number, send = 0.25, f2 = 0, atk = 0.008, bus?: AudioNode, pan = 0) {
    const c = this.ctx!;
    const o = c.createOscillator(), v = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t + atk);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(v);
    let out: AudioNode = v;
    if (pan) { const p = c.createStereoPanner(); p.pan.value = pan; v.connect(p); out = p; }
    out.connect(bus ?? this.sfxBus);
    if (send) { const s = c.createGain(); s.gain.value = send; v.connect(s); s.connect(this.send); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(t: number, dur: number, g: number, freq: number, type: BiquadFilterType, bus?: AudioNode, pan = 0, sweep = 0) {
    const c = this.ctx!;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain();
    s.buffer = this.noiseBuf;
    f.type = type; f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    v.gain.setValueAtTime(g, t);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(v);
    let out: AudioNode = v;
    if (pan) { const p = c.createStereoPanner(); p.pan.value = pan; v.connect(p); out = p; }
    out.connect(bus ?? this.sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  /** Akkordeon-Ton (zwei verstimmte Sägezähne) */
  private squeeze(m: number, t: number, d: number, g: number, bus: AudioNode, bright = 1500) {
    const c = this.ctx!;
    const f = c.createBiquadFilter(), v = c.createGain();
    f.type = 'lowpass'; f.frequency.value = bright;
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + 0.03);
    v.gain.setValueAtTime(g, t + d * 0.7);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    for (const det of [-7, 7]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + d + 0.05);
    }
    f.connect(v); v.connect(bus);
    const s = c.createGain(); s.gain.value = 0.25; v.connect(s); s.connect(this.send);
  }

  /** Flöte mit leichtem Vibrato */
  private flute(m: number, t: number, d: number, g: number, bus: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator(), v = c.createGain(), vib = c.createOscillator(), vg = c.createGain();
    o.type = 'sine'; o.frequency.value = mtof(m);
    vib.frequency.value = 5.5; vg.gain.value = mtof(m) * 0.012;
    vib.connect(vg); vg.connect(o.frequency);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + 0.08);
    v.gain.setValueAtTime(g, t + d * 0.6);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(v); v.connect(bus);
    const s = c.createGain(); s.gain.value = 0.45; v.connect(s); s.connect(this.send);
    o.start(t); vib.start(t); o.stop(t + d + 0.05); vib.stop(t + d + 0.05);
  }

  /** Blechbläser-Stoß mit Filterhüllkurve */
  private brass(m: number, t: number, d: number, g: number, bus: AudioNode) {
    const c = this.ctx!;
    const f = c.createBiquadFilter(), v = c.createGain();
    f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
    f.frequency.exponentialRampToValueAtTime(700, t + d);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + 0.03);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    for (const det of [-5, 4]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + d + 0.05);
    }
    f.connect(v); v.connect(bus);
    const s = c.createGain(); s.gain.value = 0.3; v.connect(s); s.connect(this.send);
  }

  private ok(k: string, gap: number) {
    if (!this.running) return false;
    const t = this.ctx!.currentTime;
    if (t - (this.throttle[k] ?? -9) < gap) return false;
    this.throttle[k] = t;
    return true;
  }

  // ---------- Soundeffekte ----------

  /** Effekt abspielen; at = Weltposition für Lautstärke nach Entfernung und Stereo */
  play(name: Sfx, vol = 1, at?: { x: number; z: number }) {
    if (!this.running) return;
    let pan = 0;
    if (at) {
      const dx = at.x - this.lx, dz = at.z - this.lz;
      const d = Math.hypot(dx, dz);
      vol *= Math.max(0, 1 - d / 260) ** 1.4;
      if (vol < 0.02) return;
      // rechts vom Blick = positive Stereoseite
      const rel = Math.atan2(dx, dz) - this.lyaw;
      pan = Math.max(-0.8, Math.min(0.8, -Math.sin(rel) * Math.min(1, d / 12)));
    }
    const c = this.ctx!;
    const t = c.currentTime;
    const v = vol;
    switch (name) {
      case 'punch': if (!this.ok('pu', 0.04)) return; this.noise(t, 0.12, 0.3 * v, 500, 'lowpass', undefined, pan); this.tone(160, t, 0.1, 'sine', 0.25 * v, 0, 70, 0.004, undefined, pan); break;
      case 'hit': if (!this.ok('hit', 0.04)) return; this.noise(t, 0.16, 0.28 * v, 1100, 'bandpass', undefined, pan); this.tone(240, t, 0.12, 'square', 0.05 * v, 0, 80, 0.004, undefined, pan); break;
      case 'heavy': if (!this.ok('hv', 0.06)) return; this.noise(t, 0.35, 0.42 * v, 600, 'lowpass', undefined, pan); this.tone(110, t, 0.3, 'sine', 0.4 * v, 0.1, 40, 0.004, undefined, pan); this.noise(t, 0.1, 0.2 * v, 3000, 'highpass', undefined, pan); break;
      case 'crit': if (!this.ok('cr', 0.08)) return; this.tone(1400, t, 0.25, 'triangle', 0.08 * v, 0.5, 2400); this.noise(t, 0.2, 0.25 * v, 2500, 'bandpass'); break;
      case 'swing': if (!this.ok('sw', 0.05)) return; this.noise(t, 0.16, 0.12 * v, 1800, 'bandpass', undefined, pan, 4200); break;
      case 'whoosh': if (!this.ok('wh', 0.08)) return; this.noise(t, 0.4, 0.16 * v, 500, 'bandpass', undefined, pan, 2400); break;
      case 'roll': if (!this.ok('ro', 0.15)) return; this.noise(t, 0.28, 0.12 * v, 900, 'bandpass', undefined, pan, 300); break;
      case 'clang': case 'parry': if (!this.ok('cl', 0.04)) return; this.tone(1850, t, 0.22, 'square', 0.05 * v, 0.35, 1500, 0.002, undefined, pan); this.tone(2600, t, 0.15, 'triangle', 0.06 * v, 0.35, 0, 0.002, undefined, pan); this.noise(t, 0.08, 0.15 * v, 4000, 'highpass', undefined, pan); if (name === 'parry') this.tone(mtof(88), t + 0.04, 0.5, 'sine', 0.06 * v, 0.7); break;
      case 'hurt': if (!this.ok('hu', 0.1)) return; this.noise(t, 0.3, 0.32 * v, 600, 'lowpass'); this.tone(160, t, 0.25, 'square', 0.06 * v, 0, 60); break;
      case 'ko': this.tone(220, t, 0.8, 'sawtooth', 0.08 * v, 0.4, 55); this.noise(t, 0.6, 0.3 * v, 400, 'lowpass'); break;
      case 'boom': if (!this.ok('boom', 0.035)) return; this.noise(t, 0.6, 0.5 * v, 800, 'lowpass', undefined, pan, 120); this.tone(120, t, 0.38, 'sine', 0.5 * v, 0.12, 36, 0.004, undefined, pan); break;
      case 'broadside': for (let i = 0; i < 4; i++) { const tt = t + i * 0.07 + Math.random() * 0.03; this.noise(tt, 0.7, 0.32 * v, 900, 'lowpass', undefined, pan, 110); this.tone(110 - i * 6, tt, 0.4, 'sine', 0.3 * v, 0.15, 34, 0.004, undefined, pan); } break;
      case 'splash': if (!this.ok('spl', 0.05)) return; this.noise(t, 0.35, 0.12 * v, 1700, 'bandpass', undefined, pan, 600); break;
      case 'crack': if (!this.ok('ck', 0.06)) return; this.noise(t, 0.25, 0.3 * v, 1200, 'bandpass', undefined, pan); this.tone(90, t, 0.2, 'square', 0.06 * v, 0, 50, 0.002, undefined, pan); break;
      case 'sink': this.noise(t, 1.6, 0.25 * v, 420, 'lowpass', undefined, pan, 120); this.tone(200, t, 1.2, 'sine', 0.08 * v, 0.2, 50, 0.01, undefined, pan); for (let i = 0; i < 5; i++) this.tone(300 + Math.random() * 500, t + 0.3 + i * 0.18, 0.12, 'sine', 0.03 * v, 0.3, 900); break;
      case 'coin': if (!this.ok('coin', 0.045)) return; this.tone(1320, t, 0.09, 'sine', 0.06 * v, 0.2); this.tone(1760, t + 0.05, 0.14, 'sine', 0.06 * v, 0.3); break;
      case 'shard': [81, 85, 88, 93].forEach((m, i) => this.tone(mtof(m), t + i * 0.06, 0.6, 'sine', 0.06 * v, 0.6)); break;
      case 'treasure': [62, 66, 69, 74, 78].forEach((m, i) => this.tone(mtof(m), t + i * 0.07, 0.45, 'triangle', 0.12 * v, 0.4)); break;
      case 'ui': if (this.ok('ui', 0.05)) this.tone(660, t, 0.06, 'triangle', 0.06 * v, 0); break;
      case 'uiBack': if (this.ok('ui', 0.05)) this.tone(440, t, 0.07, 'triangle', 0.05 * v, 0, 330); break;
      case 'dig': if (this.ok('dig', 0.25)) { this.noise(t, 0.14, 0.14 * v, 550, 'bandpass'); this.noise(t + 0.25, 0.14, 0.12 * v, 500, 'bandpass'); } break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(t + i * 0.12, 0.07, 0.12 * v, 1200, 'bandpass'); this.tone(mtof(79), t + 0.4, 0.3, 'sine', 0.05 * v, 0.4, mtof(84)); break;
      case 'roar': if (!this.ok('roar', 0.5)) return; this.tone(72, t, 1.6, 'sawtooth', 0.22 * v, 0.3, 44, 0.15); this.noise(t, 1.4, 0.25 * v, 320, 'lowpass'); break;
      case 'thunder': this.noise(t, 2.6, 0.45 * v, 260, 'lowpass', this.ambBus, 0, 60); this.noise(t, 0.3, 0.3 * v, 2000, 'highpass', this.ambBus); break;
      case 'bell': [0, 0.5].forEach((o) => { this.tone(mtof(81), t + o, 1.6, 'sine', 0.07 * v, 0.6); this.tone(mtof(81) * 2.4, t + o, 0.9, 'sine', 0.02 * v, 0.6); }); break;
      case 'horn': this.brass(50, t, 1.4, 0.12 * v, this.sfxBus); this.brass(57, t + 0.05, 1.3, 0.08 * v, this.sfxBus); break;
      case 'board': this.noise(t, 0.5, 0.3 * v, 600, 'bandpass', undefined, 0, 2500); [57, 62, 66].forEach((m, i) => this.brass(m, t + 0.2 + i * 0.09, 0.4, 0.06 * v, this.sfxBus)); break;
      case 'sail': if (this.ok('sail', 0.4)) this.noise(t, 0.5, 0.14 * v, 300, 'lowpass', undefined, 0, 900); break;
      case 'cutin': this.noise(t, 0.6, 0.3 * v, 300, 'bandpass', undefined, 0, 5000); this.tone(mtof(57), t + 0.1, 0.9, 'sawtooth', 0.06 * v, 0.6, mtof(69)); break;
      case 'level': [62, 66, 69, 74, 78, 81].forEach((m, i) => this.squeeze(m, t + i * 0.1, 0.35, 0.05 * v, this.sfxBus)); this.tone(mtof(86), t + 0.6, 0.8, 'triangle', 0.08 * v, 0.6); break;
      case 'win': [62, 66, 69, 74, 69, 74, 78, 81].forEach((m, i) => this.squeeze(m, t + i * 0.14, 0.28, 0.05 * v, this.sfxBus)); break;
      case 'quest': [67, 71, 74, 79].forEach((m, i) => this.brass(m, t + i * 0.11, i === 3 ? 0.9 : 0.25, 0.07 * v, this.sfxBus)); this.tone(mtof(91), t + 0.45, 1, 'sine', 0.05 * v, 0.7); break;
    }
  }

  /** Faji-Klang je Element */
  power(el: Element, vol = 1) {
    if (!this.ok('pow', 0.08)) return;
    const t = this.ctx!.currentTime;
    const v = vol;
    switch (el) {
      case 'blitz': this.noise(t, 0.5, 0.5 * v, 3000, 'highpass'); this.tone(90, t, 0.6, 'sawtooth', 0.2 * v, 0.3, 40); break;
      case 'feuer': case 'flamme': this.noise(t, 0.9, 0.45 * v, 500, 'lowpass', undefined, 0, 1600); this.tone(140, t, 0.7, 'sawtooth', 0.12 * v, 0.3, 60); break;
      case 'eis': case 'frost': [88, 93, 96, 100].forEach((m, i) => this.tone(mtof(m), t + i * 0.04, 0.6, 'sine', 0.06 * v, 0.6)); this.noise(t, 0.4, 0.2 * v, 5000, 'highpass'); break;
      case 'erde': this.noise(t, 0.7, 0.5 * v, 200, 'lowpass'); this.tone(60, t, 0.6, 'sine', 0.4 * v, 0.1, 35); break;
      case 'schatten': this.tone(110, t, 0.9, 'sawtooth', 0.08 * v, 0.6, 70); this.noise(t, 0.8, 0.2 * v, 400, 'bandpass', undefined, 0, 150); break;
      case 'licht': [76, 81, 85, 88].forEach((m, i) => this.tone(mtof(m), t + i * 0.05, 0.9, 'triangle', 0.06 * v, 0.8)); break;
      case 'wasser': case 'flut': this.noise(t, 1, 0.3 * v, 600, 'lowpass', undefined, 0, 2000); break;
      case 'sturm': case 'wind': this.noise(t, 0.9, 0.35 * v, 500, 'bandpass', undefined, 0, 3000); break;
      case 'gift': this.noise(t, 0.6, 0.18 * v, 1400, 'bandpass'); for (let i = 0; i < 4; i++) this.tone(400 + Math.random() * 300, t + i * 0.1, 0.1, 'sine', 0.04 * v, 0.3, 200); break;
      case 'geist': this.tone(55, t, 1.2, 'sawtooth', 0.12 * v, 0.6, 50, 0.1); this.tone(mtof(62), t, 1, 'sine', 0.05 * v, 0.6); break;
      default: this.noise(t, 0.8, 0.35 * v, 900, 'bandpass'); this.tone(300, t, 0.6, 'sine', 0.08 * v, 0.4, 900);
    }
  }

  // ---------- Musik ----------

  // ---------- Orchester-Bausteine (alles live erzeugt) ----------

  /** Hall-Send der Spur, die gerade geplant wird (blendet mit der Spur ein und aus) */
  private curWet: AudioNode | null = null;

  /** Hall-Anteil einer Stimme */
  private toVerb(node: AudioNode, amount: number) {
    const s = this.ctx!.createGain(); s.gain.value = amount; node.connect(s); s.connect(this.curWet ?? this.verb);
  }

  /** Streicherfläche: verstimmte Sägezähne, weicher Einsatz, langes Ausklingen */
  private pad(notes: number[], t: number, d: number, g: number, out: AudioNode, bright = 1300) {
    const c = this.ctx!;
    const f = c.createBiquadFilter(), v = c.createGain();
    f.type = 'lowpass'; f.frequency.value = bright; f.Q.value = 0.4;
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + Math.min(0.9, d * 0.4));
    v.gain.setValueAtTime(g, t + d * 0.8);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.4);
    for (const m of notes) for (const det of [-9, 0, 8]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + d + 1.5);
    }
    f.connect(v); v.connect(out); this.toVerb(v, 0.7);
  }

  /** Tiefe Streicher (Celli/Kontrabass): gestrichen oder kurz gestoßen */
  private cello(m: number, t: number, d: number, g: number, out: AudioNode, short = false) {
    const c = this.ctx!;
    const f = c.createBiquadFilter(), v = c.createGain();
    f.type = 'lowpass'; f.frequency.value = short ? 900 : 650; f.Q.value = 0.8;
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + (short ? 0.012 : 0.12));
    v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    for (const det of [-6, 6]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + d + 0.05);
    }
    f.connect(v); v.connect(out); this.toVerb(v, short ? 0.25 : 0.4);
  }

  /** Kriegstrommel (Taiko): tiefer Schlag mit Fell-Rauschen */
  private taiko(t: number, g: number, out: AudioNode, pitch = 1) {
    const c = this.ctx!;
    const o = c.createOscillator(), v = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(95 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(40 * pitch, t + 0.4);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + 0.006);
    v.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(v); v.connect(out); this.toVerb(v, 0.45);
    o.start(t); o.stop(t + 0.75);
    const s = c.createBufferSource(), nf = c.createBiquadFilter(), nv = c.createGain();
    s.buffer = this.noiseBuf; nf.type = 'lowpass'; nf.frequency.value = 320 * pitch;
    nv.gain.setValueAtTime(g * 0.7, t); nv.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    s.connect(nf); nf.connect(nv); nv.connect(out); this.toVerb(nv, 0.3);
    s.start(t, Math.random()); s.stop(t + 0.2);
  }

  /** Rahmentrommel / kleine Trommel */
  private frame(t: number, g: number, out: AudioNode) {
    const c = this.ctx!;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain();
    s.buffer = this.noiseBuf; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.9;
    v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    s.connect(f); f.connect(v); v.connect(out); this.toVerb(v, 0.35);
    s.start(t, Math.random()); s.stop(t + 0.15);
  }

  /** Waldhorn: weicher als Trompete, warmer Filter-Einsatz */
  private horn(m: number, t: number, d: number, g: number, out: AudioNode) {
    const c = this.ctx!;
    const f = c.createBiquadFilter(), v = c.createGain();
    f.type = 'lowpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(380, t);
    f.frequency.exponentialRampToValueAtTime(1500, t + 0.12);
    f.frequency.exponentialRampToValueAtTime(850, t + d);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + 0.08);
    v.gain.setValueAtTime(g * 0.85, t + d * 0.7);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.25);
    for (const det of [-6, 5, 0]) {
      const o = c.createOscillator(); o.type = det === 0 ? 'triangle' : 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + d + 0.3);
    }
    f.connect(v); v.connect(out); this.toVerb(v, 0.6);
  }

  /** Chor („Aah“): Sägezahn durch zwei Vokal-Filter, langsames Vibrato */
  private choir(notes: number[], t: number, d: number, g: number, out: AudioNode) {
    const c = this.ctx!;
    const v = c.createGain();
    // je Ton zwei Stimmen: auf die Stimmenzahl normieren, sonst übersteuert ein voller Akkord
    g /= notes.length * 2;
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + Math.min(1.1, d * 0.45));
    v.gain.setValueAtTime(g, t + d * 0.8);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.6);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 720; f1.Q.value = 5;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1180; f2.Q.value = 7;
    f1.connect(v); f2.connect(v);
    const vib = c.createOscillator(); vib.frequency.value = 4.6;
    for (const m of notes) for (const det of [-11, 10]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      const vg = c.createGain(); vg.gain.value = mtof(m) * 0.006; vib.connect(vg); vg.connect(o.frequency);
      o.connect(f1); o.connect(f2); o.start(t); o.stop(t + d + 1.7);
    }
    vib.start(t); vib.stop(t + d + 1.7);
    v.connect(out); this.toVerb(v, 0.9);
  }

  /** Fidel: gestrichene Melodie mit Vibrato (ernster als das Akkordeon) */
  private fiddle(m: number, t: number, d: number, g: number, out: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator(), f = c.createBiquadFilter(), lp = c.createBiquadFilter(), v = c.createGain();
    const vib = c.createOscillator(), vg = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = mtof(m);
    vib.frequency.value = 5.8; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(mtof(m) * 0.009, t + 0.25);
    vib.connect(vg); vg.connect(o.frequency);
    f.type = 'peaking'; f.frequency.value = 1600; f.gain.value = 5;
    lp.type = 'lowpass'; lp.frequency.value = 2800;
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + 0.09);
    v.gain.setValueAtTime(g * 0.9, t + d * 0.75);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.2);
    o.connect(f); f.connect(lp); lp.connect(v); v.connect(out); this.toVerb(v, 0.55);
    o.start(t); vib.start(t); o.stop(t + d + 0.25); vib.stop(t + d + 0.25);
  }

  /** Harfe/Laute: gezupfter Ton */
  private pluck(m: number, t: number, g: number, out: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator(), f = c.createBiquadFilter(), v = c.createGain();
    o.type = 'triangle'; o.frequency.value = mtof(m);
    f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.5);
    v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(g, t + 0.004); v.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(f); f.connect(v); v.connect(out); this.toVerb(v, 0.5);
    o.start(t); o.stop(t + 1.15);
  }

  // ---------- Musik ----------

  /** Stimmung und Kampfnähe (0 … 1) setzen; die Musik blendet passend über */
  setMood(mood: Mood, intensity = 0, seaSong: SongId = 'sea') {
    this.mood = mood;
    this.intensity = intensity;
    this.wantSong = mood === 'menu' ? 'menu' : mood === 'harbor' ? 'harbor' : mood === 'night' ? 'night' : mood === 'boss' ? 'boss'
      : mood === 'battle' || intensity > 0.65 ? 'battle' : mood === 'victory' ? 'victory' : seaSong;
  }

  /** Neues Stück einblenden, laufende ausblenden (weicher Übergang statt hartem Schnitt) */
  private switchTo(id: SongId) {
    const c = this.ctx!;
    const t = c.currentTime;
    const urgent = id === 'battle' || id === 'boss';
    const cur = this.players.find((p) => !p.fading);
    const fadeOut = urgent ? 1.6 : 3.8;
    for (const p of this.players) if (!p.fading) {
      p.fading = true;
      for (const node of [p.gain, p.wet]) {
        node.gain.cancelScheduledValues(t);
        node.gain.setValueAtTime(node.gain.value, t);
        node.gain.linearRampToValueAtTime(0.0001, t + fadeOut);
      }
      // Hall noch ausklingen lassen, bevor die Spur abgebaut wird
      p.endAt = t + fadeOut + 0.2;
    }
    const trim = SONG_TRIM[id] ?? 1;
    const gain = c.createGain(), wet = c.createGain();
    for (const node of [gain, wet]) {
      node.gain.setValueAtTime(0.0001, t);
      node.gain.linearRampToValueAtTime(trim, t + (urgent ? 0.8 : 3.2));
    }
    gain.connect(this.musicMix);
    wet.connect(this.verb);
    // am nächsten Schlag des alten Stücks einsetzen, damit es nicht holpert
    const start = cur ? Math.max(t + 0.05, cur.next) : t + 0.1;
    this.players.push({ id, gain, wet, step: 0, next: start, fading: false, endAt: Infinity });
    this.songSince = t;
    // Kampfbeginn: großer Trommel- und Hornschlag
    if (urgent && cur && cur.id !== 'battle' && cur.id !== 'boss') {
      this.curWet = wet;
      this.taiko(start, 0.5, gain, 0.8); this.taiko(start + 0.02, 0.4, gain, 1.15);
      const ch = SONGS[id].bars[0].chord;
      if (ch) for (const n of ch) this.horn(n - 12 + (SONGS[id].transpose ?? 0), start, 1.4, 0.05, gain);
      this.curWet = null;
    }
  }

  private scheduleMusic() {
    const c = this.ctx!;
    const t = c.currentTime;
    const active = this.players.find((p) => !p.fading);
    // Halten: aus dem Kampf erst nach einer Weile zurück, damit die Musik nicht flackert
    if (!active) this.switchTo(this.wantSong);
    else if (active.id !== this.wantSong) {
      const leavingFight = (active.id === 'battle' || active.id === 'boss') && this.wantSong !== 'battle' && this.wantSong !== 'boss';
      const hold = leavingFight ? 7 : this.wantSong === 'battle' || this.wantSong === 'boss' ? 0 : 3;
      if (t - this.songSince > hold) this.switchTo(this.wantSong);
    }
    const battleNow = this.wantSong === 'battle' || this.wantSong === 'boss';
    const tens = battleNow ? 1 : Math.min(1, Math.max(0, this.intensity - 0.15) * 2);
    this.layerTension += (tens - this.layerTension) * 0.06;
    for (const p of this.players) { this.curWet = p.wet; this.schedulePlayer(p); }
    this.curWet = null;
    this.players = this.players.filter((p) => {
      // Spur erst abbauen, wenn auch der Hall verklungen ist
      if (p.endAt + 3.5 < t) { p.gain.disconnect(); p.wet.disconnect(); return false; }
      return true;
    });
  }

  private schedulePlayer(p: MusicPlayer) {
    const c = this.ctx!;
    if (p.fading && p.next > p.endAt) return;
    if (p.next < c.currentTime) p.next = c.currentTime + 0.05;
    const song = SONGS[p.id];
    const out = p.gain;
    const st = song.tempo;
    const tr = song.transpose ?? 0;
    const fight = p.id === 'battle' || p.id === 'boss' || p.id === 'storm';
    const boss = p.id === 'boss';
    const mystic = p.id === 'night' || p.id === 'abyss';
    const k = fight ? 1 : this.layerTension;
    while (p.next < c.currentTime + 0.2) {
      const spb = song.steps;
      const s = p.step % spb;
      const barNo = Math.floor(p.step / spb);
      const barIdx = barNo % song.bars.length;
      const verse = Math.floor(barNo / song.bars.length);
      const bar = song.bars[barIdx];
      const t = p.next;
      const half = spb === 6 ? 3 : 4;
      const barLen = st * spb;
      // Die Melodie atmet: in ruhigen Stücken pausiert sie jede dritte Strophe – dann tragen Streicher, Hörner und Chor
      const rest = !fight && p.id !== 'menu' && verse % 3 === 2;
      // Streicherfläche über den ganzen Takt (im Ruhe-Teil voller)
      if (s === 0 && bar.chord) {
        const ch = bar.chord.map((n) => n + tr - 12);
        this.pad(ch, t, barLen, fight ? 0.018 : mystic ? 0.024 : rest ? 0.036 : 0.028, out, fight ? 1600 : 1150);
        const choirOn = boss || p.id === 'abyss' || (p.id === 'menu' && verse % 2 === 1) || (fight && barIdx % 2 === 0) || (!mystic && rest) || (p.id === 'sea' && verse % 2 === 1);
        if (choirOn) this.choir(bar.chord.map((n) => n + tr), t, barLen, boss ? 0.16 : fight ? 0.07 : 0.1, out);
        // weiche, tiefe Horn-Schwellung alle zwei Takte: Weite statt Lautstärke
        if (!fight && barIdx % 2 === 0) for (const nn of bar.chord.slice(0, 2)) this.horn(nn + tr - 12, t + st * 0.5, barLen * 1.6, rest ? 0.026 : 0.016, out);
        // leiser Paukenwirbel am Ende jeder Phrase
        if (barIdx % 4 === 3) for (let r = 0; r < 6; r++) this.taiko(t + barLen * 0.6 + r * st * 0.25, (fight ? 0.12 : 0.05) * (0.4 + r * 0.12), out, 0.75);
      }
      // Tiefe Streicher auf den Schwerpunkten, darunter der Kontrabass eine Oktave tiefer
      if (s === 0 || s === half) {
        this.cello(bar.bass[s ? 1 : 0] + tr, t, st * (half - 0.2), 0.06, out);
        if (s === 0) this.cello(bar.bass[0] + tr - 12, t, st * (spb - 0.3), fight ? 0.06 : 0.045, out);
      }
      // Melodie: je nach Stimmung Fidel, Horn oder Flöte – im Kampf und Menü von Hörnern getragen
      const m = bar.mel[s];
      if (m && !rest) {
        const n = m + tr;
        if (fight || p.id === 'menu' || p.id === 'victory') this.horn(n - (boss ? 12 : 0), t, st * 2, boss ? 0.055 : 0.045, out);
        else if (mystic) this.flute(n, t, st * 2.8, 0.065, out);
        else this.fiddle(n, t, st * 2.2, p.id === 'harbor' ? 0.055 : 0.05, out);
        // in der zweiten Strophe verdoppeln Hörner die Fidel (größer, epischer)
        if (!fight && !mystic && verse % 2 === 1 && s % 2 === 0) this.horn(n - 12, t, st * 1.8, 0.026, out);
      }
      // Gegenstimme
      if (bar.alt?.[s] && verse % 2 === 1 && !rest) this.flute(bar.alt[s]! + tr, t, st * 2.4, 0.038, out);
      // Hafen: Laute zupft den Akkord
      if (p.id === 'harbor' && bar.chord && s % 2 === 1) for (const nn of bar.chord) this.pluck(nn + tr, t, 0.028, out);
      // Spannung: treibendes Celli-Ostinato und dumpfe Trommel (unter der Melodie, nicht darüber)
      if (k > 0.05) {
        this.cello(bar.bass[0] + tr + (s % 2 ? 12 : 0), t, st * 0.8, 0.022 * k, out, true);
        if (s === 0) this.taiko(t, 0.14 * k, out, 0.9);
      }
      // Kampf: Kriegstrommeln und Bläserstöße – wuchtig, aber nicht hektisch
      if (fight) {
        if (s === 0 || s === half) this.taiko(t, 0.42, out, s ? 1.1 : 0.85);
        if (spb === 8 && s === 7) this.taiko(t, 0.18, out, 1.35);
        if (spb === 6 && s === 5) this.taiko(t, 0.16, out, 1.3);
        if (s === half - 1 || s === spb - 1) this.frame(t, 0.035, out);
        if (s === 0 && barIdx % 2 === 0 && bar.chord) for (const nn of bar.chord) this.horn(nn + tr - 12, t, st * 3, 0.022, out);
        if (boss && s === 0) this.cello(bar.bass[0] + tr - 24, t, barLen, 0.07, out);
      }
      p.next += st;
      p.step++;
    }
  }

  update(dt: number) {
    if (!this.running) return;
    this.updateAmbience(dt);
    this.scheduleMusic();
  }

  get currentMood() { return this.mood; }
}

export const audio = new AudioEngine();
