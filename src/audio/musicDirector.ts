import { groupTracks, trackById, type MusicLayer, type MusicSector, type MusicTrack } from '../data/musicTracks';
import { smoothstep } from '../core/mathUtil';

/**
 * MusicDirector: spielt die gerenderten Orchester-Stems (public/audio/music/, Manifest in data/musicTracks.ts) klickfrei und blendet sie nach der
 * Lage im Spiel. Ein „Stück“ (Gruppe) ist ein Satz taktgleicher Stems, die zusammen starten und als Schleife laufen; die Schichten werden nach
 * Bedrohung, Fahrt und Wetter überblendet (Ruhig → Spannung → Kampf). Wechsel zwischen Stücken sind Gleichleistungs-Überblendungen (0,35 bis 3 s),
 * wichtige Effekte senken die Musik kurz ab (Ducking). Fehlen die Dateien oder lassen sie sich nicht entschlüsseln (Safari ohne Ogg), bleibt
 * `active` falsch und die prozedurale Musik aus `audio.ts` spielt weiter.
 *
 * Die Auswahl (`chooseScene`) ist reine Logik ohne Web Audio und getestet.
 */

export interface MusicRaid {
  route: 'A' | 'B' | null;
  phase: string;
  over: boolean;
  /** Endboss: Macht, Lebensanteil 0 … 1 und Kampfphase (1 oder 2) – null, solange er nicht erschienen ist */
  boss: { faction: MusicSector | null; hp: number; phase: number } | null;
}

export interface MusicContext {
  mode: 'menu' | 'sail' | 'foot';
  /** Färbung der Region unter der Spielfigur: Ankerglück (Kernmeer), die fünf Mächte oder die Marine */
  sector: MusicSector;
  /** Festgemacht oder in einer Hafenstadt; `harborSector` färbt die Tavernenmusik */
  harbor: boolean;
  harborSector: MusicSector;
  /** Fahrt 0 … 1, Wind 0 … 1, Sturm 0 … 1 (Wellen, Regen, Gewitter) */
  speed: number;
  wind: number;
  storm: number;
  /** Nähe von Feinden 0 … 1 */
  threat: number;
  /** Gefecht oder KI-Grenzschlacht in Hörweite */
  seaBattle: boolean;
  boarding: boolean;
  raid: MusicRaid | null;
}

export const IDLE_MUSIC: MusicContext = { mode: 'menu', sector: 'ankergluck', harbor: false, harborSector: 'ankergluck', speed: 0, wind: 0, storm: 0, threat: 0, seaBattle: false, boarding: false, raid: null };

export interface Scene {
  group: string;
  levels: Partial<Record<MusicLayer, number>>;
  /** Wechsel dahin sofort (Gefahr) statt erst nach der Mindestzeit des laufenden Stücks */
  urgent: boolean;
  /** Dauer der Überblendung in Sekunden */
  fade: number;
}


/** Welches Stück und welche Schichten passen zur Lage? null = Menü (keine Dateimusik) */
export function chooseScene(c: MusicContext): Scene | null {
  if (c.mode === 'menu') return null;
  const raid = c.raid && !c.raid.over ? c.raid : null;
  const boss = raid?.boss;
  if (boss?.faction) {
    // Phase 2 ab 50 % Boss-Leben: Chor und schwere Trommeln kommen dazu
    return { group: `boss_${boss.faction}`, levels: { p1: 1, p2: boss.hp <= 0.5 || boss.phase >= 2 ? 1 : 0 }, urgent: true, fade: 1.6 };
  }
  if (c.boarding) return { group: 'boarding', levels: { main: 1 }, urgent: true, fade: 0.35 };
  if (raid) return { group: raid.route === 'B' ? 'siege_b' : 'siege_a', levels: { base: 1, intense: smoothstep(0.25, 0.75, c.threat) }, urgent: true, fade: 1.8 };
  if (c.mode === 'sail' && (c.seaBattle || c.threat > 0.55)) {
    return { group: 'battle_sea', levels: { base: 1, intense: Math.min(1, smoothstep(0.55, 0.95, c.threat) * 0.9 + (c.seaBattle ? 0.2 : 0)) }, urgent: true, fade: 1.2 };
  }
  if (c.mode === 'sail' && c.storm > 0.55) return { group: 'storm', levels: { base: 1, intense: smoothstep(0.7, 1.0, Math.max(c.storm, c.wind)) }, urgent: false, fade: 2.5 };
  if (c.harbor && c.threat < 0.45) return { group: `harbor_${c.harborSector}`, levels: { main: 1 }, urgent: false, fade: 2.2 };
  // Region: Ruhig immer, Spannung mit Gefahr und bei voller Fahrt im starken Wind (Trommeln und Streicher), Kampf bei Gefahr
  const combat = smoothstep(0.55, 0.9, c.threat);
  const drive = c.mode === 'sail' ? 0.85 * smoothstep(0.3, 0.95, c.speed) * (0.35 + 0.65 * Math.min(1, c.wind)) : 0;
  const tension = Math.min(1, Math.max(smoothstep(0.1, 0.6, c.threat), drive));
  return { group: `reg_${c.sector}`, levels: { calm: 1 - 0.45 * combat, tension, combat }, urgent: false, fade: 3.0 };
}

/** Pegelausgleich je Schicht im Mix (die Stems sind je auf ihren Zielpegel gerendert) */
const LAYER_TRIM: Partial<Record<MusicLayer, number>> = { calm: 1, tension: 0.9, combat: 0.85, base: 1, intense: 0.85, main: 1, p1: 1, p2: 0.85 };
/** Obergrenze der gleichzeitig im Speicher gehaltenen Stücke (entschlüsselte Puffer sind groß: etwa 10 MB je Stem) */
const MAX_RESIDENT = 5;
const MAX_RESIDENT_LITE = 3;

export interface NowPlaying { trackId: string; title: string; group: string; category: MusicTrack['category']; factionId: MusicSector | null }

export interface DirectorHooks {
  onTrack?(now: NowPlaying | null): void;
  onSector?(sector: MusicSector, previous: MusicSector): void;
}

interface Live {
  group: string;
  title: string;
  master: GainNode;
  stems: { track: MusicTrack; src: AudioBufferSourceNode; gain: GainNode }[];
  started: number;
  oneShot: boolean;
}

const fadeCurve = (n: number, up: boolean) => {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1); c[i] = up ? Math.sin(x * Math.PI / 2) : Math.cos(x * Math.PI / 2); }
  return c;
};
const CURVE_UP = fadeCurve(64, true), CURVE_DOWN = fadeCurve(64, false);

export class MusicDirector {
  readonly out: GainNode;
  private duckGain: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<boolean>>();
  private failed = new Map<string, number>();
  private lastUse = new Map<string, number>();
  private cur: Live | null = null;
  private pending: string | null = null;
  private pendingAt = 0;
  private fading: Live[] = [];
  private threatS = 0;
  private threatHold = 0;
  private battleHold = 0;
  private boardHold = 0;
  private sectorShown: MusicSector = 'ankergluck';
  private sectorPending: MusicSector | null = null;
  private sectorT = 0;
  private lite = false;
  private clock = 0;
  /** Stücke, die schon zum Vorladen angefordert wurden (nach dem Verdrängen aus dem Speicher wieder frei) */
  private asked = new Set<string>();
  enabled = true;

  constructor(private ctx: AudioContext, dest: AudioNode, private hooks: DirectorHooks = {}) {
    this.duckGain = ctx.createGain();
    this.out = ctx.createGain();
    this.out.gain.value = 0.72;
    this.duckGain.connect(this.out);
    this.out.connect(dest);
  }

  setLite(v: boolean) { this.lite = v; }

  /** Läuft gerade Dateimusik, die die prozedurale ersetzt? */
  get active(): boolean { return !!this.cur && this.enabled; }
  get currentTrackId(): string | null { return this.cur?.group ?? null; }
  get currentTrackTitle(): string { return this.cur?.title ?? ''; }
  get currentSector(): MusicSector { return this.sectorShown; }

  private now() { return this.ctx.currentTime; }

  // ---------- Laden ----------

  private layersOf(group: string): MusicTrack[] {
    // sparsamer Modus: die Spannungsschicht entfällt (weniger Speicher und Rechenzeit)
    return groupTracks(group).filter((t) => !(this.lite && t.layer === 'tension'));
  }

  private async fetchBuffer(t: MusicTrack): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(t.trackId);
    if (hit) return hit;
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}audio/${t.file}`);
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      const buf = await new Promise<AudioBuffer>((ok, bad) => { this.ctx.decodeAudioData(ab, ok, bad); });
      this.buffers.set(t.trackId, buf);
      return buf;
    } catch {
      return null;
    }
  }

  /** Alle Stems eines Stücks laden (einmal; parallele Aufrufe teilen sich die Arbeit). Wahr, wenn alle da sind. */
  load(group: string): Promise<boolean> {
    const tr = this.layersOf(group);
    if (!tr.length) return Promise.resolve(false);
    if (tr.every((t) => this.buffers.has(t.trackId))) { this.lastUse.set(group, this.clock); return Promise.resolve(true); }
    const failedAt = this.failed.get(group);
    if (failedAt !== undefined && this.clock - failedAt < 30) return Promise.resolve(false);
    let p = this.loading.get(group);
    if (!p) {
      p = Promise.all(tr.map((t) => this.fetchBuffer(t))).then((all) => {
        const ok = all.every((b) => !!b);
        if (!ok) { this.failed.set(group, this.clock); if (this.failed.size === 1) console.info(`Musik: Stück ${group} nicht geladen, die prozedurale Musik bleibt`); }
        else this.lastUse.set(group, this.clock);
        this.loading.delete(group);
        return ok;
      });
      this.loading.set(group, p);
    }
    return p;
  }

  /** Vorausschauend laden (Schlacht in Sicht, Sturm zieht auf, Belagerung beginnt) */
  preload(group: string) {
    if (!this.enabled || this.asked.has(group)) return;
    this.asked.add(group);
    void this.load(group);
  }

  private evict() {
    const limit = this.lite ? MAX_RESIDENT_LITE : MAX_RESIDENT;
    const groups = new Set<string>();
    for (const id of this.buffers.keys()) { const t = trackById(id); if (t) groups.add(t.group); }
    if (groups.size <= limit) return;
    const keep = new Set<string>([this.cur?.group ?? '', this.pending ?? '', ...this.fading.map((f) => f.group)]);
    const order = [...groups].filter((g) => !keep.has(g)).sort((a, b) => (this.lastUse.get(a) ?? 0) - (this.lastUse.get(b) ?? 0));
    for (const g of order) {
      if (groups.size <= limit) break;
      for (const t of groupTracks(g)) this.buffers.delete(t.trackId);
      this.asked.delete(g);
      groups.delete(g);
    }
  }

  // ---------- Szenen ----------

  private startScene(scene: Scene, oneShot = false): Live | null {
    const c = this.ctx;
    const tracks = this.layersOf(scene.group);
    if (!tracks.length || !tracks.every((t) => this.buffers.has(t.trackId))) return null;
    const t0 = c.currentTime;
    const when = t0 + 0.04;
    const master = c.createGain();
    master.gain.value = 0;
    master.connect(this.duckGain);
    const stems: Live['stems'] = [];
    for (const track of tracks) {
      const buf = this.buffers.get(track.trackId)!;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = track.loop && !oneShot;
      if (src.loop) {
        const end = Math.min(track.loopEnd, buf.duration);
        src.loopStart = Math.max(0, Math.min(track.loopStart, end - 0.1));
        src.loopEnd = end;
      }
      const gain = c.createGain();
      gain.gain.value = (scene.levels[track.layer] ?? 0) * (LAYER_TRIM[track.layer] ?? 1);
      src.connect(gain); gain.connect(master);
      src.start(when, 0);
      stems.push({ track, src, gain });
    }
    // Gleichleistungs-Einblenden (Sinus), damit sich zwei Stücke ohne Pegelloch überlagern
    master.gain.setValueCurveAtTime(CURVE_UP, when, Math.max(0.05, scene.fade));
    this.lastUse.set(scene.group, this.clock);
    const first = tracks[0];
    return { group: scene.group, title: first.title, master, stems, started: t0, oneShot };
  }

  private retire(l: Live, fade: number) {
    const t = this.now();
    l.master.gain.cancelScheduledValues(t);
    const v0 = l.master.gain.value;
    l.master.gain.setValueAtTime(v0, t);
    try { l.master.gain.setValueCurveAtTime(CURVE_DOWN.map((v) => v * Math.max(0.0001, v0)), t + 0.001, Math.max(0.05, fade)); } catch { l.master.gain.linearRampToValueAtTime(0, t + fade); }
    for (const s of l.stems) { try { s.src.stop(t + fade + 0.1); } catch { /* schon gestoppt */ } }
    this.fading.push(l);
    setTimeout(() => { try { l.master.disconnect(); } catch { /* weg */ } this.fading = this.fading.filter((x) => x !== l); }, (fade + 0.4) * 1000);
  }

  private applyLevels(l: Live, levels: Scene['levels']) {
    const t = this.now();
    for (const s of l.stems) s.gain.gain.setTargetAtTime(Math.max(0, levels[s.track.layer] ?? 0) * (LAYER_TRIM[s.track.layer] ?? 1), t, 0.6);
  }

  /** Musik kurz absenken (große Effekte, Fanfaren): auf `amount` (0 … 1), `hold` Sekunden halten, dann sanft zurück */
  duck(amount: number, hold = 0.6) {
    const g = this.duckGain.gain, t = this.now();
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(Math.min(1, Math.max(0.05, amount)), t + 0.06);
    g.setValueAtTime(Math.min(1, Math.max(0.05, amount)), t + 0.06 + hold);
    g.linearRampToValueAtTime(1, t + 0.06 + hold + 1.2);
  }

  /** Einmaliges Stück (Eroberungs-Fanfare, Alarm): lädt bei Bedarf, senkt die Musik ab und spielt es einmal */
  sting(id: 'conquest' | 'alarm') {
    if (!this.enabled) return;
    const group = `sting_${id}`;
    void this.load(group).then((ok) => {
      if (!ok) return;
      const live = this.startScene({ group, levels: { main: 1 }, urgent: true, fade: 0.05 }, true);
      if (!live) return;
      const dur = live.stems[0]?.track.loopEnd ?? 6;
      this.duck(0.35, Math.min(dur * 0.6, 5));
      setTimeout(() => { try { live.master.disconnect(); } catch { /* weg */ } }, (dur + 1) * 1000);
    });
  }

  // ---------- Schleife ----------

  update(c: MusicContext, dt: number) {
    this.clock += dt;
    if (!this.enabled) { this.fadeAll(); return; }
    // Bedrohung: schnell hoch (≈ 1 s), nach 4 s Ruhe langsam herunter (≈ 6 s) – kein Flackern zwischen Stücken
    if (c.threat >= this.threatS - 0.02) { this.threatS += (c.threat - this.threatS) * Math.min(1, dt / 0.9); this.threatHold = 4; }
    else if ((this.threatHold -= dt) <= 0) this.threatS += (c.threat - this.threatS) * Math.min(1, dt / 6);
    if (c.seaBattle) this.battleHold = 6; else this.battleHold = Math.max(0, this.battleHold - dt);
    if (c.boarding) this.boardHold = 1.5; else this.boardHold = Math.max(0, this.boardHold - dt);
    // Sektorwechsel erst nach 2,5 s an derselben Stelle (an den Grenzlinien kein Hin und Her)
    if (c.sector !== this.sectorShown) {
      if (this.sectorPending !== c.sector) { this.sectorPending = c.sector; this.sectorT = 0; }
      else if ((this.sectorT += dt) > 2.5) { const prev = this.sectorShown; this.sectorShown = c.sector; this.sectorPending = null; this.hooks.onSector?.(c.sector, prev); }
    } else this.sectorPending = null;
    const eff: MusicContext = { ...c, sector: this.sectorShown, threat: this.threatS, seaBattle: c.seaBattle || this.battleHold > 0, boarding: c.boarding || this.boardHold > 0 };
    // vorausschauend laden
    if (!this.lite) {
      if (c.threat > 0.25 && c.mode === 'sail') { this.preload('battle_sea'); this.preload('boarding'); }
      if (c.storm > 0.3) this.preload('storm');
      if (c.harbor) this.preload(`harbor_${c.harborSector}`);
      if (c.raid && !c.raid.over) { this.preload('siege_a'); this.preload('siege_b'); }
    }
    const want = chooseScene(eff);
    if (!want) {
      if (this.cur) { this.retire(this.cur, 2.5); this.cur = null; this.report(null); }
      this.pending = null;
      return;
    }
    if (!this.cur || this.cur.group !== want.group) {
      // das laufende Stück verlassen: Gefahrenstücke erst nach ihrer Mindestdauer (Erkundung ruhig → Musik nicht hektisch)
      const dwell = this.clock - (this.cur ? this.cur.started : -999);
      const minDwell = want.urgent ? 0.4 : 5;
      const ready = this.layersOf(want.group).every((t) => this.buffers.has(t.trackId));
      if (!ready) {
        // noch nicht im Speicher: laden (das laufende Stück spielt weiter); schlägt es fehl, bleibt die prozedurale Musik
        if (this.pending !== want.group || this.clock - this.pendingAt > 10) { this.pending = want.group; this.pendingAt = this.clock; void this.load(want.group); }
      } else if (dwell >= minDwell) {
        const live = this.startScene(want);
        if (live) {
          if (this.cur) this.retire(this.cur, want.fade);
          this.cur = live;
          this.pending = null;
          this.report(live);
          this.evict();
        }
      }
    } else this.applyLevels(this.cur, want.levels);
    this.lastUseTouch();
  }

  private lastUseTouch() { if (this.cur) this.lastUse.set(this.cur.group, this.clock); }

  private report(l: Live | null) {
    if (!l) { this.hooks.onTrack?.(null); return; }
    const t = l.stems[0]?.track;
    if (t) this.hooks.onTrack?.({ trackId: t.group, title: l.title, group: t.group, category: t.category, factionId: t.factionId });
  }

  private fadeAll() {
    if (this.cur) { this.retire(this.cur, 1.2); this.cur = null; this.report(null); }
  }
}
