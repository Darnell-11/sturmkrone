// Phase 4.6B – die 14 Kataklysmus-Ultimates (sechs Waffenstile + die 7. Form der acht Faji-Künste) als reine Daten.
// Jedes Ultimate ist ein `ActionMove` mit `ultimate`-Angabe: Aufladen unter der Zeitlupe (Mini-Zwischensequenz, `graphics/animeImpactRig.ts`),
// großer Einschlag mit Impact-Frames, Treffer der Engine auf Kämpfer und Verbände und ein Welt-Effekt (`world/cataclysmDirector.ts`):
// Schiffe zerteilen, Meer spalten, Schiffe ansaugen. Ultimates gibt es nur im Sturm-Erwachen, einmal je Erwachen.
// Endboss-Schutz: ein Ultimate zählt gegen Endbosse wie EIN Treffer (Summe gedeckelt, `ultimateBossCap`), bricht aber sofort die Haltung.
import { ROUND, move, ticks, type ActionMove, type ActionStyleId, type HitIn, type UltimateSpec } from './actionKit';
import { KAISER_BOSS_HIT_CAP, RAID_BOSS_HIT_CAP, ULTIMATE_BOSS_CAP, type DangerTier } from './balanceConfig';

/** Zeitlupe der Zwischensequenz (Anteil der Spielzeit) und ihre Dauer in echten Sekunden; Aufladen in Spielzeit = beides multipliziert */
export const CUTSCENE = { slow: 0.14, slowDur: 0.75, minDur: 0.65, maxDur: 0.85 } as const;
/** Aufladen eines Ultimates in Spielzeit: so lange dauert die Zeitlupe der Zwischensequenz */
export const ULT_CHARGE = CUTSCENE.slow * CUTSCENE.slowDur;

type UltIn = Omit<UltimateSpec, 'charge' | 'shot' | 'frames' | 'center' | 'splitShips' | 'trench' | 'shipPull'> & Partial<Pick<UltimateSpec, 'shot' | 'frames' | 'center' | 'splitShips' | 'trench' | 'shipPull'>>;

/** Grundform aller Treffer eines Ultimates: groß, wuchtig, immer mit Haltungsschaden, nie geblockt */
const U: HitIn = { breakGuard: true, poise: 60, knock: 10, hitstop: 0.06, shake: 0.5, fx: 'heavy', up: 6, down: 3 };

function ult(id: string, label: string, clip: string, dur: number, u: UltIn, hits: HitIn[], extra: Partial<ActionMove> & { from?: number; to?: number } = {}): ActionMove {
  const spec: UltimateSpec = { charge: ULT_CHARGE, shot: 'face', frames: 3, center: 0, splitShips: '', trench: 0, shipPull: 0, ...u };
  const m = move({
    id, label, clip, dur, magnet: false, lunge: 0, hyper: true, iframes: dur + 0.3, cutin: label, color: u.color, vfx: u.kind,
    hits: hits.map((h) => ({ ...U, ...h })), ...extra,
  });
  m.ultimate = spec;
  // Ultimates setzen die Kette nie fort: der Ansatzpunkt liegt am Ende (Dash und Sprung brechen nach dem Einschlag ab)
  m.cancel = Math.max(m.cancel, Math.min(dur, spec.strikeAt + 0.25));
  return m;
}

/** Ultimate je Stil (Faji-Künste: ihre 7. Form, `formMin` 7) */
export const ULTIMATES: Partial<Record<ActionStyleId, ActionMove>> = {
  zweihaender: ult('zweihaender.u', 'Himmelsspalter: Horizont-Zäsur', 'Melee_2H_Attack_Chop', 1.7,
    { kind: 'horizonCut', strikeAt: 0.42, reach: 150, width: 180, splitShips: 'cross', color: '#FFE2B0', accent: '#FF8A3A', frames: 3 },
    [{ shape: 'line', range: 150, width: 180, grow: true, at: [0.25, 0.75], dmg: 7, poise: 220, knock: 16, launch: 7, fling: 20, hitstop: 0.12, shake: 1.2, vfx: 'klinge' }]),

  saebel: ult('saebel.u', 'Souverän-Orkan: Sieben-Meere-Zäsur', 'Melee_1H_Attack_Jump_Chop', 2.2,
    // 4.6D: Akzent golden-rot statt violett (aus großer Höhe überstrahlte das Violett das ganze Bild); Violett bleibt nur im dunklen Mantel
    { kind: 'sevenSeas', strikeAt: 0.95, reach: 46, width: 34, center: 20, shot: 'sky', color: '#FFD27A', accent: '#FF3A2A', frames: 3 },
    [
      ...ticks(5, 0.3, 0.6, { shape: 'circle', offset: 14, range: 10, dmg: 0.55, poise: 30, knock: 6, status: 'shock', statusDur: 1.5, vfx: 'blitz' }),
      ...ticks(3, 0.62, 0.86, { shape: 'circle', offset: 20, range: 16, dmg: 1.4, poise: 60, knock: 14, fling: 16, launch: 5, vfx: 'kanone' }, { hitstop: 0.12, shake: 1.1 }),
    ], { rise: 13, airOk: true, from: 0.05, to: 0.95 }),

  doppel: ult('doppel.u', 'Klingen-Zyklon: Tausend-Schnitt-Wirbel', 'Melee_2H_Attack_Spinning', 2.3,
    { kind: 'sawCyclone', strikeAt: 0.3, reach: 42, width: 9, splitShips: 'length', color: '#C8FFE8', accent: '#3AE0A8', frames: 2 },
    ticks(14, 0.08, 0.86, { shape: 'arc', arc: ROUND, range: 3.8, dmg: 0.48, poise: 22, knock: 5, fling: 9, hitstop: 0.02, shake: 0.3, vfx: 'wind' }, { dmg: 1.2, knock: 14, fling: 18, hitstop: 0.1, shake: 0.8 }),
    { dashTo: 40, dashTime: 1.7, through: true, from: 0, to: 1, afterimage: true }),

  langklinge: ult('langklinge.u', 'Lautloser Blitz: Iaijutsu-Weltenbruch', 'Crouching', 2.4,
    { kind: 'iaiWorldBreak', strikeAt: 1.75, reach: 34, width: 7, splitShips: 'diagonal', shot: 'side', color: '#E6F4FF', accent: '#8AC8FF', frames: 4 },
    // im Vorstoß nur markieren, beim Einrasten der Klinge (1,75 s) zerbricht alles Durchquerte zugleich
    [{ shape: 'line', range: 4.5, width: 4, at: [0.0, 0.2], delayTo: 1.75, dmg: 9, poise: 260, pen: 3, knock: 12, fling: 16, hitstop: 0.2, shake: 1.2, vfx: 'mond' }],
    { dashTo: 32, dashTime: 0.2, through: true, from: 0.1, to: 0.6, afterimage: true }),

  sturmfaust: ult('sturmfaust.u', 'Sturmfaust-Stakkato: Zehntausend-Hiebe-Orkan', 'Melee_Unarmed_Attack_Punch_A', 2.0,
    { kind: 'fistStorm', strikeAt: 0.2, reach: 28, width: 16, color: '#FFB45A', accent: '#FFE07A', frames: 2 },
    ticks(22, 0.06, 0.82, { shape: 'arc', arc: 1.3, range: 16, dmg: 0.3, poise: 14, knock: 3, fling: 6, hitstop: 0.01, shake: 0.25, vfx: 'blitz' }, { dmg: 1.4, knock: 16, fling: 20, launch: 6, hitstop: 0.14, shake: 1.1 }),
    { from: 0.1, to: 0.7, afterimage: true }),

  erdspalter: ult('erdspalter.u', 'Erdspalter-Beben: Ozean-Teilung', 'Melee_2H_Attack_Chop', 2.0,
    { kind: 'oceanSplit', strikeAt: 0.45, reach: 110, width: 16, trench: 9, color: '#E0B88A', accent: '#C8783A', frames: 3 },
    [{ shape: 'line', range: 110, width: 16, grow: true, at: [0.28, 0.8], dmg: 6.5, poise: 220, knock: 14, launch: 9, fling: 22, hitstop: 0.12, shake: 1.3, vfx: 'erde' }]),

  schwarzloch: ult('schwarzloch.u', '7. Form: Ereignishorizont – Schwarzer Abgrund', 'Ranged_Magic_Raise', 3.1,
    { kind: 'blackHole', strikeAt: 0.3, reach: 60, width: 60, center: 12, splitShips: 'radial', shipPull: 9, color: '#B07DFF', accent: '#1A0A2A', shot: 'sky', frames: 4 },
    [
      ...ticks(8, 0.12, 0.72, { shape: 'circle', offset: 12, range: 20, dmg: 0.32, poise: 24, knock: 0, vortex: 7, status: 'suppress', statusDur: 6, hitstop: 0.01, shake: 0.3, vfx: 'void' }),
      { shape: 'circle', offset: 12, range: 22, at: [0.76, 0.82], dmg: 4.2, poise: 200, knock: 16, fling: 22, launch: 6, hitstop: 0.18, shake: 1.4, vfx: 'void' },
    ], { from: 0.2, to: 0.75, formMin: 7 }),

  feuer: ult('feuer.u', '7. Form: Purpur-Sonneninferno', 'Ranged_Magic_Raise', 2.6,
    { kind: 'fireDragons', strikeAt: 0.35, reach: 36, width: 22, color: '#FF6A2A', accent: '#C83AFF', frames: 3 },
    ticks(9, 0.18, 0.8, { shape: 'arc', arc: 1.4, range: 34, grow: true, dmg: 0.75, poise: 26, knock: 7, fling: 10, status: 'burn', statusDur: 5, hitstop: 0.03, shake: 0.4, vfx: 'feuer' }, { dmg: 1.6, knock: 14, fling: 18, hitstop: 0.12, shake: 1 }),
    { from: 0.2, to: 0.75, formMin: 7 }),

  eis: ult('eis.u', '7. Form: Ewiger Gletscher-Kataklysmus', 'Melee_2H_Attack_Chop', 2.4,
    { kind: 'glacier', strikeAt: 0.42, reach: 26, width: 26, color: '#BFEFFF', accent: '#5AB8FF', frames: 3 },
    [
      ...ticks(3, 0.28, 0.6, { shape: 'circle', range: 24, grow: true, dmg: 1.2, poise: 70, knock: 4, launch: 7, status: 'freeze', statusDur: 3, hitstop: 0.06, shake: 0.6, vfx: 'eis' }),
      { shape: 'circle', range: 25, at: [0.68, 0.74], dmg: 2.6, poise: 120, knock: 16, fling: 18, hitstop: 0.16, shake: 1.2, vfx: 'eis' },
    ], { formMin: 7 }),

  wasser: ult('wasser.u', '7. Form: Tiefsee-Sintflutdrache', 'Ranged_Magic_Raise', 2.6,
    { kind: 'floodDragon', strikeAt: 0.38, reach: 56, width: 28, color: '#5AC8FF', accent: '#1A6AFF', frames: 3 },
    [
      { shape: 'line', range: 56, width: 28, grow: true, at: [0.3, 0.72], dmg: 5.2, poise: 160, knock: 20, fling: 22, status: 'slow', statusDur: 4, hitstop: 0.1, shake: 1.1, vfx: 'wasser' },
      ...ticks(4, 0.4, 0.8, { shape: 'circle', offset: 22, range: 12, dmg: 0.6, poise: 30, knock: 8, launch: 4, hitstop: 0.03, shake: 0.4, vfx: 'wasser' }),
    ], { formMin: 7 }),

  wind: ult('wind.u', '7. Form: Vakuum-Himmelssturm', 'Ranged_Magic_Raise', 2.6,
    { kind: 'vacuumStorm', strikeAt: 0.3, reach: 24, width: 24, color: '#E8FFF4', accent: '#7AE8C8', frames: 2 },
    ticks(12, 0.14, 0.84, { shape: 'circle', range: 22, dmg: 0.5, poise: 20, knock: 3, launch: 4, juggle: 4, vortex: 2.5, hitstop: 0.01, shake: 0.3, vfx: 'wind' }, { dmg: 1.4, knock: 18, fling: 20, launch: 8, hitstop: 0.12, shake: 1 }),
    { formMin: 7 }),

  blitz: ult('blitz.u', '7. Form: Donnergott-Urteil', 'Ranged_Magic_Raise', 2.3,
    { kind: 'thunderJudgment', strikeAt: 0.42, reach: 32, width: 32, shot: 'sky', color: '#FFF3A0', accent: '#7A9BFF', frames: 4 },
    ticks(3, 0.3, 0.72, { shape: 'circle', range: 30, dmg: 1.9, poise: 80, knock: 9, chain: 6, chainRange: 9, status: 'shock', statusDur: 3, hitstop: 0.1, shake: 1, vfx: 'blitz', down: 9 }),
    // 4.6C: die Figur steigt zur Gewitterwolke auf (~9 m), schwebt unter ihr und lenkt die Blitzsäule von oben, danach fällt sie zurück
    { formMin: 7, rise: 9, hang: 1.8, airOk: true }),

  sonne: ult('sonne.u', '7. Form: Zenit-Sonnentanz', 'Ranged_Magic_Raise', 2.4,
    { kind: 'sunDance', strikeAt: 0.4, reach: 20, width: 20, shot: 'sky', color: '#FFE88A', accent: '#FF9A2A', frames: 3 },
    ticks(5, 0.22, 0.8, { shape: 'circle', range: 19, dmg: 1.1, poise: 50, knock: 8, pen: 3, status: 'sunder', statusDur: 10, hitstop: 0.05, shake: 0.6, vfx: 'sonne' }, { dmg: 2, knock: 16, fling: 18, hitstop: 0.14, shake: 1.1 }),
    { formMin: 7 }),

  mond: ult('mond.u', '7. Form: Blutmond-Finsternis', 'Ranged_Magic_Raise', 2.6,
    { kind: 'bloodMoon', strikeAt: 0.3, reach: 26, width: 26, color: '#FF3A6A', accent: '#8A2AFF', shot: 'sky', frames: 3 },
    ticks(12, 0.14, 0.84, { shape: 'circle', range: 25, grow: true, dmg: 0.55, poise: 22, knock: 6, fling: 8, hitstop: 0.015, shake: 0.3, vfx: 'mond' }, { dmg: 1.5, knock: 16, fling: 20, hitstop: 0.12, shake: 1 }),
    { formMin: 7 }),
};

/** Alle 14 Ultimates (Reihenfolge wie in der Vorgabe) */
export const ULTIMATE_ORDER: readonly ActionStyleId[] = ['zweihaender', 'saebel', 'doppel', 'langklinge', 'sturmfaust', 'erdspalter', 'schwarzloch', 'feuer', 'eis', 'wasser', 'wind', 'blitz', 'sonne', 'mond'];

// ---------- Regeln für Schiffe und Endbosse (rein, getestet) ----------

/** Was über ein Schiff im Wirkungsbereich bekannt ist */
export interface ShipSplitInfo {
  /** Gefahrenstufe des Schiffs (aus seiner Stufe, 1 … 5) */
  tier: DangerTier;
  /** Boss-Schiff (Legende, Weltboss, unversenkbares Kommandoschiff) */
  boss: boolean;
  /** Rumpf-Anteil 0 … 1 */
  hullFrac: number;
  /** eigenes Schiff, Begleiter, geentert, friedlich: nie zerteilen */
  friendly: boolean;
}

/** Bis zu diesem Rumpf-Anteil werden Boss-Schiffe von Klingen-Ultimates zerteilt (darüber nur schwerer Schaden) */
export const BOSS_SHIP_SPLIT = 0.15;

/** Wird das Schiff zerteilt? Kriegsschiffe der Gefahrenstufen 1 – 4 immer, Boss-Schiffe erst unter 15 % Rumpf, Freunde nie */
export function canSplitShip(s: ShipSplitInfo, cut: UltimateSpec['splitShips']): boolean {
  if (!cut || s.friendly) return false;
  if (s.boss) return s.hullFrac < BOSS_SHIP_SPLIT;
  return s.tier <= 4;
}

/**
 * Anti-One-Shot gegen Endbosse: höchstens dieser Anteil der Lebenspunkte für ein ganzes Ultimate (es zählt wie EIN Treffer). Raid-Endbosse:
 * `RAID_BOSS_HIT_CAP` (bzw. ihr eigener `hitCap`, Kaiser `KAISER_BOSS_HIT_CAP`), andere Bosse (Legenden, Kommandanten): `ULTIMATE_BOSS_CAP`;
 * alle anderen Gegner: kein Deckel (null).
 */
export function ultimateBossCap(def: { boss?: boolean; raid?: string; hitCap?: number }): number | null {
  if (def.raid === 'boss') return def.hitCap ?? RAID_BOSS_HIT_CAP;
  if (def.boss) return ULTIMATE_BOSS_CAP;
  return null;
}

/** Kaiser-Deckel (für Anzeige und Prüfungen) */
export const ULT_KAISER_CAP = KAISER_BOSS_HIT_CAP;

/**
 * Buchführung des Endboss-Deckels: je Wirken (`cast`, Nummer des Angriffs) und Gegner höchstens `cap × maxHp` Schaden, egal wie viele Treffer
 * das Ultimate hat. Feste Plätze, keine Speicheranforderung im Kampf. Ablauf je Treffer: `allow` (begrenzt den gewünschten Schaden), danach
 * `record` mit dem tatsächlich angerichteten Schaden (nach Rüstung).
 */
export class UltimateBossLedger {
  private cast = -1;
  private n = 0;
  private slot = -1;
  private readonly ids: string[];
  private readonly dealt: Float64Array;
  constructor(size = 32) { this.ids = new Array<string>(size).fill(''); this.dealt = new Float64Array(size); }

  /** Erlaubter Schaden dieses Treffers (`cap` null = kein Endboss: unbegrenzt) */
  allow(cast: number, id: string, cap: number | null, maxHp: number, want: number): number {
    this.slot = -1;
    if (cast !== this.cast) { this.cast = cast; this.n = 0; }
    if (cap === null) return want;
    for (let k = 0; k < this.n; k++) if (this.ids[k] === id) { this.slot = k; break; }
    if (this.slot < 0) {
      if (this.n >= this.ids.length) return Math.min(want, Math.floor(maxHp * cap));
      this.slot = this.n++;
      this.ids[this.slot] = id;
      this.dealt[this.slot] = 0;
    }
    return Math.min(want, Math.max(0, Math.floor(maxHp * cap - this.dealt[this.slot])));
  }

  /** Tatsächlichen Schaden des zuletzt erlaubten Treffers verbuchen */
  record(dealt: number) { if (this.slot >= 0) this.dealt[this.slot] += Math.max(0, dealt); }

  /** Bisheriger Schaden an einem Gegner im laufenden Wirken (Prüfungen) */
  dealtTo(id: string): number { for (let k = 0; k < this.n; k++) if (this.ids[k] === id) return this.dealt[k]; return 0; }
}
