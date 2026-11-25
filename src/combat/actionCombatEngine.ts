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

// ---------- Zustand ----------

export type FighterPhase = 'ground' | 'air' | 'move' | 'dash' | 'block' | 'cast' | 'hurt' | 'down';
export type MoveKind = 'light' | 'branch' | 'heavy' | 'air' | 'meteor' | 'finisher' | 'skill' | 'swap';

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
  };
}

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
}

export function makeInput(): ActionInput {
  return { moveX: 0, moveZ: 1, mag: 0, camYaw: 0, light: false, heavy: false, jump: false, dash: false, skill: 0, blockHeld: false, blockPressed: false, hardLockId: '', hardLockYaw: NaN };
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
  /** Platz in der eigenen Liste des Spiels */
  ref: number;
}

export function makeTargetPool(n: number): ActionTarget[] {
  return Array.from({ length: n }, () => ({ id: '', x: 0, y: 0, z: 0, radius: 0.5, height: 1.8, yaw: 0, alive: false, airborne: false, mass: false, broken: false, boss: false, ref: -1 }));
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
  /** Treffer anwenden (Schaden, Haltung, Rückstoß, Hochschleudern …); true = er saß (nicht geblockt) */
  hit(t: ActionTarget, h: ActionHit, m: ActionMove, ctx: HitContext): boolean;
  /** Geschoss(e) eines Fernangriffs */
  shoot(h: ActionHit, m: ActionMove, f: FighterState): void;
}

// ---------- Ereignisse ----------

export type ActionEventType =
  | 'move' | 'skill' | 'cutin' | 'cancel' | 'jump' | 'land' | 'fall' | 'dash' | 'perfect' | 'counter' | 'impact'
  | 'hitConfirm' | 'style' | 'lockLost' | 'staminaLow' | 'notReady' | 'buff' | 'parry' | 'blocked';

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
};

/** Suchradius der Ziele je Logikbild (größte Reichweite: Schockwellen bis 18 m) */
const QUERY_R = 20;
/** höchstens so viele Trefferfenster je Angriff und Ziele je Fenster (Trefferlisten) */
const MAX_TICKS = 16;
const MAX_TICK_TARGETS = 96;
/** Meteor: so lange hängt die Figur vor dem Sturz */
const METEOR_HANG = 0.12;

const kindCode: Record<MoveKind, number> = { light: 0, branch: 1, heavy: 2, air: 3, meteor: 4, finisher: 5, skill: 6, swap: 7 };
export const KIND_OF_CODE: readonly MoveKind[] = ['light', 'branch', 'heavy', 'air', 'meteor', 'finisher', 'skill', 'swap'];

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
    this.ctx = { dirX: 0, dirZ: 1, crit: 0, critAdd: 0, postureK: 1, tick: 0, kind: 'light', finisher: false, airborne: false, bonus: 1, style: ACTION_STYLES[f.style], fx: 0, fz: 0, fyaw: 0 };
  }

  get style(): ActionStyleDef { return ACTION_STYLES[this.f.style]; }
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
          if (w.hit(t, RIPOSTE, mv, c)) { f.hits++; f.hitT = T.hitReset; }
          break;
        }
      }
      this.events.push('counter', att ? 1 : 0);
      return 'counter';
    }
    if (f.perfectT > 0) {
      f.perfectT = 0;
      f.iframes = Math.max(f.iframes, 0.45);
      const ok = att ? this.behind(att, w) : false;
      f.counterT = T.counterWindow;
      this.events.push('perfect', ok ? 1 : 0, f.x, f.z);
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
    f.hover = dec(f.hover, dt); f.comboWindow = dec(f.comboWindow, dt); f.lockFree = dec(f.lockFree, dt); f.staminaFlash = dec(f.staminaFlash, dt);
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
    // Ziele in der Nähe (einmal je Bild) und Gültigkeit des weichen Ziels
    this.poolN = w.targets(f.x, f.z, QUERY_R, this.pool);
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
    // Dash: aus allem außer frühem Taumeln (Animation-Cancel); ein Dash kettet nach gut der Hälfte des vorigen
    if (this.wants(f.bufD) && (f.phase !== 'hurt' || f.hurtT < 0.15) && (f.phase !== 'dash' || f.dashT < f.dashDur * 0.45)) {
      if (this.tryDash(inp, st)) f.bufD = -1;
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
    f.iframes = Math.max(f.iframes, Math.max(T.dashIframes, st.perfectWindow));
    f.perfectT = st.perfectWindow;
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
    const t0 = f.moveT;
    f.moveT += dt * (f.speedT > 0 ? 1.15 : 1);
    // Meteor: in der Luft bleibt der Clip vor dem Einschlag stehen; der Treffer kommt beim Aufprall
    if (mv.meteor && !f.grounded) {
      const hold = mv.hits.length ? mv.hits[0].t0 - 0.02 : mv.dur * 0.5;
      if (f.moveT > hold) f.moveT = hold;
    }
    const t1 = f.moveT;
    const firstT0 = mv.hits.length ? mv.hits[0].t0 : mv.dur * 0.5;
    const firstT1 = mv.hits.length ? mv.hits[0].t1 : firstT0;
    const tg = f.lockId ? this.target(f.lockId) : null;
    // Ausrichten zum Ziel bis zum ersten Treffer
    if (tg && t0 <= firstT0 + 0.04) this.turnTo(Math.atan2(tg.x - f.x, tg.z - f.z), dt, 18);
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
    mx += f.kx * dt; mz += f.kz * dt;
    this.decayKnock(dt);
    if (mx !== 0 || mz !== 0) this.moveBody(w, mx, mz, impulse, f.moveSeq);
    // senkrecht: Luftangriffe tragen, Steiger (Launcher) fliegen frei, am Boden haften
    if (!f.grounded) this.airVertical(dt, w, mv);
    else this.groundFollow(dt, w);
    if (f.phase !== 'move' || this.move !== mv) return;
    // Trefferfenster dieses Bilds
    if (!(mv.meteor && !f.grounded)) {
      for (let i = 0; i < mv.hits.length && i < MAX_TICKS; i++) {
        const h = mv.hits[i];
        if (h.t0 > t1 || h.t1 <= t0) continue;
        if (h.projectile) { if (h.t0 > t0 - 1e-9 && h.t0 <= t1 + 1e-9 && !(t0 > h.t0)) w.shoot(h, mv, f); continue; }
        this.hitWindow(h, i, mv, w, st);
      }
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
    return c;
  }

  /** Ein Trefferfenster: alle Ziele in der Form, jedes höchstens einmal je Fenster */
  private hitWindow(h: ActionHit, tick: number, mv: ActionMove, w: ActionWorld, st: ActionStyleDef) {
    const f = this.f;
    const memo = this.memo[tick];
    let mn = this.memoN[tick];
    const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
    const c = this.fillCtx(f.moveKind, tick);
    let landed = 0;
    for (let i = 0; i < this.poolN; i++) {
      const t = this.pool[i];
      if (!t.alive) continue;
      if ((h.maxTargets > 0 && mn >= h.maxTargets) || mn >= MAX_TICK_TARGETS) break;
      let seen = false;
      for (let k = 0; k < mn; k++) if (memo[k] === t.id) { seen = true; break; }
      if (seen || !inShape(f, h, t, fx, fz)) continue;
      memo[mn++] = t.id;
      let dx = t.x - f.x, dz = t.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) { dx /= d; dz /= d; } else { dx = fx; dz = fz; }
      c.dirX = dx; c.dirZ = dz;
      if (w.hit(t, h, mv, c)) landed++;
    }
    this.memoN[tick] = mn;
    if (landed > 0) {
      f.hits += landed;
      f.hitT = T.hitReset;
      f.moveHits += landed;
      if (f.hits > f.maxHits) f.maxHits = f.hits;
      // Lufttreffer: kurz schweben (verlangsamter Fall), damit die Luft-Kombo trägt
      if (!f.grounded && (mv.air || f.moveKind === 'skill')) { f.vy = Math.max(f.vy, T.airHitVy); f.hover = T.airHitHover; }
      if (f.counterT > 0) f.counterT = 0;
      this.events.push('hitConfirm', landed, f.hits, tick);
    }
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
export function inShape(f: { x: number; y: number; z: number; yaw: number }, h: ActionHit, t: ActionTarget, fx = Math.sin(f.yaw), fz = Math.cos(f.yaw)): boolean {
  if (t.y > f.y + h.up || t.y + t.height < f.y - h.down) return false;
  const dx = t.x - f.x, dz = t.z - f.z;
  if (h.shape === 'circle') {
    const cx = f.x + fx * h.offset, cz = f.z + fz * h.offset;
    const d = Math.hypot(t.x - cx, t.z - cz);
    if (d > h.range + t.radius) return false;
    return h.inner <= 0 || d >= h.inner - t.radius;
  }
  if (h.shape === 'line') {
    const along = dx * fx + dz * fz;
    if (along < -t.radius - 0.3 || along > h.range + t.radius) return false;
    return Math.abs(dx * fz - dz * fx) <= h.width * 0.5 + t.radius;
  }
  const d = Math.hypot(dx, dz);
  if (d > h.range + t.radius) return false;
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
