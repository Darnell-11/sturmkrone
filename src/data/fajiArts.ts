// Phase 4.6B – die acht waffenlosen Faji-Künste (Elementar- und Gravitationsformen) als reine Daten.
// Jede Kunst ist ein vollwertiger Action-Stil (Kette, Verzweigungen, Luft-Kombo, Meteor, Finisher) aus Handflächen-, Tritt- und Energieformen
// und steigert sich über sieben Formstufen (1. Form … 7. Meisterform): die vier Form-Techniken werden mit den Stufen 1, 2, 4 und 6 frei, jede
// Stufe macht sie stärker (`formPower`), die 7. Form schaltet das Kataklysmus-Ultimate der Kunst frei. Die Meisterschaft (Punkte je Kunst)
// wächst mit jedem Treffer der Kunst (im Sturm-Erwachen doppelt) und steht im Spielstand (`player.faji`).
import {
  ACTION_TUNING, AIR, ROUND, awakenWave, move, shot, skill, ticks,
  type ActionHit, type ActionSkill, type ActionStyleDef, type ActionStyleId, type HitIn, type HitStatus, type MoveIn, type ProjectileKind,
} from './actionKit';
import { ULTIMATES } from './cataclysms';

export type FajiArtId = 'schwarzloch' | 'feuer' | 'eis' | 'wasser' | 'wind' | 'blitz' | 'sonne' | 'mond';
export const FAJI_ART_IDS: readonly FajiArtId[] = ['schwarzloch', 'feuer', 'eis', 'wasser', 'wind', 'blitz', 'sonne', 'mond'];
export const isFajiArt = (v: unknown): v is FajiArtId => typeof v === 'string' && (FAJI_ART_IDS as readonly string[]).includes(v);

// ---------- Formstufen ----------

/** Meisterschaft (Punkte), ab der die Form 1 … 7 erreicht ist */
export const FORM_THRESHOLDS: readonly number[] = [0, 60, 180, 380, 680, 1100, 1700];
/** Ab welcher Form die Technik auf Platz 1 … 4 frei ist; die 7. Form schaltet das Ultimate frei */
export const FORM_UNLOCK: readonly number[] = [1, 2, 4, 6];
export const MASTER_FORM = 7;
/** Namen der Formstufen */
export const FORM_NAMES: readonly string[] = ['1. Form', '2. Form', '3. Form', '4. Form', '5. Form', '6. Form', '7. Meisterform'];

/** Formstufe aus der Meisterschaft (1 … 7) */
export function formOf(mastery: number): number {
  let f = 1;
  for (let i = 0; i < FORM_THRESHOLDS.length; i++) if (mastery >= FORM_THRESHOLDS[i]) f = i + 1;
  return f;
}

/** Anteil zur nächsten Form (0 … 1; 1 in der Meisterform) */
export function formProgress(mastery: number): number {
  const f = formOf(mastery);
  if (f >= MASTER_FORM) return 1;
  const a = FORM_THRESHOLDS[f - 1], b = FORM_THRESHOLDS[f];
  return Math.max(0, Math.min(1, (mastery - a) / (b - a)));
}

/** Stärke der Form-Techniken: Schaden (1. Form 1,0 … 7. Form 1,6) und Reichweite (bis +24 %) */
export const formPower = (form: number): { dmg: number; range: number } => {
  const f = Math.max(1, Math.min(MASTER_FORM, Math.round(form)));
  return { dmg: 1 + 0.1 * (f - 1), range: 1 + 0.04 * (f - 1) };
};

/** Meisterschaft je Treffer der Kunst (im Sturm-Erwachen doppelt), je Finisher und je Kampfkunst-Treffer */
export const MASTERY = { hit: 1, skillHit: 2, finisher: 6, awakenK: 2 } as const;

// ---------- Baukasten der Künste ----------

interface ArtSpec {
  /** Kunst (oder 4.7B: der Priester, eine Faji-Spezialisierung ohne Meisterschaft) */
  id: FajiArtId | 'priester';
  /** Element der Darstellung, wenn es nicht die Kennung ist (Priester: Sonnenlicht) */
  vfx?: string;
  label: string;
  title: string;
  desc: string;
  color: string;
  accent: string;
  /** Zustand der Kunst auf Schlägen und Dauer */
  status: HitStatus;
  statusDur: number;
  proj: ProjectileKind;
  /** Namen der Kette L1 … L5 und des Finishers */
  names: [string, string, string, string, string];
  finisher: string;
  /** Eigenheiten: Kettenblitz auf den Schlägen, Sog des Finishers, Reichweiten-Faktor, Durchschlag */
  chain?: number;
  vortex?: number;
  reachK?: number;
  pen?: number;
  /** Mondsicheln fliegen bei jedem Schlag mit */
  crescents?: boolean;
  jumps?: number;
  airDashes?: number;
  dashSpeed?: number;
  perfectWindow?: number;
  penBonus?: number;
  skills: [SkillSpec, SkillSpec, SkillSpec, SkillSpec];
}

type SkillSpec = Omit<MoveIn, 'id' | 'label'> & { name: string; short: string; icon: string; desc: string; cd: number; hits?: HitIn[] };

/** Treffer mit Element der Kunst */
function el(a: ArtSpec, h: HitIn, withStatus = true): HitIn {
  const o: HitIn = { vfx: a.vfx ?? a.id, ...h };
  if (withStatus && a.status && !h.status) { o.status = a.status; o.statusDur = h.statusDur ?? a.statusDur; }
  if (a.chain && h.chain === undefined) o.chain = a.chain;
  if (a.pen && h.pen === undefined) o.pen = a.pen;
  if (a.reachK && h.range !== undefined && h.shape !== 'circle') o.range = h.range * a.reachK;
  return o;
}

/** Mondsichel als Begleitgeschoss eines Schlags (Größe nach Kettenschritt) */
function crescent(a: ArtSpec, size: number, at: readonly [number, number]): HitIn {
  return { at, range: 16, dmg: 0.08 * size, poise: 4, knock: 2, fx: 'magic', vfx: a.vfx ?? a.id, projectile: shot(a.color, 26, 0.45 * size, true, 1, 0, 'crescent') };
}

function artStyle(a: ArtSpec): ActionStyleDef {
  const id = a.id;
  const vx = a.vfx ?? id;
  const N = a.names;
  const cres = (size: number, at: readonly [number, number]) => (a.crescents ? [crescent(a, size, at)] : []);
  // Kette kalibriert auf das Kampfmodell (Mondsicheln fliegen zusätzlich mit: darum etwas leichtere Schläge)
  const lk = a.crescents ? 0.7 : 0.82;
  const light = [
    move({ id: `${id}.l1`, label: N[0], clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.34, vfx: vx, hits: [el(a, { range: 2.5, arc: 1.9, dmg: 0.44 * lk, poise: 8, knock: 2, fx: 'punch' }, false), ...cres(0.6, [0.42, 0.5])] }),
    move({ id: `${id}.l2`, label: N[1], clip: 'Melee_Unarmed_Attack_Kick', dur: 0.36, vfx: vx, hits: [el(a, { range: 2.7, arc: 2.1, dmg: 0.47 * lk, poise: 9, knock: 3, fx: 'heavy' }, false), ...cres(0.8, [0.45, 0.52])] }),
    move({ id: `${id}.l3`, label: N[2], clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.4, vfx: vx, hits: [el(a, { shape: 'circle', offset: 1.5, range: 2.4, dmg: 0.55 * lk, poise: 11, knock: 4, fx: 'magic' }), ...cres(1, [0.45, 0.52])] }),
    move({ id: `${id}.l4`, label: N[3], clip: 'Ranged_Magic_Shoot', dur: 0.46, lunge: 0, vfx: vx, hits: [el(a, { shape: 'line', range: 7.5, width: 2, grow: true, dmg: 0.62 * lk, poise: 13, knock: 5, fx: 'magic' }), ...cres(1.3, [0.4, 0.48])] }),
    move({ id: `${id}.l5`, label: N[4], clip: 'Ranged_Magic_Raise', dur: 0.86, lunge: 0, finisher: true, vfx: vx, hits: [el(a, { shape: 'circle', range: 4.8, dmg: 1.3 * lk, poise: 26, knock: 9, fling: 12, vortex: a.vortex ?? 0, fx: 'magic', hitstop: 0.12, shake: 0.55 }), ...cres(1.8, [0.5, 0.58])] }),
  ];
  const branch: ActionStyleDef['branch'] = [
    move({ id: `${id}.b1`, label: 'Schildbrecher-Stoß', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.42, lunge: 6, vfx: vx, hits: [el(a, { range: 2.6, arc: 1.3, dmg: 0.78, poise: 38, knock: 7, breakGuard: true, fx: 'punch', hitstop: 0.1, shake: 0.4 })] }),
    move({ id: `${id}.b2`, label: 'Orkan-Launcher', clip: 'Melee_Unarmed_Attack_Kick', dur: 0.46, rise: 10.6, vfx: vx, hits: [el(a, { shape: 'circle', offset: 1.1, range: 3, dmg: 0.66, poise: 20, knock: 1, launch: 10.8, maxTargets: 12, fx: 'heavy', hitstop: 0.08, shake: 0.35 }, false)] }),
    move({ id: `${id}.b3`, label: '360°-Massenschlacht-Feger', clip: 'Melee_2H_Attack_Spinning', dur: 0.66, from: 0, to: 1, vfx: vx, hits: ticks(3, 0.1, 0.85, el(a, { arc: ROUND, range: 4.4, dmg: 0.34, poise: 10, knock: 7, fling: 8, fx: 'spin', hitstop: 0.04 })) }),
    move({ id: `${id}.b4`, label: 'Langstrecken-Schockwelle', clip: 'Ranged_Magic_Shoot', dur: 0.62, lunge: 0, vfx: vx, hits: [el(a, { shape: 'line', range: 15, width: 3, grow: true, dmg: 1.0, poise: 24, knock: 7, fling: 9, fx: 'magic', hitstop: 0.08, shake: 0.45 })] }),
  ];
  const sk = a.skills.map((s, i): ActionSkill => {
    const { name, short, icon, desc, cd, hits, ...rest } = s;
    return skill({ id: `${id}.k${i + 1}`, slot: i + 1, label: name, short, icon, desc, cd, formMin: FORM_UNLOCK[i], vfx: vx, ...rest, hits: (hits ?? []).map((h) => el(a, h)) } as Parameters<typeof skill>[0]);
  }) as ActionStyleDef['skills'];
  const ultimate = ULTIMATES[id] ?? null;
  return {
    id, label: a.label, title: a.title, desc: a.desc, color: a.color, accent: a.accent, visual: 'effekt', idleClip: 'Melee_Unarmed_Idle',
    light, branch,
    heavy: move({ id: `${id}.s`, label: `${a.label.split('-')[0]}-Hammer`, clip: 'Melee_1H_Attack_Jump_Chop', dur: 0.7, lunge: 4, vfx: vx, hits: [el(a, { shape: 'circle', offset: 1.4, range: 3, dmg: 1.1, poise: 32, knock: 8, fx: 'heavy', hitstop: 0.11, shake: 0.5 })] }),
    air: [
      move({ id: `${id}.a1`, label: 'Luft-Handstoß', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.3, air: true, vfx: vx, hits: [el(a, { ...AIR, range: 2.5, arc: 1.9, dmg: 0.38, poise: 8, fx: 'punch' }, false), ...cres(0.7, [0.4, 0.48])] }),
      move({ id: `${id}.a2`, label: 'Luft-Wirbeltritt', clip: 'Melee_Unarmed_Attack_Kick', dur: 0.34, air: true, vfx: vx, hits: [el(a, { ...AIR, range: 2.6, arc: 2, dmg: 0.42, poise: 9, fx: 'heavy' }, false), ...cres(0.9, [0.42, 0.5])] }),
      move({ id: `${id}.a3`, label: 'Luft-Entladung', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.36, air: true, vfx: vx, hits: [el(a, { ...AIR, shape: 'circle', range: 3, dmg: 0.5, poise: 12, juggle: 4.4, fx: 'magic' }), ...cres(1.2, [0.42, 0.5])] }),
    ],
    meteor: move({ id: `${id}.m`, label: 'Meteor-Sturzangriff', clip: 'Melee_Unarmed_Attack_Kick', dur: 1.0, meteor: true, air: true, vfx: vx, hits: [el(a, { shape: 'circle', range: 4.2, dmg: 1.1, poise: 26, knock: 8, launch: 4, fling: 10, fx: 'magic', hitstop: 0.1, shake: 0.6 })] }),
    finisher: move({ id: `${id}.f`, label: a.finisher, clip: 'Ranged_Magic_Raise', dur: 1.15, hyper: true, iframes: 1.15, cutin: `${a.finisher}!`, magnet: true, vfx: vx, hits: [el(a, { shape: 'circle', offset: 1.5, range: 3.4, dmg: 1, poise: 0, knock: 10, fx: 'magic', hitstop: 0.3, shake: 1.0 })] }),
    skills: sk,
    jumps: a.jumps ?? 2, airDashes: a.airDashes ?? 1, dashSpeed: a.dashSpeed ?? 15, dashTime: 0.26,
    perfectWindow: a.perfectWindow ?? ACTION_TUNING.perfectWindow,
    critMult: 1.6, critBonus: 0.02, penBonus: a.penBonus ?? 0, postureK: 0.95, physical: false,
    faji: true, element: vx,
    awakenWave: awakenWave({ range: 11 * (a.reachK ?? 1), width: 2.4, vfx: vx, status: a.status, statusDur: Math.min(2, a.statusDur), chain: a.chain ?? 0 }),
    ultimate,
  };
}

// ---------- Die acht Künste ----------

const ARTS: ArtSpec[] = [
  {
    id: 'schwarzloch', label: 'Schwarzes Loch', title: 'Finsternis-Gravitation', color: '#B07DFF', accent: '#3A1A6A', status: 'suppress', statusDur: 4, proj: 'void', vortex: 4,
    desc: 'Dunkle Anziehungsfelder ziehen Gegner und Geschosse zusammen und lassen gegnerische Auren erlöschen.',
    names: ['Leerstoß', 'Schwerkrafttritt', 'Dunkelfaust', 'Gravitationswelle', 'Kollaps-Entladung'], finisher: 'Horizontbann',
    skills: [
      { name: 'Gravitationsgriff', short: 'Griff', icon: '◉', cd: 8, desc: 'Ein Anziehungsfeld 6 m vor dir zieht alles zusammen und bannt Auren.', clip: 'Ranged_Magic_Shoot', dur: 0.9, magnet: false, lunge: 0, hits: ticks(3, 0.3, 0.8, { shape: 'circle', offset: 6, range: 6.5, dmg: 0.32, poise: 14, knock: 0, vortex: 9, fx: 'magic' }) },
      { name: 'Ereigniskugel', short: 'Kugel', icon: '●', cd: 9, desc: 'Eine schwere Finsterniskugel rollt 12 m voran und saugt Gegner mit.', clip: 'Ranged_Magic_Shoot', dur: 0.8, magnet: false, lunge: 0, hits: [{ shape: 'line', range: 12, width: 3.2, grow: true, dmg: 1.25, poise: 30, knock: 4, vortex: 5, fx: 'magic' }] },
      { name: 'Schwerkraftsturz', short: 'Sturz', icon: '⇊', cd: 11, desc: 'Sprung und Aufprall mit zehnfacher Schwere: alles im Umkreis wird zu Boden gedrückt.', clip: 'Melee_1H_Attack_Jump_Chop', dur: 0.95, dashTo: 5, dashTime: 0.3, hyper: true, hits: [{ shape: 'circle', offset: 1, range: 6, dmg: 1.8, poise: 60, knock: 2, vortex: 3, fx: 'heavy', hitstop: 0.14, shake: 0.8 }] },
      { name: 'Singularitätsfeld', short: 'Feld', icon: '⊛', cd: 16, desc: 'Ein Feld um dich saugt und zermalmt, gegnerische Auren erlöschen 8 s.', clip: 'Ranged_Magic_Raise', dur: 1.3, magnet: false, lunge: 0, hyper: true, hits: ticks(5, 0.15, 0.85, { shape: 'circle', range: 9, dmg: 0.45, poise: 18, knock: 0, vortex: 6, status: 'suppress', statusDur: 8, fx: 'magic' }, { dmg: 1.3, knock: 12, fling: 14, vortex: 0, hitstop: 0.12, shake: 0.7 }) },
    ],
  },
  {
    id: 'feuer', label: 'Feuer-Faji', title: 'Glut der Handflächen', color: '#FF7A3A', accent: '#FFD27A', status: 'burn', statusDur: 3, proj: 'flame',
    desc: 'Brennende Handflächen-Stöße, Flammenwirbel und glühende Verbrennungs-Wellen.',
    names: ['Glutstoß', 'Flammentritt', 'Glutdoppel', 'Feuerwelle', 'Flammenwirbel-Entladung'], finisher: 'Glutbann',
    skills: [
      { name: 'Glutfächer', short: 'Glut', icon: '🔥', cd: 7, desc: 'Ein Flammenkegel aus beiden Handflächen, 7 m weit.', clip: 'Ranged_Magic_Shoot', dur: 0.7, magnet: false, lunge: 0, hits: ticks(3, 0.3, 0.7, { shape: 'arc', arc: 1.2, range: 7, dmg: 0.5, poise: 10, knock: 3, fx: 'magic' }) },
      { name: 'Flammenwirbel', short: 'Wirbel', icon: '🌀', cd: 9, desc: 'Du drehst dich in einer Feuersäule, alles in 4 m brennt.', clip: 'Melee_2H_Attack_Spinning', dur: 1.0, from: 0, to: 1, hits: ticks(4, 0.08, 0.9, { arc: ROUND, range: 4.2, dmg: 0.42, poise: 10, knock: 5, fling: 6, fx: 'spin' }) },
      { name: 'Brandwelle', short: 'Welle', icon: '≈', cd: 10, desc: 'Eine glühende Welle rollt 14 m über den Boden.', clip: 'Ranged_Magic_Raise', dur: 0.85, magnet: false, lunge: 0, hits: [{ shape: 'line', range: 14, width: 4, grow: true, dmg: 1.55, poise: 30, knock: 8, fling: 10, fx: 'magic', hitstop: 0.08 }] },
      { name: 'Phönixsprung', short: 'Phönix', icon: '♨', cd: 14, desc: 'Ein Flammensprung in die Luft und ein brennender Einschlag.', clip: 'Melee_1H_Attack_Jump_Chop', dur: 1.1, rise: 9, airOk: true, hyper: true, hits: [{ shape: 'circle', range: 6.2, at: [0.62, 0.74], dmg: 2.1, poise: 50, knock: 10, fling: 14, fx: 'heavy', hitstop: 0.14, shake: 0.9, down: 3 }] },
    ],
  },
  {
    id: 'eis', label: 'Eis-Faji', title: 'Frost der Ewigkeit', color: '#BFEFFF', accent: '#5AB8FF', status: 'slow', statusDur: 2.5, proj: 'frost',
    desc: 'Gefrierende Frostwellen, Eislanzen aus dem Boden und splitternde Kristall-Stöße.',
    names: ['Froststoß', 'Reiftritt', 'Kristallfaust', 'Frostwelle', 'Splitterkranz-Entladung'], finisher: 'Gletscherbann',
    skills: [
      { name: 'Frostwelle', short: 'Frost', icon: '❄', cd: 7, desc: 'Eine Welle aus Raureif, 10 m weit: alles darin wird langsam.', clip: 'Ranged_Magic_Shoot', dur: 0.7, magnet: false, lunge: 0, hits: [{ shape: 'line', range: 10, width: 3.4, grow: true, dmg: 1.1, poise: 18, knock: 3, fx: 'magic' }] },
      { name: 'Eislanzen', short: 'Lanzen', icon: '⟰', cd: 9, desc: 'Drei Reihen Eislanzen brechen aus dem Boden und schleudern hoch.', clip: 'Melee_2H_Attack_Chop', dur: 0.95, magnet: false, lunge: 0, hits: [{ shape: 'circle', offset: 4, range: 2.4, at: [0.4, 0.46], dmg: 0.6, poise: 16, launch: 6, status: 'freeze', statusDur: 1, fx: 'heavy' }, { shape: 'circle', offset: 7, range: 2.6, at: [0.5, 0.56], dmg: 0.6, poise: 16, launch: 6, status: 'freeze', statusDur: 1, fx: 'heavy' }, { shape: 'circle', offset: 10, range: 2.8, at: [0.6, 0.66], dmg: 0.7, poise: 18, launch: 7, status: 'freeze', statusDur: 1, fx: 'heavy' }] },
      { name: 'Kristallstoß', short: 'Kristall', icon: '◆', cd: 10, desc: 'Ein splitternder Kristall-Stoß mit großem Haltungsschaden.', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.7, lunge: 5, hits: [{ shape: 'arc', arc: 1.6, range: 5, dmg: 1.7, poise: 55, knock: 9, status: 'freeze', statusDur: 2, fx: 'heavy', hitstop: 0.12, shake: 0.6 }] },
      { name: 'Frostkerker', short: 'Kerker', icon: '⛆', cd: 15, desc: 'Alles in 7 m friert 3 s ein, dann zerspringt das Eis.', clip: 'Ranged_Magic_Raise', dur: 1.3, magnet: false, lunge: 0, hits: [{ shape: 'circle', range: 7, at: [0.35, 0.42], dmg: 0.6, poise: 30, knock: 0, status: 'freeze', statusDur: 3, fx: 'magic' }, { shape: 'circle', range: 7.5, at: [0.86, 0.92], dmg: 1.9, poise: 60, knock: 10, fling: 12, fx: 'heavy', hitstop: 0.12, shake: 0.7 }] },
    ],
  },
  {
    id: 'wasser', label: 'Wasser-Faji', title: 'Gezeitenhand', color: '#5AC8FF', accent: '#1A6AFF', status: '', statusDur: 0, proj: 'water', perfectWindow: 0.24,
    desc: 'Fließende Gezeiten-Konter, Strudel-Feger und Hochdruck-Wellenstöße.',
    names: ['Wellenstoß', 'Brandungstritt', 'Strömungsfaust', 'Hochdruckwelle', 'Gezeitenbruch-Entladung'], finisher: 'Tiefseebann',
    skills: [
      { name: 'Gezeitenkonter', short: 'Konter', icon: '◐', cd: 9, desc: 'Konterhaltung: wer zuschlägt, wird von der Gezeit erwidert; am Ende rollt eine Brandungswelle 10 m weit.', clip: 'Melee_Blocking', dur: 1.0, from: 0, to: 1, magnet: false, lunge: 0, counter: 1.0, hits: [{ shape: 'line', range: 10, width: 3, grow: true, at: [0.84, 0.96], dmg: 0.7, poise: 16, knock: 8, fx: 'magic' }] },
      { name: 'Strudelfeger', short: 'Strudel', icon: '🌊', cd: 10, desc: 'Ein Strudel um dich zieht Gegner herein und wirbelt sie herum.', clip: 'Melee_2H_Attack_Spinning', dur: 1.05, from: 0, to: 1, hits: ticks(4, 0.08, 0.9, { arc: ROUND, range: 5, dmg: 0.4, poise: 12, knock: 1, vortex: 6, fx: 'spin' }, { knock: 10, fling: 10, vortex: 0 }) },
      { name: 'Hochdruckstrahl', short: 'Strahl', icon: '➵', cd: 9, desc: 'Ein Wasserstrahl, so hart wie Stahl, 16 m weit.', clip: 'Ranged_Magic_Shoot', dur: 0.8, magnet: false, lunge: 0, hits: [{ shape: 'line', range: 16, width: 1.6, grow: true, dmg: 1.6, poise: 28, knock: 9, pen: 1, fx: 'magic', hitstop: 0.08 }] },
      { name: 'Flutwand', short: 'Flut', icon: '≋', cd: 14, desc: 'Eine 10 m breite Flutwand spült alles fort.', clip: 'Ranged_Magic_Raise', dur: 1.1, magnet: false, lunge: 0, hyper: true, hits: [{ shape: 'line', range: 14, width: 10, grow: true, dmg: 1.9, poise: 40, knock: 18, fling: 16, status: 'slow', statusDur: 3, fx: 'magic', hitstop: 0.1, shake: 0.7 }] },
    ],
  },
  {
    id: 'wind', label: 'Wind-Faji', title: 'Vakuumklinge', color: '#E8FFF4', accent: '#7AE8C8', status: '', statusDur: 0, proj: 'wind', reachK: 1.25, jumps: 3, airDashes: 2, dashSpeed: 18,
    desc: 'Rasiermesserscharfe Vakuum-Luftstöße, Auftriebs-Wirbelstürme und Überschall-Sprints.',
    names: ['Vakuumstoß', 'Sichelwind-Tritt', 'Böenfaust', 'Luftklinge', 'Zyklon-Entladung'], finisher: 'Himmelsbann',
    skills: [
      { name: 'Vakuumklinge', short: 'Vakuum', icon: '➹', cd: 6, desc: 'Ein rasiermesserscharfer Luftstoß, 14 m weit.', clip: 'Ranged_Magic_Shoot', dur: 0.6, magnet: false, lunge: 0, hits: [{ shape: 'line', range: 14, width: 1.4, grow: true, dmg: 1.2, poise: 16, knock: 4, pen: 1, fx: 'slash' }] },
      { name: 'Auftriebswirbel', short: 'Auftrieb', icon: '🌪', cd: 8, desc: 'Ein Wirbelsturm hebt dich und alles um dich in die Luft.', clip: 'Melee_2H_Attack_Spinning', dur: 0.62, rise: 9.5, airOk: true, hits: [{ shape: 'circle', range: 4.6, dmg: 0.7, poise: 16, knock: 1, launch: 10, maxTargets: 12, fx: 'spin', down: 1.5 }] },
      { name: 'Überschallsprint', short: 'Sprint', icon: '⇶', cd: 8, desc: 'Ein Sprint schneller als der Schall durch alle Gegner auf 12 m.', clip: 'Dodge_Forward', dur: 0.55, from: 0, to: 1, dashTo: 12, dashTime: 0.22, through: true, iframes: 0.35, afterimage: true, airOk: true, hits: ticks(3, 0.06, 0.45, { shape: 'circle', range: 2.4, dmg: 0.45, poise: 10, knock: 4, fx: 'slash', down: 2 }) },
      { name: 'Klingenorkan', short: 'Orkan', icon: '✳', cd: 14, desc: 'Sechs Windklingen kreisen 8 m um dich und ziehen Gegner mit.', clip: 'Ranged_Magic_Raise', dur: 1.3, magnet: false, lunge: 0, hits: ticks(6, 0.12, 0.88, { shape: 'circle', range: 8, dmg: 0.42, poise: 12, knock: 3, vortex: 2, fx: 'slash' }, { dmg: 1.1, knock: 12, fling: 14, vortex: 0 }) },
    ],
  },
  {
    id: 'blitz', label: 'Blitz-Faji', title: 'Hochspannung', color: '#FFF3A0', accent: '#7A9BFF', status: 'shock', statusDur: 1.2, proj: 'bolt', chain: 1,
    desc: 'Hochspannungs-Entladungen, Kettenblitze durch ganze Formationen und Donner-Schritte.',
    names: ['Funkenstoß', 'Donnertritt', 'Spannungsfaust', 'Blitzwelle', 'Gewitter-Entladung'], finisher: 'Donnerbann',
    skills: [
      { name: 'Entladung', short: 'Funke', icon: 'ϟ', cd: 7, desc: 'Hochspannung in 4 m, die auf drei weitere Gegner überspringt.', clip: 'Ranged_Magic_Raise', dur: 0.75, magnet: false, lunge: 0, hits: [{ shape: 'circle', range: 4, dmg: 0.9, poise: 18, knock: 5, chain: 3, chainRange: 7, fx: 'magic' }] },
      { name: 'Donnerschritt', short: 'Schritt', icon: '⇉', cd: 8, desc: 'Ein Blitzsprung 9 m voran, jeder Getroffene leitet weiter.', clip: 'Dodge_Forward', dur: 0.55, from: 0, to: 1, dashTo: 9, dashTime: 0.16, through: true, iframes: 0.3, afterimage: true, hits: ticks(2, 0.06, 0.4, { shape: 'circle', range: 2.6, dmg: 0.6, poise: 12, knock: 4, chain: 2, chainRange: 7, fx: 'magic', down: 2 }) },
      { name: 'Kettenblitz', short: 'Kette', icon: '⌁', cd: 10, desc: 'Ein Blitz 16 m voran, der durch ganze Truppen-Formationen springt.', clip: 'Ranged_Magic_Shoot', dur: 0.8, magnet: false, lunge: 0, hits: [{ shape: 'line', range: 16, width: 2, grow: true, dmg: 1.3, poise: 22, knock: 5, chain: 5, chainRange: 9, fx: 'magic' }] },
      { name: 'Gewittersäule', short: 'Säule', icon: '☈', cd: 15, desc: 'Fünf Blitze schlagen in eine Säule 6 m vor dir ein.', clip: 'Ranged_Magic_Raise', dur: 1.25, magnet: false, lunge: 0, hits: ticks(5, 0.2, 0.86, { shape: 'circle', offset: 6, range: 6, dmg: 0.6, poise: 20, knock: 3, chain: 1, fx: 'magic' }, { dmg: 1.4, knock: 10, fling: 12, hitstop: 0.12, shake: 0.7 }) },
    ],
  },
  {
    id: 'sonne', label: 'Sonnen-Faji', title: 'Strahlende Form', color: '#FFE88A', accent: '#FF9A2A', status: 'sunder', statusDur: 6, proj: 'sun', pen: 1, penBonus: 1,
    desc: 'Strahlende Sonnen-Energie brennt Rüstungen und Regeneration durch.',
    names: ['Lichtstoß', 'Glanztritt', 'Strahlenfaust', 'Sonnenwelle', 'Korona-Entladung'], finisher: 'Zenitbann',
    skills: [
      { name: 'Sonnenhand', short: 'Hand', icon: '☀', cd: 7, desc: 'Ein Handflächen-Stoß, der Rüstung 6 s lang durchbrennt.', clip: 'Melee_Unarmed_Attack_Punch_A', dur: 0.62, lunge: 4, hits: [{ shape: 'arc', arc: 1.4, range: 4, dmg: 1.2, poise: 24, knock: 6, pen: 2, fx: 'heavy', hitstop: 0.08 }] },
      { name: 'Strahlenkranz', short: 'Kranz', icon: '✺', cd: 9, desc: 'Ein Kranz aus Licht um dich: Rüstung und Heilung der Gegner versagen.', clip: 'Ranged_Magic_Raise', dur: 0.9, magnet: false, lunge: 0, hits: ticks(2, 0.35, 0.7, { shape: 'circle', range: 5.2, dmg: 0.7, poise: 18, knock: 6, fx: 'magic' }) },
      { name: 'Mittagsglut', short: 'Glut', icon: '⇢', cd: 10, desc: 'Ein Sonnenstrahl 14 m voran, durchschlägt jede Panzerung.', clip: 'Ranged_Magic_Shoot', dur: 0.85, magnet: false, lunge: 0, hits: [{ shape: 'line', range: 14, width: 2.2, grow: true, dmg: 1.5, poise: 26, knock: 6, pen: 3, fx: 'magic', hitstop: 0.08 }] },
      { name: 'Sonnenaufgang', short: 'Aufgang', icon: '◓', cd: 15, desc: 'Du steigst auf wie die Sonne und schlägst mit 7 m Glut ein.', clip: 'Melee_1H_Attack_Jump_Chop', dur: 1.15, rise: 8, airOk: true, hyper: true, hits: [{ shape: 'circle', range: 7, at: [0.62, 0.74], dmg: 2.1, poise: 55, knock: 10, fling: 12, statusDur: 10, fx: 'heavy', hitstop: 0.14, shake: 0.9, down: 3 }] },
    ],
  },
  {
    id: 'mond', label: 'Mond-Faji', title: 'Sichelbahn', color: '#E0D0FF', accent: '#8A6AFF', status: '', statusDur: 0, proj: 'crescent', crescents: true,
    desc: 'Sichelförmige Energie-Bögen in mehreren Größen fliegen bei jedem Schlag mit.',
    names: ['Sichelstoß', 'Halbmondtritt', 'Mondfaust', 'Sichelwelle', 'Vollmond-Entladung'], finisher: 'Neumondbann',
    skills: [
      { name: 'Sichelwurf', short: 'Sicheln', icon: '☾', cd: 6, desc: 'Drei Mondsicheln im Fächer, 18 m weit.', clip: 'Ranged_Magic_Shoot', dur: 0.6, magnet: false, lunge: 0, hits: [{ range: 18, dmg: 0.5, poise: 10, knock: 3, fx: 'magic', projectile: shot('#E0D0FF', 26, 0.6, true, 3, 0.22, 'crescent') }] },
      { name: 'Mondbogen', short: 'Bogen', icon: '◑', cd: 8, desc: 'Eine riesige Mondsichel durchschneidet alles auf 22 m.', clip: 'Ranged_Magic_Shoot', dur: 0.75, magnet: false, lunge: 0, hits: [{ range: 22, dmg: 1.6, poise: 26, knock: 6, fx: 'magic', projectile: shot('#E0D0FF', 22, 1.5, true, 1, 0, 'crescent') }] },
      { name: 'Halbmondtanz', short: 'Tanz', icon: '❨', cd: 10, desc: 'Vier kreisende Schnitte, bei jedem fliegen Sicheln mit.', clip: 'Melee_2H_Attack_Spinning', dur: 1.0, from: 0, to: 1, hits: [...ticks(4, 0.08, 0.9, { arc: ROUND, range: 4.2, dmg: 0.4, poise: 10, knock: 5, fling: 6, fx: 'spin' }), { at: [0.5, 0.56], range: 16, dmg: 0.4, poise: 6, knock: 2, fx: 'magic', projectile: shot('#E0D0FF', 24, 0.8, true, 4, 0.4, 'crescent') }] },
      { name: 'Neumondkreis', short: 'Kreis', icon: '◯', cd: 15, desc: 'Ein Kreis aus Mondsicheln, 9 m um dich, sechsmal hintereinander.', clip: 'Ranged_Magic_Raise', dur: 1.3, magnet: false, lunge: 0, hits: ticks(6, 0.12, 0.88, { shape: 'circle', range: 9, dmg: 0.42, poise: 12, knock: 5, fx: 'magic' }, { dmg: 1.2, knock: 12, fling: 14 }) },
    ],
  },
];

/**
 * 4.7B: der Priester – Licht- & Lebens-Faji (DPS/Heilung). Lichtstrahlen und Urteile strafen, Segen und Heilung tragen die Figur und ihre
 * Verbündeten (`ActionMove.heal`). Er ist eine Spezialisierung der Faji-Wirker, aber keine Meisterschafts-Kunst (kein Q-Wechsel, keine Formstufen).
 */
const PRIEST: ArtSpec = {
  id: 'priester', vfx: 'sonne', label: 'Priester', title: 'Licht- & Lebens-Faji', color: '#FFF1B8', accent: '#5AE8A0', status: '', statusDur: 0, proj: 'sun', pen: 1,
  desc: 'Lichtstrahlen und Urteile strafen die Feinde; Segen und Heilung tragen dich und deine Verbündeten.',
  names: ['Lichtfunke', 'Segenstritt', 'Strahlenhand', 'Urteilswelle', 'Gnaden-Entladung'], finisher: 'Gnadenbann',
  skills: [
    { name: 'Heilende Hand', short: 'Heilen', icon: '✚', cd: 9, desc: 'Heilt dich um 16 % deiner Lebenspunkte; ein Lichtstoß trifft die Gegner vor dir.', clip: 'Ranged_Magic_Spellcasting', dur: 0.6, magnet: false, lunge: 0, heal: 0.16, healR: 0, hits: [{ shape: 'arc', arc: 1.6, range: 3.5, dmg: 0.5, poise: 8, knock: 3, fx: 'magic' }] },
    { name: 'Lichtstrahl', short: 'Strahl', icon: '✦', cd: 6, desc: 'Ein gebündelter Lichtstrahl, 16 m weit, durchschlägt Rüstung.', clip: 'Ranged_Magic_Shoot', dur: 0.7, magnet: false, lunge: 0, hits: [{ shape: 'line', range: 16, width: 1.8, grow: true, dmg: 1.2, poise: 18, knock: 4, pen: 2, fx: 'magic' }] },
    { name: 'Urteilsspruch', short: 'Urteil', icon: '⚖', cd: 10, desc: 'Ein Lichturteil schlägt 6 m vor dir ein und bricht die Haltung.', clip: 'Ranged_Magic_Raise', dur: 0.9, magnet: false, lunge: 0, hits: [{ shape: 'circle', offset: 6, range: 4.5, at: [0.55, 0.62], dmg: 1.7, poise: 50, knock: 8, launch: 5, fx: 'heavy', hitstop: 0.1, shake: 0.6 }] },
    { name: 'Segenskreis', short: 'Segen', icon: '❂', cd: 15, desc: 'Ein Kreis aus Licht heilt dich und alle Verbündeten in 10 m um 14 % und versengt Gegner in 6 m.', clip: 'Ranged_Magic_Raise', dur: 1.1, magnet: false, lunge: 0, heal: 0.14, healR: 10, hits: ticks(3, 0.3, 0.8, { shape: 'circle', range: 6, dmg: 0.45, poise: 12, knock: 5, fx: 'magic' }) },
  ],
};

/** 4.7B: der Priester als Action-Stil */
export const PRIEST_STYLE: ActionStyleDef = artStyle(PRIEST);

/** Die acht Faji-Künste als Action-Stile */
export const FAJI_STYLES: Record<FajiArtId, ActionStyleDef> = Object.fromEntries(ARTS.map((a) => [a.id, artStyle(a)])) as Record<FajiArtId, ActionStyleDef>;

// ---------- Willenskraft, Sturm-Erwachen und Auren ----------

/** Willenskraft-Leiste und Sturm-Erwachen (alle Zeiten in s) */
export const WILL = {
  max: 100,
  /** Zuwachs: je Treffer (höchstens 4 je Fenster), perfektes Ausweichen, Konter, Haltungsbruch/K.O., Finisher-Treffer, eigener Treffer */
  hit: 1, hitCap: 4, perfect: 10, counter: 8, broke: 4, finisher: 12, hurt: 3,
  /** Sturm-Erwachen: Dauer, Angriffstempo */
  awakenDur: 18,
  awakenSpeed: 1.2,
} as const;

export type AuraId = 0 | 1 | 2 | 3;

export interface AuraDef { id: AuraId; label: string; short: string; desc: string; color: string; icon: string }

/** Die drei Willenskraft-Auren (eine ist aktiv; Taste wechselt der Reihe nach, 0 = keine) */
export const WILL_AURAS: readonly AuraDef[] = [
  { id: 0, label: 'Keine Aura', short: '–', desc: 'Keine Willenskraft-Aura aktiv.', color: '#9A8A70', icon: '○' },
  { id: 1, label: 'Sturmblick', short: 'Blick', desc: 'Angriffe der Gegner leuchten vorher auf; das Fenster für den Sturm-Schritt ist länger, die Zeitlupe danach tiefer.', color: '#7AD8FF', icon: '◎' },
  { id: 2, label: 'Eisenwille', short: 'Eisen', desc: 'Dunkler Metallglanz auf Waffe und Armen: deine Schläge durchdringen Rüstung (eine Waffenstufe mehr), du nimmst 10 % weniger Schaden.', color: '#8A9AB0', icon: '◆' },
  { id: 3, label: 'Königsdruck', short: 'König', desc: 'Weite Willens-Druckwelle: alle 6 s schleudert sie Truppen fort und lässt schwache Gegner zurückweichen; beim Sturm-Erwachen bricht sie gewaltig los.', color: '#FFD27A', icon: '♛' },
];

/** Wirkung der Auren */
export const AURA = {
  /** Sturmblick: längeres Fenster des Sturm-Schritts, Zeitlupe danach (Dauer, Faktor) */
  sightWindow: 0.07, sightSlowDur: 0.65, sightSlowK: 0.1,
  /** Eisenwille: Durchschlag (+ Waffenstufen gegen Rüstung, die Kurve gilt weiter) und Schadensminderung */
  ironPen: 1, ironReduce: 0.1,
  /** Königsdruck: Takt, Mindestzahl Ziele, Radius (normal / beim Erwachen) */
  kingEvery: 6, kingMin: 3, kingR: 14, kingAwakenR: 20,
} as const;

/** Druckwelle des Königsdrucks (normaler Puls); beim Erwachen mit großem Radius */
export const KING_WAVE: ActionHit = {
  t0: 0, t1: 0.1, shape: 'circle', range: AURA.kingR, arc: 6.3, width: 2, offset: 0, inner: 0, up: 3, down: 2, dmg: 0.35, poise: 18, knock: 12, launch: 0,
  juggle: 0, fling: 14, breakGuard: false, pull: false, pen: 0, maxTargets: 0, hitstop: 0.02, shake: 0.4, fx: 'magic', projectile: null,
  grow: false, status: 'fear', statusDur: 2, chain: 0, chainRange: 6, vortex: 0, delayTo: 0, vfx: 'koenig',
};

/** Ist die Technik bei dieser Form schon frei? (Waffenstile: immer) */
export const skillUnlocked = (sk: { formMin: number }, form: number): boolean => form >= sk.formMin;

/** Stil-Kennung als Faji-Kunst (oder null) */
export const fajiArtOf = (id: ActionStyleId): FajiArtId | null => (isFajiArt(id) ? id : null);

// ---------- Spielstand ----------

/** Faji-Künste im Spielstand (`player.faji`): ausgerüstete Kunst (Q-Wechsel), Meisterschaft je Kunst, Willenskraft-Aura */
export interface FajiSave { equipped: FajiArtId | null; mastery: Record<FajiArtId, number>; aura: AuraId }
/** Höchste Meisterschaft (weit über der Meisterform, damit Zahlen nicht wachsen) */
export const MASTERY_CAP = 99999;
/** Ausgerüstete Kunst für neue Spielstände: Feuer-Faji (im Menü „Kampfkünste“ frei wählbar) */
export const DEFAULT_FAJI_ART: FajiArtId = 'feuer';

/** Spielstand-Eintrag prüfen und ergänzen (alte Stände ohne Eintrag bekommen den Standard) */
export function cleanFaji(v: unknown): FajiSave {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<{ equipped: unknown; mastery: unknown; aura: unknown }>;
  const mastery = {} as Record<FajiArtId, number>;
  const m = (o.mastery && typeof o.mastery === 'object' ? o.mastery : {}) as Record<string, unknown>;
  for (const id of FAJI_ART_IDS) {
    const n = Number(m[id]);
    mastery[id] = Number.isFinite(n) ? Math.max(0, Math.min(MASTERY_CAP, Math.floor(n))) : 0;
  }
  const equipped = o.equipped === null ? null : isFajiArt(o.equipped) ? o.equipped : DEFAULT_FAJI_ART;
  const a = Number(o.aura);
  const aura = (a === 1 || a === 2 || a === 3 ? a : 0) as AuraId;
  return { equipped, mastery, aura };
}
