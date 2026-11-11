// Klang-Engine: komplett mit der Web Audio API erzeugt (keine Audiodateien nötig).
// Musik in Schichten (ruhig, Spannung, Kampf), Umgebungsklang und Soundeffekte.

import { SONGS, type SongId } from './songs';

export type Mood = 'menu' | 'sea' | 'harbor' | 'night' | 'battle' | 'boss' | 'victory';
export type Sfx =
  | 'punch' | 'boom' | 'broadside' | 'splash' | 'hit' | 'heavy' | 'swing' | 'clang' | 'parry' | 'hurt' | 'roll'
  | 'coin' | 'treasure' | 'ui' | 'uiBack' | 'dig' | 'roar' | 'sink' | 'crack' | 'level' | 'win' | 'quest' | 'eat'
  | 'fanfareRare' | 'fanfareEpic' | 'fanfareLegend' | 'victory' | 'switch'
  | 'bell' | 'horn' | 'thunder' | 'shard' | 'ko' | 'board' | 'sail' | 'whoosh' | 'crit' | 'cutin' | 'step';

/** Weltposition eines Klangs (y optional: sonst etwa Bodenhöhe beim Hörer) */
export interface SoundPos { x: number; y?: number; z: number }
export type Element = string;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Ambience { waves: number; wind: number; rain: number; town: number; gulls: number; deep: number }

/**
 * Pegelausgleich je Stück (offline gemessen): ruhige Stücke etwas leiser als Kampf, aber alle gut hörbar.
 * Ziel-Effektivpegel etwa: Nacht 0,035 · See/Hafen 0,05 · Kampf/Boss 0,075–0,08 · Menü 0,05
 */
const SONG_TRIM: Partial<Record<SongId, number>> = { sea: 1.3, north: 1.35, ember: 1.3, harbor: 1.08, night: 0.97, abyss: 1.35, battle: 1.04, storm: 1.03, boss: 1.12, menu: 1.3, victory: 1.0 };

/**
 * Schichten (Stems) eines Stücks – laufen taktgenau nebeneinander und werden über GainNodes nach der
 * Bedrohung überblendet: Grund (Streicher, Bass) immer, Erkundung (Fidel, Flöte, Laute), Spannung
 * (Celli-Ostinato, Pauke) und Kampf (Taiko-Ensemble, Spiccato-Streicher, Blech, Chor, Becken).
 */
export type Stem = 'base' | 'explore' | 'tension' | 'combat';
const STEMS: Stem[] = ['base', 'explore', 'tension', 'combat'];
/** Pegelausgleich je Schicht (offline gemessen: Kampf etwa 5–6 dB über der Erkundung) */
const STEM_TRIM: Record<Stem, number> = { base: 1, explore: 1, tension: 0.9, combat: 0.66 };

/** Eine laufende Musikspur (zum Überblenden laufen zeitweise zwei) */
interface MusicPlayer {
  id: SongId; gain: GainNode; wet: GainNode; step: number; next: number; fading: boolean; endAt: number;
  /** je Schicht: Lautstärke (trocken + Hall) und drei Stereo-Plätze (links, Mitte, rechts) */
  stem: Record<Stem, GainNode>;
  stemWet: Record<Stem, GainNode>;
  bus: Record<Stem, [AudioNode, AudioNode, AudioNode]>;
  /** Kampfbeginn-Schlag am nächsten Taktanfang */
  sting: boolean;
  /** Zeitpunkt, bis zu dem eine Schicht noch hörbar ausklingt (danach wird sie nicht mehr geplant) */
  hot: Record<Stem, number>;
}

/** Hörbarkeit je Klangart: volle Lautstärke bis ref, danach −6 dB × rolloff je Abstandsverdopplung (logarithmisch) */
interface SpatialCat { ref: number; rolloff: number; max: number; cap: number }
const SPATIAL_CAT: Record<'near' | 'combat' | 'loud' | 'mid', SpatialCat> = {
  /** Schritte: schnell leiser, höchstens 8 gleichzeitig */
  near: { ref: 2.5, rolloff: 1.2, max: 45, cap: 8 },
  /** Hiebe, Treffer, Paraden */
  combat: { ref: 4, rolloff: 1.0, max: 110, cap: 10 },
  /** Kanonen, Explosionen, Einschläge, Untergang: weit hörbar */
  loud: { ref: 22, rolloff: 0.75, max: 900, cap: 14 },
  mid: { ref: 8, rolloff: 1.0, max: 260, cap: 10 },
};
const CAT_OF: Partial<Record<Sfx, keyof typeof SPATIAL_CAT>> = {
  step: 'near', swing: 'combat', hit: 'combat', punch: 'combat', heavy: 'combat', clang: 'combat', parry: 'combat', crit: 'combat',
  roll: 'combat', whoosh: 'combat', crack: 'combat', hurt: 'combat',
  boom: 'loud', broadside: 'loud', sink: 'loud', splash: 'loud', roar: 'loud', thunder: 'loud', horn: 'loud', bell: 'loud',
};

/** Untergrund für Schritte (setzt das Spiel je nach Ort) */
export type Surface = 'sand' | 'holz' | 'stein';

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
  private players: MusicPlayer[] = [];
  private wantSong: SongId = 'menu';
  private songSince = 0;
  private layerTension = 0;
  private verb!: GainNode;
  private musicMix!: GainNode;
  /** Hörerposition (für Abstand und Stereo): Kamera; Abstände zählen ab den „Ohren“ (Spielfigur) */
  private lx = 0;
  private lz = 0;
  private ly = 0;
  private cx = 0;
  private cy = 0;
  private cz = 0;
  private fx = 0;
  private fy = 0;
  private fz = 1;
  /** Ende-Zeiten laufender räumlicher Klänge je Art (Stimmenbegrenzung) */
  private voices: Record<string, number[]> = {};
  // Varianz: Tonhöhe und Pegel des gerade gespielten Effekts, zuletzt gewählte Variante je Effekt
  private pitch = 1;
  private gainVar = 1;
  private lastPick: Record<string, number> = {};
  /** Untergrund für Schritte */
  surface: Surface = 'sand';
  // Adaptive Musik: geglättete Bedrohung (schnell rein, langsam raus), Seeschlacht-Klangfarbe, sparsamer Modus
  private threatRaw = 0;
  private threatS = 0;
  private threatHold = 0;
  private naval = false;
  private lite = false;
  private stingT = 0;
  /** Räumlicher Ausgang des gerade gespielten Effekts (PannerNode) – tone()/noise() hängen sich daran */
  private spatialOut: AudioNode | null = null;
  /** HRTF (kopfbezogen, sehr räumlich) am PC; am Handy das sparsamere Equal-Power-Verfahren */
  private panning: PanningModelType = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'equalpower' : 'HRTF';
  /** Entfernungsdämpfung: bis refDistance volle Lautstärke, danach umgekehrt proportional */


  /** Beim ersten Tippen/Tastendruck starten (Browser verlangen eine Nutzeraktion) */
  attachUnlock() {
    const go = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, go, { capture: true, passive: true });
  }

  unlock() {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
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
    setTimeout(() => this.prewarm(), 800);
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
    // Browser können das Fortsetzen ablehnen (z. B. ohne Nutzeraktion) – dann beim nächsten Tippen erneut
    (s ? this.ctx.suspend() : this.ctx.resume()).catch(() => {});
  }

  /** 2D-Hörer (ohne Kamera): Position am Boden; die Blickrichtung kommt über setListener3D */
  setListener(x: number, z: number, _yaw: number) { this.lx = x; this.lz = z; }

  /** „Ohren“: Punkt, ab dem die Entfernung zählt (die Spielfigur – sonst wären eigene Schritte zu leise) */
  setEars(x: number, y: number, z: number) { this.lx = x; this.ly = y; this.lz = z; }

  /** Sparsamer Modus (Handy, niedrige Grafikstufen): weniger Stimmen im Orchester */
  setLite(v: boolean) { this.lite = v; }

  /**
   * 3D-Hörer: Position (die Spielfigur – so klingt die eigene Figur nah) und Blickrichtung der Kamera,
   * damit links/rechts und vorn/hinten zum Bild passen.
   */
  setListener3D(x: number, y: number, z: number, fx: number, fy: number, fz: number) {
    this.cx = x; this.cy = y; this.cz = z;
    this.fx = fx; this.fy = fy; this.fz = fz;
    const c = this.ctx;
    if (!c) return;
    const L = c.listener as AudioListener & { positionX?: AudioParam };
    const t = c.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(x, t, 0.02); L.positionY!.setTargetAtTime(y, t, 0.02); L.positionZ!.setTargetAtTime(z, t, 0.02);
      L.forwardX.setTargetAtTime(fx, t, 0.02); L.forwardY.setTargetAtTime(fy, t, 0.02); L.forwardZ.setTargetAtTime(fz, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      // ältere Browser
      (L as unknown as { setPosition(a: number, b: number, c: number): void }).setPosition(x, y, z);
      (L as unknown as { setOrientation(a: number, b: number, c: number, d: number, e: number, f: number): void }).setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  /**
   * Räumlichen Ausgang für einen Klang an Weltposition at anlegen; null = zu leise/zu weit weg oder zu viele Stimmen.
   *  - Dämpfung logarithmisch (exponential-Modell): −6 dB × rolloff je Verdopplung des Abstands ab ref
   *  - Abstand ab den Ohren (Spielfigur), Richtung ab der Kamera: links/rechts passt immer zum Bild
   *  - Luftdämpfung: entfernte Klänge verlieren Höhen (Tiefpass sinkt mit dem Abstand)
   */
  private spatial(at: SoundPos, vol: number, cat: SpatialCat, catKey: string, dur = 0.5): AudioNode | null {
    const c = this.ctx!;
    const y = at.y ?? this.ly - 1.2;
    const d = Math.min(cat.max, Math.hypot(at.x - this.lx, y - this.ly, at.z - this.lz));
    const att = Math.pow(Math.max(d, cat.ref) / cat.ref, -cat.rolloff);
    if (vol * att < 0.012 || d >= cat.max) return null;
    // Stimmen begrenzen: laufende zählen, bei vollem Kontingent fällt der neue (leise) Klang weg
    const t = c.currentTime;
    const list = (this.voices[catKey] ??= []);
    let n = 0;
    for (let i = 0; i < list.length; i++) if (list[i] > t) list[n++] = list[i];
    list.length = n;
    if (n >= cat.cap && vol * att < 0.5) return null;
    list.push(t + dur);
    // Richtung von der Kamera aus, Entfernung von den Ohren
    let dx = at.x - this.cx, dy = y - this.cy, dz = at.z - this.cz;
    const dc = Math.hypot(dx, dy, dz);
    if (dc < 0.01) { dx = this.fx; dy = this.fy; dz = this.fz; } else { dx /= dc; dy /= dc; dz /= dc; }
    const pd = Math.max(0.05, d);
    const p = c.createPanner();
    p.panningModel = this.panning;
    p.distanceModel = 'exponential';
    p.refDistance = cat.ref;
    p.rolloffFactor = cat.rolloff;
    p.maxDistance = cat.max;
    const px = this.cx + dx * pd, py = this.cy + dy * pd, pz = this.cz + dz * pd;
    if (p.positionX) { p.positionX.value = px; p.positionY.value = py; p.positionZ.value = pz; }
    else (p as unknown as { setPosition(a: number, b: number, c: number): void }).setPosition(px, py, pz);
    p.connect(this.sfxBus);
    if (d > cat.ref * 2) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(700, Math.min(20000, 20000 * Math.pow(cat.ref * 2 / d, 0.9)));
      lp.Q.value = 0.5;
      lp.connect(p);
      return lp;
    }
    return p;
  }

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
    // Varianz: höher = kürzer (wie ein schneller abgespieltes Sample), Pegel leicht gestreut
    const pk = this.pitch;
    f *= pk; if (f2) f2 *= pk; dur /= pk; g *= this.gainVar;
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t + atk);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(v);
    let out: AudioNode = v;
    if (pan && !this.spatialOut) { const p = c.createStereoPanner(); p.pan.value = pan; v.connect(p); out = p; }
    out.connect(bus ?? this.spatialOut ?? this.sfxBus);
    if (send) { const s = c.createGain(); s.gain.value = send; v.connect(s); s.connect(this.send); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(t: number, dur: number, g: number, freq: number, type: BiquadFilterType, bus?: AudioNode, pan = 0, sweep = 0) {
    const c = this.ctx!;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain();
    const pk = this.pitch;
    freq *= pk; if (sweep) sweep *= pk; dur /= pk; g *= this.gainVar;
    s.buffer = this.noiseBuf;
    f.type = type; f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    v.gain.setValueAtTime(g, t);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(v);
    let out: AudioNode = v;
    if (pan && !this.spatialOut) { const p = c.createStereoPanner(); p.pan.value = pan; v.connect(p); out = p; }
    out.connect(bus ?? this.spatialOut ?? this.sfxBus);
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

  /**
   * Klänge vorwärmen: jeden wichtigen Effekt einmal fast lautlos abspielen, damit Filter, Hüllkurven und Rauschpuffer
   * schon im Speicher sind (verhindert das Stocken beim ersten Treffer, Schuss oder Fanfarenklang). Verteilt über
   * viele Bilder, damit es selbst nichts verursacht. Läuft einmal, sobald der Browser Klang erlaubt.
   */
  prewarm() {
    if (this.warmed) return;
    // der Browser startet den Klang manchmal erst einen Moment nach dem ersten Tippen
    if (!this.running) { if (this.warmTries++ < 10) setTimeout(() => this.prewarm(), 500); return; }
    this.warmed = true;
    const list: Sfx[] = ['punch', 'hit', 'heavy', 'swing', 'clang', 'parry', 'hurt', 'roll', 'step', 'whoosh', 'crit', 'boom', 'broadside', 'splash', 'crack', 'coin', 'shard', 'ui', 'uiBack',
      'level', 'win', 'quest', 'cutin', 'bell', 'horn', 'board', 'sail', 'sink', 'roar', 'thunder', 'eat', 'switch', 'fanfareRare', 'fanfareEpic', 'fanfareLegend', 'victory'];
    let i = 0;
    const next = () => {
      if (i >= list.length) return;
      try { this.play(list[i++], 0.0001); } catch { /* ein Klang darf das Vorwärmen nicht stoppen */ }
      setTimeout(next, 35);
    };
    setTimeout(next, 400);
  }

  private warmed = false;
  private warmTries = 0;

  /** Effekt abspielen; at = Weltposition für Lautstärke nach Entfernung und Stereo */
  play(name: Sfx, vol = 1, at?: SoundPos) {
    if (!this.running) return;
    const pan = 0;
    // Räumlicher Klang: Richtung (HRTF/Equal-Power) und Entfernungsdämpfung übernimmt ein PannerNode
    if (at) {
      const key = CAT_OF[name] ?? 'mid';
      this.spatialOut = this.spatial(at, vol, SPATIAL_CAT[key], key, name === 'broadside' || name === 'sink' ? 1.6 : 0.5);
      if (!this.spatialOut) return;
    }
    // Varianz: Schritte und Hiebe ±5 % Tonhöhe und ±15 % Pegel, Treffer etwas weniger, alles andere kaum
    const strong = name === 'step' || name === 'swing' || name === 'whoosh';
    const mid = name === 'hit' || name === 'punch' || name === 'clang' || name === 'parry' || name === 'heavy';
    const pr = strong ? 0.05 : mid ? 0.035 : 0.012;
    this.pitch = 1 + (Math.random() * 2 - 1) * pr;
    this.gainVar = 1 + (Math.random() * 2 - 1) * (strong ? 0.15 : mid ? 0.1 : 0.03);
    try { this.playVoice(name, vol, pan); } finally { this.spatialOut = null; this.pitch = 1; this.gainVar = 1; }
  }

  /** Variante 0 … n−1 wählen, nie zweimal dieselbe hintereinander */
  private pick(key: string, n: number) {
    const last = this.lastPick[key] ?? -1;
    let i = Math.floor(Math.random() * (n - 1));
    if (i >= last && last >= 0) i++;
    if (last < 0) i = Math.floor(Math.random() * n);
    this.lastPick[key] = i;
    return i;
  }

  private playVoice(name: Sfx, vol: number, pan: number) {
    const c = this.ctx!;
    const t = c.currentTime;
    const v = vol;
    switch (name) {
      case 'step': {
        // Schritt je Untergrund in drei Varianten (Ferse und Ballen), dazu ±5 % Tonhöhe und Pegel
        if (!this.ok('st' + Math.floor(Math.random() * 3), 0.05)) return;
        const i = this.pick('step', 3);
        const toe = 0.018 + i * 0.012;
        if (this.surface === 'holz') {
          // Holzplanken: hohler Klopfer mit kurzem Nachschwingen, ab und zu ein Knarren
          this.tone([196, 233, 175][i], t, 0.09, 'triangle', 0.07 * v, 0.1, [150, 180, 140][i], 0.002, undefined, pan);
          this.noise(t, 0.06, 0.12 * v, [380, 320, 440][i], 'lowpass', undefined, pan);
          this.noise(t + toe, 0.04, 0.05 * v, 1500, 'bandpass', undefined, pan);
          if (Math.random() < 0.08) this.tone(420 + Math.random() * 120, t + 0.03, 0.22, 'sawtooth', 0.008 * v, 0.2, 360, 0.04, undefined, pan);
        } else if (this.surface === 'stein') {
          // Pflaster: harter, kurzer Aufsetzer mit hellem Klick
          this.noise(t, 0.05, 0.13 * v, [300, 340, 280][i], 'lowpass', undefined, pan);
          this.noise(t + 0.002, 0.03, 0.07 * v, [3200, 2700, 3600][i], 'highpass', undefined, pan);
          this.noise(t + toe, 0.03, 0.05 * v, 2200, 'bandpass', undefined, pan);
        } else {
          // Sand und Gras: weicher Aufsetzer, rieselndes Knirschen
          this.noise(t, 0.08, 0.15 * v, [250, 220, 280][i], 'lowpass', undefined, pan);
          this.noise(t + 0.008, 0.07, 0.05 * v, [2400, 2900, 2100][i], 'bandpass', undefined, pan);
          this.noise(t + toe + 0.02, 0.06, 0.03 * v, 3800, 'bandpass', undefined, pan);
        }
        break;
      }
      case 'punch': if (!this.ok('pu', 0.04)) return; this.noise(t, 0.12, 0.3 * v, 500, 'lowpass', undefined, pan); this.tone(160, t, 0.1, 'sine', 0.25 * v, 0, 70, 0.004, undefined, pan); break;
      case 'hit': if (!this.ok('hit', 0.04)) return; this.noise(t, 0.16, 0.28 * v, 1100, 'bandpass', undefined, pan); this.tone(240, t, 0.12, 'square', 0.05 * v, 0, 80, 0.004, undefined, pan); break;
      case 'heavy': if (!this.ok('hv', 0.06)) return; this.noise(t, 0.35, 0.42 * v, 600, 'lowpass', undefined, pan); this.tone(110, t, 0.3, 'sine', 0.4 * v, 0.1, 40, 0.004, undefined, pan); this.noise(t, 0.1, 0.2 * v, 3000, 'highpass', undefined, pan); break;
      case 'crit': if (!this.ok('cr', 0.08)) return; this.tone(1400, t, 0.25, 'triangle', 0.08 * v, 0.5, 2400); this.noise(t, 0.2, 0.25 * v, 2500, 'bandpass'); break;
      case 'swing': {
        // Hieb: vier Luftzug-Varianten (nie zweimal dieselbe), dazu ±5 % Tonhöhe und Pegel
        if (!this.ok('sw', 0.05)) return;
        const i = this.pick('swing', 4);
        if (i === 0) this.noise(t, 0.16, 0.12 * v, 1700, 'bandpass', undefined, pan, 4200);
        else if (i === 1) this.noise(t, 0.21, 0.11 * v, 1300, 'bandpass', undefined, pan, 3500);
        else if (i === 2) { this.noise(t, 0.13, 0.1 * v, 2100, 'bandpass', undefined, pan, 5200); this.noise(t + 0.03, 0.1, 0.05 * v, 3200, 'bandpass', undefined, pan, 6000); }
        else { this.noise(t, 0.18, 0.1 * v, 1500, 'bandpass', undefined, pan, 3000); this.noise(t, 0.22, 0.06 * v, 380, 'bandpass', undefined, pan, 900); }
        break;
      }
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
      // Fanfaren: Beute ab selten, und der Sieg über eine Legende (Blech, Pauken, Glitzern)
      case 'fanfareRare': [67, 71, 74].forEach((m, i) => this.brass(m, t + i * 0.1, i === 2 ? 0.7 : 0.22, 0.07 * v, this.sfxBus)); this.tone(mtof(91), t + 0.3, 0.9, 'sine', 0.05 * v, 0.7); break;
      case 'fanfareEpic':
        [62, 66, 69, 74, 78].forEach((m, i) => this.brass(m, t + i * 0.09, i === 4 ? 1.1 : 0.25, 0.08 * v, this.sfxBus));
        this.tone(80, t, 0.5, 'sine', 0.3 * v, 0.2, 40); [93, 98, 102].forEach((m, i) => this.tone(mtof(m), t + 0.45 + i * 0.07, 0.9, 'sine', 0.04 * v, 0.8)); break;
      case 'fanfareLegend':
        this.tone(70, t, 0.8, 'sine', 0.4 * v, 0.2, 36); this.noise(t, 1.4, 0.18 * v, 5000, 'highpass');
        [57, 62, 66, 69, 74, 78, 81].forEach((m, i) => this.brass(m, t + 0.1 + i * 0.1, i === 6 ? 1.6 : 0.3, 0.09 * v, this.sfxBus));
        [98, 102, 105, 110].forEach((m, i) => this.tone(mtof(m), t + 0.8 + i * 0.08, 1.2, 'sine', 0.045 * v, 0.9)); break;
      case 'victory':
        // Sieg über eine Legende: Paukenwirbel, dann Hauptmotiv und langer Schlussakkord
        for (let i = 0; i < 6; i++) this.tone(75 - i * 3, t + i * 0.07, 0.3, 'sine', 0.3 * v, 0.1, 40);
        [57, 61, 64].forEach((m) => this.brass(m, t + 0.5, 0.5, 0.07 * v, this.sfxBus));
        [64, 66, 69, 73, 76].forEach((m, i) => this.brass(m, t + 1.0 + i * 0.16, i === 4 ? 1.8 : 0.3, 0.09 * v, this.sfxBus));
        [69, 73, 76, 81].forEach((m) => this.brass(m - 12, t + 1.8, 1.6, 0.06 * v, this.sfxBus));
        this.noise(t + 1.8, 1.8, 0.14 * v, 6000, 'highpass'); [100, 105, 109].forEach((m, i) => this.tone(mtof(m), t + 2 + i * 0.1, 1.4, 'sine', 0.04 * v, 1)); break;
      case 'switch': if (!this.ok('sw', 0.1)) return; this.noise(t, 0.12, 0.2 * v, 3500, 'bandpass', undefined, pan, 1200); this.tone(mtof(86), t + 0.03, 0.14, 'triangle', 0.05 * v, 0.2); break;
      case 'quest': [67, 71, 74, 79].forEach((m, i) => this.brass(m, t + i * 0.11, i === 3 ? 0.9 : 0.25, 0.07 * v, this.sfxBus)); this.tone(mtof(91), t + 0.45, 1, 'sine', 0.05 * v, 0.7); break;
    }
  }

  /** Faji-Klang je Element */
  power(el: Element, vol = 1, at?: SoundPos) {
    if (!this.ok('pow', 0.08)) return;
    if (at) { this.spatialOut = this.spatial(at, vol, SPATIAL_CAT.mid, 'pow', 1); if (!this.spatialOut) return; }
    try { this.powerVoice(el, vol); } finally { this.spatialOut = null; }
  }

  private powerVoice(el: Element, vol: number) {
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

  /** Spiccato-Streicher: kurz gestoßene Achtel/Sechzehntel, treiben das Seeschlacht-Ostinato */
  private spiccato(m: number, t: number, g: number, out: AudioNode, d = 0.12) {
    const c = this.ctx!;
    const f = c.createBiquadFilter(), v = c.createGain();
    f.type = 'bandpass'; f.frequency.value = Math.min(3200, mtof(m) * 3.2); f.Q.value = 0.7;
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + 0.006);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    for (const det of [0]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + d + 0.03);
    }
    f.connect(v); v.connect(out); this.toVerb(v, 0.3);
  }

  /** Tiefes Blech (Posaunen, Tuba): knurrender Einsatz, schwer und breit */
  private lowBrass(m: number, t: number, d: number, g: number, out: AudioNode) {
    const c = this.ctx!;
    const f = c.createBiquadFilter(), v = c.createGain();
    f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(260, t);
    f.frequency.exponentialRampToValueAtTime(1300, t + 0.07);
    f.frequency.exponentialRampToValueAtTime(520, t + Math.max(0.12, d));
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + 0.025);
    v.gain.setValueAtTime(g * 0.8, t + d * 0.6);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.12);
    for (const [det, oct] of (d > 0.4 && !this.lite ? [[-7, 0], [6, 0], [0, -12]] : [[-6, 0], [0, -12]]) as [number, number][]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m + oct); o.detune.value = det;
      // leichtes Anblasen von unten
      o.frequency.setValueAtTime(mtof(m + oct) * 0.97, t); o.frequency.exponentialRampToValueAtTime(mtof(m + oct), t + 0.05);
      o.connect(f); o.start(t); o.stop(t + d + 0.15);
    }
    f.connect(v); v.connect(out); this.toVerb(v, 0.45);
  }

  /** Trompete: hell und strahlend, verdoppelt die Heldenmelodie eine Oktave höher */
  private trumpet(m: number, t: number, d: number, g: number, out: AudioNode) {
    const c = this.ctx!;
    const f = c.createBiquadFilter(), v = c.createGain();
    f.type = 'lowpass'; f.Q.value = 1.5;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(4200, t + 0.05);
    f.frequency.exponentialRampToValueAtTime(2200, t + d);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + 0.03);
    v.gain.setValueAtTime(g * 0.85, t + d * 0.7);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.15);
    for (const det of [-4, 5]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + d + 0.2);
    }
    f.connect(v); v.connect(out); this.toVerb(v, 0.55);
  }

  /** Pauke: auf den Grundton gestimmt, mit Fell-Anschlag */
  private timpani(m: number, t: number, g: number, out: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator(), v = c.createGain();
    const f0 = mtof(m);
    o.type = 'sine';
    o.frequency.setValueAtTime(f0 * 1.04, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.08);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(g, t + 0.005);
    v.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(v); v.connect(out); this.toVerb(v, 0.5);
    o.start(t); o.stop(t + 1.15);
    const s = c.createBufferSource(), nf = c.createBiquadFilter(), nv = c.createGain();
    s.buffer = this.noiseBuf; nf.type = 'bandpass'; nf.frequency.value = f0 * 3; nf.Q.value = 1.2;
    nv.gain.setValueAtTime(g * 0.5, t); nv.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s.connect(nf); nf.connect(nv); nv.connect(out);
    s.start(t, Math.random()); s.stop(t + 0.14);
  }

  /** Becken: anschwellend (in die nächste Phrase hinein) oder als Schlag mit langem Ausklang */
  private cymbal(t: number, d: number, g: number, out: AudioNode, swell: boolean) {
    const c = this.ctx!;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    f.type = 'highpass'; f.frequency.value = 5200;
    if (swell) { v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(g, t + d); v.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.08); }
    else { v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.0001, t + d); }
    s.connect(f); f.connect(v); v.connect(out); this.toVerb(v, 0.6);
    s.start(t, Math.random()); s.stop(t + d + 0.1);
  }

  // ---------- Musik ----------

  /**
   * Stimmung und Bedrohung (0 … 1) setzen. Erkundung ↔ Kampf blendet innerhalb des Stücks über die Schichten
   * (taktgenau, ohne Stückwechsel); nur Boss, Hafen, Nacht, Menü und Sieg wechseln das Stück.
   * naval = Seeschlacht (volles Blech, Taiko-Ensemble, Chor).
   */
  setMood(mood: Mood, intensity = 0, seaSong: SongId = 'sea', naval = false) {
    this.mood = mood;
    this.threatRaw = mood === 'battle' ? Math.max(1, intensity) : intensity;
    this.naval = naval;
    // ruhige Sonderstücke (Hafen, Nacht) nur ohne Gefahr – bei Gefahr übernimmt das Regionsstück mit Kampfschicht
    const calm = intensity < 0.35;
    this.wantSong = mood === 'menu' ? 'menu' : mood === 'boss' ? 'boss' : mood === 'victory' ? 'victory'
      : mood === 'harbor' && calm ? 'harbor' : mood === 'night' && calm ? 'night' : seaSong;
  }

  /** Geglättete Bedrohung, wie die Musik sie hört (für Anzeige und Tests) */
  get musicThreat() { return this.threatS; }

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
    // Schichten: je Schicht trockene und Hall-Lautstärke, dazu drei Stereo-Plätze (Orchesteraufstellung)
    const stem = {} as Record<Stem, GainNode>, stemWet = {} as Record<Stem, GainNode>, bus = {} as Record<Stem, [AudioNode, AudioNode, AudioNode]>;
    const lv = this.stemLevels(id);
    for (const k of STEMS) {
      stem[k] = c.createGain(); stem[k].gain.value = lv[k] * STEM_TRIM[k]; stem[k].connect(gain);
      stemWet[k] = c.createGain(); stemWet[k].gain.value = lv[k] * STEM_TRIM[k]; stemWet[k].connect(wet);
      if (this.lite) bus[k] = [stem[k], stem[k], stem[k]];
      else {
        // seitliche Plätze: Panner verteilen die Leistung auf zwei Kanäle (−3 dB gegenüber der Mitte) – ausgleichen
        const l = c.createStereoPanner(), r = c.createStereoPanner(), lg = c.createGain(), rg = c.createGain();
        l.pan.value = -0.45; r.pan.value = 0.45; lg.gain.value = rg.gain.value = 1.35;
        lg.connect(l); rg.connect(r); l.connect(stem[k]); r.connect(stem[k]);
        bus[k] = [lg, stem[k], rg];
      }
    }
    // am nächsten Schlag des alten Stücks einsetzen, damit es nicht holpert
    const start = cur ? Math.max(t + 0.05, cur.next) : t + 0.1;
    const pl: MusicPlayer = { id, gain, wet, step: 0, next: start, fading: false, endAt: Infinity, stem, stemWet, bus, sting: false, hot: { base: Infinity, explore: 0, tension: 0, combat: 0 } };
    this.players.push(pl);
    this.songSince = t;
    // Kampfbeginn mit eigenem Stück (Boss): großer Trommel- und Hornschlag
    if (urgent && cur && cur.id !== 'battle' && cur.id !== 'boss') {
      this.curWet = wet;
      this.taiko(start, 0.5, gain, 0.8); this.taiko(start + 0.02, 0.4, gain, 1.15);
      const ch = SONGS[id].bars[0].chord;
      if (ch) for (const n of ch) this.horn(n - 12 + (SONGS[id].transpose ?? 0), start, 1.4, 0.05, gain);
      this.curWet = null;
    }
  }

  /** Reine Kampfstücke (Boss, Sturm, Schlacht) spielen alle Schichten voll */
  private isFight(id: SongId) { return id === 'battle' || id === 'boss' || id === 'storm'; }

  /**
   * Lautstärke je Schicht aus der Bedrohung (gleichmäßige Leistung beim Überblenden: cos/sin):
   * Erkundung verschwindet, Spannung kommt früh und tritt zurück, wenn der volle Kampf einsetzt.
   */
  private stemLevels(id: SongId): Record<Stem, number> {
    if (this.isFight(id)) return { base: 1, explore: 1, tension: 1, combat: 1 };
    const th = this.threatS;
    const sm = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    const combat = Math.sin(sm(0.3, 0.85, th) * Math.PI / 2);
    return {
      base: 1,
      explore: Math.cos(sm(0.15, 0.8, th) * Math.PI / 2),
      tension: sm(0.08, 0.4, th) * (1 - 0.45 * sm(0.6, 1, th)),
      combat,
    };
  }

  private scheduleMusic(dt: number) {
    const c = this.ctx!;
    const t = c.currentTime;
    // Bedrohung glätten: schnell rein (≈ 1 s), nach 4 s Ruhe langsam wieder raus (≈ 6 s)
    if (this.threatRaw >= this.threatS - 0.02) { this.threatS += (this.threatRaw - this.threatS) * Math.min(1, dt / 0.9); this.threatHold = 4; }
    else if ((this.threatHold -= dt) <= 0) this.threatS += (this.threatRaw - this.threatS) * Math.min(1, dt / 6);
    // Kampfbeginn: Schlag am nächsten Taktanfang, wenn die Bedrohung die Kampfschwelle überschreitet
    this.stingT -= dt;
    const fightNow = this.threatS > 0.55;
    const active = this.players.find((p) => !p.fading);
    if (fightNow && this.stingT <= 0 && active && !this.isFight(active.id) && this.threatRaw > 0.6) { active.sting = true; this.stingT = 25; }
    if (!fightNow && this.threatS < 0.2) this.stingT = Math.min(this.stingT, 0);
    // Stück wechseln (nicht für Kampf: der läuft über die Schichten)
    if (!active) this.switchTo(this.wantSong);
    else if (active.id !== this.wantSong) {
      const leavingFight = this.isFight(active.id) && !this.isFight(this.wantSong);
      const hold = leavingFight ? 7 : this.isFight(this.wantSong) ? 0 : 3;
      if (t - this.songSince > hold) this.switchTo(this.wantSong);
    }
    // Schichten nachführen (weich, damit das Überblenden nie springt)
    for (const p of this.players) {
      if (p.fading) continue;
      const lv = this.stemLevels(p.id);
      for (const k of STEMS) { p.stem[k].gain.setTargetAtTime(lv[k] * STEM_TRIM[k], t, 0.3); p.stemWet[k].gain.setTargetAtTime(lv[k] * STEM_TRIM[k], t, 0.3); }
    }
    const tens = this.threatS;
    this.layerTension += (tens - this.layerTension) * 0.06;
    for (const p of this.players) this.schedulePlayer(p);
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
    const st = song.tempo;
    const tr = song.transpose ?? 0;
    const fight = this.isFight(p.id);
    const boss = p.id === 'boss';
    const mystic = p.id === 'night' || p.id === 'abyss';
    const naval = this.naval || p.id === 'storm';
    const lite = this.lite;
    // Ausgang einer Schicht an einem Stereoplatz (0 links, 1 Mitte, 2 rechts); der Hall folgt der Schicht
    const S = (k: Stem, side: 0 | 1 | 2 = 1) => { this.curWet = p.stemWet[k]; return p.bus[k][side]; };
    // nur Schichten planen, die man hört (spart Rechenzeit; geplant wird 0,2 s im Voraus, das Einblenden dauert länger)
    const lvNow = this.stemLevels(p.id);
    const now = c.currentTime;
    for (const k of STEMS) if (lvNow[k] > 0.015) p.hot[k] = now + 1.5;
    const on = (k: Stem) => fight || p.hot[k] > now;
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
      const root = bar.bass[0] + tr;

      // ---------- Grund: Streicherfläche, Hörner, Bass ----------
      if (s === 0 && bar.chord) {
        const ch = bar.chord.map((n) => n + tr - 12);
        this.pad(ch, t, barLen, fight ? 0.018 : mystic ? 0.024 : rest ? 0.036 : 0.028, S('base'), fight ? 1600 : 1150);
        const choirOn = boss || p.id === 'abyss' || (p.id === 'menu' && verse % 2 === 1) || (fight && barIdx % 2 === 0) || (!mystic && rest) || (p.id === 'sea' && verse % 2 === 1);
        if (choirOn) this.choir(bar.chord.map((n) => n + tr), t, barLen, boss ? 0.16 : fight ? 0.07 : 0.1, S(fight ? 'combat' : 'explore'));
        // weiche, tiefe Horn-Schwellung alle zwei Takte: Weite statt Lautstärke
        if (!fight && barIdx % 2 === 0) for (const nn of bar.chord.slice(0, 2)) this.horn(nn + tr - 12, t + st * 0.5, barLen * 1.6, rest ? 0.026 : 0.016, S('explore', 2));
        // leiser Paukenwirbel am Ende jeder Phrase
        if (barIdx % 4 === 3 && on('tension')) for (let r = 0; r < 6; r++) this.taiko(t + barLen * 0.6 + r * st * 0.25, (fight ? 0.12 : 0.06) * (0.4 + r * 0.12), S('tension'), 0.75);
      }
      if (s === 0 || s === half) {
        this.cello(bar.bass[s ? 1 : 0] + tr, t, st * (half - 0.2), 0.06, S('base', 0));
        if (s === 0) this.cello(root - 12, t, st * (spb - 0.3), fight ? 0.06 : 0.045, S('base'));
      }

      // ---------- Erkundung: Melodie auf Fidel/Flöte, Gegenstimme, Laute ----------
      const m = bar.mel[s];
      if (m && !rest) {
        const n = m + tr;
        if (fight || p.id === 'menu' || p.id === 'victory') this.horn(n - (boss ? 12 : 0), t, st * 2, boss ? 0.055 : 0.045, S('base'));
        else if (on('explore')) {
          if (mystic) this.flute(n, t, st * 2.8, 0.065, S('explore'));
          else this.fiddle(n, t, st * 2.2, p.id === 'harbor' ? 0.055 : 0.05, S('explore', 0));
          // in der zweiten Strophe verdoppeln Hörner die Fidel (größer, epischer)
          if (!mystic && verse % 2 === 1 && s % 2 === 0) this.horn(n - 12, t, st * 1.8, 0.026, S('explore', 2));
        }
      }
      if (bar.alt?.[s] && verse % 2 === 1 && !rest && on('explore')) this.flute(bar.alt[s]! + tr, t, st * 2.4, 0.038, S('explore', 2));
      if (p.id === 'harbor' && bar.chord && s % 2 === 1 && on('explore')) for (const nn of bar.chord) this.pluck(nn + tr, t, 0.028, S('explore', 0));

      // ---------- Spannung: treibendes Celli-Ostinato, Pauke auf dem Grundton ----------
      if (on('tension')) {
        this.cello(root + (s % 2 ? 12 : 0), t, st * 0.8, fight ? 0.022 : 0.028, S('tension', 0), true);
        if (s === 0) this.timpani(root - 12, t, 0.16, S('tension'));
        if (s === half) this.timpani(root - 5, t, 0.1, S('tension'));
      }

      // ---------- Kampf (Seeschlacht): Taiko-Ensemble, Spiccato, Blech, Chor, Becken ----------
      if (!fight && on('combat') && bar.chord) {
        const chord = bar.chord.map((n) => n + tr);
        // Heldenmelodie: Hörner tragen das Thema (auch in der Atempause), Trompeten strahlen darüber, auf See Posaunen darunter
        const mel = bar.mel[s] || (rest && s === 0 ? chord[2] : 0);
        if (mel) {
          const n = mel + tr * (bar.mel[s] ? 1 : 0);
          this.horn(n, t, st * 2.1, 0.05, S('combat', 2));
          if (s % 2 === 0) this.trumpet(n + (n < 72 ? 12 : 0), t, st * 1.6, naval ? 0.03 : 0.018, S('combat', 2));
          if (naval && s % half === 0) this.lowBrass(n - 24, t, st * 1.8, 0.04, S('combat', 2));
        }
        // Spiccato-Streicher in Sechzehnteln: Grundton – Quinte – Oktave, Akzent auf den Schlägen
        const fig = [root + 12, root + 19, root + 24, root + 19];
        for (let h = 0; h < 2; h++) {
          if (lite && h === 1) break;
          const acc = h === 0 && (s === 0 || s === half) ? 1.35 : 1;
          this.spiccato(fig[(s * 2 + h) % 4], t + h * st * 0.5, 0.042 * acc, S('combat', 0), st * 0.45);
        }
        // tiefes Blech-Ostinato („DAM – da DAM da“) auf dem Grundton
        if (naval && (s === 0 || s === half)) this.lowBrass(root, t, st * 0.9, 0.05, S('combat', 2));
        if (naval && (s === half - 1 || s === spb - 1)) this.lowBrass(root, t, st * 0.45, 0.03, S('combat', 2));
        // Taiko-Ensemble: große Trommeln auf den Schlägen, Vorschlag vor dem Takt, kleine Trommeln dazwischen
        if (s === 0 || s === half) {
          this.taiko(t, 0.46, S('combat'), s ? 1.05 : 0.8);
          if (naval && !lite) this.taiko(t + 0.012, 0.32, S('combat', 0), s ? 0.7 : 0.6);
        }
        if (s === spb - 1) { this.taiko(t, 0.18, S('combat', 2), 1.3); this.taiko(t + st * 0.5, 0.24, S('combat', 2), 1.2); }
        if (s % 2 === 1) this.frame(t, 0.04, S('combat', 0));
        // Blechakkord und großer Chor („Oh“) auf jedem zweiten Takt
        if (s === 0 && barIdx % 2 === 0) {
          for (const nn of chord) this.horn(nn - 12, t, st * 3, 0.026, S('combat', 2));
          if (!lite) this.choir(chord, t, barLen * 2, naval ? 0.12 : 0.08, S('combat'));
        }
        // Becken: Schwellung in jede neue Phrase, Schlag auf ihren ersten Schlag
        if (barIdx % 4 === 3 && s === half) this.cymbal(t, st * half, 0.05, S('combat', 2), true);
        if (barIdx % 4 === 0 && s === 0) this.cymbal(t, 2.2, 0.045, S('combat', 2), false);
      }

      // ---------- Kampfbeginn: großer Schlag am Taktanfang (unabhängig von den Schichten) ----------
      if (p.sting && s === 0) {
        p.sting = false;
        this.curWet = p.wet;
        this.taiko(t, 0.55, p.gain, 0.7); this.taiko(t + 0.015, 0.45, p.gain, 1.1);
        this.cymbal(t, 2.6, 0.06, p.gain, false);
        if (bar.chord) for (const nn of bar.chord) this.lowBrass(nn + tr - 12, t, barLen * 0.9, 0.035, p.gain);
      }

      // ---------- Reine Kampfstücke (Boss, Sturm): Kriegstrommeln und Bläserstöße wie bisher ----------
      if (fight) {
        const out = S('combat');
        this.cello(root + (s % 2 ? 12 : 0), t, st * 0.8, 0.022, out, true);
        if (s === 0) this.taiko(t, 0.14, out, 0.9);
        if (s === 0 || s === half) this.taiko(t, 0.42, out, s ? 1.1 : 0.85);
        if (spb === 8 && s === 7) this.taiko(t, 0.18, out, 1.35);
        if (spb === 6 && s === 5) this.taiko(t, 0.16, out, 1.3);
        if (s === half - 1 || s === spb - 1) this.frame(t, 0.035, out);
        if (s === 0 && barIdx % 2 === 0 && bar.chord) for (const nn of bar.chord) this.horn(nn + tr - 12, t, st * 3, 0.022, S('combat', 2));
        if (boss && s === 0) this.cello(root - 24, t, barLen, 0.07, out);
        if (naval && (s === 0 || s === half)) this.lowBrass(root, t, st * 0.9, 0.04, S('combat', 2));
        if (barIdx % 4 === 3 && s === half) this.cymbal(t, st * half, 0.045, S('combat', 2), true);
      }
      p.next += st;
      p.step++;
    }
  }

  update(dt: number) {
    if (!this.running) return;
    this.updateAmbience(dt);
    this.scheduleMusic(dt);
  }

  get currentMood() { return this.mood; }
}

export const audio = new AudioEngine();
