// Phase 4.7B – Formen 5 … 10 der Klassenbäume: je Stil sechs weitere Kampfkünste nach festen taktischen Mustern (Vorstoß, Heber, Konter,
// Flächenschlag, Kontrolle, Finale) mit eigenen Namen. Die Formen 1 – 4 sind die vier alten Kampfkünste des Stils. Reine Daten ohne three.js;
// die Bewegungen nutzen die Clips des eigenen Stils (Verzweigungen, Schwer), Treffer tragen das Element des Stils für AnimeVfxForge.
// Abgestimmt auf das Kampfmodell: lange Abklingzeiten, mäßiger Schaden je Wirken – zusammen mit Form 1 – 4 bleibt der Zuwachs der
// Kampfkünste unter der Grenze der Balance-Tests (tests/actionCombatEngine.test.ts).
import { ROUND, skill, ticks, type ActionSkill, type ActionStyleDef, type ActionStyleId, type HitIn, type HitStatus } from './actionKit';

/** Name, Kurzname, Symbol und taktischer Zusatz einer Form */
export interface FormName { name: string; short: string; icon: string; note: string }

const F = (name: string, short: string, icon: string, note = ''): FormName => ({ name, short, icon, note });

/** Taktischer Einsatz der sechs Muster (Formen 5 … 10) */
export const FORM_PATTERN_USE: readonly string[] = [
  'Vorstoß: durchbricht Reihen und schließt Lücken – zum Eröffnen oder Entkommen.',
  'Heber: schleudert Gegner in die Luft und öffnet die Sturm-Verfolgung.',
  'Konter: Konterhaltung – wer zuschlägt, wird mit voller Wucht erwidert.',
  'Flächenschlag: trifft alles um dich herum, für Verbände und Entern.',
  'Kontrolle: lange Welle mit Zustand – bremst, bannt oder betäubt ganze Reihen.',
  'Finale: aufgeladener Großschlag mit Hyper-Armor, bricht Haltung und Blöcke.',
];

/** Sechs Namen je Stil (Formen 5 … 10) – jeder Name kommt im Spiel nur einmal vor */
export const EXTRA_FORM_NAMES: Readonly<Record<ActionStyleId, readonly FormName[]>> = {
  zweihaender: [F('Bergsturz-Ansturm', 'Ansturm', '⇶'), F('Gipfelheber', 'Heber', '⤒'), F('Bollwerk-Konter', 'Bollwerk', '⛨'), F('Erdbeben-Rad', 'Beben', '✺'), F('Kettenbrecher-Welle', 'Brecher', '≋'), F('Titanenfall', 'Titan', '⚔')],
  saebel: [F('Kaperhieb-Sprint', 'Kaper', '⇉'), F('Mastspringer', 'Mast', '⤒'), F('Enterhaken-Parade', 'Parade', '◐'), F('Wirbelsturm-Klingen', 'Wirbel', '🌀'), F('Breitseiten-Fächer', 'Fächer', '≋'), F('Kapitänsurteil', 'Urteil', '♛')],
  doppel: [F('Schattenschritt', 'Schatten', '⇶'), F('Natterbiss-Heber', 'Natter', '⤒'), F('Spiegelkonter', 'Spiegel', '◑'), F('Klingenwirbel-Tanz', 'Tanz', '✳'), F('Giftdorn-Linie', 'Dorn', '➵'), F('Nachtfalken-Exekution', 'Falke', '✝')],
  langklinge: [F('Mondweg-Ziehschnitt', 'Mondweg', '⇢'), F('Himmelsstufe', 'Stufe', '⤒'), F('Stille-Wasser-Konter', 'Stille', '◐'), F('Kreis der zehn Schnitte', 'Kreis', '◯'), F('Fernschnitt-Welle', 'Fernschnitt', '➹'), F('Scheidenblitz-Finale', 'Scheide', 'ϟ')],
  sturmfaust: [F('Blitzfaust-Ansturm', 'Ansturm', '⇶'), F('Aufwärtshaken', 'Haken', '⤒'), F('Pendelkonter', 'Pendel', '◐'), F('Hundert-Fäuste-Wirbel', 'Hundert', '✺'), F('Druckwellen-Hieb', 'Druck', '≋'), F('Sturmfaust-Salve', 'Salve', '✊')],
  erdspalter: [F('Rammbock-Schulter', 'Rammbock', '⇶'), F('Felsheber', 'Fels', '⤒'), F('Eisenhaut-Konter', 'Eisen', '⛨'), F('Erdbeben-Stampfer', 'Stampfer', '✺'), F('Grabenbrecher', 'Graben', '≋'), F('Bergspalter-Hammer', 'Berg', '⚒')],
  effekt: [F('Faji-Vorstoß', 'Vorstoß', '⇶'), F('Faji-Heber', 'Heber', '⤒'), F('Faji-Spiegel', 'Spiegel', '◐'), F('Faji-Wirbel', 'Wirbel', '✺'), F('Faji-Welle', 'Welle', '≋'), F('Faji-Entfesselung', 'Entfessl.', '✦')],
  schwarzloch: [F('Ereignishorizont-Sprung', 'Horizont', '⇶'), F('Schwerelosigkeit', 'Schwerelos', '⤒'), F('Leerspiegel', 'Leere', '◐'), F('Akkretionsring', 'Ring', '◎'), F('Gezeitenriss', 'Riss', '≋'), F('Supernova-Kollaps', 'Nova', '✹')],
  feuer: [F('Glutkometen-Sprint', 'Komet', '⇶'), F('Flammensäule', 'Säule', '⤒'), F('Glutspiegel', 'Spiegel', '◐'), F('Feuerrad', 'Rad', '✺'), F('Lavastrom', 'Lava', '≋'), F('Inferno-Herz', 'Inferno', '♨')],
  eis: [F('Gleiteis-Schritt', 'Gleiten', '⇶'), F('Frostfontäne', 'Fontäne', '⤒'), F('Spiegeleis-Parade', 'Parade', '◐'), F('Hagelwirbel', 'Hagel', '✺'), F('Permafrost-Pfad', 'Pfad', '≋'), F('Ewiger Winter', 'Winter', '❄')],
  wasser: [F('Gischtsprung', 'Gischt', '⇶'), F('Geysirstoß', 'Geysir', '⤒'), F('Gegenstrom', 'Gegenstrom', '◐'), F('Mahlstrom', 'Mahlstrom', '🌀'), F('Springflut-Riegel', 'Springflut', '≋'), F('Tsunami-Herz', 'Tsunami', '🌊')],
  wind: [F('Böenschritt', 'Böe', '⇶'), F('Himmelsheber', 'Heber', '⤒'), F('Windspiegel', 'Spiegel', '◐'), F('Wirbelsturm-Kreis', 'Kreis', '🌪'), F('Scherwind-Pfad', 'Scherwind', '≋'), F('Sturmauge', 'Auge', '◉')],
  blitz: [F('Blitzpfad', 'Pfad', '⇶'), F('Donnerheber', 'Heber', '⤒'), F('Erdungskonter', 'Erdung', '◐'), F('Gewitterkranz', 'Kranz', '✺'), F('Leitfeuer-Netz', 'Netz', '⌁'), F('Himmelsdonner', 'Donner', '☈')],
  sonne: [F('Morgenrot-Sprint', 'Morgenrot', '⇶'), F('Zenitsäule', 'Zenit', '⤒'), F('Sonnenspiegel', 'Spiegel', '◐'), F('Sonnenwende-Kreis', 'Wende', '✺'), F('Glutmittag-Strahl', 'Mittag', '⇢'), F('Sonnenkern', 'Kern', '☀')],
  mond: [F('Neumond-Schritt', 'Neumond', '⇶'), F('Mondsichel-Heber', 'Sichel', '⤒'), F('Halbschatten-Konter', 'Schatten', '◐'), F('Gezeitenring', 'Ring', '◯'), F('Sichelregen', 'Regen', '☾'), F('Vollmond-Urteil', 'Vollmond', '●')],
  priester: [
    F('Lichtschritt', 'Schritt', '⇶', 'Heilt dich dabei um 5 % deiner Lebenspunkte.'),
    F('Himmelsleiter', 'Leiter', '⤒'),
    F('Schutzgebet', 'Gebet', '⛨', 'Segen: Hyper-Armor für dich, Heilung um 8 % für dich und Verbündete in 10 m.'),
    F('Gnadenkranz', 'Gnade', '❂', 'Heilt dich und Verbündete in 10 m um 6 %.'),
    F('Bannstrahl', 'Bann', '⇢'),
    F('Engelsurteil', 'Engel', '✟', 'Heilt dich und Verbündete in 12 m um 12 %.'),
  ],
};

/** Zustand der Kontroll-Form je Stil (Element; physische Stile bremsen) */
const CONTROL_STATUS: Readonly<Partial<Record<ActionStyleId, [HitStatus, number]>>> = {
  schwarzloch: ['suppress', 4], feuer: ['burn', 3], eis: ['freeze', 1.4], wasser: ['slow', 3], wind: ['slow', 2.5], blitz: ['shock', 1.4],
  sonne: ['sunder', 6], mond: ['fear', 1.6], priester: ['stun', 1.2], saebel: ['shock', 1.2], langklinge: ['slow', 2.5],
};

/** Heilung der Priester-Formen 5 … 10 (Anteil der Höchst-LP, Radius für Verbündete) */
const PRIEST_HEAL: readonly ([number, number] | null)[] = [[0.05, 0], null, [0.08, 10], [0.06, 10], null, [0.12, 12]];

/** Abklingzeiten der sechs Muster (s) */
export const EXTRA_FORM_CD: readonly number[] = [11, 12, 14, 16, 18, 26];

/**
 * Die sechs weiteren Formen eines Stils (Plätze 5 … 10). Die Clips stammen aus dem Stil selbst (Verzweigungen, Schwer), damit Klinge,
 * Faust oder Geste wie gewohnt aussehen; Treffer tragen das Element des Stils.
 */
export function extraForms(st: ActionStyleDef): ActionSkill[] {
  const N = EXTRA_FORM_NAMES[st.id];
  const vfx = st.element;
  const [cs, cd] = CONTROL_STATUS[st.id] ?? ['slow', 2.4];
  const fist = st.visual === 'faust' || st.faji;
  const k = st.faji ? 0.9 : 1;
  const h = (o: HitIn): HitIn => ({ vfx, ...o });
  const desc = (i: number, own: string) => `${own} ${FORM_PATTERN_USE[i]}${N[i].note ? ` ${N[i].note}` : ''}`;
  const heal = (i: number) => (st.id === 'priester' && PRIEST_HEAL[i] ? { heal: PRIEST_HEAL[i]![0], healR: PRIEST_HEAL[i]![1] } : {});
  const base = (i: number) => ({ id: `${st.id}.k${i + 5}`, slot: i + 5, label: N[i].name, short: N[i].short, icon: N[i].icon, cd: EXTRA_FORM_CD[i], vfx, formMin: 1, ...heal(i) });
  return [
    // 5 Vorstoß: quer durch die Reihen
    skill({ ...base(0), desc: desc(0, `${fist ? 'Ein Ansturm' : 'Ein Zieh-Vorstoß'} 10 m quer durch die Gegner.`), clip: st.branch[0].clip, dur: 0.6, from: 0, to: 1, dashTo: 10, dashTime: 0.2, through: true, iframes: 0.3, afterimage: true, magnet: false, lunge: 0,
      hits: ticks(3, 0.08, 0.5, h({ shape: 'circle', range: 2.6, dmg: 0.42 * k, poise: 14, knock: 5, fx: fist ? 'punch' : 'slash', down: 2 })) }),
    // 6 Heber: alles in 4 m hoch, die Figur steigt mit
    skill({ ...base(1), desc: desc(1, 'Ein Aufwärtsschlag schleudert alles in 4 m in die Luft.'), clip: st.branch[1].clip, dur: 0.55, rise: 9.5, airOk: true,
      hits: [h({ shape: 'circle', offset: 1, range: 4, dmg: 0.85 * k, poise: 22, knock: 1, launch: 10.5, maxTargets: 10, fx: 'heavy', hitstop: 0.08, shake: 0.35 })] }),
    // 7 Konter: Haltung, danach eine Welle
    skill({ ...base(2), desc: desc(2, 'Konterhaltung für 0,9 s, am Ende eine Druckwelle 8 m weit.'), clip: 'Melee_Blocking', dur: 1.0, from: 0, to: 1, magnet: false, lunge: 0, counter: 0.9,
      ...(st.id === 'priester' ? { buff: { kind: 'hyper' as const, dur: 4 } } : {}),
      hits: [h({ shape: 'line', range: 8, width: 3, grow: true, at: [0.84, 0.96], dmg: 0.8 * k, poise: 24, knock: 8, fx: 'magic' })] }),
    // 8 Flächenschlag: Rundumschlag in mehreren Takten
    skill({ ...base(3), desc: desc(3, 'Vier Rundumschläge, 5,5 m um dich.'), clip: st.branch[2].clip, dur: 1.0, from: 0, to: 1,
      hits: ticks(4, 0.08, 0.9, h({ arc: ROUND, range: 5.5, dmg: 0.36 * k, poise: 12, knock: 6, fling: 7, fx: 'spin' }), { knock: 10, fling: 12 }) }),
    // 9 Kontrolle: lange Welle mit Zustand und Sog
    skill({ ...base(4), desc: desc(4, 'Eine 16 m lange Welle, die Gegner zusammenzieht und mit dem Element des Stils belegt.'), clip: st.branch[3].clip, dur: 0.8, magnet: false, lunge: 0,
      hits: [h({ shape: 'line', range: 16, width: 3.4, grow: true, dmg: 1.1 * k, poise: 28, knock: 3, vortex: 3, status: cs, statusDur: cd, fx: 'magic', hitstop: 0.06, shake: 0.4 })] }),
    // 10 Finale: aufgeladener Großschlag
    skill({ ...base(5), desc: desc(5, 'Ein aufgeladener Großschlag, 7 m um den Einschlag.'), clip: st.heavy.clip, dur: 1.15, hyper: true, cutin: `${N[5].name}!`, lunge: 4,
      hits: [h({ shape: 'circle', offset: 2, range: 7, at: [0.55, 0.66], dmg: 2.2 * k, poise: 70, knock: 12, fling: 14, breakGuard: true, fx: 'heavy', hitstop: 0.14, shake: 0.9 })] }),
  ];
}
