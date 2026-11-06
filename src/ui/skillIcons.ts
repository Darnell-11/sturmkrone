import type { Element, Passives, SkillDef } from '../data/skills';

/**
 * Eigene Symbole für den Faji-Baum (SVG, 24×24, Füllung = currentColor):
 * Aktive Fähigkeiten zeigen ihr Element, Passive ihre Wirkung – so sieht jeder Knoten anders aus.
 */
const P: Record<string, string> = {
  flame: 'M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1.5-1-2.5-1-4 2 1.5 4 4 4 7a6 6 0 0 1-12 0c0-5 5-7 6-12z',
  snow: 'M11 2h2v4.3l2.6-1.5 1 1.7L14 8l2.6 1.5-1 1.7L13 9.7V14h-2V9.7l-2.6 1.5-1-1.7L10 8 7.4 6.5l1-1.7L11 6.3zM11 14h2v8h-2zM5 15l1-1.7 12 7-1 1.7zM18 13.3l1 1.7-12 7-1-1.7z',
  bolt: 'M13 2 4 14h6l-2 8 10-13h-6z',
  rock: 'M3 20 8 8l3 4 3-7 7 15z',
  swirl: 'M4 6c3-3 13-3 16 1-4-1-9-1-12 2 4-1 8 0 10 3-3-1-6-1-8 1 2 0 4 1 5 3-2 0-4 0-5 2l-1 3c-1-3 0-5 1-6-2 0-3-1-3-2 1 0 2-1 3-1-2-1-3-2-3-3 2 0 3-1 5-1-3-1-5-1-8-2z',
  moon: 'M15 3a9 9 0 1 0 6 15 8 8 0 0 1-6-15z',
  sun: 'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM11 1h2v4h-2zM11 19h2v4h-2zM1 11h4v2H1zM19 11h4v2h-4zM4.2 5.6l1.4-1.4 2.8 2.8-1.4 1.4zM15.6 17l1.4-1.4 2.8 2.8-1.4 1.4zM4.2 18.4l2.8-2.8 1.4 1.4-2.8 2.8zM15.6 7l2.8-2.8 1.4 1.4L17 8.4z',
  drop: 'M12 2s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13z',
  skull: 'M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3 6v3h2v-2h2v2h2v-2h2v2h2v-3c1.5-1 3-3 3-6a8 8 0 0 0-8-8zM9 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  comet: 'M15 9a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM2 2l10 8-2 2zM6 2l8 6-1 2zM2 6l7 7-2 1z',
  fist: 'M6 9V7a1.5 1.5 0 0 1 3 0V6a1.5 1.5 0 0 1 3 0v.5a1.5 1.5 0 0 1 3 0V7a1.5 1.5 0 0 1 3 0v6a7 7 0 0 1-7 7H10a4 4 0 0 1-4-4v-3a1.5 1.5 0 0 1 2-1.4V11H6z',
  eye: 'M12 5c5 0 9 4 10 7-1 3-5 7-10 7S3 15 2 12c1-3 5-7 10-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  blade: 'M20 2 9 13l2 2L22 4zM8 14l-2 2-2-1-2 2 3 1 1 3 2-2-1-2 2-2z',
  orbit: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 3c6 0 10 4 10 9s-4 9-10 9S2 17 2 12 6 3 12 3zm0 2C7 5 4 8 4 12s3 7 8 7 8-3 8-7-3-7-8-7zM19 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  shield: 'M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5z',
  heart: 'M12 21s-9-5.5-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-9 12-9 12z',
  heartPlus: 'M12 21s-9-5.5-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-9 12-9 12zM11 8v3H8v2h3v3h2v-3h3v-2h-3V8z',
  boot: 'M7 2h6v9l6 3a3 3 0 0 1 2 3v3H3v-5l4-2z',
  wing: 'M2 18c4-1 7-4 9-8 1 4 0 7-2 9 3-1 6-4 7-8 1 3 0 6-2 8 3-1 5-4 6-7v8z',
  cross: 'M11 2h2v5h-2zM11 17h2v5h-2zM2 11h5v2H2zM17 11h5v2h-5zM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  feather: 'M20 3C11 4 6 9 5 17l-2 4 2-1 3-4h4l-2-1h4l-3-1c5-2 8-6 9-11z',
  crystal: 'M12 2 18 9 12 22 6 9zM12 5 9 9l3 9 3-9z',
  hourglass: 'M6 2h12v2l-4 8 4 8v2H6v-2l4-8-4-8zM9 4l3 6 3-6zM9 20h6l-3-5z',
  crown: 'M3 7l5 4 4-7 4 7 5-4-2 12H5zM5 20h14v2H5z',
  arrows: 'M2 12l5-5v3h10V7l5 5-5 5v-3H7v3z',
  fang: 'M5 3h14l-3 9-4 9-4-9z',
  swords: 'M4 2l9 9-2 2L2 4zM20 2l2 2-9 9-2-2zM6 16l2 2-3 3-2-2zM18 16l3 3-2 2-3-3zM7 13l4 4-2 2-4-4zM17 13l2 2-4 4-2-2z',
  rage: 'M12 2c2 3 6 4 6 9a6 6 0 0 1-12 0c0-2 1-4 2-5 0 2 1 3 2 3 0-3 1-5 2-7zM9 13l2 1-2 1zM15 13l-2 1 2 1z',
  mountain: 'M2 20 9 7l3 5 3-3 7 11z',
  star: 'M12 2l2.5 7H22l-6 4.5 2.3 7.5L12 16.5 5.7 21 8 13.5 2 9h7.5z',
  orb: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-3 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  quake: 'M2 17h7l2-3 2 3h9v3H2zM11 2h2l1 5-2 2 2 3-2 2-1-3 1-2-2-2z',
  burst: 'M12 1l2 7 6-4-3 7 6 1-6 3 4 6-7-3-2 7-2-7-7 3 4-6-6-3 6-1-3-7 6 4z',
  titan: 'M8 3h8l1 4 4 2-1 5-3-1v8H7v-8l-3 1-1-5 4-2z',
  anvil: 'M3 7h14c0 3 2 4 4 4v2h-6l-1 3h3v3H7v-3h3l-1-3H6C4 13 3 10 3 7z',
  slash: 'M3 20C8 18 16 12 20 3c0 8-6 15-15 19z',
  xcut: 'M3 5l2-2 16 16-2 2zM19 3l2 2L5 21l-2-2z',
  split: 'M11 1h2l1 14-2 8-2-8zM4 21h5v2H4zM15 21h5v2h-5z',
  tornado: 'M3 4h18v2H3zM5 8h14v2H5zM7 12h10v2H7zM9 16h6v2H9zM11 20h2v2h-2z',
  shout: 'M4 9h4l5-5v16l-5-5H4zM16 8a6 6 0 0 1 0 8l-1.4-1.4a4 4 0 0 0 0-5.2zM19 5a10 10 0 0 1 0 14l-1.4-1.4a8 8 0 0 0 0-11.2z',
};

/** Einzelne Fähigkeiten, die sich sonst ein Element-Symbol teilen würden */
const ID_ICON: Record<string, string> = {
  bergbrecher: 'quake', stahlleib: 'anvil', hundert: 'burst', titan: 'titan', urgewalt: 'quake',
  sichelwind: 'slash', iai: 'bolt', wirbel: 'swirl', tausend: 'swords', kreuzschnitt: 'xcut', himmel: 'split', klingensturm: 'tornado', letzterschnitt: 'skull',
  schrei: 'shout', herrscher: 'eye', kampfgeist: 'rage', aurastoss: 'orb', koenig: 'crown', erwachter: 'burst',
  phoenix: 'feather', schwarzloch: 'orb', donner: 'bolt', elementar: 'star',
};

const EL_ICON: Record<Element, string> = {
  feuer: 'flame', eis: 'snow', blitz: 'bolt', erde: 'rock', sturm: 'swirl', schatten: 'moon', licht: 'sun', flut: 'drop',
  gift: 'skull', meteor: 'comet', koerper: 'fist', geist: 'eye', klinge: 'blade', schwerkraft: 'orbit',
};

const PASSIVE_ICON: Partial<Record<keyof Passives, string>> = {
  dmgFist: 'fist', dmgBlade: 'blade', dmgAll: 'star', dmgSkill: 'orb', reduce: 'shield', speed: 'boot', rollCd: 'wing', crit: 'cross',
  dodge: 'feather', fajiMax: 'crystal', fajiRegen: 'drop', cdr: 'hourglass', fame: 'crown', reach: 'arrows', lifesteal: 'fang',
  fearWeak: 'skull', riposte: 'swords', secondWind: 'heartPlus', rage: 'rage', hpMax: 'heart', poise: 'mountain',
};

/** Kleines Abzeichen für die Form einer aktiven Fähigkeit */
const SHAPE_BADGE: Record<string, string> = {
  nova: '◎', cone: '◭', line: '➶', bolt: '•', chain: 'ϟ', dash: '»', blink: '◐', rain: '⁂', pull: '◉', cloud: '≈', spikes: '▲', barrage: '✶', buff: '▴', heal: '+',
};

const svg = (key: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${P[key] ?? P.star}"/></svg>`;

export function skillIcon(s: SkillDef): string {
  if (s.act) {
    const badge = SHAPE_BADGE[s.act.shape] ?? '';
    return `${svg(ID_ICON[s.id] ?? EL_ICON[s.act.el] ?? 'star')}${badge ? `<em class="sk-badge">${badge}</em>` : ''}`;
  }
  // Passiv: die stärkste Wirkung auf Stufe 1 bestimmt das Symbol
  const pas = s.passive?.(1) ?? {};
  let best: keyof Passives | null = null, bv = -1;
  for (const [k, v] of Object.entries(pas) as [keyof Passives, number][]) {
    const w = Math.abs(v) * (k === 'secondWind' || k === 'riposte' ? 3 : 1);
    if (PASSIVE_ICON[k] && w > bv) { bv = w; best = k; }
  }
  return svg(best ? PASSIVE_ICON[best]! : 'star');
}
