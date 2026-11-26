// Phase 4.6J – MMO-Ziel-Erfassung: reine Daten und Regeln (kein three.js, kein DOM, keine Speicheranforderung je Bild).
//
// Getrennt vom Rendering, damit Phase 4.7 (Prolog & Kampagne der fünf Mächte) und 4.8 (Gruppen, Würfel-Beute, Chat) direkt darauf aufbauen:
// - **Ziel-Kennungen:** jedes Ziel ist eine `EntityId` (Figuren, Schiffe, Trupps, Offiziere, Hafen-Bewohner) plus Art und Bereich – der Zustand
//   `TargetLockState` ist JSON und kann so später über das Netz gehen (Gruppen-Ziel, „Ziel des Ziels“).
// - **Freund/Feind-Regeln:** `relationOf` entscheidet aus reinen Merkmalen (eigen, Begleiter, Marine-Dienst, Bündnis, provoziert, Ansehen) –
//   nie aus Szenen-Objekten. `RELATION_RING` gibt die Farbe des Zielrings (Rot Feind, Gelb neutral, Grün verbündet, Blau Bewohner).
// - **Treffer-Prüfung:** `canHarm`/`validatePlayerHit` sind die eine Stelle, die sagt, ob ein Angriff Schaden machen darf (kein Eigenbeschuss).
//   Spielfigur, Breitseiten und Ultimates fragen sie; ein Server kann dieselbe Funktion später für Treffer anderer Spieler nutzen.
// - **Auswahl:** `cycleTarget` (Tab / Umschalt+Tab / rechter Stick / Ziel-Knopf) und `pickTarget` (Mausklick / Antippen) arbeiten auf einer
//   vorab angelegten Liste von `TargetCandidate`s, die die Welt füllt (world/targetLockLive.ts).
// - **Ziel-Fenster:** `frameView` baut aus einem Kandidaten die Anzeige (Name, „Stufe X“, Macht mit Wappenfarbe, Kategorie, Leben, Haltung).
// - **Zielhilfe:** `aimYaw` und `broadsideSide` richten Kampfkünste, Offiziers-Assists und Breitseiten auf das Ziel aus, wenn es in Reichweite ist.

/** Was ein Ziel ist (bestimmt Ring-Größe, Kategorie und welche Zielhilfe greift) */
export type TargetKind = 'fighter' | 'elite' | 'boss' | 'ship' | 'officer' | 'troop' | 'npc';
/** Beziehung zur Spielfigur */
export type TargetRelation = 'hostile' | 'neutral' | 'friendly';
/** Bereich: an Land (Figuren, Trupps) oder auf See (Schiffe) */
export type TargetDomain = 'land' | 'sea';

export const TARGET_KINDS: readonly TargetKind[] = ['fighter', 'elite', 'boss', 'ship', 'officer', 'troop', 'npc'];

/** Farbe des Zielrings je Beziehung; Bewohner und Händler (neutral, aber friedlich) bekommen Blau */
export const RELATION_RING = { hostile: '#E5483A', neutral: '#EAC54C', friendly: '#4FD58C', npc: '#5BA9F2' } as const;
export type RingTone = keyof typeof RELATION_RING;
/** Wörter für die Anzeige */
export const RELATION_LABEL: Readonly<Record<TargetRelation, string>> = { hostile: 'Feind', neutral: 'Neutral', friendly: 'Verbündet' };

/** Zahlen der Ziel-Erfassung */
export const TARGET = {
  /** Reichweite des Durchschaltens (m) und bis wohin ein Ziel erfasst bleibt */
  cycleLand: 42, keepLand: 60,
  cycleSea: 460, keepSea: 650,
  /** halber Öffnungswinkel des „Sichtfelds“ beim Durchschalten (rad): an Land ±60°, auf See ±100° (Schiffe querab sind Breitseiten-Ziele) */
  viewHalf: 1.05, viewHalfSea: 1.75,
  /** Anklicken: Zielkreis auf dem Bildschirm mindestens so groß (px) plus Toleranz */
  pickMinPx: 18, pickSlopPx: 12,
  /** Zielhilfe der Kampfkünste an Land (m); Breitseiten nehmen ihre Schussweite × `broadsideReach` */
  artAim: 24,
  broadsideReach: 1.12,
  /** Breitseiten: das Ziel darf so weit (rad) von der Querachse abweichen und wird noch angerichtet (Fächer ±0,62) */
  broadsideCone: 0.95,
  /** Ring: Radius je Art (× Maßstab), Höhe über Boden bzw. Wasserlinie */
  ringLand: 0.85, ringShip: 0.62, ringLift: 0.07, ringSeaLift: 0.55,
} as const;

/** Ein mögliches Ziel – vorab angelegt (Pool) und je Abfrage überschrieben; `ref` zeigt auf das lebende Objekt der Welt (nie speichern) */
export interface TargetCandidate {
  id: string;
  kind: TargetKind;
  relation: TargetRelation;
  domain: TargetDomain;
  /** Bewohner (Ring blau) */
  npc: boolean;
  x: number; y: number; z: number;
  /** Ausdehnung (m): Kreis am Boden bzw. halbe Schiffslänge, Höhe für den Bildschirm-Kreis */
  radius: number; height: number;
  name: string;
  /** Stufe (0 = keine Angabe) */
  level: number;
  /** Macht (FactionId) oder '' (eigene Mannschaft, freie Stadt) */
  power: string;
  /** Anzeige der Macht und Wappenfarbe */
  nation: string; crest: string;
  /** Kategorie: Schiffsklasse/Stufe auf See, Kämpfertyp/Rolle/Titel an Land */
  category: string;
  hp: number; maxHp: number;
  /** Haltung 0 … 1 (−1 = keine Leiste: nur Elite und Bosse haben eine) und gebrochen */
  posture: number; broken: boolean;
  alive: boolean;
  /** Durchschalt-Vorrang (größer = früher), z. B. Bosse vor Fußvolk */
  prio: number;
  ref: unknown;
}

export function makeCandidate(): TargetCandidate {
  return {
    id: '', kind: 'fighter', relation: 'hostile', domain: 'land', npc: false, x: 0, y: 0, z: 0, radius: 0.5, height: 1.8, name: '', level: 0, power: '', nation: '', crest: '#8A8A8A',
    category: '', hp: 0, maxHp: 0, posture: -1, broken: false, alive: true, prio: 0, ref: null,
  };
}

/** Vorab angelegter Kandidaten-Pool (Welt füllt ihn, `n` = belegte Plätze) */
export class TargetPool {
  readonly items: TargetCandidate[];
  n = 0;
  constructor(size = 128) { this.items = Array.from({ length: size }, makeCandidate); }
  /** Nächsten freien Platz holen (null, wenn voll) – überschreibt die Felder nicht, das tut der Aufrufer */
  next(): TargetCandidate | null { return this.n < this.items.length ? this.items[this.n++] : null; }
  clear() { this.n = 0; for (let i = 0; i < this.items.length; i++) this.items[i].ref = null; }
  find(id: string): TargetCandidate | null {
    if (!id) return null;
    for (let i = 0; i < this.n; i++) if (this.items[i].id === id) return this.items[i];
    return null;
  }
}

/** Zustand der Erfassung (JSON; je Spieler, später über das Netz) */
export interface TargetLockState {
  id: string;
  kind: TargetKind | '';
  domain: TargetDomain | '';
  /** Beziehung beim Erfassen (Ring und Zielhilfe) */
  relation: TargetRelation | '';
  /** Wie erfasst: Durchschalten, Anklicken, feste Erfassung (Lock-on) */
  via: 'tab' | 'click' | 'lock' | '';
  /** Spielzeit der Erfassung (s) */
  since: number;
}

export function newTargetState(): TargetLockState {
  return { id: '', kind: '', domain: '', relation: '', via: '', since: 0 };
}

export function setTarget(st: TargetLockState, c: TargetCandidate | null, via: TargetLockState['via'], t: number): TargetLockState {
  if (!c) { st.id = ''; st.kind = ''; st.domain = ''; st.relation = ''; st.via = ''; st.since = t; return st; }
  st.id = c.id; st.kind = c.kind; st.domain = c.domain; st.relation = c.relation; st.via = via; st.since = t;
  return st;
}

/** Saubere Kopie aus einem Spielstand oder vom Netz (fremde Werte werden verworfen) */
export function cleanTargetState(raw: unknown): TargetLockState {
  const s = newTargetState();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  if (typeof r.id === 'string' && r.id.length <= 64) s.id = r.id;
  if (typeof r.kind === 'string' && (TARGET_KINDS as readonly string[]).includes(r.kind)) s.kind = r.kind as TargetKind;
  if (r.domain === 'land' || r.domain === 'sea') s.domain = r.domain;
  if (r.relation === 'hostile' || r.relation === 'neutral' || r.relation === 'friendly') s.relation = r.relation;
  if (r.via === 'tab' || r.via === 'click' || r.via === 'lock') s.via = r.via;
  if (typeof r.since === 'number' && Number.isFinite(r.since)) s.since = r.since;
  if (!s.id) return newTargetState();
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Freund und Feind
// ---------------------------------------------------------------------------------------------------------------

/** Merkmale eines Ziels, aus denen die Beziehung folgt (alles reine Daten) */
export interface RelationSubject {
  /** gehört dem Spieler (Offiziere, eigene Trupps, Begleit- und Flottenschiffe, eroberte Schiffe) */
  own?: boolean;
  /** kämpft an der Seite des Spielers (Marine-Helfer im Dienst, verbündete Belagerungstrupps) */
  ally?: boolean;
  /** greift an bzw. ist als Gegner erschaffen (Gegnerlager, Raid-Wachen, Kopfgeldjäger, feindliche Horde) */
  hostile?: boolean;
  /** der Spieler hat zuerst geschossen */
  provoked?: boolean;
  /** Macht (FactionId) */
  power?: string;
  /** Bewohner, Händler, Ereignis-Schiff ohne Feindschaft */
  civilian?: boolean;
}

/** Was die Welt über den Spieler weiß (Ansehen und Bündnisse; alles Zahlen und Kennungen) */
export interface RelationContext {
  /** Ansehen bei einer Macht (−100 … 100) */
  standing(power: string): number;
  /** Mächte, mit denen der Spieler verbündet ist (Marine-Dienst, Kriegsauftrag, Belagerungs-Seite) */
  readonly allies: ReadonlySet<string>;
  /** ab diesem Ansehen fährt eine Macht friedlich (REP.peaceAt) und ab diesem kämpft sie an der Seite des Spielers (REP.serviceAt) */
  readonly peaceAt: number;
  readonly allyAt: number;
}

/**
 * Beziehung eines Ziels zum Spieler. Reihenfolge: eigen/verbündet → provoziert/feindlich erschaffen → Bündnis der Macht → Bewohner →
 * Ansehen (friedlich ab `peaceAt`, verbündet ab `allyAt`) → Feind.
 */
export function relationOf(s: RelationSubject, ctx: RelationContext | null): TargetRelation {
  if (s.own || s.ally) return 'friendly';
  if (s.provoked || s.hostile) return 'hostile';
  if (s.power && ctx?.allies.has(s.power)) return 'friendly';
  if (s.civilian) return 'neutral';
  if (s.power && ctx) {
    const st = ctx.standing(s.power);
    if (st >= ctx.allyAt) return 'friendly';
    if (st >= ctx.peaceAt) return 'neutral';
  }
  return 'hostile';
}

/** Ringfarbe: Bewohner blau, sonst nach Beziehung */
export const ringTone = (c: Pick<TargetCandidate, 'relation' | 'npc'>): RingTone => (c.npc ? 'npc' : c.relation);

/**
 * Darf ein Angriff von `attacker` (Beziehung zum Spieler: der Spieler selbst und seine Leute sind 'friendly') Schaden an `target` machen?
 * Gleiche Seite nie (kein Eigenbeschuss); Neutrale untereinander schon (KI-Seeschlachten zweier fremder Mächte).
 */
export function canHarm(attacker: TargetRelation, target: TargetRelation): boolean {
  return !(attacker === target && attacker !== 'neutral');
}

/**
 * Treffer der Spielfigur bzw. ihrer Kanonen prüfen (Server-tauglich): '' = gültig, sonst ein deutscher Grund. `dist`/`maxRange` in Metern
 * (Infinity = ohne Reichweitenprüfung).
 */
export function validatePlayerHit(target: { relation: TargetRelation; alive: boolean }, dist = 0, maxRange = Infinity): string {
  if (!target.alive) return 'Ziel ist schon besiegt';
  if (!canHarm('friendly', target.relation)) return 'Kein Beschuss auf Verbündete';
  if (dist > maxRange) return 'Ziel außer Reichweite';
  return '';
}

// ---------------------------------------------------------------------------------------------------------------
// Auswahl: Durchschalten und Anklicken
// ---------------------------------------------------------------------------------------------------------------

/** Blick der Kamera für das Durchschalten: Ort (Spielfigur bzw. Schiff), Blickrichtung (Bogenmaß wie heading) */
export interface CycleView { x: number; z: number; yaw: number; range: number; /** halber Sichtwinkel (rad), Standard `TARGET.viewHalf` */ half?: number }

const _order: number[] = [];
const _score: number[] = [];

const wrap = (a: number) => {
  let v = (a + Math.PI) % (Math.PI * 2);
  if (v < 0) v += Math.PI * 2;
  return v - Math.PI;
};

/**
 * Nächstes Ziel beim Durchschalten. Relevant sind lebende Ziele in Reichweite; liegen Feinde im Sichtfeld, schaltet Tab nur durch Feinde
 * (Kampf), sonst durch alles Sichtbare (Hafen: Bewohner, Offiziere, Schiffe). Reihenfolge: Vorrang (Boss vor Elite vor Fußvolk), dann Nähe
 * zur Bildmitte und Abstand. `dir` = +1 vorwärts, −1 rückwärts. Liefert den Index im Pool oder −1. Ist das aktuelle Ziel das einzige, kommt −1
 * (die Erfassung löst sich – wie beim alten Lock-on mit einem Gegner).
 */
export function cycleTarget(pool: TargetPool, currentId: string, dir: 1 | -1, view: CycleView): number {
  _order.length = 0;
  _score.length = 0;
  let anyHostile = false;
  for (let i = 0; i < pool.n; i++) {
    const c = pool.items[i];
    if (!c.alive) continue;
    const dx = c.x - view.x, dz = c.z - view.z, d = Math.hypot(dx, dz);
    if (d > view.range + c.radius) continue;
    const ang = d > 1e-3 ? Math.abs(wrap(Math.atan2(dx, dz) - view.yaw)) : 0;
    if (ang > (view.half ?? TARGET.viewHalf) && d > c.radius + 3) continue;
    if (c.relation === 'hostile') anyHostile = true;
  }
  for (let i = 0; i < pool.n; i++) {
    const c = pool.items[i];
    if (!c.alive) continue;
    if (anyHostile && c.relation !== 'hostile') continue;
    const dx = c.x - view.x, dz = c.z - view.z, d = Math.hypot(dx, dz);
    if (d > view.range + c.radius) continue;
    const ang = d > 1e-3 ? Math.abs(wrap(Math.atan2(dx, dz) - view.yaw)) : 0;
    if (ang > (view.half ?? TARGET.viewHalf) && d > c.radius + 3) continue;
    // kleinere Zahl = früher: Abstand relativ zur Reichweite, Winkel zur Bildmitte, Vorrang
    const s = (d / Math.max(1, view.range)) * 1.6 + ang * 0.9 - c.prio * 0.35;
    // Einfügen sortiert (Listen sind klein, keine Speicheranforderung über die wiederverwendeten Felder hinaus)
    let k = _order.length;
    _order.push(i); _score.push(s);
    while (k > 0 && _score[k - 1] > s) { _order[k] = _order[k - 1]; _score[k] = _score[k - 1]; k--; }
    _order[k] = i; _score[k] = s;
  }
  const n = _order.length;
  if (!n) return -1;
  let at = -1;
  for (let k = 0; k < n; k++) if (pool.items[_order[k]].id === currentId) { at = k; break; }
  if (at < 0) return dir > 0 ? _order[0] : _order[n - 1];
  if (n === 1) return -1;
  return _order[(at + dir + n) % n];
}

/**
 * Anklicken / Antippen: `sx`/`sy` je Kandidat = Bildschirm-Mitte (px), `sr` = Bildschirm-Radius (px), `sd` = Tiefe (m, ≤ 0 = hinter der Kamera).
 * Liefert den Index des getroffenen Ziels (bei Überlappung das vorderste) oder −1.
 */
export function pickTarget(pool: TargetPool, sx: ArrayLike<number>, sy: ArrayLike<number>, sr: ArrayLike<number>, sd: ArrayLike<number>, px: number, py: number): number {
  let best = -1, bd = Infinity;
  for (let i = 0; i < pool.n; i++) {
    if (!pool.items[i].alive || !(sd[i] > 0)) continue;
    const r = Math.max(TARGET.pickMinPx, sr[i]) + TARGET.pickSlopPx;
    const d = Math.hypot(sx[i] - px, sy[i] - py);
    if (d > r) continue;
    // vorderstes Ziel gewinnt; bei gleicher Tiefe das, dessen Mitte näher am Klick liegt
    const key = sd[i] + (d / r) * 2;
    if (key < bd) { bd = key; best = i; }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// Zielhilfe
// ---------------------------------------------------------------------------------------------------------------

/** Richtung (Bogenmaß wie yaw) von (x, z) zum Ziel, wenn es in Reichweite liegt; sonst NaN */
export function aimYaw(x: number, z: number, c: Pick<TargetCandidate, 'x' | 'z' | 'radius' | 'alive'>, range: number): number {
  if (!c.alive) return Number.NaN;
  const dx = c.x - x, dz = c.z - z;
  if (Math.hypot(dx, dz) > range + c.radius) return Number.NaN;
  return Math.atan2(dx, dz);
}

/**
 * Auf welcher Seite (+1 Backbord / −1 Steuerbord, wie `NavalSystem.broadside`) liegt das Ziel quer zum Schiff, und liegt es in
 * Reichweite und im erweiterten Fächer? 0 = keine Seite passt.
 */
export function broadsideSide(heading: number, sx: number, sz: number, tx: number, tz: number, range: number): 1 | -1 | 0 {
  const dx = tx - sx, dz = tz - sz, d = Math.hypot(dx, dz);
  if (d < 6 || d > range * TARGET.broadsideReach) return 0;
  const a = Math.atan2(dx, dz);
  for (const side of [1, -1] as const) {
    const dir = heading + side * Math.PI / 2;
    if (Math.abs(wrap(a - dir)) <= TARGET.broadsideCone) return side;
  }
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Ziel-Fenster
// ---------------------------------------------------------------------------------------------------------------

/** Anzeige-Daten des Ziel-Fensters (wiederverwendetes Objekt) */
export interface TargetFrameView {
  visible: boolean;
  id: string;
  name: string;
  /** „Stufe 12“ oder '' */
  levelText: string;
  nation: string;
  crest: string;
  category: string;
  relation: TargetRelation;
  relationText: string;
  tone: RingTone;
  hpFrac: number;
  /** „1 234 / 5 000“ oder '' (Bewohner ohne Leben) */
  hpText: string;
  /** −1 = keine Haltungsleiste */
  posture: number;
  broken: boolean;
  kind: TargetKind;
  /** zuletzt formatierte Werte (Text nur bei Änderung neu bauen: keine Zeichenkette je Bild) */
  hpRaw: number;
  maxRaw: number;
}

export function newFrameView(): TargetFrameView {
  return { visible: false, id: '', name: '', levelText: '', nation: '', crest: '#8A8A8A', category: '', relation: 'neutral', relationText: '', tone: 'neutral', hpFrac: 1, hpText: '', posture: -1, broken: false, kind: 'fighter', hpRaw: Number.NaN, maxRaw: Number.NaN };
}

const fmt = (n: number) => Math.round(n).toLocaleString('de-DE');

/** Ziel-Fenster aus einem Kandidaten füllen (Texte nur, wenn sich das Ziel geändert hat; Zahlen jedes Bild) */
export function frameView(c: TargetCandidate | null, out: TargetFrameView): TargetFrameView {
  if (!c || !c.alive) { out.visible = false; out.id = ''; return out; }
  if (out.id !== c.id || !out.visible) {
    out.id = c.id;
    out.name = c.name || 'Unbekannt';
    out.levelText = c.level > 0 ? `Stufe ${Math.round(c.level)}` : '';
    out.nation = c.nation;
    out.crest = c.crest;
    out.category = c.category;
    out.relation = c.relation;
    out.relationText = c.npc ? 'Bewohner' : RELATION_LABEL[c.relation];
    out.tone = ringTone(c);
    out.kind = c.kind;
    out.hpRaw = Number.NaN;
  }
  out.visible = true;
  out.hpFrac = c.maxHp > 0 ? Math.max(0, Math.min(1, c.hp / c.maxHp)) : 1;
  const hpR = Math.round(Math.max(0, c.hp)), maxR = Math.round(c.maxHp);
  if (hpR !== out.hpRaw || maxR !== out.maxRaw) {
    out.hpRaw = hpR; out.maxRaw = maxR;
    out.hpText = maxR > 0 ? `${fmt(hpR)} / ${fmt(maxR)}` : '';
  }
  out.posture = c.kind === 'elite' || c.kind === 'boss' ? Math.max(0, Math.min(1, c.posture)) : -1;
  out.broken = out.posture >= 0 && c.broken;
  return out;
}
