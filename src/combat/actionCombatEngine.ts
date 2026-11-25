// Phase 4.6A – die zentrale Action-Kampf-Engine: „Maximale 3D-Bewegungsfreiheit ohne Einengung, Sofort-Spaß für Casual-Spieler und echte
// Kombo-Tiefe für Meister“.
//
// Reine Simulation ohne three.js, ohne Zufall und ohne Speicheranforderungen je Logikbild: Zustand (`FighterState`) ist JSON-taugliche Daten,
// die Engine (`ActionCombatEngine`) hält nur vorab angelegte Puffer (Zielliste, Trefferlisten je Fenster, Ereignisse). Dieselben Eingaben
// auf derselben Welt ergeben dasselbe Ergebnis – vorbereitet für die Server-Simulation (Phase 4.8). Die Welt (Boden, Hindernisse, Ziele,
// Schaden) kommt über `ActionWorld`; die Darstellung liest nur Zustand und Ereignisse.
//
// Grundsätze:
//  - Keine Arena-Wände: Kämpfe begrenzen nichts. Bewegung läuft über die Hindernisse der Welt (Häuser, Küste, Reling) und sonst frei –
//    über Inseln, Brücken, Decks, mit Doppelsprung, gerichteten Luft-Dashes und Sprüngen von Kanten in die Tiefe.
//  - Jeder Angriff lässt sich jederzeit per Dash oder Sprung abbrechen (Animation-Cancel). Eingaben bleiben 160 ms gepuffert.
//  - Weiches Ziel (Soft-Lock) mit Magnet-Schritt bis 3,5 m; Kameradrehung, Sprung und Dash lösen es sofort.
//  - Perfektes Ausweichen (≤ 180 ms vor dem Treffer) = Sturm-Schritt: Blitz-Nachbild, die Figur steht hinter dem Angreifer, Konterfenster.
import {
  ACTION_STYLES, ACTION_TUNING as T, ALL_MOVES, POSTURE, lastHitEnd, moveIndex,
  type ActionHit, type ActionMove, type ActionStyleDef, type ActionStyleId,
} from '../data/actionStyles';
import { wrapAngle } from '../core/mathUtil';
import { AURA, KING_WAVE, WILL, formPower, type AuraId } from '../data/fajiArts';

// ---------- Zustand ----------

export type FighterPhase = 'ground' | 'air' | 'move' | 'dash' | 'block' | 'cast' | 'hurt' | 'down';
export type MoveKind = 'light' | 'branch' | 'heavy' | 'air' | 'meteor' | 'finisher' | 'skill' | 'swap' | 'ultimate';

/** Zustand eines Kämpfers (Spielfigur, später entfernte Mitspieler): nur Zahlen, Zeichenketten und feste Listen */
export interface FighterState {
  entityId: string;
  style: ActionStyleId;
  readonly radius: number;
  x: number; y: number; z: number; yaw: number;
  /** waagrechtes Tempo (Schwung in der Luft), senkrechtes Tempo, Rückstoß */
  vx: number; vy: number; vz: number;
  kx: number; kz: number;
  grounded: boolean;
  /** Zeit seit dem Verlassen des Bodens (Kanten-Gnade für den ersten Sprung) */
  airT: number;
  /** genutzte Sprünge und Luft-Dashes in diesem Flug */
  jumps: number;
  airDashes: number;
  phase: FighterPhase;
  /** laufender Angriff: Index in `ALL_MOVES` (−1 = keiner), Kennung, Art, Zeit, laufende Nummer */
  moveIdx: number;
  moveId: string;
  moveKind: MoveKind;
  moveT: number;
  moveSeq: number;
  /** Schadensfaktor des laufenden Angriffs (Wechselschlag 1,6) */
  moveBonus: number;
  /** Leicht-Kette: Zahl der Schläge in der laufenden Kette; Luft-Kette; offenes Kettenfenster nach dem letzten Schlag */
  lightIdx: number;
  airIdx: number;
  comboWindow: number;
  /** Eingabepuffer: Zeitpunkt (Engine-Uhr) der letzten noch offenen Eingabe, −1 = keine */
  bufL: number; bufS: number; bufJ: number; bufD: number; bufK: number;
  bufSlot: number;
  clock: number;
  /** Dash: Restzeit, Dauer, Richtung, Tempo, Nummer, in der Luft */
  dashT: number; dashDur: number; dashX: number; dashZ: number; dashSpeed: number; dashSeq: number; dashAir: boolean;
  /** Unverwundbarkeit, Fenster des perfekten Ausweichens, Konterfenster (Krit), Konterhaltung (Mondspiegel) */
  iframes: number; perfectT: number; counterT: number; counterStance: number;
  hurtT: number; castT: number; blockSince: number;
  /** weiches Ziel ('' = keins) und Sperre nach einer Kameradrehung */
  lockId: string;
  lockFree: number;
  camYaw: number;
  /** Rest des Magnet-Schritts und des Vorstoßes im laufenden Angriff */
  magnetLeft: number;
  rushLeft: number;
  /** verlangsamter Fall nach einem Lufttreffer (Restzeit) */
  hover: number;
  /** Abklingzeiten der vier Techniken */
  skillCd: number[];
  /** Stärkungen: Hyper-Armor, Krit, Haltungsschaden, Tempo (Restzeit) */
  hyperT: number; critT: number; poiseT: number; speedT: number;
  /** Wechselschlag-Bonus für den nächsten Angriff */
  swapBonus: number;
  /** Trefferzähler („HIT!“), Restzeit bis er erlischt, bester Wert, Name des letzten Angriffs */
  hits: number; hitT: number; maxHits: number; lastLabel: string;
  stamina: number; staminaPause: number; staminaFlash: number;
  /** Tempo-Faktor von außen (Ausrüstung, Fesseln) */
  speedK: number;
  /** taumelndes Ziel in Reichweite des Haltungsbruch-Finishers ('' = keins) */
  finisherId: string;
  /** Treffer des laufenden Angriffs */
  moveHits: number;
  /** Willenskraft 0 … 100: füllt sich im Kampf (Treffer, Sturm-Schritt, Konter, Haltungsbruch); voll = Sturm-Erwachen bereit */
  will: number;
  /** Sturm-Erwachen: Restzeit (s); Ultimate in diesem Erwachen noch bereit; gepufferter Druck der Erwachen-Taste */
  awakenT: number;
  ultReady: boolean;
  bufU: number;
  /** Willenskraft-Aura (0 keine, 1 Sturmblick, 2 Eisenwille, 3 Königsdruck) und Takt des Königsdrucks */
  aura: AuraId;
  kingT: number;
  /** Formstufe der laufenden Faji-Kunst 1 … 7 (setzt das Spiel aus der Meisterschaft; Waffenstile 1) */
  form: number;
  /** Ultimate: Restzeit des Aufladens (Zwischensequenz, Spielzeit); Nummer des Angriffs mit gemeldetem Einschlag */
  cineT: number;
  strikeSeq: number;
  /** Energiewelle des Sturm-Erwachens: Nummer des Angriffs, der sie schon ausgelöst hat, und ihre Laufzeit (−1 = keine) */
  waveSeq: number;
  waveT: number;
  /** verzögerte Treffer (Iaijutsu): markierte Ziele, Anzahl, schon ausgelöst */
  marks: string[];
  markN: number;
  marksDone: boolean;
  /** Sturm-Verfolgung (4.6C): Restzeit des Fensters nach einem Hochschleudern (ein Dash teleportiert zum Ziel in der Luft) */
  chaseT: number;
  /** Klingen-Clash (4.6C): Nummer des Angriffs, der schon einen Clash hatte (höchstens einer je Angriff) */
  clashSeq: number;
}

export function createFighter(entityId: string, style: ActionStyleId, x = 0, y = 0, z = 0, yaw = 0): FighterState {
  return {
    entityId, style, radius: 0.35, x, y, z, yaw, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0, grounded: true, airT: 0, jumps: 0, airDashes: 0,
    phase: 'ground', moveIdx: -1, moveId: '', moveKind: 'light', moveT: 0, moveSeq: 0, moveBonus: 1, lightIdx: 0, airIdx: 0, comboWindow: 0,
    bufL: -1, bufS: -1, bufJ: -1, bufD: -1, bufK: -1, bufSlot: 0, clock: 0,
    dashT: 0, dashDur: 0, dashX: 0, dashZ: 1, dashSpeed: 0, dashSeq: 0, dashAir: false,
    iframes: 0, perfectT: 0, counterT: 0, counterStance: 0, hurtT: 0, castT: 0, blockSince: 99,
    lockId: '', lockFree: 0, camYaw: 0, magnetLeft: 0, rushLeft: 0, hover: 0, skillCd: [0, 0, 0, 0],
    hyperT: 0, critT: 0, poiseT: 0, speedT: 0, swapBonus: 1, hits: 0, hitT: 0, maxHits: 0, lastLabel: '',
    stamina: T.stamina, staminaPause: 0, staminaFlash: 0, speedK: 1, finisherId: '', moveHits: 0,
    will: 0, awakenT: 0, ultReady: false, bufU: -1, aura: 0, kingT: AURA.kingEvery, form: 1, cineT: 0, strikeSeq: -1, waveSeq: -1, waveT: -1,
    marks: new Array<string>(MAX_MARKS).fill(''), markN: 0, marksDone: false, chaseT: 0, clashSeq: -1,
  };
}

/** Beschleunigungskurve des Vorwärts-Momentums: schnell an, weich aus (Weg-Anteil 0 … 1) */
export const easeOutCubic = (u: number): number => { const k = u < 0 ? 0 : u > 1 ? 1 : u; const r = 1 - k; return 1 - r * r * r; };

// ---------- Eingabe, Ziele, Welt ----------

/** Eingabe eines Logikbilds (Weltrichtung schon aus der Kamera gerechnet) */
export interface ActionInput {
  /** gewünschte Laufrichtung (Einheitsvektor in der Ebene) und Auslenkung 0 … 1 */
  moveX: number; moveZ: number; mag: number;
  camYaw: number;
  /** Knöpfe, gerade gedrückt */
  light: boolean; heavy: boolean; jump: boolean; dash: boolean;
  /** Technik 1 … 4, gerade gedrückt (0 = keine) */
  skill: number;
  blockHeld: boolean; blockPressed: boolean;
  /** feste Zielerfassung des Spiels ('' / NaN = keine) */
  hardLockId: string;
  hardLockYaw: number;
  /** Erwachen-Taste (voll: Sturm-Erwachen; im Erwachen: Ultimate) und Aura wechseln, gerade gedrückt */
  awaken: boolean;
  aura: boolean;
}

export function makeInput(): ActionInput {
  return { moveX: 0, moveZ: 1, mag: 0, camYaw: 0, light: false, heavy: false, jump: false, dash: false, skill: 0, blockHeld: false, blockPressed: false, hardLockId: '', hardLockYaw: NaN, awaken: false, aura: false };
}

/** Ein Ziel in der Nähe (vom Spiel je Bild in vorab angelegte Plätze geschrieben) */
export interface ActionTarget {
  id: string;
  x: number; y: number; z: number;
  radius: number; height: number; yaw: number;
  alive: boolean;
  airborne: boolean;
  /** Verband (TroopSquad): ein Ziel für viele Köpfe */
  mass: boolean;
  /** Haltung gebrochen (taumelt): offen für den Finisher */
  broken: boolean;
  boss: boolean;
  /** Elite-Gegner mit Haltungsleiste (kein Boss); holt gerade zum Schlag aus oder schlägt zu (Klingen-Clash, 4.6C) */
  elite: boolean;
  attacking: boolean;
  /** Platz in der eigenen Liste des Spiels */
  ref: number;
}

export function makeTargetPool(n: number): ActionTarget[] {
  return Array.from({ length: n }, () => ({ id: '', x: 0, y: 0, z: 0, radius: 0.5, height: 1.8, yaw: 0, alive: false, airborne: false, mass: false, broken: false, boss: false, elite: false, attacking: false, ref: -1 }));
}

/** Was die Engine über einen Treffer mitgibt (ein vorab angelegtes Objekt, je Treffer neu gefüllt) */
export interface HitContext {
  dirX: number; dirZ: number;
  /** erzwungener Krit-Faktor (Konter nach Sturm-Schritt), 0 = normal würfeln; zusätzliche Krit-Chance (Stärkung „Sturmkrone“) */
  crit: number;
  critAdd: number;
  /** Faktor auf den Haltungsschaden (Stil, Stärkung) */
  postureK: number;
  /** Nummer des Fensters im Angriff, Art des Angriffs */
  tick: number;
  kind: MoveKind;
  finisher: boolean;
  airborne: boolean;
  /** Schadensfaktor (Wechselschlag) */
  bonus: number;
  style: ActionStyleDef;
  /** Ort der Figur (für Greifwürfe: Ziel vor die Figur ziehen) */
  fx: number; fz: number; fyaw: number;
  /** Faji-Form: Schaden der Form-Techniken; Durchschlag durch Eisenwille (Waffenstufen); Ultimate (Endboss-Deckel je Wirken `cast`); Sprung eines Kettenblitzes */
  formK: number;
  penAdd: number;
  ultimate: boolean;
  cast: number;
  chained: number;
  /** Klingen-Clash (4.6C): ein schwerer Schlag trifft den Schlag eines Bosses/Elite-Gegners – Funken, Haltungsschaden, sein Angriff bricht ab */
  clash: boolean;
}

/** Körper für die Bewegung durch die Welt */
export interface ActionBody { x: number; y: number; z: number; readonly radius: number }

export interface ActionWorld {
  /** Bodenhöhe an (x, z) mit Höhenhinweis y (Brücken, Decks übereinander); nicht endlich = kein Boden */
  height(x: number, z: number, y: number): number;
  /** waagrecht bewegen, Hindernisse auflösen; `impulse` = strenge Regeln (Wand beendet den Stoß), `id` = Nummer des Stoßes */
  move(b: ActionBody, dx: number, dz: number, impulse: boolean, id: number): void;
  /** Teleport-Ziel prüfen und setzen (Sturm-Schritt); false = dort nicht möglich */
  teleport(b: ActionBody, x: number, z: number): boolean;
  /** Ziele im Umkreis r: in `out` ab Platz 0 schreiben, Anzahl zurückgeben */
  targets(x: number, z: number, r: number, out: ActionTarget[]): number;
  /** Treffer anwenden (Schaden, Haltung, Rückstoß, Hochschleudern, Zustände …): 0 = geblockt/kein Treffer, 1 = Treffer, 2 = Treffer mit Haltungsbruch oder K.O. */
  hit(t: ActionTarget, h: ActionHit, m: ActionMove, ctx: HitContext): number;
  /** Sog (Schwarzes Loch, Strudel): Ziel um höchstens `step` m zum Punkt (cx, cz) ziehen */
  drag(t: ActionTarget, cx: number, cz: number, step: number): void;
  /** Geschoss(e) eines Fernangriffs */
  shoot(h: ActionHit, m: ActionMove, f: FighterState): void;
}

// ---------- Ereignisse ----------

export type ActionEventType =
  | 'move' | 'skill' | 'cutin' | 'cancel' | 'jump' | 'land' | 'fall' | 'dash' | 'perfect' | 'counter' | 'impact'
  | 'hitConfirm' | 'style' | 'lockLost' | 'staminaLow' | 'notReady' | 'buff' | 'parry' | 'blocked'
  | 'awaken' | 'awakenEnd' | 'aura' | 'ultimate' | 'ultStrike' | 'sheath' | 'chain' | 'kingWave' | 'awakenWave' | 'locked' | 'willFull'
  /** 4.6C: Sturm-Verfolgung (a = Platz des Ziels, b/c = alter Ort x/z), Klingen-Clash (a = Fenster, b = Ergebnis), Schwungfenster einer Technik/Verzweigung (a = Angriff, b = Fenster) */
  | 'chase' | 'clash' | 'swing';

export interface ActionEvent { type: ActionEventType; a: number; b: number; c: number; s: string }

/** Feste Warteschlange für Ereignisse eines Logikbilds (Darstellung, Klang, HUD) */
export class ActionEventQueue {
  readonly items: ActionEvent[] = Array.from({ length: 48 }, () => ({ type: 'move' as ActionEventType, a: 0, b: 0, c: 0, s: '' }));
  n = 0;
  push(type: ActionEventType, a = 0, b = 0, c = 0, s = '') {
    if (this.n >= this.items.length) return;
    const e = this.items[this.n++];
    e.type = type; e.a = a; e.b = b; e.c = c; e.s = s;
  }
  clear() { this.n = 0; }
  /** Gab es in diesem Bild ein Ereignis dieser Art? (Prüfungen) */
  has(type: ActionEventType): boolean { for (let i = 0; i < this.n; i++) if (this.items[i].type === type) return true; return false; }
}

/** Ergebnis eines gegnerischen Treffers auf den Kämpfer */
export type IncomingResult = 'perfect' | 'counter' | 'dodged' | 'armor' | 'parry' | 'block' | 'hit' | 'none';

/** Was über einen Angreifer bekannt ist (null = Fläche, Geschütz, Verband ohne Figur) */
export interface AttackerInfo { id: string; x: number; z: number; yaw: number; radius: number }

/** Gegenschlag der Konterhaltung (Mondspiegel) */
const RIPOSTE: ActionHit = {
  t0: 0, t1: 0.1, shape: 'arc', range: 3.6, arc: 6.3, width: 2, offset: 0, inner: 0, up: 2.6, down: 1, dmg: 2.4, poise: 45, knock: 8, launch: 0,
  juggle: 0, fling: 6, breakGuard: true, pull: false, pen: 2, maxTargets: 1, hitstop: 0.22, shake: 0.7, fx: 'slash', projectile: null,
  grow: false, status: '', statusDur: 0, chain: 0, chainRange: 6, vortex: 0, delayTo: 0, vfx: '',
};

/** Suchradius der Ziele je Logikbild (größte Reichweite der normalen Angriffe: Schockwellen bis 18 m); Ultimates erweitern ihn */
const QUERY_R = 20;
/** Plätze für markierte Ziele eines verzögerten Treffers; Platz der Trefferliste für die Erwachen-Welle */
const MAX_MARKS = 24;
const WAVE_TICK = 15;
/** Laufzeit der Erwachen-Welle (s) */
const WAVE_DUR = 0.18;
/** Reichweite je Angriff (für den Suchradius): größte Ausdehnung der Formen plus Vorstoß */
const MOVE_REACH: Float32Array = (() => {
  const r = new Float32Array(ALL_MOVES.length);
  ALL_MOVES.forEach((m, i) => {
    let mx = 0;
    for (const h of m.hits) mx = Math.max(mx, h.shape === 'line' ? Math.max(h.range, h.width * 0.5) : h.range + h.offset);
    r[i] = mx + m.dashTo + 2;
  });
  return r;
})();
/** höchstens so viele Trefferfenster je Angriff und Ziele je Fenster (Trefferlisten) */
const MAX_TICKS = 16;
const MAX_TICK_TARGETS = 96;
/** Meteor: so lange hängt die Figur vor dem Sturz */
const METEOR_HANG = 0.12;

const kindCode: Record<MoveKind, number> = { light: 0, branch: 1, heavy: 2, air: 3, meteor: 4, finisher: 5, skill: 6, swap: 7, ultimate: 8 };
export const KIND_OF_CODE: readonly MoveKind[] = ['light', 'branch', 'heavy', 'air', 'meteor', 'finisher', 'skill', 'swap', 'ultimate'];

const dec = (v: number, dt: number) => (v > 0 ? Math.max(0, v - dt) : v);

// ---------- Engine ----------

/**
 * Die Engine eines Kämpfers: Eingabe → Zustand. Ein Aufruf von `step` je festem Logikbild (60 Hz). Alles, was sie je Bild braucht, ist
 * vorab angelegt (Zielplätze, Trefferlisten, Ereignisse, Kontext) – kein `new`, keine Listen, keine Funktionsobjekte im Takt.
 */
export class ActionCombatEngine {
  readonly events = new ActionEventQueue();
  readonly pool: ActionTarget[];
  poolN = 0;
  private readonly memo: string[][];
  private readonly memoN = new Int32Array(MAX_TICKS);
  private readonly ctx: HitContext;

  constructor(readonly f: FighterState, poolSize = 160) {
    this.pool = makeTargetPool(poolSize);
    this.memo = Array.from({ length: MAX_TICKS }, () => new Array<string>(MAX_TICK_TARGETS).fill(''));
    this.ctx = { formK: 1, penAdd: 0, ultimate: false, cast: 0, chained: 0, clash: false, dirX: 0, dirZ: 1, crit: 0, critAdd: 0, postureK: 1, tick: 0, kind: 'light', finisher: false, airborne: false, bonus: 1, style: ACTION_STYLES[f.style], fx: 0, fz: 0, fyaw: 0 };
  }

  get style(): ActionStyleDef { return ACTION_STYLES[this.f.style]; }
  /** Im Sturm-Erwachen? */
  get awakened(): boolean { return this.f.awakenT > 0; }
  /** Steht das Ultimate jetzt bereit? (im Erwachen, noch nicht benutzt, Faji-Künste ab der 7. Form) */
  get ultAvailable(): boolean { const st = this.style; return this.f.awakenT > 0 && this.f.ultReady && !!st.ultimate && (!st.faji || this.f.form >= st.ultimate.formMin); }
  /** Willenskraft-Leiste 0 … 1 */
  get willFrac(): number { return Math.min(1, this.f.will / WILL.max); }
  /** Formstufe setzen (Faji-Kunst; Spiel aus der Meisterschaft) */
  setForm(n: number) { this.f.form = Math.max(1, Math.min(7, Math.round(n))); }
  /** Willenskraft gutschreiben (nicht im Erwachen); meldet einmal, wenn die Leiste voll wird */
  addWill(n: number) {
    const f = this.f;
    if (f.awakenT > 0 || !(n > 0) || f.will >= WILL.max) return;
    f.will = Math.min(WILL.max, f.will + n);
    if (f.will >= WILL.max) this.events.push('willFull');
  }
  /** laufender Angriff (null = keiner) */
  get move(): ActionMove | null { return this.f.moveIdx >= 0 ? ALL_MOVES[this.f.moveIdx] : null; }
  /** Hyper-Armor gerade aktiv? (Angriff mit Hyper-Armor oder Stärkung „Unbeugsam“) */
  get hyper(): boolean { const m = this.move; return this.f.hyperT > 0 || (!!m && m.hyper && this.f.phase === 'move'); }
  /** Abklingzeit einer Technik als Anteil 0 (bereit) … 1 */
  skillFrac(slot: number): number { const s = this.style.skills[slot - 1]; return s ? Math.min(1, this.f.skillCd[slot - 1] / s.cd) : 0; }

  // ---------- Steuerung von außen ----------

  /** Neu aufstellen (Landgang, Teleport): alles Laufende endet */
  place(x: number, y: number, z: number, yaw: number) {
    const f = this.f;
    f.x = x; f.y = y; f.z = z; f.yaw = yaw;
    f.vx = f.vy = f.vz = f.kx = f.kz = 0;
    f.grounded = true; f.airT = 0; f.jumps = 0; f.airDashes = 0; f.airIdx = 0; f.hover = 0;
    this.clearMove();
    f.phase = 'ground'; f.lightIdx = 0; f.comboWindow = 0; f.iframes = 0; f.perfectT = 0; f.counterT = 0; f.counterStance = 0;
    f.bufL = f.bufS = f.bufJ = f.bufD = f.bufK = -1; f.bufSlot = 0; f.lockId = ''; f.stamina = T.stamina; f.hits = 0; f.hitT = 0;
  }

  /** Skriptete Lage (Leiter, Reling): Eingaben ruhen, die Figur steht dort */
  drive(x: number, y: number, z: number, yaw: number) {
    const f = this.f;
    f.x = x; f.y = y; f.z = z; f.yaw = yaw;
    f.vx = f.vy = f.vz = 0;
    f.grounded = true; f.airT = 0;
    if (f.phase !== 'down') { this.clearMove(); f.phase = 'ground'; }
  }

  /** Treffer-Reaktion (Taumeln) mit Rückstoß */
  hurt(dur: number, kx: number, kz: number) {
    const f = this.f;
    if (f.phase === 'down') return;
    this.addWill(WILL.hurt);
    this.clearMove();
    f.phase = 'hurt';
    f.hurtT = dur;
    f.kx += kx; f.kz += kz;
  }

  /** Nur Rückstoß (Hyper-Armor, Block) */
  shove(kx: number, kz: number) { this.f.kx += kx; this.f.kz += kz; }

  down() { const f = this.f; this.clearMove(); f.phase = 'down'; f.lockId = ''; }
  revive() { const f = this.f; if (f.phase === 'down') { f.phase = f.grounded ? 'ground' : 'air'; } f.hurtT = 0; }

  /** Zauber/Technik der Faji-Fähigkeiten (Darstellung über eigenen Clip): `dur` Sekunden belegt, Dash bricht ab */
  beginCast(dur: number, yaw: number | null) {
    const f = this.f;
    this.clearMove();
    if (yaw !== null) f.yaw = yaw;
    f.phase = 'cast';
    f.castT = Math.max(0.1, dur);
  }

  /**
   * Stil wechseln (jederzeit). Mitten in einer Kette (Schlag läuft oder Kettenfenster offen): Wechselschlag – der nächste Schlag des neuen
   * Stils setzt sofort an, trifft 1,6-fach und führt die Kette fort. Rückgabe: 'swap' (Wechselschlag), 'instant' (Ruhe) oder null (unmöglich).
   */
  switchStyle(id: ActionStyleId, input: ActionInput | null = null): 'swap' | 'instant' | null {
    const f = this.f;
    if (id === f.style || f.phase === 'down' || f.phase === 'hurt') return null;
    const mid = (f.phase === 'move' && (f.moveKind === 'light' || f.moveKind === 'swap')) || (f.comboWindow > 0 && f.lightIdx > 0);
    f.style = id;
    this.ctx.style = ACTION_STYLES[id];
    f.airIdx = Math.min(f.airIdx, ACTION_STYLES[id].air.length);
    this.events.push('style', mid ? 1 : 0, 0, 0, id);
    if (!mid || !f.grounded) return 'instant';
    const st = ACTION_STYLES[id];
    const i = Math.min(f.lightIdx, st.light.length - 2);
    f.swapBonus = 1.6;
    this.startMove(st.light[Math.max(0, i)], 'swap', input);
    f.lightIdx = Math.max(0, i) + 1;
    return 'swap';
  }

  /**
   * Ein gegnerischer Treffer erreicht den Kämpfer: perfektes Ausweichen (Sturm-Schritt hinter den Angreifer), Konterhaltung, Ausweichen,
   * Hyper-Armor, Parade/Block oder Treffer. `dirX/dirZ` = Richtung, in die der Treffer stößt (vom Angreifer weg).
   */
  incoming(att: AttackerInfo | null, dirX: number, dirZ: number, w: ActionWorld): IncomingResult {
    const f = this.f;
    if (f.phase === 'down') return 'none';
    // Ultimate (Aufladen und Einschlag): unverwundbar
    if (f.cineT > 0 || (f.phase === 'move' && this.move?.ultimate)) return 'dodged';
    if (f.counterStance > 0) {
      f.counterStance = 0;
      if (att) this.behind(att, w);
      this.clearMove();
      f.phase = f.grounded ? 'ground' : 'air';
      f.counterT = T.counterWindow;
      f.iframes = Math.max(f.iframes, 0.5);
      // Gegenschlag auf den Angreifer (wenn er in Reichweite der Zielliste ist)
      if (att) {
        for (let i = 0; i < this.poolN; i++) {
          const t = this.pool[i];
          if (t.id !== att.id || !t.alive) continue;
          const c = this.fillCtx('skill', 0);
          const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz) || 1;
          c.dirX = dx / d; c.dirZ = dz / d; c.crit = T.counterCrit;
          const mv = this.move ?? this.style.light[0];
          if (w.hit(t, RIPOSTE, mv, c) > 0) { f.hits++; f.hitT = T.hitReset; }
          break;
        }
      }
      this.events.push('counter', att ? 1 : 0);
      this.addWill(WILL.counter);
      return 'counter';
    }
    if (f.perfectT > 0) {
      f.perfectT = 0;
      f.iframes = Math.max(f.iframes, 0.45);
      const ok = att ? this.behind(att, w) : false;
      f.counterT = T.counterWindow;
      this.events.push('perfect', ok ? 1 : 0, f.x, f.z);
      this.addWill(WILL.perfect);
      return 'perfect';
    }
    if (f.iframes > 0) return 'dodged';
    if (f.phase === 'block') {
      const facing = Math.sin(f.yaw) * -dirX + Math.cos(f.yaw) * -dirZ;
      if (facing > 0.2) {
        if (f.blockSince < T.parryWindow) { this.events.push('parry'); return 'parry'; }
        this.events.push('blocked');
        return 'block';
      }
    }
    if (this.hyper) return 'armor';
    return 'hit';
  }

  /** Sturm-Schritt: hinter den Rücken des Angreifers (sonst seitlich), Blick zu ihm */
  private behind(att: AttackerInfo, w: ActionWorld): boolean {
    const f = this.f;
    const d = att.radius + T.behindDist + f.radius;
    const s = Math.sin(att.yaw), c = Math.cos(att.yaw);
    let ok = w.teleport(f, att.x - s * d, att.z - c * d);
    if (!ok) ok = w.teleport(f, att.x + c * d, att.z - s * d);
    if (!ok) ok = w.teleport(f, att.x - c * d, att.z + s * d);
    if (ok) {
      f.yaw = Math.atan2(att.x - f.x, att.z - f.z);
      const h = w.height(f.x, f.z, f.y + 0.5);
      if (Number.isFinite(h) && Math.abs(h - f.y) < 2.5) { f.y = Math.max(h, f.grounded ? h : f.y); }
    }
    f.lockId = att.id;
    f.lockFree = 0;
    return ok;
  }

  // ---------- Logikbild ----------

  step(inp: ActionInput, w: ActionWorld, dt: number) {
    const f = this.f;
    const st = ACTION_STYLES[f.style];
    this.ctx.style = st;
    this.events.clear();
    f.clock += dt;
    // Zeiten
    f.iframes = dec(f.iframes, dt); f.perfectT = dec(f.perfectT, dt); f.counterT = dec(f.counterT, dt); f.counterStance = dec(f.counterStance, dt);
    f.hover = dec(f.hover, dt); f.chaseT = dec(f.chaseT, dt); f.comboWindow = dec(f.comboWindow, dt); f.lockFree = dec(f.lockFree, dt); f.staminaFlash = dec(f.staminaFlash, dt);
    f.hyperT = dec(f.hyperT, dt); f.critT = dec(f.critT, dt); f.poiseT = dec(f.poiseT, dt); f.speedT = dec(f.speedT, dt);
    for (let i = 0; i < 4; i++) f.skillCd[i] = dec(f.skillCd[i], dt);
    if (f.hitT > 0) { f.hitT -= dt; if (f.hitT <= 0) { f.hitT = 0; f.hits = 0; } }
    f.blockSince += dt;
    if (f.staminaPause > 0) f.staminaPause -= dt;
    else if (f.stamina < T.stamina) f.stamina = Math.min(T.stamina, f.stamina + dt * (f.phase === 'ground' && inp.mag < 0.1 ? T.staminaRegenIdle : T.staminaRegen));
    // Kamera schnell gedreht: weiches Ziel sofort lösen (die feste Erfassung bleibt)
    const turn = Math.abs(wrapAngle(inp.camYaw - f.camYaw)) / Math.max(dt, 1e-4);
    f.camYaw = inp.camYaw;
    if (turn > T.lockReleaseTurn && !inp.hardLockId) {
      if (f.lockId) { f.lockId = ''; this.events.push('lockLost'); }
      f.lockFree = T.lockReleaseHold;
    }
    // Eingaben puffern
    if (inp.light) f.bufL = f.clock;
    if (inp.heavy) f.bufS = f.clock;
    if (inp.jump) f.bufJ = f.clock;
    if (inp.dash) f.bufD = f.clock;
    if (inp.skill > 0) { f.bufK = f.clock; f.bufSlot = inp.skill; }
    if (inp.blockPressed) f.blockSince = 0;
    if (inp.awaken) f.bufU = f.clock;
    // Sturm-Erwachen läuft ab; Aura wechseln (keine → Sturmblick → Eisenwille → Königsdruck → keine)
    if (f.awakenT > 0) { f.awakenT -= dt; if (f.awakenT <= 0) { f.awakenT = 0; f.ultReady = false; this.events.push('awakenEnd'); } }
    if (inp.aura) { f.aura = ((f.aura + 1) % 4) as AuraId; f.kingT = Math.min(f.kingT, 1.2); this.events.push('aura', f.aura); }
    // Ziele in der Nähe (einmal je Bild) und Gültigkeit des weichen Ziels
    this.poolN = w.targets(f.x, f.z, f.moveIdx >= 0 ? Math.max(QUERY_R, MOVE_REACH[f.moveIdx]) : QUERY_R, this.pool);
    // Königsdruck: alle 6 s eine Willens-Druckwelle, sobald genug Gegner oder Verbände nahe sind
    if (f.aura === 3 && f.phase !== 'down') {
      f.kingT -= dt;
      if (f.kingT <= 0) { f.kingT = AURA.kingEvery; if (this.countNear(AURA.kingR) >= AURA.kingMin) this.kingWave(w, AURA.kingR); }
    }
    if (inp.hardLockId) f.lockId = inp.hardLockId;
    if (f.lockId) {
      const t = this.target(f.lockId);
      if (!t || !t.alive || Math.hypot(t.x - f.x, t.z - f.z) > T.lockDrop + t.radius) { f.lockId = ''; this.events.push('lockLost'); }
    }
    f.finisherId = this.brokenNear();

    if (f.phase === 'down') { this.passive(dt, w); return; }
    if (f.phase === 'hurt') {
      f.hurtT -= dt;
      if (f.hurtT <= 0) f.phase = f.grounded ? 'ground' : 'air';
    }
    this.decide(inp, w, st);

    switch (f.phase) {
      case 'ground': this.stepGround(inp, dt, w); break;
      case 'air': this.stepAir(inp, dt, w); break;
      case 'move': this.stepMove(inp, dt, w, st); break;
      case 'dash': this.stepDash(dt, w); break;
      case 'block': this.stepBlock(inp, dt, w); break;
      case 'cast':
        f.castT -= dt;
        this.passive(dt, w);
        if (f.castT <= 0 && f.phase === 'cast') f.phase = f.grounded ? 'ground' : 'air';
        break;
      case 'hurt': this.passive(dt, w); break;
      default: break;
    }
  }

  // ---------- Entscheidungen ----------

  private wants(stamp: number): boolean { return stamp >= 0 && this.f.clock - stamp <= T.bufferS + 1e-6; }

  private decide(inp: ActionInput, w: ActionWorld, st: ActionStyleDef) {
    const f = this.f;
    // Ultimate: Aufladen und Einschlag laufen ungestört (danach brechen Dash und Sprung wieder ab)
    const um = f.phase === 'move' ? this.move : null;
    if (f.cineT > 0 || (um && um.ultimate && f.moveT < um.cancel)) return;
    if (this.wants(f.bufU) && f.phase !== 'down' && f.phase !== 'hurt') {
      if (f.awakenT > 0 && f.ultReady) { const r = this.tryUltimate(inp, st, w); if (r !== 0) f.bufU = -1; }
      else if (f.will >= WILL.max && f.awakenT <= 0) { this.awaken(w); f.bufU = -1; }
      else { this.events.push('notReady', 5); f.bufU = -1; }
    }
    // Dash: aus allem außer frühem Taumeln (Animation-Cancel); ein Dash kettet nach gut der Hälfte des vorigen
    if (this.wants(f.bufD) && (f.phase !== 'hurt' || f.hurtT < 0.15) && (f.phase !== 'dash' || f.dashT < f.dashDur * 0.45)) {
      // Sturm-Verfolgung: kurz nach einem Hochschleudern bringt der Dash die Figur zum Ziel in der Luft
      if (f.chaseT > 0 && this.tryChase(w)) f.bufD = -1;
      else if (this.tryDash(inp, st)) f.bufD = -1;
    }
    // Sprung: bricht jeden Angriff ab
    if (this.wants(f.bufJ) && f.phase !== 'hurt' && f.phase !== 'down') {
      if (this.tryJump(inp, st)) f.bufJ = -1;
    }
    if (this.wants(f.bufK) && f.bufSlot > 0) {
      const r = this.trySkill(f.bufSlot, inp, st);
      if (r !== 0) { f.bufK = -1; f.bufSlot = 0; }
    }
    // Haltungsbruch-Finisher: solange ein taumelndes Ziel bereitsteht, bleibt „Schwer“ länger gepuffert (der Moment soll nie verloren gehen)
    if ((this.wants(f.bufS) || (f.finisherId && f.bufS >= 0 && f.clock - f.bufS <= T.finisherBuffer)) && this.tryHeavy(inp, st)) f.bufS = -1;
    if (this.wants(f.bufL) && this.tryLight(inp, st)) f.bufL = -1;
    // Blocken (halten) am Boden
    if (inp.blockHeld && f.phase === 'ground') f.phase = 'block';
    else if (!inp.blockHeld && f.phase === 'block') f.phase = 'ground';
    void w;
  }

  /** Darf jetzt ein neuer Angriff beginnen? (frei oder der laufende ist über seinen Ansatzpunkt) */
  private canAct(): boolean {
    const f = this.f;
    if (f.phase === 'ground' || f.phase === 'air' || f.phase === 'block') return true;
    if (f.phase === 'move') { const m = this.move; return !!m && f.moveT >= m.cancel && !(m.meteor && !f.grounded); }
    return false;
  }

  private tryLight(inp: ActionInput, st: ActionStyleDef): boolean {
    const f = this.f;
    if (!this.canAct()) return false;
    if (!f.grounded) {
      if (f.airIdx >= st.air.length) return false;
      this.startMove(st.air[f.airIdx], 'air', inp);
      f.airIdx++;
      return true;
    }
    const chained = (f.phase === 'move' && (f.moveKind === 'light' || f.moveKind === 'swap')) || f.comboWindow > 0;
    let i = chained ? f.lightIdx : 0;
    if (i >= st.light.length) i = 0;
    this.startMove(st.light[i], 'light', inp);
    f.lightIdx = i + 1;
    return true;
  }

  private tryHeavy(inp: ActionInput, st: ActionStyleDef): boolean {
    const f = this.f;
    if (!this.canAct()) return false;
    if (!f.grounded) {
      if (f.phase === 'move' && f.moveKind === 'meteor') return false;
      this.startMove(st.meteor, 'meteor', inp);
      return true;
    }
    // Haltungsbruch-Finisher: ein taumelndes Elite-Ziel oder ein Boss in Reichweite
    if (f.finisherId) {
      this.startMove(st.finisher, 'finisher', inp, f.finisherId);
      f.lightIdx = 0;
      return true;
    }
    const chained = (f.phase === 'move' && (f.moveKind === 'light' || f.moveKind === 'swap')) || f.comboWindow > 0;
    const n = chained ? f.lightIdx : 0;
    if (n >= 1) this.startMove(st.branch[Math.min(n, 4) - 1], 'branch', inp);
    else this.startMove(st.heavy, 'heavy', inp);
    f.lightIdx = 0;
    return true;
  }

  /** 0 = warten (Puffer bleibt), 1 = gestartet, −1 = verworfen (Abklingzeit) */
  private trySkill(slot: number, inp: ActionInput, st: ActionStyleDef): number {
    const f = this.f;
    const sk = st.skills[slot - 1];
    if (!sk) return -1;
    if (f.skillCd[slot - 1] > 0) { this.events.push('notReady', slot); return -1; }
    // Faji-Kunst: die Technik wird erst mit ihrer Formstufe frei
    if (st.faji && sk.formMin > f.form) { this.events.push('locked', slot, sk.formMin); return -1; }
    if (!this.canAct()) return 0;
    if (!f.grounded && !sk.airOk) return 0;
    this.startMove(sk, 'skill', inp);
    f.skillCd[slot - 1] = sk.cd;
    f.lightIdx = 0;
    this.events.push('skill', slot, 0, 0, sk.label);
    return 1;
  }

  private tryDash(inp: ActionInput, st: ActionStyleDef): boolean {
    const f = this.f;
    if (f.phase === 'down') return false;
    const air = !f.grounded;
    if (air && f.airDashes >= st.airDashes) return false;
    const cost = air ? T.airDashCost : T.dashCost;
    if (f.stamina < cost) { f.staminaFlash = 0.35; this.events.push('staminaLow'); return true; }
    f.stamina -= cost;
    f.staminaPause = T.staminaDelay;
    if (f.phase === 'move') { this.events.push('cancel', f.moveIdx); this.clearMove(); }
    const back = inp.mag <= 0.1;
    let dx = inp.moveX, dz = inp.moveZ;
    if (back) { dx = -Math.sin(f.yaw); dz = -Math.cos(f.yaw); }
    else f.yaw = Math.atan2(dx, dz);
    f.phase = 'dash';
    f.dashT = f.dashDur = st.dashTime;
    f.dashSpeed = st.dashSpeed;
    f.dashX = dx; f.dashZ = dz;
    f.dashSeq++;
    f.dashAir = air;
    if (air) { f.airDashes++; f.vy = 0; f.hover = 0; }
    const pw = st.perfectWindow + (f.aura === 1 ? AURA.sightWindow : 0);
    f.iframes = Math.max(f.iframes, Math.max(T.dashIframes, pw));
    f.perfectT = pw;
    f.counterStance = 0;
    if (f.lockId) { f.lockId = ''; this.events.push('lockLost'); }
    this.events.push('dash', air ? 1 : 0, back ? 1 : 0, f.dashSeq);
    return true;
  }

  private tryJump(inp: ActionInput, st: ActionStyleDef): boolean {
    const f = this.f;
    const fromGround = f.grounded || (f.airT < T.coyote && f.jumps === 0 && f.phase !== 'dash');
    if (fromGround) { f.vy = T.jumpV; f.jumps = 1; }
    else if (f.jumps < st.jumps) { f.vy = T.doubleJumpV; f.jumps = Math.max(1, f.jumps) + 1; }
    else return false;
    if (f.phase === 'move') { this.events.push('cancel', f.moveIdx); this.clearMove(); }
    f.grounded = false;
    f.phase = 'air';
    f.hover = 0;
    f.dashAir = false;
    // Schwung mitnehmen: aus dem Lauf weit, aus dem Stand senkrecht
    if (inp.mag > 0.1) { const sp = T.run * 0.92 * Math.min(1, inp.mag) * f.speedK; f.vx = inp.moveX * sp; f.vz = inp.moveZ * sp; }
    if (f.lockId) { f.lockId = ''; this.events.push('lockLost'); }
    this.events.push('jump', f.jumps);
    return true;
  }

  /**
   * Sturm-Verfolgung (4.6C): Blitz-Teleport neben das nächste hochgeschleuderte Ziel, auf seine Höhe – die Luft-Kombo und der Meteor
   * ketten nahtlos an. Liefert false, wenn kein Ziel hoch genug in Reichweite ist (dann ist es ein normaler Dash).
   */
  private tryChase(w: ActionWorld): boolean {
    const f = this.f;
    let best = -1, bd: number = T.chaseRange;
    for (let i = 0; i < this.poolN; i++) {
      const t = this.pool[i];
      if (!t.alive || !t.airborne || t.y < f.y + T.chaseMinRise) continue;
      const d = Math.hypot(t.x - f.x, t.z - f.z);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return false;
    const t = this.pool[best];
    let dx = f.x - t.x, dz = f.z - t.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-3) { dx /= d; dz /= d; } else { dx = -Math.sin(f.yaw); dz = -Math.cos(f.yaw); }
    const ox = f.x, oz = f.z;
    const k = t.radius + T.chaseOffset;
    // neben das Ziel (Seite der Figur), sonst direkt darunter; nie in eine Wand
    if (!w.teleport(f, t.x + dx * k, t.z + dz * k) && !w.teleport(f, t.x, t.z)) return false;
    if (f.phase === 'move') { this.events.push('cancel', f.moveIdx); this.clearMove(); }
    f.y = Math.max(f.y, t.y - 0.15);
    f.grounded = false;
    f.phase = 'air';
    f.vx = 0; f.vz = 0; f.kx = 0; f.kz = 0;
    f.vy = 0.8;
    f.hover = T.airHitHover * 1.6;
    f.jumps = Math.max(f.jumps, 1);
    f.airIdx = 0;
    f.yaw = Math.atan2(t.x - f.x, t.z - f.z);
    f.lockId = t.id;
    f.iframes = Math.max(f.iframes, 0.25);
    f.chaseT = 0;
    this.events.push('chase', best, ox, oz);
    return true;
  }

  // ---------- Sturm-Erwachen, Ultimate, Königsdruck ----------

  /** Sturm-Erwachen (volle Willenskraft): 18 s Aura, +20 % Angriffstempo, Energiewelle bei jedem normalen Schlag, einmal das Ultimate */
  awaken(w: ActionWorld) {
    const f = this.f;
    f.will = 0;
    f.awakenT = WILL.awakenDur;
    f.ultReady = true;
    f.iframes = Math.max(f.iframes, 0.35);
    this.events.push('awaken', WILL.awakenDur);
    // Königsdruck bricht beim Erwachen gewaltig los
    if (f.aura === 3) this.kingWave(w, AURA.kingAwakenR);
  }

  /** 0 = warten, 1 = gestartet, −1 = verworfen (noch nicht frei) */
  private tryUltimate(inp: ActionInput, st: ActionStyleDef, w: ActionWorld): number {
    const f = this.f;
    const u = st.ultimate;
    if (!u || !u.ultimate) { this.events.push('locked', 5, 0); return -1; }
    if (st.faji && f.form < u.formMin) { this.events.push('locked', 5, u.formMin); return -1; }
    if (!this.canAct() && f.phase !== 'dash') return 0;
    void w;
    f.ultReady = false;
    this.startMove(u, 'ultimate', inp);
    f.cineT = u.ultimate.charge;
    f.iframes = Math.max(f.iframes, u.ultimate.charge + u.dur);
    f.markN = 0;
    f.marksDone = false;
    f.strikeSeq = -1;
    this.events.push('ultimate', f.moveIdx, 0, 0, u.ultimate.kind);
    return 1;
  }

  /** Ziele im Umkreis (lebend) */
  private countNear(r: number): number {
    const f = this.f;
    let n = 0;
    for (let i = 0; i < this.poolN; i++) { const t = this.pool[i]; if (t.alive && Math.hypot(t.x - f.x, t.z - f.z) <= r + t.radius) n++; }
    return n;
  }

  /** Willens-Druckwelle des Königsdrucks: schleudert Verbände fort, schwache Gegner weichen zurück */
  private kingWave(w: ActionWorld, r: number) {
    const f = this.f;
    const c = this.fillCtx('skill', WAVE_TICK - 1);
    c.formK = 1;
    let landed = 0;
    for (let i = 0; i < this.poolN; i++) {
      const t = this.pool[i];
      if (!t.alive) continue;
      let dx = t.x - f.x, dz = t.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d > r + t.radius) continue;
      if (d > 1e-4) { dx /= d; dz /= d; } else { dx = 0; dz = 1; }
      c.dirX = dx; c.dirZ = dz;
      if (w.hit(t, KING_WAVE, this.style.light[0], c) > 0) landed++;
    }
    this.events.push('kingWave', r, landed);
  }

  // ---------- Angriffe ----------

  private startMove(mv: ActionMove, kind: MoveKind, inp: ActionInput | null, lockOverride = '') {
    const f = this.f;
    const idx = moveIndex(mv.id);
    f.phase = 'move';
    f.moveIdx = idx;
    f.moveId = mv.id;
    f.moveKind = kind;
    f.moveT = 0;
    f.moveSeq++;
    f.moveBonus = f.swapBonus;
    f.swapBonus = 1;
    f.magnetLeft = T.magnetMax;
    f.rushLeft = mv.dashTo;
    f.moveHits = 0;
    f.comboWindow = 0;
    this.memoN.fill(0);
    // Ziel: feste Erfassung > Vorgabe (Finisher) > bestehendes weiches Ziel > nächstes im Kegel
    if (inp && inp.hardLockId) f.lockId = inp.hardLockId;
    else if (lockOverride) f.lockId = lockOverride;
    else if (f.lockFree <= 0 && (mv.magnet || mv.dashTo > 0)) {
      const cur = f.lockId ? this.target(f.lockId) : null;
      if (!cur || Math.hypot(cur.x - f.x, cur.z - f.z) > T.magnetRange + cur.radius) f.lockId = this.acquire(inp);
    }
    const tg = f.lockId ? this.target(f.lockId) : null;
    if (tg) {
      // sanft, aber sofort spürbar: bis 100° Unterschied gleich zum Ziel, sonst dreht der Angriff in den ersten Bildern
      const want = Math.atan2(tg.x - f.x, tg.z - f.z);
      if (Math.abs(wrapAngle(want - f.yaw)) < 1.75) f.yaw = want;
    } else if (inp && inp.mag > 0.15) f.yaw = Math.atan2(inp.moveX, inp.moveZ);
    if (mv.rise > 0) { f.vy = mv.rise; f.grounded = false; f.airT = Math.max(f.airT, T.coyote); }
    else if (mv.meteor) { f.vy = Math.max(f.vy, 1.5); f.vx *= 0.3; f.vz *= 0.3; }
    else if (mv.air) { f.vy = Math.max(f.vy, 0.8); f.vx *= 0.4; f.vz *= 0.4; }
    if (mv.iframes > 0) f.iframes = Math.max(f.iframes, mv.iframes);
    if (mv.counter > 0) f.counterStance = mv.counter;
    if (mv.buff) {
      const b = mv.buff;
      if (b.kind === 'hyper') { f.hyperT = b.dur; f.poiseT = b.dur; }
      else if (b.kind === 'crit') f.critT = b.dur;
      else if (b.kind === 'poise') f.poiseT = b.dur;
      else f.speedT = b.dur;
      this.events.push('buff', 0, b.dur, 0, b.kind);
    }
    f.lastLabel = mv.label;
    this.events.push('move', idx, kindCode[kind], f.moveSeq, mv.id);
    if (mv.cutin) this.events.push('cutin', idx, 0, 0, mv.cutin);
  }

  private clearMove() {
    const f = this.f;
    f.moveIdx = -1; f.moveId = ''; f.moveT = 0; f.rushLeft = 0; f.magnetLeft = 0; f.moveBonus = 1;
  }

  private endMove() {
    const f = this.f;
    const k = f.moveKind;
    this.clearMove();
    f.comboWindow = k === 'light' || k === 'swap' ? T.comboWindow : 0;
    if (k !== 'light' && k !== 'swap') f.lightIdx = 0;
    f.phase = f.grounded ? 'ground' : 'air';
  }

  /** Weiches Ziel wählen: nächster lebender Gegner im Kegel um die Stickrichtung (ohne Stick: rundum), ähnliche Höhe bevorzugt */
  private acquire(inp: ActionInput | null): string {
    const f = this.f;
    const hasDir = !!inp && inp.mag > 0.15;
    const dirYaw = hasDir ? Math.atan2(inp!.moveX, inp!.moveZ) : f.yaw;
    const cone = hasDir ? T.magnetCone : Math.PI;
    let best = '', bs = Infinity;
    for (let i = 0; i < this.poolN; i++) {
      const t = this.pool[i];
      if (!t.alive) continue;
      const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz);
      if (d > T.magnetRange + t.radius) continue;
      const ang = d > 1e-3 ? Math.abs(wrapAngle(Math.atan2(dx, dz) - dirYaw)) : 0;
      if (ang > cone) continue;
      const score = d + ang * 3.5 + Math.abs(t.y - f.y) * 0.8 + (t.mass ? 1.2 : 0);
      if (score < bs) { bs = score; best = t.id; }
    }
    return best;
  }

  /** Abstand, auf dem der Magnet-Schritt vor dem Ziel stehen bleibt (der Treffer soll sitzen, nicht hindurchlaufen) */
  private static reachStop(mv: ActionMove): number {
    const h = mv.hits[0];
    if (!h) return 1.2;
    if (h.shape === 'circle') return Math.max(0.5, h.offset * 0.9);
    if (h.shape === 'line') return Math.min(1.6, h.range * 0.35);
    return Math.max(0.8, Math.min(2.2, h.range * 0.5));
  }

  private stepMove(inp: ActionInput, dt: number, w: ActionWorld, st: ActionStyleDef) {
    const f = this.f;
    const mv = this.move;
    if (!mv) { f.phase = f.grounded ? 'ground' : 'air'; return; }
    // Ultimate: während der Zwischensequenz steht die Zeit des Angriffs, die Figur schwebt an ihrem Ort
    if (f.cineT > 0) {
      f.cineT -= dt;
      if (!f.grounded) f.vy = 0;
      else this.groundFollow(dt, w);
      // 4.6C: Aufstieg und Schweben beginnen erst nach der Zwischensequenz (vorher hielt sie die Figur fest und schluckte den Sprung)
      if (f.cineT <= 0 && mv.rise > 0) {
        f.vy = mv.rise; f.grounded = false; f.airT = Math.max(f.airT, T.coyote);
        if (mv.hang > 0) f.hover = Math.max(f.hover, mv.hang);
      }
      return;
    }
    const t0 = f.moveT;
    f.moveT += dt * (f.speedT > 0 ? 1.15 : 1) * (f.awakenT > 0 && f.moveKind !== 'ultimate' ? WILL.awakenSpeed : 1);
    // Meteor: in der Luft bleibt der Clip vor dem Einschlag stehen; der Treffer kommt beim Aufprall
    if (mv.meteor && !f.grounded) {
      const hold = mv.hits.length ? mv.hits[0].t0 - 0.02 : mv.dur * 0.5;
      if (f.moveT > hold) f.moveT = hold;
    }
    const t1 = f.moveT;
    const firstT0 = mv.hits.length ? mv.hits[0].t0 : mv.dur * 0.5;
    const firstT1 = mv.hits.length ? mv.hits[0].t1 : firstT0;
    const tg = f.lockId ? this.target(f.lockId) : null;
    // Ausrichten zum Ziel bis zum ersten Treffer. Durchstoß-Ultimates (Iaijutsu, Klingen-Zyklon) halten ihre Richtung, sobald das Ziel überholt
    // ist (sonst biegen sie zum Ziel hinter sich ab); Techniken wie der Kronenblitz-Sprint drehen sich weiter zum Ziel um und schlagen zurück
    if (tg && t0 <= firstT0 + 0.04 && !(mv.ultimate && mv.through && t0 > 0 && (tg.x - f.x) * Math.sin(f.yaw) + (tg.z - f.z) * Math.cos(f.yaw) < 0.5)) {
      this.turnTo(Math.atan2(tg.x - f.x, tg.z - f.z), dt, 18);
    }
    let mx = 0, mz = 0, impulse = false;
    const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
    if (f.rushLeft > 0 && t0 < mv.dashTime + 1e-6) {
      // Vorstoß (Zieh-Schnitt, Sprungtritt): mit Ziel bis kurz davor, „hindurch“-Stöße über die volle Strecke
      let step = Math.min(f.rushLeft, (mv.dashTo / Math.max(0.05, mv.dashTime)) * dt);
      if (tg && !mv.through) step = Math.min(step, Math.max(0, Math.hypot(tg.x - f.x, tg.z - f.z) - tg.radius - ActionCombatEngine.reachStop(mv)));
      mx += fx * step; mz += fz * step;
      f.rushLeft = step > 1e-4 ? f.rushLeft - step : 0;
      impulse = true;
    } else if (t0 < firstT1) {
      // Magnet-Schritt bis zum Ende des ersten Fensters (die Figur gleitet in den Schwung hinein), Ausfallschritt ohne Ziel nur davor
      if (tg && mv.magnet && f.magnetLeft > 0) {
        // Magnet-Schritt: gleitet bis zu 3,5 m heran (kein Luftschlagen), bleibt aber vor dem Ziel stehen
        const dx = tg.x - f.x, dz = tg.z - f.z, d = Math.hypot(dx, dz);
        const gap = d - tg.radius - ActionCombatEngine.reachStop(mv);
        if (gap > 0.02 && d > 1e-3) {
          const step = Math.min(gap, T.magnetSpeed * dt, f.magnetLeft);
          mx += (dx / d) * step; mz += (dz / d) * step;
          f.magnetLeft -= step;
          impulse = true;
        }
      } else if (!tg && mv.lunge > 0 && f.grounded && t0 < firstT0) {
        mx += fx * mv.lunge * dt; mz += fz * mv.lunge * dt;
        impulse = true;
      }
    }
    // Vorwärts-Momentum (4.6C): knackige Beschleunigungskurve über das erste Schwungfenster – durch Verbände hindurch,
    // vor einem einzelnen Ziel höchstens bis kurz hinein (der Rückstoß schiebt es weg)
    if (mv.push > 0 && (f.grounded || mv.air)) {
      // mehrtreffrige Angriffe (Wirbel, Tänze, Schlaghagel) gleiten über alle Fenster, die übrigen über das erste
      const endT = mv.hits.length >= 3 ? mv.hits[mv.hits.length - 1].t1 : firstT1;
      const p0 = Math.max(0, firstT0 - T.pushLead), p1 = Math.max(p0 + 0.06, endT + T.pushTail);
      if (t1 > p0 && t0 < p1) {
        const u0 = Math.max(0, (t0 - p0) / (p1 - p0)), u1 = Math.min(1, (t1 - p0) / (p1 - p0));
        let step = mv.push * (easeOutCubic(u1) - easeOutCubic(u0));
        if (tg && !tg.mass && !mv.through) {
          // gegen ein einzelnes Ziel zählt der Schub zum Budget des Magnet-Schritts (zusammen höchstens 3,5 m) und endet kurz davor
          const gap = Math.hypot(tg.x - f.x - mx, tg.z - f.z - mz) - tg.radius - ActionCombatEngine.reachStop(mv) + T.pushGap;
          step = Math.min(step, Math.max(0, gap), Math.max(0, f.magnetLeft));
          f.magnetLeft -= step;
        }
        if (step > 1e-5) { mx += fx * step; mz += fz * step; impulse = true; }
      }
    }
    mx += f.kx * dt; mz += f.kz * dt;
    this.decayKnock(dt);
    if (mx !== 0 || mz !== 0) this.moveBody(w, mx, mz, impulse, f.moveSeq);
    // senkrecht: Luftangriffe tragen, Steiger (Launcher) fliegen frei, am Boden haften
    if (!f.grounded) this.airVertical(dt, w, mv);
    else this.groundFollow(dt, w);
    if (f.phase !== 'move' || this.move !== mv) return;
    // Ultimate: der große Einschlag (Impact-Frames, Welt-Effekt)
    if (mv.ultimate && f.strikeSeq !== f.moveSeq && t1 >= mv.ultimate.strikeAt) {
      f.strikeSeq = f.moveSeq;
      this.events.push('ultStrike', f.moveIdx, f.x, f.z, mv.ultimate.kind);
    }
    // Trefferfenster dieses Bilds
    if (!(mv.meteor && !f.grounded)) {
      const fk = st.faji && f.moveKind === 'skill' ? formPower(f.form).range : 1;
      // Schwungfenster von Techniken, Verzweigungen, Finishern und Meteor melden (Klingenwellen und Eruptionen der Darstellung)
      const swing = f.moveKind !== 'light' && f.moveKind !== 'air' && f.moveKind !== 'swap' && f.moveKind !== 'ultimate';
      for (let i = 0; i < mv.hits.length && i < MAX_TICKS; i++) {
        const h = mv.hits[i];
        if (swing && ((t0 < h.t0 && h.t0 <= t1) || (h.t0 === 0 && t0 === 0))) this.events.push('swing', f.moveIdx, i);
        // verzögerter Treffer: zur Zeit `delayTo` treffen alle markierten Ziele zugleich (Klinge rastet ein)
        if (h.delayTo > 0 && !f.marksDone && t1 >= h.delayTo) this.fireMarks(h, i, mv, w);
        if (h.t0 > t1 || h.t1 <= t0) continue;
        if (h.projectile) { if (h.t0 > t0 - 1e-9 && h.t0 <= t1 + 1e-9 && !(t0 > h.t0)) w.shoot(h, mv, f); continue; }
        const grow = h.grow ? Math.max(0.05, Math.min(1, (t1 - h.t0) / Math.max(1e-3, h.t1 - h.t0))) : 1;
        this.hitWindow(h, i, mv, w, st, grow * fk, h.delayTo > 0);
      }
      // Sturm-Erwachen: eine Energiewelle begleitet jeden normalen Schlag
      if (f.awakenT > 0 && f.waveSeq !== f.moveSeq && (f.moveKind === 'light' || f.moveKind === 'air' || f.moveKind === 'swap') && mv.hits.length && t1 >= mv.hits[0].t0) {
        f.waveSeq = f.moveSeq;
        f.waveT = 0;
        this.memoN[WAVE_TICK] = 0;
        this.events.push('awakenWave', f.moveIdx);
      }
    }
    if (f.waveT >= 0) {
      f.waveT += dt;
      this.hitWindow(st.awakenWave, WAVE_TICK, mv, w, st, Math.min(1, f.waveT / WAVE_DUR), false);
      if (f.waveT >= WAVE_DUR) f.waveT = -1;
    }
    if (f.moveT >= mv.dur - 1e-6) { this.endMove(); return; }
    // nach dem letzten Treffer bricht Laufen den Ausschwung ab – man ist nie lange festgenagelt
    if (inp.mag > T.recoverCancelMag && f.grounded && !mv.air && f.moveT > mv.cancel && f.moveT > lastHitEnd(mv) + T.recoverCancelAfter) this.endMove();
  }

  private fillCtx(kind: MoveKind, tick: number): HitContext {
    const f = this.f, c = this.ctx, st = this.style;
    c.crit = f.counterT > 0 ? T.counterCrit : 0;
    c.critAdd = f.critT > 0 ? 0.25 : 0;
    c.postureK = st.postureK * (f.poiseT > 0 ? 1.5 : 1);
    c.tick = tick;
    c.kind = kind;
    c.finisher = kind === 'finisher';
    c.airborne = !f.grounded;
    c.bonus = f.moveBonus;
    c.style = st;
    c.fx = f.x; c.fz = f.z; c.fyaw = f.yaw;
    c.formK = st.faji && kind === 'skill' ? formPower(f.form).dmg : 1;
    c.penAdd = f.aura === 2 ? AURA.ironPen : 0;
    c.ultimate = kind === 'ultimate';
    c.cast = f.moveSeq;
    c.chained = 0;
    c.clash = false;
    return c;
  }

  /** Verzögerter Treffer: alle markierten Ziele, die noch leben, zugleich treffen */
  private fireMarks(h: ActionHit, tick: number, mv: ActionMove, w: ActionWorld) {
    const f = this.f;
    f.marksDone = true;
    const c = this.fillCtx(f.moveKind, tick);
    let landed = 0, broke = 0;
    for (let k = 0; k < f.markN; k++) {
      const t = this.target(f.marks[k]);
      if (!t || !t.alive) continue;
      let dx = t.x - f.x, dz = t.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) { dx /= d; dz /= d; } else { dx = Math.sin(f.yaw); dz = Math.cos(f.yaw); }
      c.dirX = dx; c.dirZ = dz;
      const r = w.hit(t, h, mv, c);
      if (r > 0) landed++;
      if (r > 1) broke++;
    }
    this.events.push('sheath', landed, f.markN);
    if (landed > 0) this.afterHits(landed, broke, mv, tick);
  }

  /** Schwer genug für einen Klingen-Clash? (Schwer, Finisher, Verzweigungen, Meteor und alle wuchtigen Treffer) */
  private clashable(h: ActionHit): boolean {
    const k = this.f.moveKind;
    return k === 'heavy' || k === 'finisher' || k === 'branch' || k === 'meteor' || h.poise >= 30 || h.fx === 'heavy';
  }

  /** Nach Treffern eines Fensters: Zähler, Willenskraft, Schweben in der Luft, Konter verbraucht */
  private afterHits(landed: number, broke: number, mv: ActionMove, tick: number) {
    const f = this.f;
    // Hochgeschleudert (Orkan-Launcher, Auftriebs-Techniken): ein Dash darf jetzt hinterher teleportieren (Sturm-Verfolgung)
    const lh = tick < mv.hits.length ? mv.hits[tick] : null;
    if (lh && lh.launch >= 6 && f.moveKind !== 'ultimate') f.chaseT = T.chaseWindow;
    f.hits += landed;
    f.hitT = T.hitReset;
    f.moveHits += landed;
    if (f.hits > f.maxHits) f.maxHits = f.hits;
    this.addWill(Math.min(landed, WILL.hitCap) * WILL.hit + broke * WILL.broke + (f.moveKind === 'finisher' ? WILL.finisher : 0));
    // Lufttreffer: kurz schweben (verlangsamter Fall), damit die Luft-Kombo trägt
    if (!f.grounded && (mv.air || f.moveKind === 'skill')) { f.vy = Math.max(f.vy, T.airHitVy); f.hover = T.airHitHover; }
    if (f.counterT > 0) f.counterT = 0;
    this.events.push('hitConfirm', landed, f.hits, tick);
  }

  /** Ein Trefferfenster: alle Ziele in der Form, jedes höchstens einmal je Fenster */
  private hitWindow(h: ActionHit, tick: number, mv: ActionMove, w: ActionWorld, st: ActionStyleDef, rangeK = 1, mark = false) {
    const f = this.f;
    const memo = this.memo[tick];
    let mn = this.memoN[tick];
    const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
    // Sog: jedes Bild alle Ziele in der Form zum Mittelpunkt ziehen (auch schon getroffene)
    if (h.vortex > 0) {
      const cx = h.shape === 'circle' ? f.x + fx * h.offset : f.x, cz = h.shape === 'circle' ? f.z + fz * h.offset : f.z;
      const step = h.vortex * (1 / 60);
      for (let i = 0; i < this.poolN; i++) { const t = this.pool[i]; if (t.alive && inShape(f, h, t, fx, fz, rangeK)) w.drag(t, cx, cz, step); }
    }
    const c = this.fillCtx(f.moveKind, tick);
    let landed = 0, broke = 0;
    for (let i = 0; i < this.poolN; i++) {
      const t = this.pool[i];
      if (!t.alive) continue;
      if ((h.maxTargets > 0 && mn >= h.maxTargets) || mn >= MAX_TICK_TARGETS) break;
      let seen = false;
      for (let k = 0; k < mn; k++) if (memo[k] === t.id) { seen = true; break; }
      if (seen || !inShape(f, h, t, fx, fz, rangeK)) continue;
      memo[mn++] = t.id;
      // Iaijutsu: nur markieren, getroffen wird beim Einrasten der Klinge
      if (mark) { if (f.markN < MAX_MARKS) f.marks[f.markN++] = t.id; continue; }
      let dx = t.x - f.x, dz = t.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) { dx /= d; dz /= d; } else { dx = fx; dz = fz; }
      c.dirX = dx; c.dirZ = dz;
      c.chained = 0;
      // Klingen-Clash: ein schwerer Schlag trifft den Schlag eines Bosses oder Elite-Gegners, der auf die Figur zielt (einmal je Angriff)
      const clash = f.clashSeq !== f.moveSeq && t.attacking && (t.boss || t.elite) && this.clashable(h)
        && Math.sin(t.yaw) * -dx + Math.cos(t.yaw) * -dz > T.clashFacing;
      c.clash = clash;
      const r = w.hit(t, h, mv, c);
      c.clash = false;
      if (clash) {
        f.clashSeq = f.moveSeq;
        f.kx -= fx * T.clashRecoil; f.kz -= fz * T.clashRecoil;
        this.events.push('clash', i, r);
      }
      if (r > 0) landed++;
      if (r > 1) broke++;
      // Kettenblitz: springt auf die nächsten Ziele in Reichweite (je Sprung 70 % Schaden)
      if (r > 0 && h.chain > 0) {
        let from = t;
        for (let j = 1; j <= h.chain && mn < MAX_TICK_TARGETS; j++) {
          let best: ActionTarget | null = null, bd = h.chainRange;
          for (let q = 0; q < this.poolN; q++) {
            const o = this.pool[q];
            if (!o.alive || o === from) continue;
            let hit = false;
            for (let k = 0; k < mn; k++) if (memo[k] === o.id) { hit = true; break; }
            if (hit) continue;
            const dd = Math.hypot(o.x - from.x, o.z - from.z) - o.radius;
            if (dd < bd) { bd = dd; best = o; }
          }
          if (!best) break;
          memo[mn++] = best.id;
          const ddx = best.x - from.x, ddz = best.z - from.z, dl = Math.hypot(ddx, ddz) || 1;
          c.dirX = ddx / dl; c.dirZ = ddz / dl;
          c.chained = j;
          const rr = w.hit(best, h, mv, c);
          if (rr > 0) landed++;
          if (rr > 1) broke++;
          this.events.push('chain', this.pool.indexOf(best), this.pool.indexOf(from), j);
          from = best;
        }
        c.chained = 0;
      }
    }
    this.memoN[tick] = mn;
    if (landed > 0) this.afterHits(landed, broke, mv, tick);
    void st;
  }

  // ---------- Bewegung ----------

  private turnTo(want: number, dt: number, rate: number) {
    const f = this.f;
    f.yaw += wrapAngle(want - f.yaw) * Math.min(1, dt * rate);
  }

  private decayKnock(dt: number) {
    const f = this.f;
    if (f.kx === 0 && f.kz === 0) return;
    const k = Math.pow(0.01, dt);
    f.kx *= k; f.kz *= k;
    if (Math.abs(f.kx) + Math.abs(f.kz) < 0.01) { f.kx = 0; f.kz = 0; }
  }

  /** Waagrecht bewegen; in der Luft halten Felswände und Hänge über den Füßen auf, eine niedrige Kante wird mitgenommen */
  private moveBody(w: ActionWorld, dx: number, dz: number, impulse: boolean, id: number) {
    const f = this.f;
    const px = f.x, pz = f.z;
    w.move(f, dx, dz, impulse && f.grounded, id);
    if (f.grounded) return;
    const h = w.height(f.x, f.z, f.y);
    if (!Number.isFinite(h)) return;
    if (h > f.y + T.stepUp) { f.x = px; f.z = pz; f.vx = 0; f.vz = 0; }
    else if (h > f.y && f.vy <= 0.5) this.land(h, w);
  }

  private stepGround(inp: ActionInput, dt: number, w: ActionWorld) {
    const f = this.f;
    let vx = 0, vz = 0;
    const hard = !Number.isNaN(inp.hardLockYaw);
    if (inp.mag > 0.05) {
      const sp = (inp.mag > 0.7 ? T.run : 0.6 + 1.6 * (inp.mag / 0.7)) * f.speedK * (f.speedT > 0 ? 1.15 : 1);
      vx = inp.moveX * sp; vz = inp.moveZ * sp;
      this.turnTo(hard && inp.mag < 0.7 ? inp.hardLockYaw : Math.atan2(inp.moveX, inp.moveZ), dt, 12);
    } else if (hard) this.turnTo(inp.hardLockYaw, dt, 8);
    f.vx = vx; f.vz = vz;
    const mx = (vx + f.kx) * dt, mz = (vz + f.kz) * dt;
    this.decayKnock(dt);
    if (mx !== 0 || mz !== 0) w.move(f, mx, mz, false, 0);
    this.groundFollow(dt, w);
  }

  private stepBlock(inp: ActionInput, dt: number, w: ActionWorld) {
    const f = this.f;
    let vx = 0, vz = 0;
    if (!Number.isNaN(inp.hardLockYaw)) this.turnTo(inp.hardLockYaw, dt, 10);
    else if (inp.mag > 0.05) this.turnTo(Math.atan2(inp.moveX, inp.moveZ), dt, 6);
    if (inp.mag > 0.05) { vx = inp.moveX * inp.mag * T.blockSpeed; vz = inp.moveZ * inp.mag * T.blockSpeed; }
    const mx = (vx + f.kx) * dt, mz = (vz + f.kz) * dt;
    this.decayKnock(dt);
    if (mx !== 0 || mz !== 0) w.move(f, mx, mz, false, 0);
    this.groundFollow(dt, w);
  }

  private stepAir(inp: ActionInput, dt: number, w: ActionWorld) {
    const f = this.f;
    // Luftsteuerung: Schwung bleibt, die Richtung lässt sich führen
    const want = inp.mag > 0.05 ? T.airSpeed * Math.min(1, inp.mag) * f.speedK : 0;
    const tx = inp.mag > 0.05 ? inp.moveX * Math.max(want, Math.hypot(f.vx, f.vz) * 0.85) : f.vx;
    const tz = inp.mag > 0.05 ? inp.moveZ * Math.max(want, Math.hypot(f.vx, f.vz) * 0.85) : f.vz;
    const k = Math.min(1, dt * T.airControl);
    f.vx += (tx - f.vx) * k; f.vz += (tz - f.vz) * k;
    if (inp.mag > 0.05) this.turnTo(Math.atan2(inp.moveX, inp.moveZ), dt, 7);
    const mx = (f.vx + f.kx) * dt, mz = (f.vz + f.kz) * dt;
    this.decayKnock(dt);
    if (mx !== 0 || mz !== 0) this.moveBody(w, mx, mz, false, 0);
    if (f.phase === 'air') this.airVertical(dt, w, null);
  }

  private stepDash(dt: number, w: ActionWorld) {
    const f = this.f;
    f.dashT -= dt;
    const k = Math.max(T.dashTail, f.dashT / Math.max(0.01, f.dashDur));
    const sp = f.dashSpeed * k * (f.dashAir ? T.airDashK : 1);
    this.moveBody(w, f.dashX * sp * dt, f.dashZ * sp * dt, true, -f.dashSeq);
    if (f.phase !== 'dash') return;
    if (f.dashAir) f.vy = 0;
    else if (!f.grounded) this.airVertical(dt, w, null);
    else this.groundFollow(dt, w);
    if (f.dashT <= 0 && f.phase === 'dash') {
      f.phase = f.grounded ? 'ground' : 'air';
      // in der Luft trägt der Dash-Schwung weiter
      if (!f.grounded) { f.vx = f.dashX * T.airSpeed; f.vz = f.dashZ * T.airSpeed; }
      f.dashAir = false;
    }
  }

  /** Taumeln, K.O., Zaubern: nur Rückstoß und Schwerkraft */
  private passive(dt: number, w: ActionWorld) {
    const f = this.f;
    const mx = f.kx * dt, mz = f.kz * dt;
    this.decayKnock(dt);
    if (mx !== 0 || mz !== 0) this.moveBody(w, mx, mz, false, 0);
    if (!f.grounded) this.airVertical(dt, w, null);
    else this.groundFollow(dt, w);
  }

  /** Am Boden: der Bodenhöhe folgen; fällt der Boden um mehr als eine Stufe ab (Kante, Deck, Klippe), beginnt ein freier Fall */
  private groundFollow(dt: number, w: ActionWorld) {
    const f = this.f;
    const h = w.height(f.x, f.z, f.y);
    if (!Number.isFinite(h)) return;
    if (h < f.y - T.stepDown) {
      f.grounded = false;
      f.airT = 0;
      f.vy = Math.min(f.vy, 0);
      if (f.phase === 'ground' || f.phase === 'block') f.phase = 'air';
      this.events.push('fall', f.y - h);
      return;
    }
    f.y += (h - f.y) * Math.min(1, dt * 18);
  }

  /** Senkrechte Bewegung in der Luft: Schwerkraft (Schweben nach Lufttreffern, getragene Luftangriffe, Meteor-Sturz) und Landung */
  private airVertical(dt: number, w: ActionWorld, mv: ActionMove | null) {
    const f = this.f;
    f.airT += dt;
    let g: number = T.gravity;
    if (mv && mv.meteor) {
      if (f.moveT >= METEOR_HANG || f.vy < 0) { f.vy = T.meteorV; g = 0; }
    } else if (f.hover > 0) g *= T.hoverGravityK;
    else if (mv && mv.air) g *= T.airMoveGravityK;
    const y0 = f.y;
    f.vy = Math.max(-T.maxFall, f.vy - g * dt);
    f.y += f.vy * dt;
    if (f.vy <= 0) {
      const h = this.floorBelow(w, y0, f.y);
      if (Number.isFinite(h) && f.y <= h) this.land(h, w);
    }
  }

  /** Höchste Fläche unter den Füßen zwischen alter und neuer Höhe (Brücke über der Schlucht, Achterdeck über dem Hauptdeck) */
  private floorBelow(w: ActionWorld, y0: number, y1: number): number {
    const f = this.f;
    let best = -Infinity;
    const a = w.height(f.x, f.z, y0);
    if (Number.isFinite(a) && a <= y0 + 0.05 && a > best) best = a;
    const b = w.height(f.x, f.z, (y0 + y1) * 0.5);
    if (Number.isFinite(b) && b <= y0 + 0.05 && b > best) best = b;
    const c = w.height(f.x, f.z, y1);
    if (Number.isFinite(c) && c <= y0 + 0.05 && c > best) best = c;
    return best;
  }

  private land(h: number, w: ActionWorld) {
    const f = this.f;
    const fall = -f.vy;
    f.y = h; f.vy = 0;
    f.grounded = true; f.airT = 0; f.jumps = 0; f.airDashes = 0; f.airIdx = 0; f.hover = 0;
    f.vx = 0; f.vz = 0;
    this.events.push('land', fall);
    if (f.phase === 'air') { f.phase = 'ground'; return; }
    if (f.phase === 'dash') { f.dashAir = false; return; }
    if (f.phase !== 'move') return;
    const mv = this.move;
    if (!mv) { f.phase = 'ground'; return; }
    if (mv.meteor) {
      // Einschlag: die Treffer des Meteors gehen jetzt los, der Rest des Angriffs ist die Erholung
      const h0 = mv.hits[0];
      f.moveT = h0 ? h0.t0 : f.moveT;
      for (let i = 0; i < mv.hits.length && i < MAX_TICKS; i++) this.hitWindow(mv.hits[i], i, mv, w, this.style);
      this.events.push('impact', h0 ? h0.range : 3, fall);
      return;
    }
    if (mv.air) this.endMove();
  }

  // ---------- Ziele ----------

  /** Ziel über seine Kennung in der Liste dieses Bilds */
  target(id: string): ActionTarget | null {
    for (let i = 0; i < this.poolN; i++) if (this.pool[i].id === id) return this.pool[i];
    return null;
  }

  /** taumelndes Ziel (Haltung gebrochen) in Reichweite des Finishers */
  private brokenNear(): string {
    const f = this.f;
    let best = '', bd: number = T.finisherRange;
    for (let i = 0; i < this.poolN; i++) {
      const t = this.pool[i];
      if (!t.alive || !t.broken || t.mass) continue;
      const d = Math.hypot(t.x - f.x, t.z - f.z) - t.radius;
      if (d < bd && Math.abs(t.y - f.y) < 2.5) { bd = d; best = t.id; }
    }
    return best;
  }
}

// ---------- Trefferformen ----------

/** Liegt ein Ziel (Kreis mit Radius, Höhe) in der Trefferform um die Figur? Bogen, Kreis (vor der Figur) oder Linie (Schockwelle) */
export function inShape(f: { x: number; y: number; z: number; yaw: number }, h: ActionHit, t: Pick<ActionTarget, 'x' | 'y' | 'z' | 'radius' | 'height'>, fx = Math.sin(f.yaw), fz = Math.cos(f.yaw), rangeK = 1): boolean {
  if (t.y > f.y + h.up || t.y + t.height < f.y - h.down) return false;
  const dx = t.x - f.x, dz = t.z - f.z;
  const range = h.range * rangeK;
  if (h.shape === 'circle') {
    const cx = f.x + fx * h.offset, cz = f.z + fz * h.offset;
    const d = Math.hypot(t.x - cx, t.z - cz);
    if (d > range + t.radius) return false;
    return h.inner <= 0 || d >= h.inner - t.radius;
  }
  if (h.shape === 'line') {
    const along = dx * fx + dz * fz;
    if (along < -t.radius - 0.3 || along > range + t.radius) return false;
    return Math.abs(dx * fz - dz * fx) <= h.width * 0.5 + t.radius;
  }
  const d = Math.hypot(dx, dz);
  if (d > range + t.radius) return false;
  if (h.inner > 0 && d < h.inner - t.radius) return false;
  if (h.arc >= 6.2 || d < t.radius + 0.05) return true;
  const cos = (dx * fx + dz * fz) / d;
  const ang = Math.acos(cos < -1 ? -1 : cos > 1 ? 1 : cos);
  return ang <= h.arc * 0.5 + Math.asin(Math.min(1, t.radius / d));
}

// ---------- Haltung (Posture) ----------

/** Haltungsleiste eines Gegners (Elite, Kommandant, Endboss): reine Daten */
export interface PostureState { value: number; max: number; brokenT: number; sinceHit: number }

export const makePosture = (max: number): PostureState => ({ value: Math.max(1, max), max: Math.max(1, max), brokenT: 0, sinceHit: 99 });

/** Haltungsschaden; true, wenn die Leiste durch diesen Treffer bricht */
export function hitPosture(p: PostureState, amount: number): boolean {
  p.sinceHit = 0;
  if (p.brokenT > 0 || !(amount > 0)) return false;
  p.value = Math.max(0, p.value - amount);
  return p.value <= 0;
}

/** Bruch: die Leiste ist leer, das Ziel taumelt `dur` Sekunden */
export function breakPosture(p: PostureState, dur: number) { p.value = 0; p.brokenT = Math.max(p.brokenT, dur); }

/** Taumeln sofort beenden (nach dem Finisher, Phasenwechsel): Leiste wieder voll */
export function restorePosture(p: PostureState) { p.brokenT = 0; p.value = p.max; p.sinceHit = 99; }

/** Je Logikbild: Taumeln läuft ab (true = gerade beendet), sonst lädt die Leiste nach `POSTURE.regenDelay` s ohne Treffer */
export function stepPosture(p: PostureState, dt: number, regen = true): boolean {
  if (p.brokenT > 0) {
    p.brokenT -= dt;
    if (p.brokenT <= 0) { restorePosture(p); return true; }
    return false;
  }
  p.sinceHit += dt;
  if (regen && p.sinceHit > POSTURE.regenDelay && p.value < p.max) p.value = Math.min(p.max, p.value + p.max * POSTURE.regenRate * dt);
  return false;
}

/** Füllstand 0 … 1 (0 während des Taumelns) */
export const postureFrac = (p: PostureState): number => (p.brokenT > 0 ? 0 : Math.max(0, Math.min(1, p.value / p.max)));

/** Wer bekommt eine Haltungsleiste? Elite-Truppen, Hauptmänner/Insel-Kommandanten, Königs- und Kaiser-Endbosse */
export const hasPostureBar = (def: { elite?: boolean; boss?: boolean; raid?: string }): boolean => !!(def.elite || def.boss || def.raid);
