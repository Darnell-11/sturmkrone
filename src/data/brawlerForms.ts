// Phase 4.93A – Kategorie 1 der Kino-Endgame-Regie: die beiden Faustkämpfer-Pfade als reine Daten.
//   Pfad 1 – Schneller Faustkämpfer (`sturmfaust`): Blitz- & Vakuum-Sturm
//   Pfad 2 – Kräftiger Faustkämpfer (`erdspalter`): Tektonik- & Titanen-Wucht
// Je Pfad die 4er-Kette des Auto-Angriffs (der vierte Schlag ist der Flächen-Finisher) und alle zehn Formen. Dauer und Treffermoment jeder
// Form kommen aus ihrer 4-Phasen-Zeitachse (`graphics/endgameDirector.ts`): die Engine-Dauer ist die Echtzeit-Dauer der Form abzüglich des
// Hit-Stops im Impact-Frame, das entscheidende Trefferfenster öffnet genau im Treffermoment (Ende von Phase 2). Der Clip-Abschnitt ist so
// gewählt, dass Faust, Tritt oder Hammer sichtbar in diesem Moment einschlagen.
//
// Zu Fuß treffen diese Angriffe nur Gegner zu Fuß (`combat/combatModes.ts`); am Steuerrad wirken dieselben Formen über `data/seaArts.ts` auf
// das angewählte Schiff. Formen mit Impact-Frame tragen keinen eigenen Hit-Stop und kein eigenes Kamerawackeln mehr (beides führt die Regie:
// kein doppeltes Anhalten der Zeit).
import { CLIP_SWING, move, skill, ticks, type ActionMove, type ActionSkill, type HitIn } from './actionKit';
import { DIRECTOR_TIMELINES, decisiveFraction, engineDuration, type BrawlerStyleId, type DirectorActionId, type FormSlot } from '../graphics/endgameDirector';

/** Abklingzeiten der zehn Formen (s) – wie bisher: vier Signatur-Techniken, sechs taktische Formen */
export const BRAWLER_FORM_CD: Readonly<Record<BrawlerStyleId, readonly number[]>> = {
  sturmfaust: [7, 7, 10, 9, 10, 12, 14, 16, 18, 26],
  erdspalter: [8, 9, 14, 10, 12, 14, 14, 16, 18, 26],
};

/** Reichweite des Vakuum-Stoßes (m) und Radius des Erd-Schmetterschlags (m) */
export const AUTO_FINISHER = { vacuumRange: 18, quakeRadius: 6 } as const;

interface Timing { dur: number; f: number; t1: number; win: readonly [number, number]; long: readonly [number, number]; regie: boolean }

/** Zeiten einer Regie-Aktion für die Engine: Dauer, Treffermoment (Anteil), Ende der Aufladung (Anteil), Trefferfenster kurz und lang */
function timing(id: DirectorActionId): Timing {
  const tl = DIRECTOR_TIMELINES[id];
  const dur = engineDuration(tl), f = decisiveFraction(tl);
  return { dur, f, t1: tl.t1 / dur, win: [f, Math.min(0.97, f + 0.07)], long: [f, Math.min(0.97, f + 0.14)], regie: tl.impactMs > 0 };
}

/** Clip-Abschnitt, dessen Schwung auf den Treffermoment `f` (Anteil der Dauer) fällt */
function span(clip: string, f: number, lead = 0.22): { from: number; to: number } {
  const c = CLIP_SWING[clip];
  if (!c) return { from: 0, to: 1 };
  let from = Math.max(0, c[1] - lead), to = from + (c[1] - from) / f;
  if (to > 1) { to = 1; from = Math.max(0, (c[1] - f) / (1 - f)); }
  return { from: Math.round(from * 1000) / 1000, to: Math.round(to * 1000) / 1000 };
}

/** Treffer einer Form: mit Impact-Frame ohne eigenen Hit-Stop und ohne eigenes Wackeln (führt die Regie) */
const H = (tm: Timing, h: HitIn): HitIn => (tm.regie ? { ...h, hitstop: 0, shake: 0 } : h);

interface FormIn {
  short: string; icon: string; desc: string; clip: string; hits: (tm: Timing) => HitIn[];
  extra?: Partial<ActionMove> & { from?: number; to?: number };
}

function formOf(style: BrawlerStyleId, slot: FormSlot, o: FormIn): ActionSkill {
  const id = `${style}.k${slot}` as DirectorActionId;
  const tl = DIRECTOR_TIMELINES[id], tm = timing(id);
  return skill({
    id, slot, label: tl.label, short: o.short, icon: o.icon, desc: o.desc, cd: BRAWLER_FORM_CD[style][slot - 1],
    clip: o.clip, dur: tm.dur, ...span(o.clip, tm.f), formMin: 1,
    hits: o.hits(tm).map((h) => H(tm, h)), ...o.extra,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Pfad 1 – Schneller Faustkämpfer
// ---------------------------------------------------------------------------------------------------------------

const VAC = timing('sturmfaust.l4');

/** Auto-Angriff zu Fuß: 1 Linker Blitz-Jab → 2 Rechter Haken → 3 Wirbel-Drehkick → 4 Vakuum-Stoß (komprimierte blaue Luftdruckkugel, 18 m) */
export const STURMFAUST_LIGHT: ActionMove[] = [
  move({ id: 'sturmfaust.l1', label: 'Linker Blitz-Jab', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.26, hits: [{ range: 2.1, arc: 1.7, dmg: 0.3, poise: 7, knock: 1.5, fx: 'punch', hitstop: 0.04 }] }),
  move({ id: 'sturmfaust.l2', label: 'Rechter Haken', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.3, from: 0.06, to: 0.8, hits: [{ range: 2.2, arc: 2.1, dmg: 0.34, poise: 9, knock: 2.5, fx: 'punch', hitstop: 0.04 }] }),
  move({ id: 'sturmfaust.l3', label: 'Wirbel-Drehkick', clip: 'Melee_Unarmed_Attack_Kick', dur: 0.36, hits: [{ range: 2.6, arc: 3.0, dmg: 0.43, poise: 12, knock: 4, fx: 'spin', hitstop: 0.05 }] }),
  move({
    id: 'sturmfaust.l4', label: 'Vakuum-Stoß', clip: 'Melee_Unarmed_Attack_Punch_A', dur: VAC.dur, ...span('Melee_Unarmed_Attack_Punch_A', VAC.f), finisher: true, afterimage: true, vfx: 'wind',
    hits: [
      { range: 2.6, arc: 1.6, dmg: 0.5, poise: 18, knock: 6, fx: 'punch', hitstop: 0.06, shake: 0.2, at: VAC.win },
      // die Luftdruckkugel: wandernde Front bis 18 m, schleudert schwache Truppen weg
      { shape: 'line', range: AUTO_FINISHER.vacuumRange, width: 2.2, grow: true, dmg: 0.54, poise: 16, knock: 8, fling: 10, fx: 'punch', vfx: 'wind', hitstop: 0.03, shake: 0.2, at: [VAC.f + 0.02, Math.min(0.96, VAC.f + 0.36)] },
    ],
  }),
];

export const STURMFAUST_FORMS: ActionSkill[] = [
  formOf('sturmfaust', 1, { short: 'Jab', icon: '➤', clip: 'Melee_Unarmed_Attack_Punch_A', desc: 'Schneller Luftdruck-Schuss, 14 m weit, mit peitschendem Schallknall.',
    hits: (t) => [{ shape: 'line', range: 14, width: 2.2, grow: true, at: t.long, dmg: 2.5, poise: 22, knock: 7, fx: 'punch', hitstop: 0.05, shake: 0.3, vfx: 'wind' }],
    extra: { lunge: 0, magnet: false } }),
  formOf('sturmfaust', 2, { short: 'Blitztritt', icon: '✕', clip: 'Melee_Unarmed_Attack_Kick', desc: 'Zwei gekreuzte blau-weiße Luftklingen-Sicheln, 7 m weit.',
    hits: (t) => [
      { range: 6.6, arc: 2.2, dmg: 1.0, poise: 12, knock: 4, fx: 'spin', hitstop: 0.03, vfx: 'blitz', at: [t.f - 0.12, t.f - 0.05] },
      { range: 7.2, arc: 2.4, dmg: 1.45, poise: 16, knock: 7, fx: 'spin', hitstop: 0.05, shake: 0.3, vfx: 'blitz', at: t.win },
    ] }),
  formOf('sturmfaust', 3, { short: 'Parade', icon: '◐', clip: 'Melee_2H_Attack_Spinning', desc: 'Rotierende Luftdruck-Kuppel: lenkt Geschosse und Hiebe ab (Konterhaltung), zerplatzt als Druckring.',
    hits: (t) => [{ shape: 'circle', range: 4.4, dmg: 0.9, poise: 20, knock: 9, fling: 8, fx: 'spin', hitstop: 0.04, shake: 0.25, vfx: 'wind', at: t.win }],
    extra: { from: 0, to: 1, counter: 0.6, hyper: true, lunge: 0, magnet: false } }),
  formOf('sturmfaust', 4, { short: 'Schritt', icon: '≫', clip: 'Dodge_Forward', desc: 'Blitzschneller Vorstoß über 9 m mit blauen Nachbildern, am Ende ein Schockwellen-Stoß.',
    hits: (t) => [
      ...ticks(2, t.t1, t.f - 0.02, { shape: 'circle', range: 2.4, dmg: 0.4, poise: 8, knock: 3, fx: 'punch', down: 2 }),
      { shape: 'circle', range: 3.6, dmg: 1.2, poise: 22, knock: 8, fling: 8, fx: 'heavy', at: t.win, down: 2 },
    ],
    extra: { from: 0, to: 1, dashTo: 9, dashTime: 0.24, through: true, iframes: 0.3, afterimage: true, lunge: 0, magnet: false } }),
  formOf('sturmfaust', 5, { short: 'Fallkick', icon: '⚡', clip: 'Melee_1H_Attack_Jump_Chop', desc: 'Steiler Himmels-Einschlag mit blauer Blitzsäule – bricht die Haltung.',
    hits: (t) => [{ shape: 'circle', offset: 3, range: 4.2, dmg: 2.6, poise: 110, knock: 6, launch: 3, breakGuard: true, fx: 'heavy', vfx: 'blitz', at: t.win, down: 3 }],
    extra: { lunge: 3 } }),
  formOf('sturmfaust', 6, { short: 'Sog', icon: '🌀', clip: 'Ranged_Magic_Spellcasting', desc: 'Unterdruck-Wirbel 5 m voraus: zieht Gegner ins Zentrum und bremst sie.',
    hits: (t) => [
      ...ticks(3, t.t1, t.f - 0.02, { shape: 'circle', offset: 5, range: 7, dmg: 0.14, poise: 4, knock: 0, vortex: 7, status: 'slow', statusDur: 2, fx: 'magic', vfx: 'wind' }),
      { shape: 'circle', offset: 5, range: 5, dmg: 0.8, poise: 30, knock: 4, fx: 'magic', vfx: 'wind', at: t.win },
    ],
    extra: { lunge: 0, magnet: false } }),
  formOf('sturmfaust', 7, { short: 'Hundert', icon: '✊', clip: 'Melee_Unarmed_Attack_Punch_A', desc: '24 versetzte Phantom-Fäuste trommeln im Stakkato, 9 m weit.',
    hits: (t) => [
      ...ticks(11, t.t1 * 0.6, t.f - 0.01, { range: 9, arc: 1.3, dmg: 0.11, poise: 3, knock: 0.5, fx: 'punch', hitstop: 0, shake: 0, vfx: 'blitz' }),
      { range: 9.5, arc: 1.4, dmg: 1.7, poise: 26, knock: 9, fling: 8, fx: 'heavy', vfx: 'blitz', at: t.win },
    ],
    extra: { from: 0.05, to: 0.75, afterimage: true } }),
  formOf('sturmfaust', 8, { short: 'Käfig', icon: '⌁', clip: 'Ranged_Magic_Raise', desc: 'Hochspannungs-Kuppel 4 m voraus mit überspringenden Kettenblitzen – lähmt.',
    hits: (t) => [
      ...ticks(3, t.t1, t.f - 0.02, { shape: 'circle', offset: 4, range: 6.5, dmg: 0.28, poise: 8, knock: 0, chain: 3, chainRange: 8, status: 'shock', statusDur: 1.4, fx: 'magic', vfx: 'blitz' }),
      { shape: 'circle', offset: 4, range: 6.5, dmg: 0.9, poise: 40, knock: 8, launch: 3, fx: 'magic', vfx: 'blitz', at: t.win },
    ],
    extra: { lunge: 0, magnet: false } }),
  formOf('sturmfaust', 9, { short: 'Avatar', icon: '☈', clip: 'Melee_2H_Attack_Chop', desc: 'Eine riesige leuchtende Blitz-Faust schmettert 4,5 m voraus ein.',
    hits: (t) => [{ shape: 'circle', offset: 4.5, range: 6.2, dmg: 3.6, poise: 70, knock: 12, launch: 4, fling: 12, fx: 'heavy', vfx: 'blitz', at: t.win, down: 3 }],
    extra: { hyper: true } }),
  formOf('sturmfaust', 10, { short: 'Kanone', icon: '➹', clip: 'Ranged_Magic_Shoot', desc: 'Verdunkelter Himmel: ein langer Luft- und Blitzstrahl durchschlägt ganze Reihen, 30 m weit.',
    hits: (t) => [{ shape: 'line', range: 30, width: 4.2, grow: true, at: t.long, dmg: 4.6, pen: 2, poise: 90, knock: 12, fling: 14, breakGuard: true, fx: 'heavy', vfx: 'blitz' }],
    extra: { hyper: true, cutin: 'Kaiser-Vakuumkanone!', lunge: 0, magnet: false } }),
];

// ---------------------------------------------------------------------------------------------------------------
// Pfad 2 – Kräftiger Faustkämpfer
// ---------------------------------------------------------------------------------------------------------------

const QUAKE = timing('erdspalter.l4');

/** Auto-Angriff zu Fuß: 1 Rammfaust → 2 Schulterstoß → 3 Aufwärtshaken → 4 Erd-Schmetterschlag (erschüttert 6 m, bricht Boss-Haltung) */
export const ERDSPALTER_LIGHT: ActionMove[] = [
  move({ id: 'erdspalter.l1', label: 'Rammfaust', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.46, hits: [{ range: 2.3, arc: 1.7, dmg: 0.46, poise: 16, knock: 4, fx: 'punch', hitstop: 0.07, shake: 0.25 }] }),
  move({ id: 'erdspalter.l2', label: 'Schulterstoß', clip: 'Melee_Block_Attack', dur: 0.48, lunge: 5, hits: [{ range: 2.6, arc: 1.6, dmg: 0.52, poise: 22, knock: 8, fx: 'heavy', hitstop: 0.08, shake: 0.3 }] }),
  move({ id: 'erdspalter.l3', label: 'Aufwärtshaken', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.5, from: 0.04, to: 0.82, hits: [{ range: 2.4, arc: 1.5, dmg: 0.57, poise: 24, knock: 3, launch: 2.5, fx: 'heavy', hitstop: 0.09, shake: 0.35 }] }),
  move({
    id: 'erdspalter.l4', label: 'Erd-Schmetterschlag', clip: 'Melee_2H_Attack_Chop', dur: QUAKE.dur, ...span('Melee_2H_Attack_Chop', QUAKE.f), hyper: true, finisher: true, vfx: 'erde',
    hits: [{ shape: 'circle', offset: 1.2, range: AUTO_FINISHER.quakeRadius, dmg: 0.93, poise: 80, knock: 10, launch: 5, fling: 14, fx: 'heavy', hitstop: 0.14, shake: 0.4, vfx: 'erde', at: QUAKE.win }],
  }),
];

export const ERDSPALTER_FORMS: ActionSkill[] = [
  formOf('erdspalter', 1, { short: 'Ramme', icon: '➤', clip: 'Melee_Block_Attack', desc: 'Schwerer gold-bernsteinfarbener Druckkegel, 8 m weit, mit tiefem Trommel-Bass.',
    hits: (t) => [{ shape: 'line', range: 8, width: 3.2, grow: true, at: t.long, dmg: 2.9, poise: 44, knock: 10, fling: 9, fx: 'heavy', hitstop: 0.06, shake: 0.4, vfx: 'erde' }],
    extra: { lunge: 3, hyper: true } }),
  formOf('erdspalter', 2, { short: 'Fächer', icon: '≋', clip: 'Melee_2H_Attack_Slice', desc: 'Drei breite Erdschock-Wellen fächern sich 11 m weit auf.',
    hits: (t) => [{ range: 11, arc: 1.9, dmg: 3.0, poise: 40, knock: 9, fling: 10, fx: 'heavy', hitstop: 0.06, shake: 0.45, vfx: 'erde', at: t.long }],
    extra: { hyper: true, lunge: 0 } }),
  formOf('erdspalter', 3, { short: 'Bollwerk', icon: '⛨', clip: 'Melee_Blocking', desc: 'Gold-schwarze Rüstungsaura: 5 s Hyper-Armor, ein Treffer wird mit einer Druckwelle gekontert.',
    hits: (t) => [{ shape: 'circle', range: 4.2, dmg: 0.9, poise: 30, knock: 10, fling: 8, fx: 'heavy', hitstop: 0.04, shake: 0.3, vfx: 'erde', at: t.win }],
    extra: { from: 0, to: 1, counter: 0.6, buff: { kind: 'hyper', dur: 5 }, lunge: 0, magnet: false } }),
  formOf('erdspalter', 4, { short: 'Ansturm', icon: '⇶', clip: 'Melee_Block_Attack', desc: 'Unaufhaltsamer Rammstoß über 8 m – schleudert Ziele zurück.',
    hits: (t) => [{ shape: 'circle', offset: 0.8, range: 3.2, dmg: 2.7, poise: 50, knock: 15, fling: 14, fx: 'heavy', vfx: 'erde', at: t.win }],
    extra: { dashTo: 8, dashTime: 0.26, hyper: true, lunge: 0 } }),
  formOf('erdspalter', 5, { short: 'Hammer', icon: '⚒', clip: 'Melee_2H_Attack_Chop', desc: 'Beidhändiger Niederschlag – knackt Haltungsleisten sofort.',
    hits: (t) => [{ shape: 'circle', offset: 1.6, range: 5, dmg: 3.3, poise: 160, knock: 8, launch: 4, fling: 10, breakGuard: true, fx: 'heavy', vfx: 'erde', at: t.win }],
    extra: { hyper: true } }),
  formOf('erdspalter', 6, { short: 'Fessel', icon: '⛰', clip: 'Melee_2H_Attack_Chop', desc: 'Gesteins-Säulen kesseln das Ziel 5,5 m voraus ein und betäuben es.',
    hits: (t) => [{ shape: 'circle', offset: 5.5, range: 4.6, dmg: 1.3, poise: 36, knock: 0, status: 'stun', statusDur: 1.6, fx: 'heavy', vfx: 'erde', at: t.win }],
    extra: { lunge: 0, magnet: false } }),
  formOf('erdspalter', 7, { short: 'Salve', icon: '✺', clip: 'Melee_2H_Attack_Chop', desc: 'Sechs seismische Bodenschläge laufen bis 12 m auf das Ziel zu.',
    hits: (t) => {
      const out: HitIn[] = [];
      const step = (t.f - 0.02 - t.t1) / 5;
      for (let i = 0; i < 5; i++) out.push({ shape: 'circle', offset: 2 + i * 2, range: 2.6, dmg: 0.3, poise: 14, knock: 4, launch: 2, fx: 'heavy', hitstop: 0, shake: 0, vfx: 'erde', at: [t.t1 + step * i, t.t1 + step * (i + 0.8)] });
      out.push({ shape: 'circle', offset: 12, range: 3.4, dmg: 0.9, poise: 30, knock: 8, launch: 4, fling: 10, fx: 'heavy', vfx: 'erde', at: t.win });
      return out;
    },
    extra: { lunge: 0, magnet: false, hyper: true } }),
  formOf('erdspalter', 8, { short: 'Graben', icon: '♨', clip: 'Melee_2H_Attack_Chop', desc: 'Eine glühende Spalte reißt 16 m weit unter den Gegnern auf und setzt sie in Brand.',
    hits: (t) => [{ shape: 'line', range: 16, width: 3.8, grow: true, at: t.long, dmg: 1.9, poise: 44, knock: 6, launch: 5, status: 'burn', statusDur: 3, fx: 'heavy', vfx: 'erde' }],
    extra: { hyper: true, lunge: 0, magnet: false } }),
  formOf('erdspalter', 9, { short: 'Gigant', icon: '☄', clip: 'Ranged_Magic_Raise', desc: 'Eine 20 m große tektonisch-goldene Energie-Faust schmettert senkrecht aus den Wolken herab.',
    hits: (t) => [{ shape: 'circle', offset: 6.5, range: 7, dmg: 3.8, poise: 90, knock: 12, launch: 5, fling: 14, fx: 'heavy', vfx: 'erde', at: t.win, down: 4 }],
    extra: { hyper: true, lunge: 0, magnet: false } }),
  formOf('erdspalter', 10, { short: 'Weltbeben', icon: '◎', clip: 'Melee_2H_Attack_Chop', desc: 'Verdunkelter Himmel: eine radiale Schockwelle erschüttert alles in 12 m.',
    hits: (t) => [{ shape: 'circle', range: 12, grow: true, at: t.long, dmg: 4.6, poise: 100, knock: 13, launch: 3, fling: 16, breakGuard: true, fx: 'heavy', vfx: 'erde' }],
    extra: { hyper: true, cutin: 'Weltbeben-Stoß!', lunge: 0, magnet: false } }),
];
