// Die 20 Legenden der Rangliste aus Sturmkrone 1.0 – mit Persönlichkeit, Heimatgewässer und Sprüchen.
import type { Faction } from '../core/save/types';

export interface LegendDef {
  id: string;
  n: string;
  /** Beiname */
  t: string;
  lvl: number;
  /** Schiffsklasse */
  tier: number;
  /** Ruhm (Platz in der Rangliste) */
  ruhm: number;
  col: string;
  /** Faji-Element ihrer Spezialattacke */
  sk: string;
  faction: Faction;
  /** Heimatinsel (ID) – dort kreuzt ihr Schiff */
  home: string;
  /** Wesen in einem Satz */
  bio: string;
  /** Spruch beim Auftauchen */
  hello: string;
  /** Spruch bei der Niederlage */
  bye: string;
}

const P = (o: Omit<LegendDef, 'faction'>): LegendDef => ({ ...o, faction: 'pirat' });
const M = (o: Omit<LegendDef, 'faction'>): LegendDef => ({ ...o, faction: 'marine' });

export const LEGENDS: LegendDef[] = [
  P({ id: 'p1', n: 'Bram Eisenzahn', t: 'der Hafenschreck', lvl: 4, tier: 1, ruhm: 500, col: '#7A2A22', sk: 'feuer', home: 'bernsteinbucht', bio: 'Laut, gierig und stolz auf seinen eisernen Zahn. Raubt am liebsten Fischerboote aus.', hello: 'Na, wen haben wir denn da? Frischfleisch für meinen Zahn!', bye: 'Mein … Zahn … Das wirst du bereuen!' }),
  P({ id: 'p2', n: 'Die Zwillinge Fenn', t: 'zwei Klingen, ein Wille', lvl: 6, tier: 2, ruhm: 900, col: '#3A6E5A', sk: 'wind', home: 'rabenriff', bio: 'Zwei Schwestern, die jeden Satz gemeinsam beenden – und jeden Kampf.', hello: '„Zwei gegen einen“ – „ist doch fair!“', bye: '„Das war –“ „– nur Glück!“' }),
  P({ id: 'p3', n: 'Yuna Glutauge', t: 'die Brandstifterin', lvl: 8, tier: 2, ruhm: 1500, col: '#D9532A', sk: 'feuer', home: 'ascheinsel', bio: 'Ihr Blick soll Segel entzünden. Sie liebt Feuer mehr als Gold.', hello: 'Schöne Segel. Wie gut sie wohl brennen?', bye: 'Das Feuer … erlischt … vorerst.' }),
  P({ id: 'p4', n: 'Tomasz der Stille', t: 'Schatten der Riffe', lvl: 10, tier: 3, ruhm: 2200, col: '#2B2B44', sk: 'schatten', home: 'graueklippe', bio: 'Spricht nie. Seine Crew versteht ihn trotzdem – aus Angst.', hello: '…', bye: '… (Er nickt dir anerkennend zu.)' }),
  P({ id: 'p5', n: 'Orla Dorn', t: 'die Dornenkapitänin', lvl: 12, tier: 3, ruhm: 3200, col: '#5A2E5E', sk: 'eis', home: 'baerenfels', bio: 'Kalt wie die Nordsee und genauso unberechenbar.', hello: 'Ein Schritt näher, und du frierst fest.', bye: 'Du bist … wärmer, als ich dachte.' }),
  P({ id: 'p6', n: 'Hektor Rabenschrei', t: 'der Herr von Grauwacht', lvl: 14, tier: 4, ruhm: 4300, col: '#1E1A20', sk: 'blitz', home: 'eulenstein', bio: 'Herrscht über ein Meer aus Raben und Blitzen. Hält sich für unsterblich.', hello: 'Die Raben haben dich angekündigt. Und deinen Untergang.', bye: 'Unmöglich! Die Raben haben gelogen!' }),
  P({ id: 'p7', n: 'Lady Maren Kessel', t: 'die Perlenhexe', lvl: 16, tier: 4, ruhm: 5600, col: '#2F8F9D', sk: 'wasser', home: 'seufzerinsel', bio: 'Sammelt Perlen – und die Seelen derer, die sie ihr stehlen wollen.', hello: 'Oh, wie hübsch. Du passt perfekt in meine Sammlung.', bye: 'Meine Perlen … Nimm sie. Diesmal.' }),
  P({ id: 'p8', n: 'Old Saro Knochenkrone', t: 'der Unsinkbare', lvl: 18, tier: 5, ruhm: 7200, col: '#D8CCB0', sk: 'geist', home: 'versunkenertempel', bio: 'Sein Schiff ist dreimal gesunken. Er nicht.', hello: 'Hehehe … Noch einer, der glaubt, er könnte mich versenken.', bye: 'Viermal … versenkt. Respekt, Jungspund.' }),
  P({ id: 'p9', n: 'Rotbart Varga', t: 'der Sturmreiter', lvl: 20, tier: 5, ruhm: 9000, col: '#A8322A', sk: 'blitz', home: 'gischtzahn', bio: 'Segelt nur bei Sturm. Behauptet, er sei mit dem Donner verwandt.', hello: 'HAHAHA! Endlich ein würdiger Gegner im Sturm!', bye: 'Ein guter Kampf! Der Sturm gehört dir … für heute.' }),
  P({ id: 'p10', n: 'Selva Nachtwind', t: 'die Meeresfürstin', lvl: 23, tier: 6, ruhm: 12500, col: '#241838', sk: 'licht', home: 'tiefentor', bio: 'Die Nummer eins der Piraten. Man sagt, sie habe die Sturmkrone schon einmal gesehen.', hello: 'Du bist also die, von der alle reden. Zeig mir, ob es stimmt.', bye: 'Dann trägst jetzt du die Hoffnung der See. Enttäusche sie nicht.' }),
  M({ id: 'm1', n: 'Kapitän Jorin Weiß', t: 'der Pflichtbewusste', lvl: 4, tier: 1, ruhm: 500, col: '#C8D8F0', sk: 'eis', home: 'kraehenfels', bio: 'Folgt jeder Vorschrift. Auch der, die er sich gerade ausgedacht hat.', hello: 'Im Namen der Admiralität: Streichen Sie die Segel!', bye: 'Das … steht so nicht im Handbuch.' }),
  M({ id: 'm2', n: 'Kapitänin Mara Lind', t: 'die Spürnase', lvl: 6, tier: 2, ruhm: 900, col: '#9FC8E8', sk: 'blitz', home: 'moewennest', bio: 'Findet jedes Schiff. Jedes. Immer.', hello: 'Hab ich dich! Ich habe deinen Kurs seit drei Tagen verfolgt.', bye: 'Gefunden habe ich dich trotzdem.' }),
  M({ id: 'm3', n: 'Kommodore Ruben Eck', t: 'der Eiserne', lvl: 8, tier: 2, ruhm: 1500, col: '#7A8CAC', sk: 'erde', home: 'wolfsklippe', bio: 'Trägt eine eiserne Rüstung, selbst im Schlaf.', hello: 'Meine Rüstung hat noch nie einen Kratzer bekommen.', bye: 'Ein … Kratzer.' }),
  M({ id: 'm4', n: 'Kommodore Ilsa Brandt', t: 'Feuer der Flotte', lvl: 10, tier: 3, ruhm: 2200, col: '#E8A07A', sk: 'feuer', home: 'funkenriff', bio: 'Ihre Breitseiten färben den Himmel orange.', hello: 'Feuer frei auf mein Kommando – jetzt!', bye: 'Feuer eingestellt. Gut gekämpft.' }),
  M({ id: 'm5', n: 'Konteradmiral Gideon Falk', t: 'das Falkenauge', lvl: 12, tier: 3, ruhm: 3200, col: '#B8C4D8', sk: 'blitz', home: 'obsidianstrand', bio: 'Trifft eine Möwe auf eine Seemeile. Sagt er.', hello: 'Ich sehe jede deiner Bewegungen, bevor du sie machst.', bye: 'Diese … habe ich nicht kommen sehen.' }),
  M({ id: 'm6', n: 'Vizeadmiralin Nadja Sturmfeld', t: 'die Sturmwand', lvl: 14, tier: 4, ruhm: 4300, col: '#9FE0D0', sk: 'wind', home: 'seemannsgrab', bio: 'Ihre Flotte steht wie eine Mauer im Wind.', hello: 'An mir kommt niemand vorbei.', bye: 'Die Mauer hat einen Riss. Merk dir meinen Namen.' }),
  M({ id: 'm7', n: 'Vizeadmiral Konrad Stahl', t: 'der Unbeugsame', lvl: 16, tier: 4, ruhm: 5600, col: '#8C96A8', sk: 'erde', home: 'kielbruch', bio: 'Hat noch nie einen Befehl zurückgenommen.', hello: 'Kapitulation ist keine Option. Für dich.', bye: 'Ich beuge mich … nur diesem einen Mal.' }),
  M({ id: 'm8', n: 'Admiralin Theda Morgenstern', t: 'das Licht der Flotte', lvl: 18, tier: 5, ruhm: 7200, col: '#F2E2A8', sk: 'licht', home: 'korallenkranz', bio: 'Gerecht, strahlend und gnadenlos ehrlich.', hello: 'Möge das Licht entscheiden, wer recht hat.', bye: 'Das Licht hat entschieden. Ich akzeptiere es.' }),
  M({ id: 'm9', n: 'Admiral Kasimir Eisgrau', t: 'der Frostadmiral', lvl: 20, tier: 5, ruhm: 9000, col: '#D8F0FF', sk: 'eis', home: 'eulenstein', bio: 'Wo er segelt, gefriert das Meer.', hello: 'Die See gefriert unter meinem Kiel. Und du mit ihr.', bye: 'Das Eis … taut. Wie ärgerlich.' }),
  M({ id: 'm10', n: 'Großadmiral Aurelian Hohenwacht', t: 'Schild der Meere', lvl: 23, tier: 6, ruhm: 12500, col: '#F4F1E8', sk: 'licht', home: 'letzterhafen', bio: 'Höchster Offizier der Marine. Will die Sturmkrone sichern, bevor Piraten sie finden.', hello: 'Du bist weit gekommen. Hier endet deine Reise.', bye: 'Vielleicht … verdienst du die Krone mehr als ich.' }),
];

export const LEGEND_BY_ID: Record<string, LegendDef> = Object.fromEntries(LEGENDS.map((l) => [l.id, l]));

/** Welche Legenden greifen dich an? Piraten jagt jeder, die Marine jagt nur Piraten. */
export function hostileLegends(faction: Faction): LegendDef[] {
  return faction === 'pirat' ? LEGENDS : LEGENDS.filter((l) => l.faction === 'pirat');
}

/** Rangliste der eigenen Fraktion inkl. Spielfigur; der Ruhm der Legenden schwankt leicht mit der Zeit */
export function rankRows(faction: Faction, beaten: string[], me: { name: string; title: string; lvl: number; ruhm: number }, playTime: number) {
  const rows = LEGENDS.filter((l) => l.faction === faction && !beaten.includes(l.id)).map((l, i) => ({
    id: l.id, n: l.n, t: l.t, lvl: l.lvl, ruhm: Math.round(l.ruhm * (1 + 0.06 * Math.sin(playTime / 900 + i * 1.7))), me: false,
  }));
  rows.push({ id: 'me', n: me.name, t: me.title, lvl: me.lvl, ruhm: me.ruhm, me: true });
  return rows.sort((a, b) => b.ruhm - a.ruhm);
}
