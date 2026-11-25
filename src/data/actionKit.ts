// Phase 4.6A/4.6B – Baukasten der Action-Kampf-Engine: Datentypen, Engine-Konstanten, gemessene Clips und die Helfer, aus denen alle Stile,
// Faji-Künste und Ultimates entstehen (reine Daten, ohne three.js und ohne Zufall). Die Stile selbst stehen in `actionStyles.ts` (Waffen),
// `fajiArts.ts` (acht Faji-Künste mit Formstufen) und `cataclysms.ts` (14 Kataklysmus-Ultimates).
import type { StyleId } from './animations';
import type { FxKind } from './combat';

export type ActionStyleId =
  | 'zweihaender' | 'saebel' | 'doppel' | 'langklinge' | 'sturmfaust' | 'erdspalter' | 'effekt'
  | 'schwarzloch' | 'feuer' | 'eis' | 'wasser' | 'wind' | 'blitz' | 'sonne' | 'mond';
/** Die sechs physischen Stile in der Reihenfolge des Stilwechsels (Taste Q) */
export const PHYSICAL_STYLES: readonly ActionStyleId[] = ['zweihaender', 'saebel', 'doppel', 'langklinge', 'sturmfaust', 'erdspalter'];
/** Die acht waffenlosen Faji-Künste (Phase 4.6B): Elementar- und Gravitationsformen mit sieben Formstufen */
export const FAJI_ARTS: readonly ActionStyleId[] = ['schwarzloch', 'feuer', 'eis', 'wasser', 'wind', 'blitz', 'sonne', 'mond'];
export const ACTION_STYLE_IDS: readonly ActionStyleId[] = [...PHYSICAL_STYLES, 'effekt', ...FAJI_ARTS];

// ---------- Engine-Konstanten ----------

/** Alle Zeiten in Sekunden, Strecken in Metern, Tempo in m/s */
export const ACTION_TUNING = {
  /** Eingabepuffer: so lange bleibt ein zu früh gedrückter Knopf gültig */
  bufferS: 0.16,
  /** Magnet-Schritt: höchstens so weit gleitet die Figur je Angriff zum Ziel; Suchradius und halber Kegel (rad) des weichen Ziels */
  magnetMax: 3.5,
  magnetRange: 6.5,
  magnetCone: 1.05,
  magnetSpeed: 18,
  /** Kameradrehung (rad/s), ab der das weiche Ziel sofort gelöst wird, und wie lange danach keins gewählt wird */
  lockReleaseTurn: 2.4,
  lockReleaseHold: 0.5,
  /** Zielwechsel: weiter als das entfernt verliert die Figur ihr weiches Ziel */
  lockDrop: 10,
  /** Schwerkraft, Sprungtempo (erster und weitere Sprünge), Fallgrenze */
  gravity: 26,
  jumpV: 8.8,
  doubleJumpV: 8.2,
  maxFall: 34,
  /** Nach dem Verlassen einer Kante darf noch so lange normal gesprungen werden */
  coyote: 0.12,
  /** Bodenhaftung: kleine Absätze folgt die Figur, darüber beginnt ein Fall; höchste Kante, die man in der Luft „mitnimmt“ */
  stepDown: 0.65,
  stepUp: 0.55,
  /** Laufen am Boden und Steuerung in der Luft */
  walk: 2.4,
  run: 6.2,
  airSpeed: 6.0,
  airControl: 6,
  /** Ausweichen (Dash): Unverwundbarkeit, Ausdauerkosten (am Boden / in der Luft), Tempo-Faktor des Luft-Dashs, Mindesttempo am Ende */
  dashIframes: 0.2,
  airDashK: 1.2,
  dashTail: 0.45,
  dashCost: 14,
  airDashCost: 10,
  /** Perfektes Ausweichen (Sturm-Schritt): Fenster vor dem Treffer, Abstand hinter dem Angreifer, Konterfenster und Krit-Faktor */
  perfectWindow: 0.18,
  behindDist: 1.15,
  counterWindow: 1.3,
  counterCrit: 1.8,
  /** Luft-Kombo: verlangsamter Fall nach einem Lufttreffer (Dauer, Schwerkraft-Anteil, Steigtempo) */
  airHitHover: 0.34,
  hoverGravityK: 0.16,
  airHitVy: 1.4,
  /** Luftangriffe tragen die Figur (Schwerkraft-Anteil während eines Luftangriffs) */
  airMoveGravityK: 0.25,
  /** Meteor-Sturzangriff: Falltempo */
  meteorV: -27,
  /** So lange bleibt eine Kette nach dem letzten Schlag offen */
  comboWindow: 0.5,
  /** Trefferzähler („HIT!“) erlischt nach so vielen Sekunden ohne Treffer */
  hitReset: 2.4,
  /** Haltungsbruch-Finisher: so nah muss das taumelnde Ziel stehen; so lange bleibt „Schwer“ dann gepuffert */
  finisherRange: 4.6,
  finisherBuffer: 0.4,
  /** Ausdauer: Höchstwert, Nachladen (laufend / im Stand), Pause nach Verbrauch */
  stamina: 100,
  staminaRegen: 34,
  staminaRegenIdle: 50,
  staminaDelay: 0.5,
  /** Perfekte Parade nach Drücken von Blocken (s) und Tempo im Block */
  parryWindow: 0.22,
  blockSpeed: 1.2,
  /** Laufbewegung nach dem Treffer bricht den Ausschwung ab (Stick-Auslenkung, Zeit nach dem letzten Treffer) */
  recoverCancelMag: 0.35,
  recoverCancelAfter: 0.08,
  /**
   * Vorwärts-Momentum (4.6C): der Schub einer Schlagstufe beginnt so lange vor ihrem ersten Schwungfenster und endet so lange danach (s);
   * vor einem einzelnen Ziel darf die Figur höchstens so weit (m) „in“ den Gegner hineingleiten (er weicht durch den Rückstoß ohnehin).
   */
  pushLead: 0.08,
  pushTail: 0.06,
  pushGap: 0.3,
  /**
   * Sturm-Verfolgung (4.6C): so lange nach einem Hochschleudern bringt ein Dash die Figur per Blitz-Teleport zum Ziel in der Luft;
   * Reichweite (m), Abstand neben dem Ziel, Mindesthöhe des Ziels über der Figur (sonst normaler Dash).
   */
  chaseWindow: 1.6,
  chaseRange: 16,
  chaseOffset: 1.1,
  chaseMinRise: 0.9,
  /** Klingen-Clash (4.6C): Rückstoß der Figur (m/s), Haltungsfaktor des Clash-Treffers, Ausrichtung des Gegners zur Figur (Kosinus) */
  clashRecoil: 6.5,
  clashPosture: 2.4,
  clashFacing: 0.25,
} as const;

/**
 * Haltung (Posture) der Elite-Truppen, Insel-Kommandanten, Königs- und Kaiser-Endbosse: Leiste unter den Lebenspunkten. Bricht sie, taumelt
 * das Ziel (`stagger`) und ist offen für den Haltungsbruch-Finisher. Normale Gegner behalten ihr kurzes Taumeln aus `EnemyDef.poise`.
 */
export const POSTURE = {
  /** Sekunden ohne Treffer, bis die Leiste wieder lädt, und Ladetempo (Anteil des Maximums je Sekunde) */
  regenDelay: 3,
  regenRate: 0.07,
  /** Taumeln nach dem Bruch: Elite und Kommandanten / Endbosse (Bosse nutzen `BOSS.breakTime`) */
  staggerElite: 2.6,
  /** Schadensfaktor des Finishers (vor Rüstung und Anti-One-Shot-Grenze) */
  finisherDmg: 5,
} as const;

// ---------- Datentypen ----------

export type HitShape = 'arc' | 'circle' | 'line';

/** Form des Geschosses in der Darstellung (Kugel, Mondsichel, Flamme, Frost, Blitz, Wind, Wasser, Sonne, Finsternis) */
export type ProjectileKind = 'orb' | 'crescent' | 'flame' | 'frost' | 'bolt' | 'wind' | 'water' | 'sun' | 'void';
export interface ActionProjectile { speed: number; radius: number; color: string; pierce: boolean; count: number; spread: number; kind: ProjectileKind }

/** Zustand, den ein Treffer hinterlässt: Brand, Frost (einfrieren), Verlangsamung, Schock, Rüstungsbrand (Sonne: Rüstung und Heilung
 *  durchgebrannt), Aura-Bann (Schwarzes Loch: gegnerische Auren erlöschen), Furcht */
export type HitStatus = '' | 'burn' | 'freeze' | 'slow' | 'shock' | 'sunder' | 'suppress' | 'fear';

/** Ein Trefferfenster eines Angriffs (Sekunden ab Beginn des Angriffs) */
export interface ActionHit {
  t0: number; t1: number;
  shape: HitShape;
  /** Reichweite (Bogen, Kreis) bzw. Länge (Linie); Öffnungswinkel des Bogens (rad, ≥ 6,2 = rundum); Breite der Linie */
  range: number; arc: number; width: number;
  /** Kreis: Mittelpunkt so weit vor der Figur; Ring: innerer Radius (darin sicher) */
  offset: number; inner: number;
  /** Höhenband um die Füße der Figur (m nach oben/unten): Bodenhiebe treffen tief Jongliertes, Luftangriffe um die eigene Höhe */
  up: number; down: number;
  /** Schaden (Faktor auf den Grundangriff), Haltungsschaden, Rückstoß (m/s) */
  dmg: number; poise: number; knock: number;
  /** Ziel am Boden hochschleudern (Steigtempo) / Ziel in der Luft halten (Steigtempo) / Truppen wegschleudern (Wucht) */
  launch: number; juggle: number; fling: number;
  /** knackt Blockhaltung und Deckung (Schildbrecher) · zieht das Ziel vor die Figur (Greifwurf) · zusätzliche Waffenstufe gegen Rüstung */
  breakGuard: boolean; pull: boolean; pen: number;
  /** höchstens so viele Ziele je Fenster (0 = alle) */
  maxTargets: number;
  hitstop: number; shake: number; fx: FxKind;
  projectile: ActionProjectile | null;
  /** wandernde Front (Schockwellen): die Reichweite wächst im Fenster von 0 auf `range`; ein Ziel wird getroffen, sobald die Front es erreicht */
  grow: boolean;
  /** Zustand auf dem Ziel und seine Dauer (s) */
  status: HitStatus; statusDur: number;
  /** Kettenblitz: springt nach einem Treffer auf so viele weitere Ziele (je höchstens `chainRange` m weiter, jeder Sprung 70 % Schaden) */
  chain: number; chainRange: number;
  /** Sog zum Mittelpunkt der Form (m/s je Bild im Fenster; Schwarzes Loch, Strudel) */
  vortex: number;
  /** verzögerter Treffer (Iaijutsu): im Fenster werden Ziele nur markiert; zur Zeit `delayTo` (s im Angriff) treffen alle zugleich */
  delayTo: number;
  /** Element/Effekt für die Darstellung ('' = Stilfarbe) */
  vfx: string;
}

export type BuffKind = 'hyper' | 'crit' | 'poise' | 'speed';

export interface ActionMove {
  /** eindeutige Kennung (`<stil>.<name>`) und Anzeigename */
  id: string; label: string;
  clip: string; clipFrom: number; clipTo: number;
  dur: number;
  /** ab hier setzt der nächste Kettenschritt / eine Technik an (der Eingabepuffer greift davor) */
  cancel: number;
  hits: ActionHit[];
  /** Vorwärtsschritt ohne Ziel (m/s, bis zum ersten Treffer) · Magnet-Schritt zum weichen Ziel */
  lunge: number; magnet: boolean;
  /**
   * Vorwärts-Momentum (4.6C, m): die Schlagstufe treibt die Figur mit einer knackigen Beschleunigungskurve (schnell an, weich aus) vor –
   * durch Verbände hindurch, vor einem einzelnen Ziel bis kurz davor. 0 = kein Schub.
   */
  push: number;
  /** läuft in der Luft · Steigtempo beim Start · Hyper-Armor · Meteor (Sturz bis zum Boden, Treffer beim Aufprall) */
  air: boolean; rise: number; hyper: boolean; meteor: boolean;
  /**
   * Schweben nach dem Aufstieg (4.6C, s): so lange wirkt nur ein Bruchteil der Schwerkraft (`hoverGravityK`), die Figur hängt in der Luft
   * (Blitz-Ultimate unter der Gewitterwolke). Bei Ultimates beginnen Aufstieg und Schweben erst nach der Zwischensequenz.
   */
  hang: number;
  /** Vorstoß zu Beginn: so weit (m) in so vielen Sekunden (Zieh-Schnitt, Sprungtritt); `through` = quer durch die Gegner statt davor stehen; Unverwundbarkeit ab Start */
  dashTo: number; dashTime: number; through: boolean; iframes: number;
  /** Konterhaltung (s): ein Treffer in dieser Zeit wird zum perfekten Konter */
  counter: number;
  buff: { kind: BuffKind; dur: number } | null;
  /** auch in der Luft nutzbar (Techniken) */
  airOk: boolean;
  /** Flächen-Finisher-Effekte · Cut-in-Schriftzug · Nachbilder · eigene Akzentfarbe ('' = Stilfarbe) */
  finisher: boolean; cutin: string; afterimage: boolean; color: string;
  /** Faji-Kunst: ab dieser Formstufe nutzbar (1 … 7); Waffenstile 1 */
  formMin: number;
  /** Element/Effekt der Darstellung ('' = Stilfarbe) */
  vfx: string;
  /** Kataklysmus-Ultimate (Zwischensequenz, Welt-Effekt); null bei allen anderen Angriffen */
  ultimate: UltimateSpec | null;
  /**
   * Talent-Mutationen (4.6E, `combat/talentCombat.ts`): Hinrichtung in der Luft (Schadensbonus gegen Ziele in der Luft) und Auto-Verfolgung
   * (nach einem Hochschleudern teleportiert die Figur ohne Dash zum Ziel). Fehlen sie, gilt 0 bzw. aus.
   */
  airExec?: number;
  autoChase?: boolean;
}

/** Welt-Effekt eines Ultimates (Darstellung und Wirkung auf Schiffe, Meer und Massen: `world/cataclysmDirector.ts`) */
export type CataclysmKind =
  | 'horizonCut' | 'sevenSeas' | 'sawCyclone' | 'iaiWorldBreak' | 'fistStorm' | 'oceanSplit' | 'blackHole'
  | 'fireDragons' | 'glacier' | 'floodDragon' | 'vacuumStorm' | 'thunderJudgment' | 'sunDance' | 'bloodMoon'
  /** 4.6E: das 15. Ultimate (Kosmos, Stufe 101) – Himmelssturz: Zwillings-Meteoriten & Planeten-Kollaps */
  | 'skyfall';

/**
 * Wie ein Ultimate Schiffe zerstört: quer zerteilt (Bug/Heck), längs (Backbord/Steuerbord), schräg, radial (Sog), kentern (rollt um und
 * versinkt, 4.6C) oder durchlöchert versenken (ganz, 4.6C); '' = gar nicht
 */
export type ShipCut = '' | 'cross' | 'length' | 'diagonal' | 'radial' | 'capsize' | 'sink';

export interface UltimateSpec {
  kind: CataclysmKind;
  /** Zwischensequenz: Aufladen in Spielzeit (unter der Zeitlupe 0,14 ≈ 0,75 s echt), Kamera-Einstellung, Zahl der Impact-Frames (2 … 4) */
  charge: number;
  shot: 'face' | 'low' | 'side' | 'sky';
  frames: number;
  /** großer Einschlag (s im Angriff nach dem Aufladen): Impact-Frames, Welt-Effekt, Schiffe */
  strikeAt: number;
  /** Welt-Effekt: Reichweite nach vorn bzw. Radius, Breite der Welle/des Pfads, Mittelpunkt vor der Figur (m) */
  reach: number; width: number; center: number;
  /** Schiffe zerteilen und wie */
  splitShips: ShipCut;
  /** Ozean-Spaltung: halbe Breite des Grabens (m); 0 = keine */
  trench: number;
  /** Sog auf Schiffe (m/s) im Radius `reach` (Schwarzes Loch) */
  shipPull: number;
  /** Farben der Darstellung */
  color: string; accent: string;
}

export interface ActionSkill extends ActionMove {
  slot: 1 | 2 | 3 | 4;
  /** Kurzname für Knopf und Leiste, Beschreibung, Abklingzeit (s), Symbol (Zeichen) */
  short: string; desc: string; cd: number; icon: string;
}

export interface ActionStyleDef {
  id: ActionStyleId;
  label: string;
  /** Untertitel („Korsaren-Souverän“) und kurze Beschreibung für Anzeige und Kompendium */
  title: string; desc: string;
  color: string; accent: string;
  /** Waffe und Ruhehaltung der Figur (Darstellung) */
  visual: StyleId;
  idleClip: string;
  /** Leicht-Kette; der letzte Schritt ist der Flächen-Finisher */
  light: ActionMove[];
  /** Verzweigungen nach L ×1 … ×4 */
  branch: [ActionMove, ActionMove, ActionMove, ActionMove];
  /** Schwer aus dem Stand */
  heavy: ActionMove;
  /** Luft-Kette und Meteor (Schwer in der Luft) */
  air: ActionMove[];
  meteor: ActionMove;
  /** Haltungsbruch-Finisher (Schwer nahe einem taumelnden Elite-Gegner oder Boss) */
  finisher: ActionMove;
  skills: [ActionSkill, ActionSkill, ActionSkill, ActionSkill];
  /** Sprünge (2 = Doppelsprung) und Luft-Dashes je Flug, Dash-Tempo und -Dauer */
  jumps: number; airDashes: number; dashSpeed: number; dashTime: number;
  /** Fenster des perfekten Ausweichens (Langklinge länger) */
  perfectWindow: number;
  /** Krit-Faktor und zusätzliche Krit-Chance (Säbel), zusätzliche Waffenstufe gegen Rüstung (Langklinge), Haltungsschaden-Faktor */
  critMult: number; critBonus: number; penBonus: number; postureK: number;
  physical: boolean;
  /** Waffenlose Faji-Kunst mit sieben Formstufen (Phase 4.6B) */
  faji: boolean;
  /** Element der Darstellung (Wellen, Geschosse, Aura) */
  element: string;
  /** Energiewelle, die im Sturm-Erwachen jeden normalen Schlag begleitet */
  awakenWave: ActionHit;
  /** Kataklysmus-Ultimate des Stils (Faji-Künste: die 7. Form); null = keins */
  ultimate: ActionMove | null;
}

// ---------- Clips: Dauer (s) und Schwungfenster (Anteil) ----------

/** Dauer und Schwungfenster der KayKit-Clips (gemessen); daraus folgen die Trefferfenster, damit Klinge und Treffer zusammenfallen */
export const CLIP_SWING: Record<string, readonly [dur: number, s0: number, s1: number]> = {
  Melee_1H_Attack_Chop: [1.04, 0.32, 0.5],
  Melee_1H_Attack_Jump_Chop: [1.33, 0.45, 0.62],
  Melee_1H_Attack_Slice_Diagonal: [1.0, 0.3, 0.5],
  Melee_1H_Attack_Slice_Horizontal: [1.33, 0.3, 0.52],
  Melee_1H_Attack_Stab: [1.58, 0.35, 0.5],
  Melee_2H_Attack_Chop: [1.62, 0.4, 0.57],
  Melee_2H_Attack_Slice: [1.08, 0.31, 0.53],
  Melee_2H_Attack_Spin: [2.38, 0.2, 0.75],
  Melee_2H_Attack_Spinning: [0.67, 0.1, 0.85],
  Melee_2H_Attack_Stab: [1.58, 0.35, 0.5],
  Melee_Dualwield_Attack_Chop: [1.25, 0.3, 0.55],
  Melee_Dualwield_Attack_Slice: [1.17, 0.25, 0.55],
  Melee_Dualwield_Attack_Stab: [1.58, 0.3, 0.5],
  Melee_Unarmed_Attack_Kick: [0.92, 0.3, 0.5],
  Melee_Unarmed_Attack_Punch_A: [1.17, 0.25, 0.45],
  Melee_Block_Attack: [1.04, 0.3, 0.5],
  Ranged_Magic_Raise: [2.08, 0.5, 0.65],
  Ranged_Magic_Shoot: [0.92, 0.35, 0.62],
  Ranged_Magic_Spellcasting: [0.67, 0.4, 0.66],
  Throw: [1.33, 0.42, 0.58],
  PickUp: [1.29, 0.3, 0.5],
  Jump_Full_Short: [1.17, 0.35, 0.6],
  Spawn_Air: [1.29, 0.55, 0.75],
};

// ---------- Baukasten ----------

export const H0: ActionHit = {
  t0: 0, t1: 0, shape: 'arc', range: 2.6, arc: 2.4, width: 2, offset: 0, inner: 0, up: 2.4, down: 0.8,
  dmg: 1, poise: 10, knock: 3, launch: 0, juggle: 0, fling: 0, breakGuard: false, pull: false, pen: 0, maxTargets: 0,
  hitstop: 0.05, shake: 0.15, fx: 'slash', projectile: null,
  grow: false, status: '', statusDur: 0, chain: 0, chainRange: 6, vortex: 0, delayTo: 0, vfx: '',
};

/** Treffer-Eingabe: `at` = Fenster als Anteil der Dauer (fehlt es, gilt das Schwungfenster des Clips) */
export type HitIn = Partial<Omit<ActionHit, 't0' | 't1'>> & { at?: readonly [number, number] };
export type MoveIn = Partial<Omit<ActionMove, 'hits' | 'cancel'>> & Pick<ActionMove, 'id' | 'label' | 'clip' | 'dur'> & {
  hits?: HitIn[];
  /** Abschnitt des Clips als Anteil (Standard: vom Ausholen bis kurz nach dem Schwung) */
  from?: number; to?: number;
  /** eigener Ansatzpunkt der Kette als Anteil der Dauer */
  cancelAt?: number;
};

/** Schwungfenster eines Clips im genutzten Abschnitt [from, to] als Anteil der Angriffsdauer */
function syncedWindow(clip: string, from: number, to: number): [number, number] {
  const c = CLIP_SWING[clip];
  if (!c) return [0.35, 0.55];
  const span = Math.max(0.05, to - from);
  const u0 = Math.min(0.9, Math.max(0.02, (c[1] - from) / span));
  const u1 = Math.min(0.98, Math.max(u0 + 0.05, (c[2] - from) / span));
  return [u0, u1];
}

export function move(o: MoveIn): ActionMove {
  const c = CLIP_SWING[o.clip];
  const from = o.from ?? (c ? Math.max(0, c[1] - 0.26) : 0);
  const to = o.to ?? (c ? Math.min(1, c[2] + 0.3) : 1);
  const win = syncedWindow(o.clip, from, to);
  const hits: ActionHit[] = (o.hits ?? []).map((h) => {
    const at = h.at ?? win;
    const { at: _a, ...rest } = h;
    void _a;
    return { ...H0, ...rest, t0: at[0] * o.dur, t1: at[1] * o.dur };
  });
  // Ansatzpunkt der Kette: kurz nachdem das letzte Fenster aufgeht (der Treffer sitzt, die nächste Bewegung blendet schon über)
  const last = hits.length ? hits[hits.length - 1] : null;
  const cancel = o.cancelAt !== undefined ? o.cancelAt * o.dur : last ? Math.min(o.dur, last.t0 + Math.min(0.07, Math.max(0.02, last.t1 - last.t0))) : o.dur * 0.6;
  const { hits: _h, from: _f, to: _t, cancelAt: _c, ...rest } = o;
  void _h; void _f; void _t; void _c;
  return {
    clipFrom: from, clipTo: to, cancel,
    lunge: 2, magnet: true, push: 0, air: false, rise: 0, hang: 0, hyper: false, meteor: false,
    dashTo: 0, dashTime: 0.18, through: false, iframes: 0, counter: 0, buff: null, airOk: false,
    finisher: false, cutin: '', afterimage: false, color: '', formMin: 1, vfx: '', ultimate: null,
    ...rest, hits,
  };
}

/** `n` gleichmäßig verteilte Fenster zwischen den Anteilen a und b (Wirbel, Schlaghagel) */
export function ticks(n: number, a: number, b: number, h: HitIn, last?: HitIn): HitIn[] {
  const out: HitIn[] = [];
  const step = (b - a) / n;
  for (let i = 0; i < n; i++) {
    const s = a + step * i;
    out.push({ ...h, ...(i === n - 1 && last ? last : {}), at: [s, Math.min(b, s + step * 0.8)] });
  }
  return out;
}

export type SkillIn = MoveIn & Pick<ActionSkill, 'slot' | 'short' | 'desc' | 'cd' | 'icon'>;
export const skill = (o: SkillIn): ActionSkill => ({ ...move(o), slot: o.slot, short: o.short, desc: o.desc, cd: o.cd, icon: o.icon });

// gemeinsame Formen
export const AIR: HitIn = { up: 2.1, down: 2.3, juggle: 3.4, knock: 1.2 };
export const ROUND = 6.3;

/** Geschoss eines Fernangriffs */
export const shot = (color: string, speed = 28, radius = 0.6, pierce = false, count = 1, spread = 0, kind: ProjectileKind = 'orb'): ActionProjectile => ({ speed, radius, color, pierce, count, spread, kind });

/** Energiewelle des Sturm-Erwachens: wandernde Linie vor der Figur (begleitet jeden normalen Schlag) */
export function awakenWave(o: HitIn = {}): ActionHit {
  return { ...H0, shape: 'line', range: 9, width: 2.2, dmg: 0.32, poise: 6, knock: 3, fling: 4, grow: true, hitstop: 0.02, shake: 0.08, fx: 'magic', ...o, t0: 0, t1: 0.18 };
}
