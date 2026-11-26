// Phase 4.7C – eigene Standardangriffe und Kombos der Faji-Wirker: reiner Elementarkampf ohne Nahkampf-Gefuchtel. Jedes Element schleudert
// seine eigenen Geschosse bzw. Strahlen (Feuerlanzen, Eissplitter-Salven, Wasserpeitschen, Windklingen, Blitzbögen, Sonnenstrahlen,
// Mondsicheln, Gravitationssphären; der Priester goldene Lichtlanzen und heilige Glyphen) und endet in einem elementaren Kombo-Finisher –
// beim Priester einer heilenden Lichtwelle für die Figur und ihre Verbündeten. Verzweigungen, Schwer, Luft-Kette und Meteor sind ebenfalls
// elementar und tragen eigene Namen. Nur Zauber-Clips (Schuss, Wirken, Heben). Reine Daten, abgestimmt auf das Kampfmodell (Balance-Tests).
import { AIR, ROUND, move, shot, ticks, type ActionMove, type HitIn, type HitStatus, type ProjectileKind } from './actionKit';

/** Element (bzw. Priester), Farben, Zustand und Geschoss der Kunst */
export interface ComboElement {
  id: string; vfx: string; color: string; accent: string;
  status: HitStatus; statusDur: number; proj: ProjectileKind;
}

/** Namen eines Satzes: Kette L1 … L5, Verzweigungen B1 … B4, Schwer, Luft-Kette A1 … A3, Meteor */
export interface ComboNames { l: [string, string, string, string, string]; b: [string, string, string, string]; s: string; a: [string, string, string]; m: string }

export const COMBO_NAMES: Readonly<Record<string, ComboNames>> = {
  feuer: { l: ['Feuerlanze', 'Glutlanze', 'Glutfächer', 'Flammenspeer', 'Inferno-Ausbruch'], b: ['Glutbruch', 'Glutfontäne', 'Feuerring', 'Lavawelle'], s: 'Feuerbombe', a: ['Luft-Feuerlanze', 'Glutregen', 'Flammensturz'], m: 'Phönix-Sturz' },
  eis: { l: ['Eissplitter', 'Frostsplitter', 'Splitter-Salve', 'Eislanze', 'Gletscherbruch'], b: ['Frostbruch', 'Eisfontäne', 'Frostring', 'Raureifwelle'], s: 'Eisbombe', a: ['Luft-Eissplitter', 'Hagelschauer', 'Froststurz'], m: 'Gletscher-Sturz' },
  wasser: { l: ['Wasserpeitsche', 'Rückpeitsche', 'Doppelpeitsche', 'Druckstrahl', 'Gezeitenbruch'], b: ['Strudelbruch', 'Wasserfontäne', 'Brandungsring', 'Sturmflut-Welle'], s: 'Wasserbombe', a: ['Luft-Peitsche', 'Sprühregen', 'Wasserfall-Sturz'], m: 'Tiefsee-Sturz' },
  wind: { l: ['Windklinge', 'Sichelböe', 'Klingenfächer', 'Vakuumschnitt', 'Zyklon-Ausbruch'], b: ['Böenbruch', 'Windhose', 'Sturmring', 'Orkanwelle'], s: 'Druckluftbombe', a: ['Luft-Windklinge', 'Fallbö', 'Sturzbö'], m: 'Wirbelsturm-Sturz' },
  blitz: { l: ['Blitzbogen', 'Funkenbogen', 'Gabelblitz', 'Donnerkeil', 'Gewitter-Ausbruch'], b: ['Spannungsbruch', 'Blitzsäule', 'Funkenring', 'Donnerwelle'], s: 'Kugelblitz', a: ['Luft-Blitzbogen', 'Funkenregen', 'Donnersturz'], m: 'Himmelsblitz-Sturz' },
  sonne: { l: ['Sonnenstrahl', 'Glanzstrahl', 'Strahlenfächer', 'Zenitlanze', 'Korona-Ausbruch'], b: ['Glanzbruch', 'Lichtfontäne', 'Sonnenring', 'Mittagswelle'], s: 'Sonnenbombe', a: ['Luft-Sonnenstrahl', 'Strahlenregen', 'Zenitsturz'], m: 'Sonnenfall' },
  mond: { l: ['Mondsichel', 'Halbmondsichel', 'Sichelpaar', 'Vollmondsichel', 'Neumond-Ausbruch'], b: ['Schattenbruch', 'Mondfontäne', 'Sichelring', 'Gezeitensichel'], s: 'Mondkugel', a: ['Luft-Mondsichel', 'Sternsicheln', 'Mondsturz'], m: 'Mondfall' },
  schwarzloch: { l: ['Gravitationssphäre', 'Schwerkraftsphäre', 'Sphärenpaar', 'Ereignislanze', 'Kollaps-Ausbruch'], b: ['Schwerkraftbruch', 'Gravitationsfontäne', 'Akkretionswirbel', 'Gravitationswoge'], s: 'Singularitätsbombe', a: ['Luft-Sphäre', 'Leerenregen', 'Gravitationsfall'], m: 'Ereignissturz' },
  priester: { l: ['Lichtlanze', 'Segenslanze', 'Glyphen-Salve', 'Heilige Lanze', 'Gnadenwelle'], b: ['Bannbruch', 'Lichtsäule', 'Glyphenring', 'Gerichtswelle'], s: 'Glyphenbombe', a: ['Luft-Lichtlanze', 'Glyphenregen', 'Lichtsturz'], m: 'Erzengel-Sturz' },
};

/** Heilung der Gnadenwelle (Priester-Finisher der Kette): Anteil der Höchst-LP und Radius für Verbündete (Crew, Trupps) */
export const PRIEST_CHAIN_HEAL = { heal: 0.06, healR: 12 } as const;

/** Zauber-Clips der Kette (keine Faust- oder Tritt-Clips) */
const SHOOT = 'Ranged_Magic_Shoot';
const CAST = 'Ranged_Magic_Spellcasting';
const RAISE = 'Ranged_Magic_Raise';

/**
 * Die Leicht-Kette L1 … L5 eines Elements. `el` versieht jeden Treffer mit dem Element (Farbe, Zustand, Kettenblitz, Durchschlag) wie
 * bei den Techniken der Kunst.
 */
export function elementLight(e: ComboElement, el: (h: HitIn, withStatus?: boolean) => HitIn): ActionMove[] {
  const N = COMBO_NAMES[e.id].l;
  const id = e.id, vx = e.vfx;
  const P = (speed: number, radius: number, pierce = false, count = 1, spread = 0, kind: ProjectileKind = e.proj, color = e.color) => shot(color, speed, radius, pierce, count, spread, kind);
  const m = (i: number, clip: string, dur: number, hits: HitIn[], extra: Partial<ActionMove> = {}) =>
    move({ id: `${id}.l${i + 1}`, label: N[i], clip, dur, magnet: false, lunge: 0, vfx: vx, hits: hits.map((h) => el(h, !h.projectile)), ...extra });
  const fin = (hits: HitIn[], extra: Partial<ActionMove> = {}) => m(4, RAISE, 0.9, hits, { finisher: true, ...extra });
  const area = (h: HitIn): HitIn => ({ shape: 'circle', fx: 'magic', poise: 12, knock: 4, ...h });
  switch (id) {
    case 'feuer': return [
      m(0, SHOOT, 0.42, [{ range: 22, dmg: 0.42, poise: 8, knock: 2, fx: 'magic', projectile: P(34, 0.55) }]),
      m(1, CAST, 0.42, [{ range: 22, dmg: 0.42, poise: 8, knock: 2, fx: 'magic', projectile: P(34, 0.55) }]),
      m(2, SHOOT, 0.46, [{ range: 20, dmg: 0.17, poise: 5, knock: 2, fx: 'magic', projectile: P(30, 0.45, false, 3, 0.2) }]),
      m(3, SHOOT, 0.5, [{ range: 24, dmg: 0.55, poise: 14, knock: 5, fx: 'magic', projectile: P(36, 0.9, true) }]),
      fin(ticks(3, 0.3, 0.58, area({ offset: 6.5, range: 3.8, dmg: 0.25, status: 'burn', statusDur: 3 }), { dmg: 0.38, poise: 26, knock: 9, fling: 11, hitstop: 0.12, shake: 0.55 })),
    ];
    case 'eis': return [
      m(0, SHOOT, 0.42, [{ range: 22, dmg: 0.2, poise: 5, knock: 1, fx: 'magic', projectile: P(38, 0.4, false, 2, 0.1) }]),
      m(1, CAST, 0.42, [{ range: 22, dmg: 0.2, poise: 5, knock: 1, fx: 'magic', projectile: P(38, 0.4, false, 2, 0.1) }]),
      m(2, SHOOT, 0.46, [{ range: 20, dmg: 0.1, poise: 4, knock: 1, fx: 'magic', projectile: P(36, 0.35, false, 5, 0.13) }]),
      m(3, SHOOT, 0.5, [{ range: 24, dmg: 0.55, poise: 16, knock: 5, fx: 'magic', projectile: P(40, 0.85, true) }]),
      fin([...ticks(2, 0.3, 0.46, area({ offset: 6, range: 4.2, dmg: 0.28, status: 'slow', statusDur: 2 })), area({ offset: 6, range: 4.4, at: [0.5, 0.58], dmg: 0.38, poise: 30, knock: 9, fling: 10, status: 'freeze', statusDur: 1.2, fx: 'heavy', hitstop: 0.12, shake: 0.55 })]),
    ];
    case 'wasser': return [
      m(0, SHOOT, 0.42, [{ shape: 'line', range: 8, width: 1.4, grow: true, dmg: 0.45, poise: 9, knock: 3, fx: 'magic' }]),
      m(1, CAST, 0.42, [{ shape: 'line', range: 8, width: 1.4, grow: true, dmg: 0.45, poise: 9, knock: 3, fx: 'magic' }]),
      m(2, SHOOT, 0.46, ticks(2, 0.3, 0.62, { shape: 'line', range: 9, width: 1.6, grow: true, dmg: 0.26, poise: 7, knock: 3, fx: 'magic' })),
      m(3, SHOOT, 0.5, [{ shape: 'line', range: 14, width: 1.6, grow: true, dmg: 0.58, poise: 16, knock: 6, pen: 1, fx: 'magic' }]),
      fin([{ shape: 'line', range: 12, width: 5.5, grow: true, dmg: 0.8, poise: 28, knock: 9, fling: 12, status: 'slow', statusDur: 2.5, fx: 'magic', hitstop: 0.12, shake: 0.55 }]),
    ];
    case 'wind': return [
      m(0, SHOOT, 0.42, [{ range: 24, dmg: 0.4, poise: 7, knock: 2, fx: 'slash', projectile: P(40, 0.5, true) }]),
      m(1, CAST, 0.42, [{ range: 24, dmg: 0.4, poise: 7, knock: 2, fx: 'slash', projectile: P(40, 0.5, true) }]),
      m(2, SHOOT, 0.46, [{ range: 22, dmg: 0.17, poise: 5, knock: 2, fx: 'slash', projectile: P(38, 0.45, true, 3, 0.25) }]),
      m(3, SHOOT, 0.5, [{ shape: 'line', range: 13, width: 1.1, grow: true, dmg: 0.56, poise: 14, knock: 5, pen: 1, fx: 'slash' }]),
      fin(ticks(3, 0.3, 0.58, area({ offset: 6, range: 4.4, dmg: 0.24, vortex: 4, fx: 'slash' }), { dmg: 0.36, poise: 24, knock: 10, fling: 13, vortex: 0, hitstop: 0.12, shake: 0.55 })),
    ];
    case 'blitz': return [
      m(0, SHOOT, 0.42, [{ shape: 'line', range: 9, width: 0.9, grow: true, dmg: 0.4, poise: 8, knock: 2, chain: 1, chainRange: 6, status: 'shock', statusDur: 0.8, fx: 'magic' }]),
      m(1, CAST, 0.42, [{ shape: 'line', range: 9, width: 0.9, grow: true, dmg: 0.4, poise: 8, knock: 2, chain: 1, chainRange: 6, status: 'shock', statusDur: 0.8, fx: 'magic' }]),
      m(2, SHOOT, 0.46, [{ range: 22, dmg: 0.25, poise: 6, knock: 2, fx: 'magic', projectile: P(44, 0.45, false, 2, 0.18) }]),
      m(3, SHOOT, 0.5, [{ range: 24, dmg: 0.55, poise: 15, knock: 5, fx: 'magic', projectile: P(46, 0.8, true) }]),
      fin(ticks(3, 0.3, 0.58, area({ offset: 6, range: 4, dmg: 0.25, status: 'shock', statusDur: 1.2, chain: 2, chainRange: 7 }), { dmg: 0.36, poise: 24, knock: 9, fling: 11, hitstop: 0.12, shake: 0.6 })),
    ];
    case 'sonne': return [
      m(0, SHOOT, 0.42, [{ shape: 'line', range: 10, width: 0.8, grow: true, dmg: 0.42, poise: 9, knock: 2, pen: 1, fx: 'magic' }]),
      m(1, CAST, 0.42, [{ shape: 'line', range: 10, width: 0.8, grow: true, dmg: 0.42, poise: 9, knock: 2, pen: 1, fx: 'magic' }]),
      m(2, SHOOT, 0.46, [{ range: 22, dmg: 0.17, poise: 5, knock: 2, fx: 'magic', projectile: P(36, 0.45, false, 3, 0.22) }]),
      m(3, SHOOT, 0.5, [{ shape: 'line', range: 15, width: 1.4, grow: true, dmg: 0.56, poise: 16, knock: 5, pen: 2, fx: 'magic' }]),
      fin([...ticks(2, 0.3, 0.46, area({ range: 5.5, dmg: 0.3, status: 'sunder', statusDur: 6 })), area({ range: 5.8, at: [0.5, 0.58], dmg: 0.5, poise: 28, knock: 10, fling: 12, status: 'sunder', statusDur: 6, hitstop: 0.12, shake: 0.55 })]),
    ];
    case 'mond': return [
      // Sicheln wachsen mit jedem Schritt der Kette
      m(0, SHOOT, 0.42, [{ range: 22, dmg: 0.42, poise: 8, knock: 2, fx: 'magic', projectile: P(28, 0.5, true, 1, 0, 'crescent') }]),
      m(1, CAST, 0.42, [{ range: 22, dmg: 0.42, poise: 8, knock: 2, fx: 'magic', projectile: P(28, 0.62, true, 1, 0, 'crescent') }]),
      m(2, SHOOT, 0.46, [{ range: 22, dmg: 0.25, poise: 6, knock: 2, fx: 'magic', projectile: P(28, 0.75, true, 2, 0.3, 'crescent') }]),
      m(3, SHOOT, 0.5, [{ range: 24, dmg: 0.56, poise: 15, knock: 5, fx: 'magic', projectile: P(26, 1.2, true, 1, 0, 'crescent') }]),
      fin([{ range: 20, at: [0.38, 0.44], dmg: 0.12, poise: 6, knock: 3, fx: 'magic', projectile: P(26, 1.35, true, 5, 0.45, 'crescent') }, area({ range: 4.6, at: [0.5, 0.58], dmg: 0.3, poise: 26, knock: 10, fling: 12, status: 'fear', statusDur: 1.2, hitstop: 0.12, shake: 0.55 })]),
    ];
    case 'schwarzloch': return [
      m(0, SHOOT, 0.42, [{ range: 20, dmg: 0.42, poise: 9, knock: 1, fx: 'magic', projectile: P(22, 0.8) }]),
      m(1, CAST, 0.42, [{ range: 20, dmg: 0.42, poise: 9, knock: 1, fx: 'magic', projectile: P(22, 0.8) }]),
      m(2, SHOOT, 0.46, [{ range: 20, dmg: 0.25, poise: 7, knock: 1, fx: 'magic', projectile: P(22, 0.7, false, 2, 0.3) }]),
      m(3, SHOOT, 0.5, [{ shape: 'line', range: 12, width: 1.6, grow: true, dmg: 0.55, poise: 16, knock: 2, vortex: 3, fx: 'magic' }]),
      fin(ticks(3, 0.3, 0.58, area({ offset: 6, range: 4.6, dmg: 0.22, knock: 0, vortex: 7 }), { dmg: 0.42, poise: 30, knock: 12, fling: 14, vortex: 0, hitstop: 0.12, shake: 0.6 })),
    ];
    case 'priester': {
      const gold = '#FFE9A0';
      return [
        m(0, SHOOT, 0.42, [{ range: 24, dmg: 0.42, poise: 8, knock: 2, fx: 'magic', projectile: P(40, 0.5, true, 1, 0, 'sun', gold) }]),
        m(1, CAST, 0.42, [{ range: 24, dmg: 0.42, poise: 8, knock: 2, fx: 'magic', projectile: P(40, 0.5, true, 1, 0, 'sun', gold) }]),
        m(2, SHOOT, 0.46, [{ range: 22, dmg: 0.17, poise: 5, knock: 2, fx: 'magic', projectile: P(32, 0.45, false, 3, 0.2, 'orb', '#FFF4C8') }]),
        m(3, SHOOT, 0.5, [{ range: 26, dmg: 0.56, poise: 15, knock: 5, pen: 2, fx: 'magic', projectile: P(44, 1.0, true, 1, 0, 'sun', gold) }]),
        // Gnadenwelle: der Kombo-Finisher sendet eine heilende Lichtwelle aus (dich und Crew/Truppen im Umkreis)
        fin([...ticks(2, 0.3, 0.46, area({ range: 6, dmg: 0.3, knock: 6 })), area({ range: 6.4, at: [0.5, 0.58], dmg: 0.45, poise: 26, knock: 10, fling: 11, status: 'stun', statusDur: 0.5, hitstop: 0.12, shake: 0.5 })], { ...PRIEST_CHAIN_HEAL }),
      ];
    }
    default: return [
      m(0, SHOOT, 0.42, [{ range: 22, dmg: 0.42, poise: 8, knock: 2, fx: 'magic', projectile: P(32, 0.55) }]),
      m(1, CAST, 0.42, [{ range: 22, dmg: 0.42, poise: 8, knock: 2, fx: 'magic', projectile: P(32, 0.55) }]),
      m(2, SHOOT, 0.46, [{ range: 22, dmg: 0.17, poise: 5, knock: 2, fx: 'magic', projectile: P(30, 0.45, false, 3, 0.2) }]),
      m(3, SHOOT, 0.5, [{ range: 24, dmg: 0.55, poise: 14, knock: 5, fx: 'magic', projectile: P(36, 0.9, true) }]),
      fin(ticks(3, 0.3, 0.58, area({ range: 4.8, dmg: 0.25 }), { dmg: 0.36, poise: 26, knock: 9, fling: 11, hitstop: 0.12, shake: 0.55 })),
    ];
  }
}

/** Verzweigungen nach L × 1 … 4: Bruch (bricht die Deckung), Fontäne (Heber), Ring (rundum), Welle (weit) – alle elementar */
export function elementBranch(e: ComboElement, el: (h: HitIn, withStatus?: boolean) => HitIn): [ActionMove, ActionMove, ActionMove, ActionMove] {
  const N = COMBO_NAMES[e.id]?.b ?? COMBO_NAMES.feuer.b;
  const id = e.id, vx = e.vfx;
  return [
    move({ id: `${id}.b1`, label: N[0], clip: CAST, dur: 0.5, magnet: false, lunge: 0, vfx: vx, hits: [el({ shape: 'circle', offset: 2.2, range: 2.8, dmg: 0.8, poise: 38, knock: 7, breakGuard: true, fx: 'magic', hitstop: 0.1, shake: 0.4 })] }),
    move({ id: `${id}.b2`, label: N[1], clip: RAISE, dur: 0.5, rise: 10.6, magnet: false, lunge: 0, vfx: vx, hits: [el({ shape: 'circle', offset: 1.2, range: 3, dmg: 0.66, poise: 20, knock: 1, launch: 10.8, maxTargets: 12, fx: 'magic', hitstop: 0.08, shake: 0.35 }, false)] }),
    move({ id: `${id}.b3`, label: N[2], clip: RAISE, dur: 0.66, from: 0, to: 1, magnet: false, lunge: 0, vfx: vx, hits: ticks(3, 0.1, 0.85, el({ shape: 'circle', range: 4.4, arc: ROUND, dmg: 0.34, poise: 10, knock: 7, fling: 8, fx: 'magic', hitstop: 0.04 })) }),
    move({ id: `${id}.b4`, label: N[3], clip: SHOOT, dur: 0.62, magnet: false, lunge: 0, vfx: vx, hits: [el({ shape: 'line', range: 15, width: 3, grow: true, dmg: 1.0, poise: 24, knock: 7, fling: 9, fx: 'magic', hitstop: 0.08, shake: 0.45 })] }),
  ];
}

/** Schwer, Luft-Kette und Meteor: elementar */
export function elementExtras(e: ComboElement, el: (h: HitIn, withStatus?: boolean) => HitIn): { heavy: ActionMove; air: ActionMove[]; meteor: ActionMove } {
  const N = COMBO_NAMES[e.id] ?? COMBO_NAMES.feuer;
  const id = e.id, vx = e.vfx;
  const P = (speed: number, radius: number, pierce = false, count = 1, spread = 0) => shot(e.id === 'priester' ? '#FFE9A0' : e.color, speed, radius, pierce, count, spread, e.id === 'mond' ? 'crescent' : e.proj);
  return {
    heavy: move({ id: `${id}.s`, label: N.s, clip: SHOOT, dur: 0.7, magnet: false, lunge: 0, vfx: vx, hits: [el({ range: 20, dmg: 1.1, poise: 32, knock: 8, fx: 'heavy', hitstop: 0.1, shake: 0.45, projectile: P(26, 1.3, true) }, false)] }),
    air: [
      move({ id: `${id}.a1`, label: N.a[0], clip: SHOOT, dur: 0.3, air: true, magnet: false, lunge: 0, vfx: vx, hits: [el({ range: 18, dmg: 0.38, poise: 8, knock: 2, fx: 'magic', projectile: P(36, 0.5) }, false)] }),
      move({ id: `${id}.a2`, label: N.a[1], clip: CAST, dur: 0.34, air: true, magnet: false, lunge: 0, vfx: vx, hits: [el({ range: 16, dmg: 0.14, poise: 4, knock: 2, fx: 'magic', projectile: P(32, 0.4, false, 3, 0.3) }, false)] }),
      move({ id: `${id}.a3`, label: N.a[2], clip: RAISE, dur: 0.36, air: true, magnet: false, lunge: 0, vfx: vx, hits: [el({ ...AIR, shape: 'circle', range: 3.2, dmg: 0.5, poise: 12, juggle: 4.4, fx: 'magic' })] }),
    ],
    meteor: move({ id: `${id}.m`, label: N.m, clip: CAST, dur: 1.0, meteor: true, air: true, magnet: false, vfx: vx, hits: [el({ shape: 'circle', range: 4.4, dmg: 1.1, poise: 26, knock: 8, launch: 4, fling: 10, fx: 'magic', hitstop: 0.1, shake: 0.6 })] }),
  };
}
