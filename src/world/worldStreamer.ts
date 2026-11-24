// WorldStreamer (Phase 4.3A): Kern des Chunk-Streamings der Inseln. Reine Logik ohne three.js; die Darstellung steckt hinter `StreamHost`.
//
// Die Daten der Welt (Inseln, Wirtschaft, Fraktionen, Besatzung, Entdeckung) liegen dauerhaft als reine, JSON-taugliche Strukturen im Speicher. Nur
// ihre Darstellung (Netze, Instanz-Puffer, Lichter, Tiere, Begehbarkeits-Netze) kommt und geht – je Insel in drei Stufen mit Hysterese:
//
//   UNLOADED     Abstand > 4 500 m: nichts als Daten (der IslandBlueprint, 0 Objekte, 0 Zeichenaufrufe)
//   HORIZON_LOD  Aktivierung ≤ 4 200 m, Abbau > 4 500 m: Silhouette mit Gischtlinie und Feuer (höchstens 4 Zeichenaufrufe, keine Physik)
//   ACTIVE_HIGH  Aktivierung ≤ 1 100 m, Rückstufung > 1 300 m: die volle Insel, in Teilschritten über mehrere Bilder aufgebaut (Gelände → Bauten und
//                Stege → Felsen, Bewuchs, Lichter, Schilder, Konturen), je Bild höchstens das Zeitbudget (2,5 ms), danach der Tausch in einem eigenen Bild
//
// Der Abstand einer Insel ist der Abstand ihrer Küste (Mitte minus Küstenradius `r`, nie unter 0) zum nächsten Interessenpunkt: Spielerschiff,
// Kamera und die aktiven Flottenschiffe. Während ACTIVE_HIGH aufgebaut wird, bleibt die Silhouette sichtbar; erst wenn alles bereitsteht, tauscht
// `commitActive` sie gegen die Insel (kein Aufpoppen, kein Bildruckler durch einen Mammutaufbau). `forceSyncAround` baut dagegen alles im ACTIVE-Radius
// sofort fertig (Spielstand laden, Rückkehr aus dem Raid, Schnellreise), bevor Physik und Kollision anlaufen.
import { SpatialGrid, chunkKeyAt, type GridJSON } from './worldGrid';

export const LOD = { UNLOADED: 0, HORIZON_LOD: 1, ACTIVE_HIGH: 2 } as const;
export type StreamLevel = 0 | 1 | 2;
export const LEVEL_NAMES = ['UNLOADED', 'HORIZON_LOD', 'ACTIVE_HIGH'] as const;

/** Schwellen (m) und Zeitplan des Streamings */
export const STREAM = {
  /** ACTIVE_HIGH: Aktivierung ≤ activeIn, Rückstufung > activeOut (seit 4.3B: 1 100/1 300 m, vorher 1 000/1 200 m) */
  activeIn: 1100,
  activeOut: 1300,
  /** HORIZON_LOD: Aktivierung ≤ horizonIn, Abbau > horizonOut (seit 4.3B: 4 200/4 500 m für die 3,7-fache Welt, vorher 2 600/2 850 m) */
  horizonIn: 4200,
  horizonOut: 4500,
  /**
   * Zeitbudget (ms) eines Bildes für Aufbau-Teilschritte: nach jedem Teilschritt prüft der Streamer die Uhr und hört auf, sobald das Budget
   * verbraucht ist. Die Teilschritte sind klein (Geländeringe, ein Bauwerk, ein Material beim Verschmelzen, ein Netz mit Kontur); ein einzelner Schritt, der
   * das Budget allein sprengt, zählt in `stats.overBudget` und erscheint in `stats.maxStepMs`.
   */
  budgetMs: 2.5,
  /** Obergrenze der Aufbau-Teilschritte je Bild (auch bei winzigen Schritten) */
  maxStepsPerFrame: 24,
  /** Abbau von ACTIVE-Inseln je Bild (das Freigeben vieler Puffer am Stück wäre ein Ruckler) */
  maxUnloadsPerFrame: 1,
} as const;

/**
 * Stufenwechsel mit Hysterese (reine Funktion). `cur` ist die zuletzt gewünschte Stufe, `dist` der Küstenabstand.
 * Aufwärts gilt die engere Schwelle, abwärts die weitere: an den Grenzen flattert nichts.
 */
export function nextLevel(cur: StreamLevel, dist: number): StreamLevel {
  if (cur === 2) return dist <= STREAM.activeOut ? 2 : dist <= STREAM.horizonOut ? 1 : 0;
  if (cur === 1) return dist <= STREAM.activeIn ? 2 : dist <= STREAM.horizonOut ? 1 : 0;
  return dist <= STREAM.activeIn ? 2 : dist <= STREAM.horizonIn ? 1 : 0;
}

/** Reine, JSON-taugliche Beschreibung einer Insel für den Streamer */
export interface StreamRecord {
  id: string;
  x: number;
  z: number;
  /** Küstenradius: der Abstand zählt von der Küste, nicht von der Mitte */
  r: number;
  /** Heimatzelle der Inselmitte (`"cx,cz"`) */
  chunk: string;
  /** Bleibt immer ACTIVE_HIGH (zum Beispiel Ankerglück mit Stadt, Bewohnern und Hafenmenüs) */
  pinned: boolean;
}

export interface StreamSnapshot {
  chunkSize: number;
  islands: (StreamRecord & { level: StreamLevel; levelName: string })[];
  grid: GridJSON;
}

/** Was der Streamer von der Darstellung verlangt (`SeaWorld` setzt es mit echten Netzen um, die Tests mit einem Protokoll) */
export interface StreamHost {
  /** Silhouette anlegen und in die Szene hängen (UNLOADED → HORIZON_LOD) */
  showHorizon(i: number): void;
  /** Silhouette abbauen, samt ihrer Grafikspeicher-Objekte */
  hideHorizon(i: number): void;
  /**
   * Detailaufbau als Iterator: je `next()` ein Teilschritt (Gelände, Bauten, Props …), der letzte beendet ihn (`done`). Die Insel bleibt dabei
   * unsichtbar. Bricht der Streamer ab, ruft er `return()`: das Halbfertige gehört dem `finally` des Generators.
   */
  buildActive(i: number): Iterator<unknown, unknown>;
  /** Der Aufbau ist fertig: die Insel sichtbar schalten, in die Listen der Welt aufnehmen */
  commitActive(i: number): void;
  /** Die Insel abbauen (Netze, Instanz-Puffer, Lichter, Tiere, Begehbarkeits-Netz); die Daten bleiben. Gilt auch für fertig gebaute, nie gezeigte Inseln. */
  disposeActive(i: number): void;
}

export interface StreamStats {
  frames: number;
  steps: number;
  commits: number;
  unloads: number;
  /** Dauer des letzten und des längsten Teilschritts (ms) */
  lastStepMs: number;
  maxStepMs: number;
  /** Teilschritte, die das Zeitbudget (`STREAM.budgetMs`) überschritten */
  overBudget: number;
  forceSyncs: number;
  /** Inseln, die `forceSyncAround` selbst fertig gebaut hat, und die Zeit (ms), die das gekostet hat */
  syncBuilt: number;
  syncMs: number;
  failures: number;
}

interface Slot {
  rec: StreamRecord;
  /** Gewünschte Stufe (Hysterese-Zustand) und tatsächlich bereitstehende Stufe */
  target: StreamLevel;
  level: StreamLevel;
  /** Abstand zur Küste beim letzten Durchlauf */
  dist: number;
  job: Iterator<unknown, unknown> | null;
  /** Der Aufbau ist durchgelaufen, der Tausch steht noch aus */
  ready: boolean;
  steps: number;
  retryAt: number;
  mark: number;
  resPos: number;
}

const MAX_INTEREST = 16;

export type Clock = () => number;
const defaultClock: Clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class WorldStreamer {
  private slots: Slot[] = [];
  private grid = new SpatialGrid();
  private ix = new Float64Array(MAX_INTEREST * 2);
  private nI = 0;
  private cand: number[] = [];
  private tmp: number[] = [];
  private markId = 0;
  /** Inseln mit Stufe > 0 oder laufendem Aufbau (kleine Liste, Austausch mit dem letzten Eintrag) */
  private resident: number[] = [];
  private frame = 0;
  private jobIdx = -1;
  readonly stats: StreamStats = { frames: 0, steps: 0, commits: 0, unloads: 0, lastStepMs: 0, maxStepMs: 0, overBudget: 0, forceSyncs: 0, syncBuilt: 0, syncMs: 0, failures: 0 };

  private budgetMs: number;
  private maxSteps: number;
  private maxUnloads: number;

  constructor(private host: StreamHost, private now: Clock = defaultClock, opts: Partial<{ budgetMs: number; maxStepsPerFrame: number; maxUnloadsPerFrame: number }> = {}) {
    this.budgetMs = opts.budgetMs ?? STREAM.budgetMs;
    this.maxSteps = opts.maxStepsPerFrame ?? STREAM.maxStepsPerFrame;
    this.maxUnloads = opts.maxUnloadsPerFrame ?? STREAM.maxUnloadsPerFrame;
  }

  // ---------- Inseln ----------

  /** Insel eintragen (in der Reihenfolge der Weltdaten); liefert ihre Nummer. `level` = was schon dasteht (beim Laden: alles ACTIVE_HIGH) */
  addIsland(def: { id: string; x: number; z: number; r: number }, opts: { pinned?: boolean; level?: StreamLevel } = {}): number {
    const rec: StreamRecord = { id: def.id, x: def.x, z: def.z, r: def.r, chunk: chunkKeyAt(def.x, def.z, this.grid.size), pinned: !!opts.pinned };
    const i = this.grid.add(def.x, def.z, def.r);
    const level = opts.level ?? 0;
    this.slots.push({ rec, target: opts.pinned ? 2 : level, level, dist: Infinity, job: null, ready: false, steps: 0, retryAt: 0, mark: 0, resPos: -1 });
    if (level > 0) this.addResident(i);
    return i;
  }

  get count(): number { return this.slots.length; }
  record(i: number): StreamRecord { return this.slots[i].rec; }
  levelOf(i: number): StreamLevel { return this.slots[i].level; }
  targetOf(i: number): StreamLevel { return this.slots[i].target; }
  distOf(i: number): number { return this.slots[i].dist; }
  /** Läuft für diese Insel gerade ein Aufbau (oder wartet der Tausch)? */
  buildingOf(i: number): boolean { return this.slots[i].job !== null || this.slots[i].ready; }
  indexOf(id: string): number { for (let i = 0; i < this.slots.length; i++) if (this.slots[i].rec.id === id) return i; return -1; }

  /** Zähler je Stufe und Anzahl laufender Aufbauten */
  counts(): { unloaded: number; horizon: number; active: number; building: number } {
    const c = { unloaded: 0, horizon: 0, active: 0, building: 0 };
    for (const s of this.slots) {
      if (s.level === 2) c.active++; else if (s.level === 1) c.horizon++; else c.unloaded++;
      if (s.job || s.ready) c.building++;
    }
    return c;
  }

  /** Indizes aller Inseln, die gerade Detail oder Silhouette tragen (zum Nachschlagen; allokiert) */
  residentIndices(): number[] { return this.resident.slice(); }

  /** Alles als reine Daten: Inseln mit Zelle und Stufe, dazu das Raster */
  snapshot(): StreamSnapshot {
    return {
      chunkSize: this.grid.size,
      islands: this.slots.map((s) => ({ ...s.rec, level: s.level, levelName: LEVEL_NAMES[s.level] })),
      grid: this.grid.toJSON(),
    };
  }

  // ---------- Interessenpunkte ----------

  /** Vor jedem Bild: Liste der Interessenpunkte leeren … */
  beginInterest(): void { this.nI = 0; }
  /** … und füllen: Spielerschiff, Kamera, aktive Flottenschiffe (ungültige Zahlen werden ignoriert, höchstens 16 Punkte) */
  addInterest(x: number, z: number): void {
    if (this.nI >= MAX_INTEREST || !Number.isFinite(x) || !Number.isFinite(z)) return;
    this.ix[this.nI * 2] = x; this.ix[this.nI * 2 + 1] = z; this.nI++;
  }
  get interestCount(): number { return this.nI; }

  // ---------- Ziele ----------

  private addResident(i: number): void {
    const s = this.slots[i];
    if (s.resPos >= 0) return;
    s.resPos = this.resident.length;
    this.resident.push(i);
  }

  private dropResident(i: number): void {
    const s = this.slots[i];
    if (s.resPos < 0) return;
    const last = this.resident.length - 1, moved = this.resident[last];
    this.resident[s.resPos] = moved;
    this.slots[moved].resPos = s.resPos;
    this.resident.pop();
    s.resPos = -1;
  }

  /** Abstand der Küste einer Insel zum nächsten Interessenpunkt */
  private distTo(s: Slot): number {
    let best = Infinity;
    for (let k = 0; k < this.nI; k++) {
      const dx = this.ix[k * 2] - s.rec.x, dz = this.ix[k * 2 + 1] - s.rec.z;
      const d = Math.sqrt(dx * dx + dz * dz) - s.rec.r;
      if (d < best) best = d;
    }
    return best > 0 ? best : 0;
  }

  /** Kandidaten sammeln (Inseln nahe an einem Interessenpunkt plus alles, was schon dasteht) und ihre gewünschte Stufe nachführen */
  private refreshTargets(): void {
    const cand = this.cand;
    cand.length = 0;
    const id = ++this.markId;
    for (let k = 0; k < this.nI; k++) {
      const n = this.grid.query(this.ix[k * 2], this.ix[k * 2 + 1], STREAM.horizonOut, this.tmp);
      for (let j = 0; j < n; j++) { const i = this.tmp[j]; const s = this.slots[i]; if (s.mark !== id) { s.mark = id; cand.push(i); } }
    }
    for (let j = 0; j < this.resident.length; j++) { const i = this.resident[j]; const s = this.slots[i]; if (s.mark !== id) { s.mark = id; cand.push(i); } }
    for (let j = 0; j < cand.length; j++) {
      const s = this.slots[cand[j]];
      s.dist = this.distTo(s);
      s.target = s.rec.pinned ? 2 : nextLevel(s.target, s.dist);
    }
  }

  // ---------- Übergänge ----------

  private setHorizon(i: number, on: boolean): void {
    const s = this.slots[i];
    if (on) { if (s.level === 0) { this.host.showHorizon(i); s.level = 1; this.addResident(i); } return; }
    if (s.level === 1) { this.host.hideHorizon(i); s.level = 0; if (!s.job && !s.ready) this.dropResident(i); }
  }

  /** Laufenden oder fertigen, noch nicht getauschten Aufbau verwerfen */
  private abortJob(i: number): void {
    const s = this.slots[i];
    if (s.job) { try { s.job.return?.(undefined); } catch (e) { console.error('WorldStreamer: Abbruch', e); } s.job = null; }
    if (s.ready) { try { this.host.disposeActive(i); } catch (e) { console.error('WorldStreamer: Abbau', e); } s.ready = false; }
    s.steps = 0;
    if (this.jobIdx === i) this.jobIdx = -1;
    if (s.level === 0) this.dropResident(i);
  }

  /** Eine ACTIVE-Insel auf `to` (0 oder 1) zurücknehmen */
  private demote(i: number, to: 0 | 1): void {
    const s = this.slots[i];
    if (to === 1) { this.host.showHorizon(i); s.level = 1; }
    this.host.disposeActive(i);
    this.stats.unloads++;
    if (to === 0) { s.level = 0; if (!s.job && !s.ready) this.dropResident(i); }
  }

  private commit(i: number): void {
    const s = this.slots[i];
    this.host.commitActive(i);
    if (s.level === 1) this.host.hideHorizon(i);
    s.level = 2;
    s.ready = false; s.job = null; s.steps = 0;
    if (this.jobIdx === i) this.jobIdx = -1;
    this.addResident(i);
    this.stats.commits++;
  }

  /** Teilschritt eines Aufbaus; true, wenn der Iterator damit fertig ist. Synchrone Aufbauten (`forceSyncAround`) zählen nicht gegen das Bildbudget. */
  private stepJob(i: number, sync = false): boolean {
    const s = this.slots[i];
    const t0 = this.now();
    let done = false;
    try {
      const r = s.job!.next();
      done = !!r.done;
    } catch (e) {
      console.error('WorldStreamer: Aufbau fehlgeschlagen', s.rec.id, e);
      this.stats.failures++;
      s.retryAt = this.frame + 300;
      this.abortJob(i);
      return false;
    }
    const ms = this.now() - t0;
    this.stats.steps++;
    s.steps++;
    if (sync) this.stats.syncMs += ms;
    else {
      this.stats.lastStepMs = ms;
      if (ms > this.stats.maxStepMs) this.stats.maxStepMs = ms;
      if (ms > this.budgetMs) this.stats.overBudget++;
    }
    if (done) { s.job = null; s.ready = true; }
    return done;
  }

  /** Nächste Insel, die ACTIVE werden soll: die nächste nach Abstand */
  private pickBuild(): number {
    let best = -1, bd = Infinity;
    for (let j = 0; j < this.cand.length; j++) {
      const i = this.cand[j], s = this.slots[i];
      if (s.target !== 2 || s.level === 2 || s.job || s.ready || s.retryAt > this.frame) continue;
      if (s.dist < bd) { bd = s.dist; best = i; }
    }
    return best;
  }

  // ---------- Takt ----------

  /**
   * Ein Bild streamen: Ziele nachführen, Silhouetten anlegen und abbauen, höchstens `maxUnloadsPerFrame` Inseln abbauen und
   * Teilschritte eines Aufbaus ausführen, bis das Zeitbudget (`budgetMs`) des Bildes verbraucht ist (oder den Tausch einer fertig gebauten Insel).
   */
  update(): void {
    this.frame++;
    this.stats.frames++;
    if (this.nI === 0) return;
    this.refreshTargets();
    const cand = this.cand;
    // 1. Rücknahmen und Silhouetten
    let unloads = 0;
    for (let j = 0; j < cand.length; j++) {
      const i = cand[j], s = this.slots[i];
      if (s.target < 2 && (s.job || s.ready)) this.abortJob(i);
      if (s.target === 0) {
        if (s.level === 2) { if (unloads < this.maxUnloads) { this.demote(i, 0); unloads++; } }
        else if (s.level === 1) this.setHorizon(i, false);
      } else if (s.target === 1) {
        if (s.level === 2) { if (unloads < this.maxUnloads) { this.demote(i, 1); unloads++; } }
        else if (s.level === 0) this.setHorizon(i, true);
      } else if (s.level === 0) this.setHorizon(i, true); // ACTIVE gewünscht: die Silhouette steht, bis die Insel bereit ist
    }
    // 2. Aufbau: Teilschritte, bis das Zeitbudget des Bildes verbraucht ist; der Tausch (Grafikspeicher-Upload) steht immer allein in einem Bild
    const t0 = this.now();
    let steps = 0;
    while (steps < this.maxSteps) {
      let i = this.jobIdx;
      if (i < 0 || (this.slots[i].target !== 2)) {
        if (i >= 0) { this.abortJob(i); this.jobIdx = -1; }
        i = this.pickBuild();
        if (i < 0) break;
        const s = this.slots[i];
        if (s.level === 0) this.setHorizon(i, true);
        s.job = this.host.buildActive(i); s.ready = false; s.steps = 0;
        this.addResident(i);
        this.jobIdx = i;
      }
      const s = this.slots[i];
      if (s.ready) { if (steps > 0) break; this.commit(i); steps++; break; }
      this.stepJob(i);
      steps++;
      if (!this.slots[i].job && !this.slots[i].ready) this.jobIdx = -1;
      if (this.now() - t0 >= this.budgetMs) break;
    }
  }

  /**
   * Alles im ACTIVE-Radius um (x, z) sofort fertig aufbauen und den Rest auf seine Stufe bringen (Laden, Raid-Rückkehr, Schnellreise).
   * Liefert die Zahl der Inseln, die dabei gebaut wurden. Danach stimmen Daten, Kollision und Darstellung für diesen Ort.
   */
  forceSyncAround(x: number, z: number): number {
    this.stats.forceSyncs++;
    this.nI = 0;
    this.addInterest(x, z);
    if (this.nI === 0) return 0;
    this.refreshTargets();
    const cand = this.cand;
    let built = 0;
    // Rücknahmen zuerst (Speicher frei, bevor Neues kommt)
    for (let j = 0; j < cand.length; j++) {
      const i = cand[j], s = this.slots[i];
      if (s.target < 2 && (s.job || s.ready)) this.abortJob(i);
      if (s.level === 2 && s.target < 2) this.demote(i, s.target as 0 | 1);
      else if (s.level === 1 && s.target === 0) this.setHorizon(i, false);
      else if (s.level === 0 && s.target === 1) this.setHorizon(i, true);
    }
    for (let j = 0; j < cand.length; j++) {
      const i = cand[j], s = this.slots[i];
      if (s.target !== 2 || s.level === 2) continue;
      if (!s.job && !s.ready) { s.job = this.host.buildActive(i); s.steps = 0; this.addResident(i); }
      if (s.job) {
        for (let guard = 0; guard < 10000; guard++) { if (this.stepJob(i, true)) break; if (!s.job) break; }
      }
      if (s.ready) { this.commit(i); built++; }
    }
    this.stats.syncBuilt += built;
    this.jobIdx = -1;
    return built;
  }

  /** Eine Insel sofort auf ACTIVE_HIGH bringen (zum Beispiel ein Ort, den eine Quest verlangt) */
  forceActive(i: number): boolean {
    const s = this.slots[i];
    if (!s) return false;
    if (s.level === 2) return true;
    s.target = 2;
    if (!s.job && !s.ready) { s.job = this.host.buildActive(i); s.steps = 0; this.addResident(i); }
    if (s.job) for (let guard = 0; guard < 10000; guard++) { if (this.stepJob(i, true)) break; if (!s.job) break; }
    if (s.ready) { this.commit(i); this.stats.syncBuilt++; return true; }
    return false;
  }

  /** Alles abbauen (Welt wird verworfen): Silhouetten und Details, Aufbauten abbrechen */
  disposeAll(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.job || s.ready) this.abortJob(i);
      if (s.level === 2) this.demote(i, 0);
      else if (s.level === 1) this.setHorizon(i, false);
      s.target = 0;
    }
    this.resident.length = 0;
    for (const s of this.slots) s.resPos = -1;
    this.jobIdx = -1;
  }
}
