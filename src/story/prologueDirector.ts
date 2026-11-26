// Phase 4.7A – Ablauf des Gewitter-Prologs als reine Zustandsmaschine (kein three.js, kein DOM, kein Math.random, nichts Neues je Schritt).
//
//   intro     Kamerafahrt über das brennende Flaggschiff, Titel, Schwarzbarts Ruf (Spielfigur steht am Bug)
//   deck      spielbar: der Schiffsjunge läuft vom Bug zum Achterdeck; Kanoneneinschläge und brennende Trümmer mit Warnringen vor ihm,
//             Schwarzbarts Schockwellen zerschmettern Marine-Schiffe, Blitze schlagen neben dem Schiff ein
//   assemble  Akt 1 des Finales: die sieben Admirale formieren sich auf ihren Flaggschiffen
//   charge    Akt 2: sieben Strahlen bündeln sich zum Vereinten Admirals-Urteil, Schwarzbart stellt sich ihm
//   impact    Akt 3: Einschlag mit Doppel-Impact-Frame, Schwarzbart fällt im Feuersturm
//   overboard die Druckwelle schleudert die Figur über Bord
//   blackout  Schwarzblende mit Herzschlag → done (die Einführung „Ankerglück“ beginnt)
//
// Die Welt (world/prologueLive.ts) liefert je Schritt die Lage der Figur im Schiffsraum (`PrologueGeo`) und setzt die Ereignisse um.
import { ADMIRALS, DECK_LINES, PROLOGUE, type ProloguePhase } from '../data/prologue';

export type PrologueEventType =
  | 'phase' | 'line' | 'hazard' | 'detonate' | 'shock' | 'strike' | 'admiral' | 'charge' | 'judgment' | 'fall' | 'thrown' | 'heartbeat' | 'done';

/** Ein Ereignis (vorab angelegt, je Schritt überschrieben): Felder je nach Art */
export interface PrologueEvent {
  type: PrologueEventType;
  /** Phase, Zeilen-ID */
  text: string;
  /** Gefahren-Nummer, Schiff, Admiral, Herzschlag */
  id: number;
  kind: 'cannon' | 'debris' | '';
  /** Lage im Schiffsraum (m): quer (+ Backbord) und längs (+ Bug) */
  lx: number; lz: number;
  r: number; warn: number; dmg: number; knock: number;
}

const ev = (): PrologueEvent => ({ type: 'phase', text: '', id: 0, kind: '', lx: 0, lz: 0, r: 0, warn: 0, dmg: 0, knock: 0 });

/** Ausgabe eines Schritts: feste Plätze, `n` = belegt */
export class PrologueOut {
  readonly events: PrologueEvent[] = Array.from({ length: 24 }, ev);
  n = 0;
  push(type: PrologueEventType): PrologueEvent {
    const e = this.events[Math.min(this.n, this.events.length - 1)];
    if (this.n < this.events.length) this.n++;
    e.type = type; e.text = ''; e.id = 0; e.kind = ''; e.lx = 0; e.lz = 0; e.r = 0; e.warn = 0; e.dmg = 0; e.knock = 0;
    return e;
  }
}

/** Lage der Spielfigur und des Decks im Schiffsraum (m): `lz` längs (+ Bug), `startLz` Bug-Startpunkt, `goalLz` Steuerrad, `halfW` halbe Deckbreite */
export interface PrologueGeo {
  lx: number; lz: number; startLz: number; goalLz: number; halfW: number;
  /** die Welt meldet das Achterdeck selbst (Höhe und Treppe zählen); ohne Angabe gilt der Abstand längs zum Ziel */
  reached?: boolean;
}

interface Pending { id: number; kind: 'cannon' | 'debris'; lx: number; lz: number; r: number; at: number; dmg: number; knock: number; live: boolean }

/** Zustand (JSON-tauglich) */
export interface PrologueState {
  phase: ProloguePhase;
  /** Zeit seit Beginn und in der Phase (s) */
  t: number;
  phaseT: number;
  /** eigener Zufall (LCG) */
  seed: number;
  nextCannon: number;
  nextDebris: number;
  nextStrike: number;
  hazardSeq: number;
  pending: Pending[];
  shocks: number;
  /** Phasenzeit der letzten Schockwelle (−1 = noch keine) */
  lastShock: number;
  lines: number;
  admirals: number;
  hint: boolean;
  reached: boolean;
  /** das Ziel wurde nicht erreicht, die Zeit lief ab (die Welt setzt die Figur ans Achterdeck) */
  auto: boolean;
  /** Merker der Finale-Schritte */
  marks: number;
  heartbeats: number;
  /** Treffer, die die Figur abbekommen hat (Prüfungen) */
  hits: number;
}

export function newPrologueState(seed = 0x5c4a7b): PrologueState {
  return {
    phase: 'intro', t: 0, phaseT: 0, seed: seed >>> 0 || 1, nextCannon: 1.2, nextDebris: 2.4, nextStrike: 0.8, hazardSeq: 0,
    pending: Array.from({ length: 12 }, () => ({ id: 0, kind: 'cannon' as const, lx: 0, lz: 0, r: 0, at: 0, dmg: 0, knock: 0, live: false })),
    shocks: 0, lastShock: -1, lines: 0, admirals: 0, hint: false, reached: false, auto: false, marks: 0, heartbeats: 0, hits: 0,
  };
}

/** Zufall 0 … 1 aus dem Zustand */
function rnd(st: PrologueState): number {
  st.seed = (Math.imul(st.seed, 1664525) + 1013904223) >>> 0;
  return st.seed / 4294967296;
}

/** Dauer einer Phase (s); Deck und Fertig sind offen */
export function phaseDuration(p: ProloguePhase): number {
  switch (p) {
    case 'intro': return PROLOGUE.intro;
    case 'assemble': return PROLOGUE.assemble;
    case 'charge': return PROLOGUE.charge;
    case 'impact': return PROLOGUE.impact;
    case 'overboard': return PROLOGUE.overboard;
    case 'blackout': return PROLOGUE.blackout;
    default: return Number.POSITIVE_INFINITY;
  }
}

const NEXT: Readonly<Record<ProloguePhase, ProloguePhase>> = {
  intro: 'deck', deck: 'assemble', assemble: 'charge', charge: 'impact', impact: 'overboard', overboard: 'blackout', blackout: 'done', done: 'done',
};

function setPhase(st: PrologueState, p: ProloguePhase, out: PrologueOut) {
  st.phase = p;
  st.phaseT = 0;
  st.marks = 0;
  out.push('phase').text = p;
  if (p === 'done') out.push('done');
}

/** Einmal-Auslöser: Merker `bit` setzen, wenn die Phasenzeit `at` überschritten ist */
function once(st: PrologueState, bit: number, at: number): boolean {
  if ((st.marks & (1 << bit)) || st.phaseT < at) return false;
  st.marks |= 1 << bit;
  return true;
}

/** Ist das Achterdeck erreicht? (nah genug am Steuerrad, längs gemessen) */
export const reachedGoal = (g: PrologueGeo): boolean => g.reached ?? g.lz <= g.goalLz + PROLOGUE.goalReach;

/**
 * Einen Schritt rechnen (`dt` in s, Spielzeit). Ereignisse landen in `out` (vorher geleert). Gefahren erscheinen VOR der Figur (Richtung
 * Achterdeck) und seitlich verstreut, damit man ihnen ausweichen muss; zünden nach ihrer Warnzeit. Liefert die Zahl der Ereignisse.
 */
export function stepPrologue(st: PrologueState, dt: number, g: PrologueGeo, out: PrologueOut): number {
  out.n = 0;
  if (st.phase === 'done') return 0;
  if (st.t === 0 && st.phaseT === 0 && st.marks === 0) { out.push('phase').text = st.phase; }
  st.t += dt;
  st.phaseT += dt;
  switch (st.phase) {
    case 'intro':
      if (once(st, 0, 0.3)) out.push('line').text = 'title';
      if (once(st, 1, 2.4)) out.push('line').text = 'call';
      break;
    case 'deck': stepDeck(st, g, out); break;
    case 'assemble':
      if (once(st, 0, 0)) out.push('line').text = 'admirals';
      // die Admirale erscheinen nacheinander (Banner, Aura-Säule auf ihrem Schiff)
      while (st.admirals < ADMIRALS.length && st.phaseT >= 0.35 + st.admirals * 0.45) { const e = out.push('admiral'); e.id = st.admirals++; }
      break;
    case 'charge':
      if (once(st, 0, 0)) { out.push('charge'); out.push('line').text = 'charge'; }
      if (once(st, 1, 1.7)) out.push('line').text = 'defiance';
      break;
    case 'impact':
      if (once(st, 0, 0)) out.push('judgment');
      if (once(st, 1, 0.9)) { out.push('fall'); out.push('line').text = 'fall'; }
      break;
    case 'overboard':
      if (once(st, 0, 0.2)) out.push('thrown');
      break;
    case 'blackout':
      if (once(st, 0, 0.8)) out.push('line').text = 'dark';
      for (let i = 0; i < 3; i++) if (once(st, 1 + i, 0.5 + i * 0.9)) { const e = out.push('heartbeat'); e.id = ++st.heartbeats; }
      break;
    default: break;
  }
  // Phase zu Ende?
  if (st.phase !== 'deck' && st.phaseT >= phaseDuration(st.phase)) setPhase(st, NEXT[st.phase], out);
  return out.n;
}

function stepDeck(st: PrologueState, g: PrologueGeo, out: PrologueOut) {
  const t = st.phaseT;
  // Zeilen
  while (st.lines < DECK_LINES.length && t >= DECK_LINES[st.lines].at) out.push('line').text = DECK_LINES[st.lines++].id;
  // Ziel erreicht: am Achterdeck stehen bleiben und zusehen (keine neuen Gefahren mehr)
  if (!st.reached && reachedGoal(g)) { st.reached = true; out.push('line').text = 'arrive'; clearPending(st); }
  // Schwarzbarts Schockwellen zerschmettern Marine-Schiffe – nach Zeitplan; wer früh am Achterdeck ist, sieht die übrigen kurz hintereinander
  const allShocks = PROLOGUE.shocks.length;
  if (st.shocks < allShocks) {
    const due = st.reached ? Math.min(PROLOGUE.shocks[st.shocks], st.lastShock < 0 ? t : st.lastShock + PROLOGUE.shockGap) : PROLOGUE.shocks[st.shocks];
    if (t >= due) {
      const e = out.push('shock'); e.id = st.shocks;
      out.push('line').text = `shock${++st.shocks}`;
      st.lastShock = t;
    }
  }
  // Blitze neben dem Schiff
  if (t >= st.nextStrike) {
    st.nextStrike = t + PROLOGUE.strikeEvery * (0.6 + rnd(st) * 0.8);
    const e = out.push('strike');
    const side = rnd(st) < 0.5 ? -1 : 1;
    e.lx = side * (g.halfW + 10 + rnd(st) * 40);
    e.lz = g.goalLz + (g.startLz - g.goalLz) * rnd(st) + (rnd(st) - 0.5) * 30;
  }
  // Gefahren vor der Figur: Kanoneneinschläge und brennende Trümmer (nur unterwegs)
  if (!st.reached && t >= st.nextCannon) {
    st.nextCannon = t + PROLOGUE.cannon.every + (rnd(st) - 0.5) * 2 * PROLOGUE.cannon.jitter;
    spawnHazard(st, 'cannon', g, out);
  }
  if (!st.reached && t >= st.nextDebris) {
    st.nextDebris = t + PROLOGUE.debris.every + (rnd(st) - 0.5) * 2 * PROLOGUE.debris.jitter;
    spawnHazard(st, 'debris', g, out);
  }
  for (const p of st.pending) {
    if (!p.live || t < p.at) continue;
    p.live = false;
    const e = out.push('detonate');
    e.id = p.id; e.kind = p.kind; e.lx = p.lx; e.lz = p.lz; e.r = p.r; e.dmg = p.dmg; e.knock = p.knock;
    // trifft die Figur? (die Welt setzt den Treffer um; hier nur gezählt)
    if (Math.hypot(g.lx - p.lx, g.lz - p.lz) <= p.r) st.hits++;
  }
  // Ziel erreicht oder Zeit abgelaufen
  if (!st.hint && t >= PROLOGUE.hintAfter && !reachedGoal(g)) { st.hint = true; out.push('line').text = 'hint'; }
  // weiter zum Finale, sobald alle Schockwellen gefallen sind und die letzte kurz nachwirken durfte
  if (st.reached && st.shocks >= allShocks && t >= st.lastShock + PROLOGUE.shockGap) { setPhase(st, 'assemble', out); return; }
  if (t >= PROLOGUE.autoAfter) { st.auto = true; clearPending(st); setPhase(st, 'assemble', out); }
}

function clearPending(st: PrologueState) { for (const p of st.pending) p.live = false; }

function spawnHazard(st: PrologueState, kind: 'cannon' | 'debris', g: PrologueGeo, out: PrologueOut) {
  const slot = st.pending.find((p) => !p.live);
  if (!slot) return;
  const c = kind === 'cannon' ? PROLOGUE.cannon : PROLOGUE.debris;
  const [a0, a1] = PROLOGUE.ahead;
  // vor der Figur in Laufrichtung (zum Achterdeck = kleineres lz); Trümmer näher an ihr
  const ahead = kind === 'cannon' ? a0 + (a1 - a0) * rnd(st) : 1 + 4 * rnd(st);
  const lz = Math.max(g.goalLz + 1.5, Math.min(g.startLz + 2, g.lz - ahead));
  const lx = (rnd(st) * 2 - 1) * PROLOGUE.side * g.halfW;
  slot.live = true; slot.id = ++st.hazardSeq; slot.kind = kind; slot.lx = lx; slot.lz = lz; slot.r = c.radius; slot.at = st.phaseT + c.warn; slot.dmg = c.dmg; slot.knock = c.knock;
  const e = out.push('hazard');
  e.id = slot.id; e.kind = kind; e.lx = lx; e.lz = lz; e.r = c.radius; e.warn = c.warn; e.dmg = c.dmg; e.knock = c.knock;
}

/** Spielbar? (nur auf dem Deck steuert man die Figur selbst) */
export const prologuePlayable = (st: PrologueState): boolean => st.phase === 'deck';

/** Kinobalken und HUD-Ausblendung (0 … 1): außer auf dem Deck immer im Kino-Format */
export function prologueBars(st: PrologueState): number {
  if (st.phase === 'deck') return st.phaseT < 0.5 ? 1 - st.phaseT / 0.5 : 0;
  if (st.phase === 'done') return 0;
  return 1;
}

/**
 * Spannung der Musik (0 … 1), −1 = Musik aus (Schwarzblende: nur Herzschlag). Zieht mit dem Geschehen an: Einstieg mittel, Deck steigend,
 * Admirale und Urteil voll, nach dem Einschlag leiser, über Bord fast still.
 */
export function prologueIntensity(st: PrologueState): number {
  switch (st.phase) {
    case 'intro': return 0.45 + 0.15 * Math.min(1, st.phaseT / PROLOGUE.intro);
    case 'deck': return Math.min(0.88, 0.6 + st.phaseT / 60);
    case 'assemble': return 0.9;
    case 'charge': return 1;
    case 'impact': return st.phaseT < 1.2 ? 1 : 0.55;
    case 'overboard': return 0.25;
    default: return -1;
  }
}

/** Prolog überspringen (Schnelltests): sofort fertig */
export function skipPrologue(st: PrologueState, out: PrologueOut) {
  if (st.phase === 'done') return;
  clearPending(st);
  setPhase(st, 'done', out);
}
