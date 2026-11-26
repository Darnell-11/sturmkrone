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
import { TARGET } from './targetLock';
import {
  ACTION_STYLES, ACTION_TUNING as T, ALL_MOVES, POSTURE, lastHitEnd, moveIndex,
  type ActionHit, type ActionMove, type ActionStyleDef, type ActionStyleId,
} from '../data/actionStyles';
import { wrapAngle } from '../core/mathUtil';
import { AURA, KING_WAVE, WILL, formPower, type AuraId } from '../data/fajiArts';
import { TALENT_CAP, softCap } from '../data/balanceConfig';
import { NO_TALENT_PARAMS, type TalentCombat, type TalentEngineParams } from './talentCombat';
import { FORM_NODES, GEIST_VALUES, ULT_NODE } from '../data/classes';
import { H0 } from '../data/actionKit';

/** 4.7B: Abklingzeiten der vier Geistes-Kräfte je Rang (gleich `GEIST[i].cd` in data/classes.ts) */
const GEIST_CD: readonly ((r: number) => number)[] = [(r) => 32 - r, (r) => 26 - r, (r) => Math.round(20 - 0.8 * r), (r) => 75 - 3 * r];

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
  /** Abklingzeiten der zehn Formen (4.7B; Formen 1 – 4 = die alten Kampfkünste) */
  skillCd: number[];
  /**
   * 4.7B Klassenbaum: so viele Formen sind frei (0 … 10; Form k ab Knoten 1, 6, 12 … 54) und ob das Ultimate gelernt ist (Knoten 60).
   * Ohne Klasse (Gegner, Prüfungen): alle zehn und das Ultimate.
   */
  formsOpen: number;
  ultOpen: boolean;
  /** 4.7B Geistes-Faji (Q/R/T/G): Ränge 0 … 5 (0 = gesperrt), Abklingzeiten, gepufferte Kraft, Willens-Entfesselung (Rest, Schadensbonus) */
  geistRank: number[];
  geistCd: number[];
  bufG: number;
  geistSlot: number;
  willT: number;
  willDmg: number;
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
  /** Talente (4.6E): Auto-Verfolgung steht an (nach einem Hochschleudern durch eine Technik mit Auto-Verfolgung oder den Stil) */
  autoChase: boolean;
  /** Talente (4.6E): ausstehende Nachbeben des Ultimates, Zeit bis zum nächsten, Mittelpunkt */
  shockN: number;
  shockT: number;
  shockX: number;
  shockZ: number;
  /** 4.6H Höhen-Ebenen: Zeit seit der letzten Wandberührung in der Luft, Normale der Wand (zeigt von ihr weg), Wandsprünge seit dem Absprung */
  wallT: number;
  wallNX: number;
  wallNZ: number;
  wallKicks: number;
}

export function createFighter(entityId: string, style: ActionStyleId, x = 0, y = 0, z = 0, yaw = 0): FighterState {
  return {
    entityId, style, radius: 0.35, x, y, z, yaw, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0, grounded: true, airT: 0, jumps: 0, airDashes: 0,
    phase: 'ground', moveIdx: -1, moveId: '', moveKind: 'light', moveT: 0, moveSeq: 0, moveBonus: 1, lightIdx: 0, airIdx: 0, comboWindow: 0,
    bufL: -1, bufS: -1, bufJ: -1, bufD: -1, bufK: -1, bufSlot: 0, clock: 0,
    dashT: 0, dashDur: 0, dashX: 0, dashZ: 1, dashSpeed: 0, dashSeq: 0, dashAir: false,
    iframes: 0, perfectT: 0, counterT: 0, counterStance: 0, hurtT: 0, castT: 0, blockSince: 99,
    lockId: '', lockFree: 0, camYaw: 0, magnetLeft: 0, rushLeft: 0, hover: 0, skillCd: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    formsOpen: 10, ultOpen: true, geistRank: [0, 0, 0, 0], geistCd: [0, 0, 0, 0], bufG: -1, geistSlot: 0, willT: 0, willDmg: 0,
    hyperT: 0, critT: 0, poiseT: 0, speedT: 0, swapBonus: 1, hits: 0, hitT: 0, maxHits: 0, lastLabel: '',
    stamina: T.stamina, staminaPause: 0, staminaFlash: 0, speedK: 1, finisherId: '', moveHits: 0,
    will: 0, awakenT: 0, ultReady: false, bufU: -1, aura: 0, kingT: AURA.kingEvery, form: 1, cineT: 0, strikeSeq: -1, waveSeq: -1, waveT: -1,
    marks: new Array<string>(MAX_MARKS).fill(''), markN: 0, marksDone: false, chaseT: 0, clashSeq: -1,
    autoChase: false, shockN: 0, shockT: 0, shockX: 0, shockZ: 0,
    wallT: 9, wallNX: 0, wallNZ: 0, wallKicks: 0,
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
  /** Form 1 … 10, gerade gedrückt (0 = keine) */
  skill: number;
  /** 4.7B Geistes-Faji 1 … 4 (Q Willens-Entfesselung, R Lebensstrom-Fokus, T Erwachter Wille, G Königsdruck), gerade gedrückt (0 = keine) */
  geist: number;
  blockHeld: boolean; blockPressed: boolean;
  /** feste Zielerfassung des Spiels ('' / NaN = keine) */
  hardLockId: string;
  hardLockYaw: number;
  /**
   * 4.6J: angewähltes Ziel der MMO-Erfassung (Tab, Klick, Antippen; '' = keins): Kampfkünste und Ultimate richten sich darauf aus, wenn es
   * lebt und in Reichweite liegt (`TARGET.artAim`) – ohne die Kamera festzuhalten
   */
  softLockId: string;
  /** Erwachen-Taste (voll: Sturm-Erwachen; im Erwachen: Ultimate) und Aura wechseln, gerade gedrückt */
  awaken: boolean;
  aura: boolean;
}

export function makeInput(): ActionInput {
  return { moveX: 0, moveZ: 1, mag: 0, camYaw: 0, light: false, heavy: false, jump: false, dash: false, skill: 0, geist: 0, blockHeld: false, blockPressed: false, hardLockId: '', hardLockYaw: NaN, softLockId: '', awaken: false, aura: false };
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
  | 'chase' | 'clash' | 'swing' | 'slash'
  /** 4.6E: Nachbeben des Ultimates (a = Radius, b/c = Mittelpunkt x/z), Sturm-Schritt-Entladung (a = Radius, b/c = Mittelpunkt) */
  | 'aftershock' | 'stormBurst'
  /** 4.6H: Wandsprung (a = Zahl der Wandsprünge, b/c = Wandnormale x/z), Kantengriff (a = Höhe des Hochziehens) */
  | 'wallKick' | 'ledge'
  /**
   * 4.7B: Heilung (a = Anteil der Höchst-LP, b = Radius für Verbündete, 0 = nur selbst; Priester-Formen, Ultimate, Lebensstrom-Fokus) und
   * Geistes-Faji (a = Kraft 1 … 4, b = Radius bzw. Dauer/Heilung, c = getroffene Ziele; b = −1 gesperrt, −2 noch nicht bereit)
   */
  | 'heal' | 'geist';

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
/** Nachbeben eines Ultimates (Ultimate-Evolution, 4.6E): erstes nach dem Einschlag, Abstand der weiteren (s) */
const AFTERSHOCK_FIRST = 0.65;
const AFTERSHOCK_GAP = 0.6;

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
  /** Talente (4.6E): umgebaute Stile und Angriffe, Engine-Werte des laufenden Stils */
  private tal: TalentCombat | null = null;
  private tp: TalentEngineParams = NO_TALENT_PARAMS;
  /** Schadensminderung aus Talenten außerhalb der Haltung im Angriff (Rüstung, Planeten-Schild; setzt das Spiel) */
  talentArmor = 0;
  /**
   * 4.6H: Verschiebung (m) der Kreis-Trefferflächen eines Ultimates nach vorn (Himmelssturz an Deck: Einschläge mindestens 28 m vom eigenen
   * Rumpf, `combat/skyfallClearance.ts`); setzt die Welt beim Auslösen, 0 = keine
   */
  ultShift = 0;

  constructor(readonly f: FighterState, poolSize = 160) {
    this.pool = makeTargetPool(poolSize);
    this.memo = Array.from({ length: MAX_TICKS }, () => new Array<string>(MAX_TICK_TARGETS).fill(''));
    this.ctx = { formK: 1, penAdd: 0, ultimate: false, cast: 0, chained: 0, clash: false, dirX: 0, dirZ: 1, crit: 0, critAdd: 0, postureK: 1, tick: 0, kind: 'light', finisher: false, airborne: false, bonus: 1, style: ACTION_STYLES[f.style], fx: 0, fz: 0, fyaw: 0 };
  }

  get style(): ActionStyleDef { return this.styleOf(this.f.style); }
  /** Stil mit Talenten (ohne Talente: die Grunddaten) */
  styleOf(id: ActionStyleId): ActionStyleDef { return this.tal ? this.tal.styles[id] : ACTION_STYLES[id]; }
  /** Angriff mit Talenten an seinem festen Platz (`ALL_MOVES`) */
  moveAt(i: number): ActionMove | null { return i >= 0 ? (this.tal ? this.tal.moves[i] : ALL_MOVES[i]) ?? null : null; }
  /** Reichweite eines Angriffs für den Suchradius */
  private reachAt(i: number): number { return this.tal ? this.tal.reach[i] : MOVE_REACH[i]; }
  /** Talente setzen (null = keine); gilt sofort, laufende Angriffe behalten ihren Platz */
  setTalents(t: TalentCombat | null) {
    this.tal = t;
    this.tp = t ? t.params[this.f.style] : NO_TALENT_PARAMS;
    this.ctx.style = this.style;
  }
  get talents(): TalentCombat | null { return this.tal; }
  /** Engine-Werte des laufenden Stils aus den Talenten */
  get talentParams(): TalentEngineParams { return this.tp; }
  /** Schadensminderung aus Talenten jetzt (Haltung nur während eines eigenen Angriffs), gedeckelt */
  get talentReduce(): number { return softCap((this.f.phase === 'move' ? this.tp.stance : 0) + this.talentArmor, TALENT_CAP.reduce); }
  /** Ultimate des Erwachens: der Himmelssturz, wenn ausgerüstet, sonst das des Stils */
  ultimateOf(st: ActionStyleDef): ActionMove | null { return this.tal && this.tal.useCosmic && this.tal.cosmic ? this.tal.cosmic : st.ultimate; }
  /** Im Sturm-Erwachen? */
  get awakened(): boolean { return this.f.awakenT > 0; }
  /** Steht das Ultimate jetzt bereit? (im Erwachen, noch nicht benutzt, Faji-Künste ab der 7. Form) */
  get ultAvailable(): boolean { const st = this.style; const u = this.ultimateOf(st); return this.f.awakenT > 0 && this.f.ultReady && !!u && (this.f.ultOpen || u !== st.ultimate); }
  /** Willenskraft-Leiste 0 … 1 */
  get willFrac(): number { return Math.min(1, this.f.will / WILL.max); }
  /** Formstufe setzen (Faji-Kunst; Spiel aus der Meisterschaft) */
  setForm(n: number) { this.f.form = Math.max(1, Math.min(7, Math.round(n))); }
  /** Willenskraft gutschreiben (nicht im Erwachen); meldet einmal, wenn die Leiste voll wird */
  addWill(n: number) {
    const f = this.f;
    if (f.awakenT > 0 || !(n > 0) || f.will >= WILL.max) return;
    f.will = Math.min(WILL.max, f.will + n * this.tp.willK);
    if (f.will >= WILL.max) this.events.push('willFull');
  }
  /**
   * 4.6H: Gegner wurden von außen hochgeschleudert (Orkan-Schildstoß eines Offiziers): das Fenster der Sturm-Verfolgung öffnet sich wie nach
   * einem eigenen Launcher (ein Dash teleportiert zum Ziel in der Luft; mit Auto-Verfolgung aus den Talenten folgt die Figur von selbst)
   */
  openChase() {
    const f = this.f;
    f.chaseT = Math.max(f.chaseT, T.chaseWindow + this.tp.chaseAdd);
    if (this.tp.autoChase) f.autoChase = true;
  }
  /** laufender Angriff (null = keiner) */
  get move(): ActionMove | null { return this.moveAt(this.f.moveIdx); }
  /** Hyper-Armor gerade aktiv? (Angriff mit Hyper-Armor oder Stärkung „Unbeugsam“) */
  get hyper(): boolean { const m = this.move; return this.f.hyperT > 0 || (!!m && m.hyper && this.f.phase === 'move'); }
  /** Abklingzeit einer Technik als Anteil 0 (bereit) … 1 */
  skillFrac(slot: number): number { const s = this.style.skills[slot - 1]; return s ? Math.min(1, this.f.skillCd[slot - 1] / s.cd) : 0; }
  /** 4.7B Klassenbaum: freie Formen und Ultimate setzen (Spiel aus dem Spielstand) */
  setClass(forms: number, ult: boolean) { this.f.formsOpen = Math.max(0, Math.min(10, Math.floor(forms))); this.f.ultOpen = ult; }
  /** 4.7B Geistes-Faji: Ränge 0 … 5 der vier Kräfte */
  setGeist(ranks: readonly number[]) { for (let i = 0; i < 4; i++) this.f.geistRank[i] = Math.max(0, Math.min(5, Math.floor(ranks[i] ?? 0))); }
  /** Abklingzeit einer Geistes-Kraft als Anteil 0 (bereit) … 1 */
  geistFrac(i: number): number { const r = this.f.geistRank[i]; if (r <= 0) return 0; const cd = GEIST_CD[i](r); return cd > 0 ? Math.min(1, this.f.geistCd[i] / cd) : 0; }

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
    this.tp = this.tal ? this.tal.params[id] : NO_TALENT_PARAMS;
    this.ctx.style = this.styleOf(id);
    f.airIdx = Math.min(f.airIdx, this.styleOf(id).air.length);
    this.events.push('style', mid ? 1 : 0, 0, 0, id);
    if (!mid || !f.grounded) return 'instant';
    const st = this.styleOf(id);
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
      // Talente: Entladung des Elements hinter dem Angreifer (Sturm-Schritt-Synergie)
      if (this.tp.stormBurst) this.burst(w, this.tp.stormBurst, f.x, f.z, 'stormBurst');
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
    const st = this.styleOf(f.style);
    this.tp = this.tal ? this.tal.params[f.style] : NO_TALENT_PARAMS;
    this.ctx.style = st;
    this.events.clear();
    f.clock += dt;
    // Zeiten
    f.iframes = dec(f.iframes, dt); f.perfectT = dec(f.perfectT, dt); f.counterT = dec(f.counterT, dt); f.counterStance = dec(f.counterStance, dt);
    f.wallT = Math.min(9, f.wallT + dt);
    f.hover = dec(f.hover, dt); f.chaseT = dec(f.chaseT, dt); f.comboWindow = dec(f.comboWindow, dt); f.lockFree = dec(f.lockFree, dt); f.staminaFlash = dec(f.staminaFlash, dt);
    f.hyperT = dec(f.hyperT, dt); f.critT = dec(f.critT, dt); f.poiseT = dec(f.poiseT, dt); f.speedT = dec(f.speedT, dt);
    for (let i = 0; i < f.skillCd.length; i++) f.skillCd[i] = dec(f.skillCd[i], dt);
    for (let i = 0; i < 4; i++) f.geistCd[i] = dec(f.geistCd[i], dt);
    if (f.willT > 0) { f.willT -= dt; if (f.willT <= 0) { f.willT = 0; f.willDmg = 0; } }
    if (f.hitT > 0) { f.hitT -= dt; if (f.hitT <= 0) { f.hitT = 0; f.hits = 0; } }
    f.blockSince += dt;
    if (f.staminaPause > 0) f.staminaPause -= dt;
    else if (f.stamina < T.stamina) f.stamina = Math.min(T.stamina, f.stamina + dt * this.tp.regenK * (f.phase === 'ground' && inp.mag < 0.1 ? T.staminaRegenIdle : T.staminaRegen));
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
    if (inp.geist > 0) { f.bufG = f.clock; f.geistSlot = inp.geist; }
    if (inp.blockPressed) f.blockSince = 0;
    if (inp.awaken) f.bufU = f.clock;
    // Sturm-Erwachen läuft ab; Aura wechseln (keine → Sturmblick → Eisenwille → Königsdruck → keine)
    if (f.awakenT > 0) { f.awakenT -= dt; if (f.awakenT <= 0) { f.awakenT = 0; f.ultReady = false; this.events.push('awakenEnd'); } }
    if (inp.aura) { f.aura = ((f.aura + 1) % 4) as AuraId; f.kingT = Math.min(f.kingT, 1.2); this.events.push('aura', f.aura); }
    // Ziele in der Nähe (einmal je Bild) und Gültigkeit des weichen Ziels
    this.poolN = w.targets(f.x, f.z, f.moveIdx >= 0 ? Math.max(QUERY_R, this.reachAt(f.moveIdx)) : f.shockN > 0 ? Math.max(QUERY_R, Math.hypot(f.shockX - f.x, f.shockZ - f.z) + this.tp.aftershockHit.range + 4) : QUERY_R, this.pool);
    // Königsdruck: alle 6 s eine Willens-Druckwelle, sobald genug Gegner oder Verbände nahe sind
    if (f.aura === 3 && f.phase !== 'down') {
      f.kingT -= dt;
      const kr = AURA.kingR * this.tp.auraKingK;
      if (f.kingT <= 0) { f.kingT = AURA.kingEvery; if (this.countNear(kr) >= AURA.kingMin) this.kingWave(w, kr); }
    }
    // Talente: Nachbeben des Ultimates (Ultimate-Evolution) und Auto-Verfolgung
    if (f.shockN > 0) {
      f.shockT -= dt;
      if (f.shockT <= 0) { f.shockN--; f.shockT = AFTERSHOCK_GAP; this.burst(w, this.tp.aftershockHit, f.shockX, f.shockZ, 'aftershock'); }
    }
    if (f.autoChase && (f.chaseT <= 0 || f.phase === 'down' || f.phase === 'hurt')) f.autoChase = false;
    if (f.autoChase && f.cineT <= 0 && f.phase !== 'dash' && (f.phase !== 'move' || f.moveT >= (this.move?.cancel ?? 0)) && this.tryChase(w)) f.autoChase = false;
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
    // 4.7B Geistes-Faji: wirkt sofort (auch mitten in einem Angriff), nur nicht am Boden liegend oder taumelnd
    if (this.wants(f.bufG) && f.geistSlot > 0 && f.phase !== 'down' && f.phase !== 'hurt') {
      this.tryGeist(f.geistSlot - 1, w);
      f.bufG = -1; f.geistSlot = 0;
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
    // 4.7B: die Form wird erst über den Klassenbaum frei (Form k am Knoten 1, 6, 12 … 54)
    if (slot > f.formsOpen) { this.events.push('locked', slot, FORM_NODES[slot - 1] ?? 0); return -1; }
    if (f.skillCd[slot - 1] > 0) { this.events.push('notReady', slot); return -1; }
    if (!this.canAct()) return 0;
    if (!f.grounded && !sk.airOk) return 0;
    this.startMove(sk, 'skill', inp);
    f.skillCd[slot - 1] = sk.cd;
    f.lightIdx = 0;
    this.events.push('skill', slot, 0, 0, sk.label);
    if (sk.heal) this.events.push('heal', sk.heal, sk.healR ?? 0);
    return 1;
  }

  private tryDash(inp: ActionInput, st: ActionStyleDef): boolean {
    const f = this.f;
    if (f.phase === 'down') return false;
    const air = !f.grounded;
    if (air && f.airDashes >= st.airDashes) return false;
    const cost = (air ? T.airDashCost : T.dashCost) * this.tp.dashCostK;
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
    const pw = st.perfectWindow + (f.aura === 1 ? AURA.sightWindow * this.tp.auraSightK : 0);
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
    let wallKick = false;
    if (fromGround) { f.vy = T.jumpV; f.jumps = 1; }
    else if (f.wallT < T.wallGrace && f.wallKicks < T.wallKicks) {
      // 4.6H Wandsprung: von der berührten Wand (Hauswand, Mauer, Fels) wieder nach oben – der Doppelsprung bleibt erhalten
      f.vy = T.wallKickV; f.jumps = Math.max(1, f.jumps); f.wallKicks++; f.wallT = 9;
      wallKick = true;
    }
    else if (f.jumps < st.jumps) { f.vy = T.doubleJumpV; f.jumps = Math.max(1, f.jumps) + 1; }
    else return false;
    if (f.phase === 'move') { this.events.push('cancel', f.moveIdx); this.clearMove(); }
    f.grounded = false;
    f.phase = 'air';
    f.hover = 0;
    f.dashAir = false;
    // Schwung mitnehmen: aus dem Lauf weit, aus dem Stand senkrecht
    if (inp.mag > 0.1) { const sp = T.run * 0.92 * Math.min(1, inp.mag) * f.speedK; f.vx = inp.moveX * sp; f.vz = inp.moveZ * sp; }
    // Wandsprung: leichter Abstoß von der Wand (die Luftsteuerung führt zur Wand zurück – so klettert man von Absprung zu Absprung)
    if (wallKick) { f.vx = f.vx * 0.35 + f.wallNX * T.wallKickPush; f.vz = f.vz * 0.35 + f.wallNZ * T.wallKickPush; this.events.push('wallKick', f.wallKicks, f.wallNX, f.wallNZ); }
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
    let best = -1, bd: number = T.chaseRange + this.tp.chaseRangeAdd;
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
    f.awakenT = WILL.awakenDur + this.tp.awakenAdd;
    f.ultReady = true;
    f.iframes = Math.max(f.iframes, 0.35);
    this.events.push('awaken', f.awakenT);
    // Königsdruck bricht beim Erwachen gewaltig los
    if (f.aura === 3) this.kingWave(w, AURA.kingAwakenR * this.tp.auraKingK);
  }

  /** 0 = warten, 1 = gestartet, −1 = verworfen (noch nicht frei) */
  private tryUltimate(inp: ActionInput, st: ActionStyleDef, w: ActionWorld): number {
    const f = this.f;
    const u = this.ultimateOf(st);
    if (!u || !u.ultimate) { this.events.push('locked', 11, 0); return -1; }
    // 4.7B: das Ultimate der Klasse erst mit Knoten 60 (Himmelssturz des Kosmos ausgenommen)
    if (!f.ultOpen && u === st.ultimate) { this.events.push('locked', 11, ULT_NODE); return -1; }
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
    if (u.heal) this.events.push('heal', u.heal, u.healR ?? 0);
    return 1;
  }

  /** Ziele im Umkreis (lebend) */
  private countNear(r: number): number {
    const f = this.f;
    let n = 0;
    for (let i = 0; i < this.poolN; i++) { const t = this.pool[i]; if (t.alive && Math.hypot(t.x - f.x, t.z - f.z) <= r + t.radius) n++; }
    return n;
  }

  /**
   * Talent-Entladung (4.6E): ein Kreis-Treffer um den Punkt (x, z) auf alle Ziele darin, einmal (Sturm-Schritt-Entladung, Nachbeben des
   * Ultimates). Nachbeben zählen als Teil des Ultimates: der Endboss-Deckel (`UltimateBossLedger`, je Wirken) umfasst sie mit.
   */
  private burst(w: ActionWorld, h: ActionHit, x: number, z: number, kind: 'stormBurst' | 'aftershock') {
    const f = this.f;
    const c = this.fillCtx(kind === 'aftershock' ? 'ultimate' : 'skill', WAVE_TICK - 1);
    if (kind === 'aftershock') { c.ultimate = true; c.cast = f.strikeSeq; }
    let landed = 0, broke = 0;
    for (let i = 0; i < this.poolN; i++) {
      const t = this.pool[i];
      if (!t.alive) continue;
      let dx = t.x - x, dz = t.z - z;
      const d = Math.hypot(dx, dz);
      if (d > h.range + t.radius || Math.abs(t.y - f.y) > 8) continue;
      if (d > 1e-4) { dx /= d; dz /= d; } else { dx = Math.sin(f.yaw); dz = Math.cos(f.yaw); }
      c.dirX = dx; c.dirZ = dz;
      const mv = this.move ?? this.style.light[0];
      const r = w.hit(t, h, mv, c);
      if (r > 0) landed++;
      if (r > 1) broke++;
    }
    this.events.push(kind, h.range, x, z);
    if (landed > 0) { f.hits += landed; f.hitT = T.hitReset; if (f.hits > f.maxHits) f.maxHits = f.hits; this.addWill(Math.min(landed, WILL.hitCap) * WILL.hit + broke * WILL.broke); }
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

  // ---------- Geistes-Faji (4.7B) ----------

  /** Treffer der Wellen Erwachter Wille (T) und Königsdruck (G): einmal angelegt, je Wirken neu gefüllt (keine Speicheranforderung) */
  private readonly geistHit: ActionHit = { ...H0, t0: 0, t1: 0.1, shape: 'circle', arc: 6.3 };

  /** Geistes-Kraft `i` (0 Q, 1 R, 2 T, 3 G) wirken */
  private tryGeist(i: number, w: ActionWorld) {
    const f = this.f;
    const r = f.geistRank[i] ?? 0;
    if (r <= 0) { this.events.push('geist', i + 1, -1); return; }
    if (f.geistCd[i] > 0) { this.events.push('geist', i + 1, -2); return; }
    f.geistCd[i] = GEIST_CD[i](r);
    const V = GEIST_VALUES;
    if (i === 0) {
      f.willT = V.willeDur(r); f.willDmg = V.willeDmg(r);
      this.events.push('geist', 1, f.willT);
    } else if (i === 1) {
      const heal = V.lebenHeal(r);
      this.events.push('heal', heal, 0);
      this.events.push('geist', 2, heal);
    } else {
      const h = this.geistHit;
      const king = i === 3;
      const rad = king ? V.koenigR(r) : V.erwachtR(r);
      h.range = rad; h.up = king ? 6 : 3; h.down = 3;
      h.dmg = king ? V.koenigDmg(r) : V.erwachtDmg(r);
      h.poise = king ? 160 : 90; h.knock = king ? 14 : 6; h.fling = king ? 16 : 4; h.launch = king ? 3 : 0;
      h.breakGuard = true; h.status = king ? 'fear' : 'stun'; h.statusDur = king ? V.koenigFear : V.erwachtStun(r);
      h.hitstop = king ? 0.1 : 0.06; h.shake = king ? 1.0 : 0.55; h.fx = king ? 'heavy' : 'magic'; h.vfx = king ? 'koenig' : 'schwarzloch';
      f.iframes = Math.max(f.iframes, king ? 0.45 : 0.25);
      const c = this.fillCtx('skill', WAVE_TICK - 1);
      c.formK = 1;
      let landed = 0, broke = 0;
      for (let k = 0; k < this.poolN; k++) {
        const t = this.pool[k];
        if (!t.alive) continue;
        let dx = t.x - f.x, dz = t.z - f.z;
        const d = Math.hypot(dx, dz);
        if (d > rad + t.radius || Math.abs(t.y - f.y) > h.up + 2) continue;
        if (d > 1e-4) { dx /= d; dz /= d; } else { dx = Math.sin(f.yaw); dz = Math.cos(f.yaw); }
        c.dirX = dx; c.dirZ = dz;
        const res = w.hit(t, h, this.style.light[0], c);
        if (res > 0) landed++;
        if (res > 1) broke++;
      }
      this.events.push('geist', i + 1, rad, landed);
      if (landed > 0) { f.hits += landed; f.hitT = T.hitReset; if (f.hits > f.maxHits) f.maxHits = f.hits; this.addWill(Math.min(landed, WILL.hitCap) * WILL.hit + broke * WILL.broke); }
    }
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
    f.magnetLeft = T.magnetMax + this.tp.magnetAdd;
    f.rushLeft = mv.dashTo;
    f.moveHits = 0;
    f.comboWindow = 0;
    this.memoN.fill(0);
    // Ziel: feste Erfassung > Vorgabe (Finisher) > angewähltes Ziel für Kampfkünste/Ultimate (4.6J) > bestehendes weiches Ziel > nächstes im Kegel
    let aimed = false;
    if (inp && inp.hardLockId) f.lockId = inp.hardLockId;
    else if (lockOverride) f.lockId = lockOverride;
    else if (inp && inp.softLockId && (kind === 'skill' || kind === 'ultimate') && this.inAim(inp.softLockId)) { f.lockId = inp.softLockId; aimed = true; }
    else if (f.lockFree <= 0 && (mv.magnet || mv.dashTo > 0)) {
      const cur = f.lockId ? this.target(f.lockId) : null;
      if (!cur || Math.hypot(cur.x - f.x, cur.z - f.z) > T.magnetRange + cur.radius) f.lockId = this.acquire(inp);
    }
    const tg = f.lockId ? this.target(f.lockId) : null;
    if (tg) {
      // sanft, aber sofort spürbar: bis 100° Unterschied gleich zum Ziel, sonst dreht der Angriff in den ersten Bildern
      const want = Math.atan2(tg.x - f.x, tg.z - f.z);
      // 4.6J: eine Kampfkunst auf das angewählte Ziel richtet sich sofort aus (Zielhilfe), sonst nur bis 100°
      if (aimed || Math.abs(wrapAngle(want - f.yaw)) < 1.75) f.yaw = want;
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
  /** 4.6J: liegt das angewählte Ziel lebend in Reichweite der Zielhilfe? */
  private inAim(id: string): boolean {
    const t = this.target(id);
    if (!t || !t.alive) return false;
    const f = this.f;
    return Math.hypot(t.x - f.x, t.z - f.z) <= TARGET.artAim + t.radius;
  }

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
    const mk = f.moveKind;
    const talentK = mk === 'light' || mk === 'air' || mk === 'swap' ? this.tp.comboK : mk === 'heavy' || mk === 'branch' || mk === 'finisher' || mk === 'meteor' ? this.tp.heavyK : 1;
    f.moveT += dt * (f.speedT > 0 ? 1.15 : 1) * (f.awakenT > 0 && f.moveKind !== 'ultimate' ? WILL.awakenSpeed : 1) * talentK;
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
      // Ultimate-Evolution „Nachbeben“: um den Mittelpunkt des Einschlags (center vor der Figur)
      if (this.tp.aftershock > 0) {
        f.shockN = this.tp.aftershock;
        f.shockT = AFTERSHOCK_FIRST;
        f.shockX = f.x + Math.sin(f.yaw) * mv.ultimate.center;
        f.shockZ = f.z + Math.cos(f.yaw) * mv.ultimate.center;
      }
    }
    // Trefferfenster dieses Bilds
    if (!(mv.meteor && !f.grounded)) {
      const fk = st.faji && f.moveKind === 'skill' ? formPower(f.form).range : 1;
      // Schwungfenster von Techniken, Verzweigungen, Finishern und Meteor melden (Klingenwellen und Eruptionen der Darstellung)
      const swing = f.moveKind !== 'light' && f.moveKind !== 'air' && f.moveKind !== 'swap' && f.moveKind !== 'ultimate';
      // 4.6D: Kettenschläge (L1 – L5), Luft-Kette und Stilwechsel-Schlag melden ihr Schwungfenster als `slash` (Klingen-/Faustbogen)
      const slash = !swing && f.moveKind !== 'ultimate';
      for (let i = 0; i < mv.hits.length && i < MAX_TICKS; i++) {
        const h = mv.hits[i];
        const opens = (t0 < h.t0 && h.t0 <= t1) || (h.t0 === 0 && t0 === 0);
        if (swing && opens) this.events.push('swing', f.moveIdx, i);
        else if (slash && opens) this.events.push('slash', f.moveIdx, i);
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
    c.bonus = f.moveBonus * (f.willT > 0 ? 1 + f.willDmg : 1);
    c.style = st;
    c.fx = f.x; c.fz = f.z; c.fyaw = f.yaw;
    c.formK = st.faji && kind === 'skill' ? formPower(f.form).dmg : 1;
    c.penAdd = (f.aura === 2 ? Math.round(AURA.ironPen * this.tp.auraIronK) : 0) + (f.willT > 0 ? GEIST_VALUES.willePen : 0);
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
    if (lh && lh.launch >= 6 && f.moveKind !== 'ultimate') {
      f.chaseT = T.chaseWindow + this.tp.chaseAdd;
      // Talente: Auto-Verfolgung (Technik-Mutation oder Stil) – die Figur folgt ohne Dash, sobald das Ziel hoch genug ist
      if (mv.autoChase || this.tp.autoChase) f.autoChase = true;
    }
    // Ultimate-Evolution „Willens-Rausch“: drei und mehr Brüche/K.O. in einem Fenster laden die Willenskraft zusätzlich
    if (broke >= 3 && this.tp.multiKill > 0) this.addWill(this.tp.multiKill * (broke - 2));
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
    // 4.6H: Ultimate-Einschläge (Himmelssturz) liegen an Deck weiter vorn – gleiche Verschiebung wie die Darstellung
    const shift = f.moveKind === 'ultimate' ? this.ultShift : 0;
    // Sog: jedes Bild alle Ziele in der Form zum Mittelpunkt ziehen (auch schon getroffene)
    if (h.vortex > 0) {
      const cx = h.shape === 'circle' ? f.x + fx * (h.offset + shift) : f.x, cz = h.shape === 'circle' ? f.z + fz * (h.offset + shift) : f.z;
      const step = h.vortex * (1 / 60);
      for (let i = 0; i < this.poolN; i++) { const t = this.pool[i]; if (t.alive && inShape(f, h, t, fx, fz, rangeK, shift)) w.drag(t, cx, cz, step); }
    }
    const c = this.fillCtx(f.moveKind, tick);
    let landed = 0, broke = 0;
    for (let i = 0; i < this.poolN; i++) {
      const t = this.pool[i];
      if (!t.alive) continue;
      if ((h.maxTargets > 0 && mn >= h.maxTargets) || mn >= MAX_TICK_TARGETS) break;
      let seen = false;
      for (let k = 0; k < mn; k++) if (memo[k] === t.id) { seen = true; break; }
      if (seen || !inShape(f, h, t, fx, fz, rangeK, shift)) continue;
      memo[mn++] = t.id;
      // Iaijutsu: nur markieren, getroffen wird beim Einrasten der Klinge
      if (mark) { if (f.markN < MAX_MARKS) f.marks[f.markN++] = t.id; continue; }
      let dx = t.x - f.x, dz = t.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) { dx /= d; dz /= d; } else { dx = fx; dz = fz; }
      c.dirX = dx; c.dirZ = dz;
      c.chained = 0;
      // Talente: Hinrichtung in der Luft (Mutation oder Stil) – Bonus gegen Ziele in der Luft
      const exec = t.airborne ? (mv.airExec ?? 0) + this.tp.airExec : 0;
      c.bonus = (exec > 0 ? f.moveBonus * (1 + softCap(exec, TALENT_CAP.airDmg)) : f.moveBonus) * (f.willT > 0 ? 1 + f.willDmg : 1);
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
    // 4.6H: an einer Wand in der Luft – Wandsprung vormerken (Normale aus dem Herausschieben), Kantengriff auf Dach, Wehrgang oder Fels
    const ex = f.x - (px + dx), ez = f.z - (pz + dz), el = Math.hypot(ex, ez);
    if (el > 1e-3) {
      f.wallT = 0; f.wallNX = ex / el; f.wallNZ = ez / el;
      const ml = Math.hypot(dx, dz);
      if ((f.phase === 'air' || f.phase === 'dash') && f.vy <= T.ledgeVy && ml > 1e-5 && this.ledge(w, dx / ml, dz / ml)) return;
    }
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

  /**
   * 4.6H Kantengriff: liegt vor der Figur (Probe in Bewegungsrichtung) eine Fläche höher als eine Stufe, aber höchstens `ledgeReach` über den
   * Füßen, zieht sie sich hinauf (Dachtraufe, Wehrgang, Mauerkrone, Felsabsatz). Der Boden prüft den Platz oben wie einen Teleport.
   */
  private ledge(w: ActionWorld, dirX: number, dirZ: number): boolean {
    const f = this.f;
    const qx = f.x + dirX * T.ledgeProbe, qz = f.z + dirZ * T.ledgeProbe;
    // Höhenhinweis so, dass Flächen bis `ledgeReach` über den Füßen zählen (der Boden nimmt eine Stufe Spielraum dazu)
    const top = w.height(qx, qz, f.y + T.ledgeReach - T.stepUp);
    if (!Number.isFinite(top) || top <= f.y + T.stepUp || top > f.y + T.ledgeReach + 0.05) return false;
    const y0 = f.y;
    f.y = top;
    if (!w.teleport(f, qx, qz)) { f.y = y0; return false; }
    this.events.push('ledge', top - y0);
    this.land(top, w);
    return true;
  }

  private land(h: number, w: ActionWorld) {
    const f = this.f;
    const fall = -f.vy;
    f.y = h; f.vy = 0;
    f.grounded = true; f.airT = 0; f.jumps = 0; f.airDashes = 0; f.airIdx = 0; f.hover = 0;
    f.wallKicks = 0; f.wallT = 9;
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
export function inShape(f: { x: number; y: number; z: number; yaw: number }, h: ActionHit, t: Pick<ActionTarget, 'x' | 'y' | 'z' | 'radius' | 'height'>, fx = Math.sin(f.yaw), fz = Math.cos(f.yaw), rangeK = 1, shift = 0): boolean {
  if (t.y > f.y + h.up || t.y + t.height < f.y - h.down) return false;
  const dx = t.x - f.x, dz = t.z - f.z;
  const range = h.range * rangeK;
  if (h.shape === 'circle') {
    const cx = f.x + fx * (h.offset + shift), cz = f.z + fz * (h.offset + shift);
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
