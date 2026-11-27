// Phase 4.6B – die 14 Kataklysmus-Ultimates (sechs Waffenstile + die 7. Form der acht Faji-Künste) als reine Daten.
// Jedes Ultimate ist ein `ActionMove` mit `ultimate`-Angabe: Aufladen (Akt 1 der Kino-Regie, `graphics/ultimateCinematics.ts`), großer
// Einschlag, Treffer der Engine auf Kämpfer und Verbände und ein Welt-Effekt (`world/cataclysmDirector.ts`): Schiffe zerteilen, Meer
// spalten, Schiffe ansaugen. Ultimates gibt es nur im Sturm-Erwachen, einmal je Erwachen.
// 4.6I: die Zeiten folgen der 3-Akt-Choreografie (~1 s): Aufladen = Akt 1 (Zeitlupe), Einschlag `strikeAt` und entscheidender Treffer
// `strikeAt + lag` = Ende von Akt 2 (Gefahr entsteht), danach Akt 3 (Doppel-Impact-Frame, Zerstörung). Die Clips laufen darum knapper
// (Klinge fällt in Akt 2, nicht danach), Treffer und Ende des Angriffs rücken mit – die Figur ist direkt nach der Sequenz wieder frei.
// Endboss-Schutz: ein Ultimate zählt gegen Endbosse wie EIN Treffer (Summe gedeckelt, `ultimateBossCap`), bricht aber sofort die Haltung.
import { ROUND, move, ticks, type ActionMove, type ActionStyleId, type HitIn, type UltimateSpec } from './actionKit';
import { KAISER_BOSS_HIT_CAP, RAID_BOSS_HIT_CAP, ULTIMATE_BOSS_CAP, type DangerTier } from './balanceConfig';

/**
 * Aufladen eines Ultimates in Spielzeit (Akt 1 „Vorbereitung & Aufladung“: die Engine hält den Angriff an, die Figur nimmt ihre Pose ein).
 * Die Kino-Regie spielt diese 0,105 s Spielzeit in ihren 0,30 – 0,35 s Echtzeit ab (Zeitlupe ≈ 0,32).
 */
export const ULT_CHARGE = 0.105;
/** 4.6I: so viel Spielzeit nach dem entscheidenden Treffer sind Dash und Sprung wieder frei (Akt 3 läuft in Zeitlupe; danach Rückkehr) */
export const ULT_FREE_AFTER = 0.15;

type UltIn = Omit<UltimateSpec, 'charge' | 'shot' | 'frames' | 'center' | 'splitShips' | 'trench' | 'shipPull' | 'lag'> & Partial<Pick<UltimateSpec, 'charge' | 'shot' | 'frames' | 'center' | 'splitShips' | 'trench' | 'shipPull' | 'lag'>>;

/** Grundform aller Treffer eines Ultimates: groß, wuchtig, immer mit Haltungsschaden, nie geblockt */
const U: HitIn = { breakGuard: true, poise: 60, knock: 10, hitstop: 0.06, shake: 0.5, fx: 'heavy', up: 6, down: 3 };

function ult(id: string, label: string, clip: string, dur: number, u: UltIn, hits: HitIn[], extra: Partial<ActionMove> & { from?: number; to?: number } = {}): ActionMove {
  const spec: UltimateSpec = { charge: ULT_CHARGE, shot: 'face', frames: 3, center: 0, splitShips: '', trench: 0, shipPull: 0, lag: 0, ...u };
  const m = move({
    id, label, clip, dur, magnet: false, lunge: 0, hyper: true, iframes: dur + 0.3, cutin: label, color: u.color, vfx: u.kind,
    hits: hits.map((h) => ({ ...U, ...h })), ...extra,
  });
  m.ultimate = spec;
  // Ultimates setzen die Kette nie fort: der Ansatzpunkt liegt nach dem entscheidenden Treffer und nach dem Beginn des letzten Treffers
  // (während der Kino-Sequenz keine Eingabe; mit ihrem Ende brechen Dash und Sprung wieder ab – 4.6I: die Treffer liegen darum alle davor)
  const lastT0 = m.hits.reduce((a, h) => Math.max(a, h.t0), 0);
  m.cancel = Math.min(dur, Math.max(lastT0 + 0.02, spec.strikeAt + spec.lag + ULT_FREE_AFTER));
  return m;
}

/**
 * 4.93A – Ultimate der Kino-Endgame-Regie (3,4 – 4,2 s in vier Phasen, `graphics/endgameDirector.ts`): das Aufladen dauert länger (Akt 1 läuft
 * mit Zeitmaß 0,4 statt 0,32 – die Welt bleibt in Bewegung), und die Figur bleibt bis kurz vor dem Ende der Sequenz in ihrem Angriff (das
 * Nachbeben gehört zur Choreografie; der Kapitän kehrt danach in seine Ausgangshaltung bzw. ans Steuerrad zurück).
 */
export const KINO_ULT_CHARGE = 0.36;
function kinoUlt(m: ActionMove): ActionMove {
  m.cancel = Math.max(m.cancel, m.dur - 0.2);
  return m;
}

/**
 * Ultimate je Stil (Faji-Künste: ihre 7. Form, `formMin` 7). 4.6I: Zeiten auf die 3-Akt-Choreografie gezogen – `strikeAt` (Einschlag) und
 * `strikeAt + lag` (entscheidender Treffer = Ende von Akt 2) liegen in den ersten ~0,4 s Spielzeit, die Treffer der Engine im selben Fenster,
 * Clip-Abschnitte so, dass Hieb, Schlag oder Geste genau dorthin fallen (Akt 1 zeigt davor die Aushol-Pose desselben Clips).
 */
export const ULTIMATES: Partial<Record<ActionStyleId, ActionMove>> = {
  // Zweihänder: die Klinge fällt in Akt 2 (Schwung 0,04 – 0,33 s), die Energiewand löst sich bei 0,12 s und erreicht die Schiffe; bei 0,32 s
  // kippen Bug und Heck auseinander (Doppel-Impact-Frame)
  zweihaender: ult('zweihaender.u', 'Himmelsspalter: Horizont-Zäsur', 'Melee_2H_Attack_Chop', 0.9,
    { kind: 'horizonCut', strikeAt: 0.12, lag: 0.2, reach: 150, width: 180, splitShips: 'cross', color: '#FFE2B0', accent: '#FF8A3A', frames: 3 },
    [{ shape: 'line', range: 150, width: 180, grow: true, at: [0.13, 0.75], dmg: 7, poise: 220, knock: 16, launch: 7, fling: 20, hitstop: 0.12, shake: 1.2, vfx: 'klinge' }],
    { from: 0.38, to: 0.9 }),

  saebel: ult('saebel.u', 'Souverän-Orkan: Sieben-Meere-Zäsur', 'Melee_1H_Attack_Jump_Chop', 0.95,
    // 4.6D: Akzent golden-rot statt violett (aus großer Höhe überstrahlte das Violett das ganze Bild); Violett bleibt nur im dunklen Mantel.
    // 4.6I: Sprung in Akt 2, der Hieb (Clip-Fenster 0,45) fällt genau auf den Einschlag 0,38 s – Blitz-Zäsur und erste Salve im Impact-Frame
    { kind: 'sevenSeas', strikeAt: 0.38, reach: 46, width: 34, center: 20, shot: 'sky', color: '#FFD27A', accent: '#FF3A2A', frames: 3 },
    [
      ...ticks(5, 0.4, 0.55, { shape: 'circle', offset: 14, range: 10, dmg: 0.55, poise: 30, knock: 6, status: 'shock', statusDur: 1.5, vfx: 'blitz' }),
      // drei Salven der Geister-Armada (Welt: 0 / 0,08 / 0,16 s nach dem Einschlag)
      ...ticks(3, 0.41, 0.62, { shape: 'circle', offset: 20, range: 16, dmg: 1.4, poise: 60, knock: 14, fling: 16, launch: 5, vfx: 'kanone' }, { hitstop: 0.12, shake: 1.1 }),
    ], { rise: 13, airOk: true, from: 0.15, to: 0.9 }),

  // Doppelklinge: Überschall-Vorstoß (40 m in 0,34 s) direkt hinter der Kreissäge; was sie durchfräst, bricht im Impact-Frame in vier Teile
  doppel: ult('doppel.u', 'Klingen-Zyklon: Tausend-Schnitt-Wirbel', 'Melee_2H_Attack_Spinning', 0.8,
    { kind: 'sawCyclone', strikeAt: 0.06, lag: 0.3, reach: 42, width: 9, splitShips: 'length', color: '#C8FFE8', accent: '#3AE0A8', frames: 2 },
    ticks(14, 0.05, 0.5, { shape: 'arc', arc: ROUND, range: 3.8, dmg: 0.48, poise: 22, knock: 5, fling: 9, hitstop: 0.02, shake: 0.3, vfx: 'wind' }, { dmg: 1.2, knock: 14, fling: 18, hitstop: 0.1, shake: 0.8 }),
    { dashTo: 40, dashTime: 0.34, through: true, from: 0, to: 1, afterimage: true }),

  langklinge: ult('langklinge.u', 'Lautloser Blitz: Iaijutsu-Weltenbruch', 'Crouching', 1.0,
    { kind: 'iaiWorldBreak', strikeAt: 0.36, reach: 34, width: 7, splitShips: 'diagonal', shot: 'side', color: '#E6F4FF', accent: '#8AC8FF', frames: 4 },
    // im Vorstoß (0,2 s) nur markieren, beim Einrasten der Klinge (0,36 s, tiefe Landepose) zerbricht alles Durchquerte zugleich
    [{ shape: 'line', range: 4.5, width: 4, at: [0.0, 0.2], delayTo: 0.36, dmg: 9, poise: 260, pen: 3, knock: 12, fling: 16, hitstop: 0.2, shake: 1.2, vfx: 'mond' }],
    { dashTo: 32, dashTime: 0.2, through: true, from: 0.1, to: 0.6, afterimage: true }),

  // 4.93A Stufe 60, Pfad 1 – „Sturmfaust der Tausend Blitze“ (3,4 s): Akt 1 (0,9 s) der Himmel verdunkelt sich, blaue Blitze tanzen um Fäuste
  // bzw. Masten; Akt 2 (0,6 s) 24 Hochgeschwindigkeits-Blitzeinschläge umkreisen das Ziel; im Treffermoment (0,56 s Spielzeit nach dem
  // Aufladen) der Zentralschlag: Stille, blau-weißer Impact-Frame, dann sprengt die Kugelblitz-Kuppel auf und zerbricht das Zielschiff
  sturmfaust: kinoUlt(ult('sturmfaust.u', 'Sturmfaust der Tausend Blitze', 'Melee_Unarmed_Attack_Punch_A', 1.85,
    { kind: 'fistStorm', charge: KINO_ULT_CHARGE, strikeAt: 0.06, lag: 0.5, reach: 28, width: 24, center: 9, splitShips: 'radial', color: '#7FD0FF', accent: '#EAF8FF', frames: 4 },
    [
      ...ticks(24, 0.04, 0.295, { shape: 'circle', offset: 9, range: 10, dmg: 0.22, poise: 12, knock: 1, status: 'shock', statusDur: 1.2, hitstop: 0, shake: 0.12, vfx: 'blitz' }),
      { shape: 'circle', offset: 9, range: 13, at: [0.303, 0.34], dmg: 2.6, poise: 220, knock: 16, fling: 20, launch: 6, hitstop: 0, shake: 0, vfx: 'blitz' },
    ],
    { from: 0.05, to: 0.71, afterimage: true })),

  // 4.93A Stufe 60, Pfad 2 – „Weltenbrecher-Erdspalter“ (3,6 s): Akt 1 (1,0 s) beide Fäuste glühen tektonisch-golden, die Erde grollt;
  // Akt 2 (0,5 s) der Zentralschlag fährt nieder; im Treffermoment (0,46 s Spielzeit) Stille und invertierter Impact-Frame, dann reißt an
  // Land ein Magma-Graben auf bzw. teilt die Schockwelle das Meer bis zum Grund und zerbricht das Zielschiff in zwei Hälften
  erdspalter: kinoUlt(ult('erdspalter.u', 'Weltenbrecher-Erdspalter', 'Melee_2H_Attack_Chop', 1.95,
    { kind: 'oceanSplit', charge: KINO_ULT_CHARGE + 0.04, strikeAt: 0.04, lag: 0.42, reach: 110, width: 16, trench: 9, splitShips: 'cross', color: '#FFC860', accent: '#E08A2A', frames: 4 },
    [{ shape: 'line', range: 110, width: 16, grow: true, at: [0.236, 0.5], dmg: 6.5, poise: 220, knock: 14, launch: 9, fling: 22, hitstop: 0, shake: 0, vfx: 'erde' }],
    { from: 0.215, to: 1 })),

  schwarzloch: ult('schwarzloch.u', '7. Form: Ereignishorizont – Schwarzer Abgrund', 'Ranged_Magic_Raise', 1.4,
    { kind: 'blackHole', strikeAt: 0.06, lag: 0.32, reach: 60, width: 60, center: 12, splitShips: 'radial', shipPull: 9, color: '#B07DFF', accent: '#1A0A2A', shot: 'sky', frames: 4 },
    [
      // 4.6I: der Sog läuft nur noch durch Akt 2 (~0,35 s) – dafür stärker (gleiche Strecke wie zuvor in 1,5 s)
      ...ticks(8, 0.0, 0.27, { shape: 'circle', offset: 12, range: 20, dmg: 0.32, poise: 24, knock: 0, vortex: 32, status: 'suppress', statusDur: 6, hitstop: 0.01, shake: 0.3, vfx: 'void' }),
      // Implosion und Explosion nach außen (entscheidender Treffer bei 0,38 s)
      { shape: 'circle', offset: 12, range: 22, at: [0.27, 0.31], dmg: 4.2, poise: 200, knock: 16, fling: 22, launch: 6, hitstop: 0.18, shake: 1.4, vfx: 'void' },
    ], { from: 0.2, to: 0.75, formMin: 7 }),

  feuer: ult('feuer.u', '7. Form: Purpur-Sonneninferno', 'Ranged_Magic_Raise', 1.4,
    { kind: 'fireDragons', strikeAt: 0.08, lag: 0.3, reach: 36, width: 22, color: '#FF6A2A', accent: '#C83AFF', frames: 3 },
    ticks(9, 0.05, 0.3, { shape: 'arc', arc: 1.4, range: 34, grow: true, dmg: 0.75, poise: 26, knock: 7, fling: 10, status: 'burn', statusDur: 5, hitstop: 0.03, shake: 0.4, vfx: 'feuer' }, { dmg: 1.6, knock: 14, fling: 18, hitstop: 0.12, shake: 1 }),
    { from: 0.2, to: 0.75, formMin: 7 }),

  // Eis: der Handflächen-Aufschlag fällt ans Ende von Akt 1 (Clip-Abschnitt beginnt nach dem Schlag), die Eiswelle friert sofort; Säulen in
  // Akt 2, Zersplittern im Impact-Frame bei 0,38 s
  eis: ult('eis.u', '7. Form: Ewiger Gletscher-Kataklysmus', 'Melee_2H_Attack_Chop', 0.9,
    { kind: 'glacier', strikeAt: 0.04, lag: 0.34, reach: 26, width: 26, color: '#BFEFFF', accent: '#5AB8FF', frames: 3 },
    [
      ...ticks(3, 0.05, 0.3, { shape: 'circle', range: 24, grow: true, dmg: 1.2, poise: 70, knock: 4, launch: 7, status: 'freeze', statusDur: 3, hitstop: 0.06, shake: 0.6, vfx: 'eis' }),
      { shape: 'circle', range: 25, at: [0.42, 0.48], dmg: 2.6, poise: 120, knock: 16, fling: 18, hitstop: 0.16, shake: 1.2, vfx: 'eis' },
    ], { from: 0.55, to: 0.95, formMin: 7 }),

  wasser: ult('wasser.u', '7. Form: Tiefsee-Sintflutdrache', 'Ranged_Magic_Raise', 1.5,
    { kind: 'floodDragon', strikeAt: 0.1, lag: 0.28, reach: 56, width: 28, color: '#5AC8FF', accent: '#1A6AFF', frames: 3 },
    [
      { shape: 'line', range: 56, width: 28, grow: true, at: [0.07, 0.5], dmg: 5.2, poise: 160, knock: 20, fling: 22, status: 'slow', statusDur: 4, hitstop: 0.1, shake: 1.1, vfx: 'wasser' },
      ...ticks(4, 0.15, 0.4, { shape: 'circle', offset: 22, range: 12, dmg: 0.6, poise: 30, knock: 8, launch: 4, hitstop: 0.03, shake: 0.4, vfx: 'wasser' }),
    ], { formMin: 7 }),

  wind: ult('wind.u', '7. Form: Vakuum-Himmelssturm', 'Ranged_Magic_Raise', 1.5,
    { kind: 'vacuumStorm', strikeAt: 0.06, lag: 0.32, reach: 24, width: 24, color: '#E8FFF4', accent: '#7AE8C8', frames: 2 },
    ticks(12, 0.03, 0.26, { shape: 'circle', range: 22, dmg: 0.5, poise: 20, knock: 3, launch: 4, juggle: 4, vortex: 2.5, hitstop: 0.01, shake: 0.3, vfx: 'wind' }, { dmg: 1.4, knock: 18, fling: 20, launch: 8, hitstop: 0.12, shake: 1 }),
    { formMin: 7 }),

  blitz: ult('blitz.u', '7. Form: Donnergott-Urteil', 'Ranged_Magic_Raise', 2.3,
    // 4.6I: der Hauptblitz stürzt in Akt 2 aus der Wolke herab und schlägt bei 0,4 s ein (die Figur steht dann gut 3 m hoch unter der Wolke)
    { kind: 'thunderJudgment', strikeAt: 0.4, reach: 32, width: 32, shot: 'sky', color: '#FFF3A0', accent: '#7A9BFF', frames: 4 },
    // drei Kettenblitz-Wellen (Welt: 0 / 0,08 / 0,16 s nach dem Einschlag)
    ticks(3, 0.175, 0.28, { shape: 'circle', range: 30, dmg: 1.9, poise: 80, knock: 9, chain: 6, chainRange: 9, status: 'shock', statusDur: 3, hitstop: 0.1, shake: 1, vfx: 'blitz', down: 9 }),
    // 4.6C: die Figur steigt zur Gewitterwolke auf (~9 m), schwebt unter ihr und lenkt die Blitzsäule von oben, danach fällt sie zurück
    { formMin: 7, rise: 9, hang: 1.8, airOk: true }),

  sonne: ult('sonne.u', '7. Form: Zenit-Sonnentanz', 'Ranged_Magic_Raise', 1.4,
    { kind: 'sunDance', strikeAt: 0.06, lag: 0.32, reach: 20, width: 20, shot: 'sky', color: '#FFE88A', accent: '#FF9A2A', frames: 3 },
    ticks(5, 0.05, 0.3, { shape: 'circle', range: 19, dmg: 1.1, poise: 50, knock: 8, pen: 3, status: 'sunder', statusDur: 10, hitstop: 0.05, shake: 0.6, vfx: 'sonne' }, { dmg: 2, knock: 16, fling: 18, hitstop: 0.14, shake: 1.1 }),
    { formMin: 7 }),

  // 4.7B Priester: Erzengel-Himmelsgericht – Lichtsäulen fallen im Kreis um die Figur, betäuben und strafen; der Segen heilt dich und alle
  // Verbündeten in 20 m um 35 % (`heal`). Welt-Effekt wie der Sonnentanz, aber weiß-gold mit smaragdenem Lebenslicht (cataclysmDirector).
  priester: ult('priester.u', 'Erzengel-Himmelsgericht', 'Ranged_Magic_Raise', 1.4,
    { kind: 'himmelsgericht', strikeAt: 0.06, lag: 0.32, reach: 22, width: 22, shot: 'sky', color: '#FFF4C8', accent: '#6AF0B0', frames: 3 },
    ticks(6, 0.05, 0.3, { shape: 'circle', range: 21, dmg: 1.0, poise: 50, knock: 8, pen: 3, status: 'stun', statusDur: 1.2, hitstop: 0.05, shake: 0.6, vfx: 'sonne' }, { dmg: 2, knock: 16, fling: 18, hitstop: 0.14, shake: 1.1 }),
    { heal: 0.35, healR: 20, formMin: 7 }),

  mond: ult('mond.u', '7. Form: Blutmond-Finsternis', 'Ranged_Magic_Raise', 1.4,
    { kind: 'bloodMoon', strikeAt: 0.06, lag: 0.32, reach: 26, width: 26, color: '#FF3A6A', accent: '#8A2AFF', shot: 'sky', frames: 3 },
    ticks(12, 0.03, 0.29, { shape: 'circle', range: 25, grow: true, dmg: 0.55, poise: 22, knock: 6, fling: 8, hitstop: 0.015, shake: 0.3, vfx: 'mond' }, { dmg: 1.5, knock: 16, fling: 20, hitstop: 0.12, shake: 1 }),
    { formMin: 7 }),
};

/**
 * 4.93A: Welt-Zeitachse des Himmelssturzes (s Spielzeit nach dem Einschlag der Engine) – Engine-Treffer und Darstellung teilen sie:
 * fünf Vorhut-Meteoriten (Stufe 2), dann erscheint der Koloss (Stufe 3) und schlägt als entscheidender Treffer ein (Stufe 4).
 */
export const SKYFALL_TIMES = { shards: [0.2, 0.34, 0.48, 0.62, 0.76], colossusFrom: 0.8, colossus: 1.55 } as const;
/** Einschlagsorte der fünf Vorhut-Meteoriten: m vor dem Mittelpunkt (−: davor) und seitlich (+ = links) – Umgebung und Begleitschiffe */
export const SKYFALL_SHARDS: readonly (readonly [ahead: number, side: number])[] = [[-14, -12], [4, 16], [-4, -22], [16, 8], [10, -14]];
/** Durchmesser des Koloss-Meteoriten (m), Höhe der Wasser- bzw. Lava-Fontäne (m), Radius des Kraters (m) */
export const SKYFALL_COLOSSUS = { size: 45, fountain: 120, crater: 34 } as const;
const SKY_STRIKE = 0.05, SKY_DUR = 2.9, SKY_CENTER = 20;
/** Anteil der Dauer für einen Zeitpunkt der Welt-Zeitachse (nach dem Einschlag) */
const skyAt = (t: number, w = 0.02): [number, number] => [(SKY_STRIKE + t) / SKY_DUR, (SKY_STRIKE + t + w) / SKY_DUR];

/**
 * Das geheime Stufe-101-Ultimate (Krone des Kosmos-Baums, an keinen Stil gebunden): „Himmelssturz“ – ein Meteoriten-Kataklysmus in vier
 * Stufen (4,2 s): Schwerkraft-Umkehr · Vorhut-Bombardement aus fünf brennenden Meteoriten · der 45 m große Koloss-Meteorit mit
 * Plasma-Bugwelle · Impact-Frame und Kataklysmus (120 m hohe Wasser- bzw. Lava-Fontäne, aufgerissener Krater, zerbrechende Kriegsschiffe).
 * Endbosse: wie jedes Ultimate über `UltimateBossLedger` gedeckelt (ein Wirken zählt wie ein Treffer).
 */
export const SKYFALL_ULTIMATE: ActionMove = kinoUlt(ult('kosmos.u', 'Himmelssturz', 'Ranged_Magic_Raise', SKY_DUR,
  { kind: 'skyfall', charge: KINO_ULT_CHARGE, strikeAt: SKY_STRIKE, lag: SKYFALL_TIMES.colossus, reach: 46, width: 46, center: SKY_CENTER, splitShips: 'radial', shot: 'sky', color: '#FF7A3A', accent: '#B07DFF', frames: 4 },
  [
    // Vorhut-Bombardement: fünf Einschläge rund um den Mittelpunkt (die Engine kennt nur den Abstand voraus – ihre Kreise decken die Breite ab)
    ...SKYFALL_TIMES.shards.map((t, i): HitIn => ({ shape: 'circle', offset: Math.max(4, SKY_CENTER + SKYFALL_SHARDS[i][0]), range: 12, at: skyAt(t), dmg: 0.5, poise: 40, knock: 10, launch: 6, fling: 12, hitstop: 0, shake: 0.5, vfx: 'meteor' })),
    // der Koloss: wachsende Front um den Einschlagsmittelpunkt; die Glut des Kraters brennt als Zustand nach
    { shape: 'circle', offset: SKY_CENTER, range: 34, grow: true, at: skyAt(SKYFALL_TIMES.colossus, 0.12), dmg: 6.0, poise: 260, knock: 20, launch: 10, fling: 24, pen: 3, status: 'burn', statusDur: 5, hitstop: 0, shake: 0, vfx: 'meteor' },
  ], { from: 0.2, to: 0.8 }));

/** 4.6I: Spielzeit vom Start der Bewegung (nach dem Aufladen) bis zum entscheidenden Treffer = Ende von Akt 2 der Kino-Regie */
export const decisiveAt = (s: Pick<UltimateSpec, 'strikeAt' | 'lag'>) => s.strikeAt + s.lag;
/** Alle 15 Stil-Ultimates (Reihenfolge wie in der Vorgabe) */
export const ULTIMATE_ORDER: readonly ActionStyleId[] = ['zweihaender', 'saebel', 'doppel', 'langklinge', 'sturmfaust', 'erdspalter', 'schwarzloch', 'feuer', 'eis', 'wasser', 'wind', 'blitz', 'sonne', 'mond', 'priester'];

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

/**
 * 4.92: Kriegsschiffe der Gefahrenstufe 5 (Festungsgürtel, Stufe 18+ – dort kämpft man im Endgame fast immer) zerbrechen, sobald ihr Rumpf
 * höchstens zur Hälfte steht (vorher nur schwerer Schaden). Ohne diese Schwelle sah ein Kapitän mit Stufe 60 die Schiffsteilung nie.
 */
export const T5_SHIP_SPLIT = 0.5;

/** Wird das Schiff zerteilt? Kriegsschiffe der Gefahrenstufen 1 – 4 immer, Stufe 5 ab halbem Rumpf, Boss-Schiffe erst unter 15 % Rumpf, Freunde nie */
export function canSplitShip(s: ShipSplitInfo, cut: UltimateSpec['splitShips']): boolean {
  if (!cut || s.friendly) return false;
  if (s.boss) return s.hullFrac < BOSS_SHIP_SPLIT;
  return s.tier <= 4 || s.hullFrac <= T5_SHIP_SPLIT;
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
