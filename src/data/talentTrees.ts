// Phase 4.6E – das 18-Baum-Talent- und Stufensystem: reine Daten, ohne three.js und ohne Zufall.
//
// Vierzehn Kampfbäume (sechs Waffenstile, acht Faji-Künste) mit je sieben Stufen und rund 70 Punkten Kapazität, drei Kapitäns- und Weltbäume
// mit je rund 40 Punkten und der geheime 18. Baum (Kosmos), der erst mit dem Aufstieg auf Stufe 101 sichtbar wird. Bis Stufe 100 gibt es
// 120 Talentpunkte: 99 aus den Stufenaufstiegen und 21 Meisterschafts-Siegel für die ersten Siege über Kaiser, Mega-Kommandanten, Weltbosse,
// Raid-Endbosse und die erste Legende. Die Regeln (Punkte, Freischalten, Bindung, Zurücksetzen, Aufstieg) stehen in `core/talentRules.ts`,
// die Wirkung auf die Kampfstile in `combat/talentCombat.ts`; alle Obergrenzen in `data/balanceConfig.ts` (`TALENT_CAP`).
import { ACTION_STYLES } from './actionStyles';
import type { ActionStyleId, HitStatus } from './actionKit';
import { KAISER_IDS, KAISER_SPEC_BY_ID } from './kaiserIslands';
import { MEGA_BY_ID, MEGA_IDS } from './megaIslands';
import { WORLD_BOSSES, WORLD_BOSS_IDS } from './seaEvents';
import { CITADELS } from './factions';

// ---------- Kennungen ----------

/** Die vierzehn Kampfbäume: einer je Waffenstil und je Faji-Kunst (Faji-Wirken hat keinen eigenen Baum) */
export type CombatTreeId = Exclude<ActionStyleId, 'effekt'>;
export const WEAPON_TREES: readonly CombatTreeId[] = ['zweihaender', 'saebel', 'doppel', 'langklinge', 'sturmfaust', 'erdspalter'];
export const FAJI_TREES: readonly CombatTreeId[] = ['schwarzloch', 'feuer', 'eis', 'wasser', 'wind', 'blitz', 'sonne', 'mond'];
export const COMBAT_TREES: readonly CombatTreeId[] = [...WEAPON_TREES, ...FAJI_TREES];
export type CaptainTreeId = 'admiral' | 'belagerung' | 'handel';
export const CAPTAIN_TREES: readonly CaptainTreeId[] = ['admiral', 'belagerung', 'handel'];
export type TalentTreeId = CombatTreeId | CaptainTreeId | 'kosmos';
export const TALENT_TREE_IDS: readonly TalentTreeId[] = [...COMBAT_TREES, ...CAPTAIN_TREES, 'kosmos'];
export type TreeKind = 'waffe' | 'faji' | 'kapitaen' | 'kosmos';

export const isCombatTree = (id: string): id is CombatTreeId => (COMBAT_TREES as readonly string[]).includes(id);
export const isTalentTree = (id: unknown): id is TalentTreeId => typeof id === 'string' && (TALENT_TREE_IDS as readonly string[]).includes(id);

// ---------- Wirkungen ----------

/**
 * Wirkung eines Rangs. Werte gelten je Rang und werden über alle gelernten Ränge summiert; Prozentwerte als Anteil (0,02 = 2 %). Die Summe
 * läuft danach durch die asymptotischen Obergrenzen (`TALENT_CAP`). Kampfwirkungen gelten für den Stil ihres Baums, die des Kosmos-Baums
 * für alle Stile; Kapitänswirkungen gelten für Schiff, Flotte, Krieg und Handel.
 */
export type FxKey =
  // Kampf: Schaden und Durchschlag
  | 'dmg' | 'crit' | 'critDmg' | 'posture' | 'pen' | 'finisher' | 'skillDmg' | 'airDmg' | 'meteor' | 'ult' | 'cosmicDmg'
  // Kampf: Verteidigung
  | 'stance' | 'armor' | 'hp'
  // Kampf: Tempo, Reichweite, Bewegung
  | 'combo' | 'heavy' | 'lunge' | 'reach' | 'heavyReach' | 'arc' | 'launch' | 'fling' | 'knock' | 'cd' | 'dashCost' | 'perfect' | 'chase'
  | 'jumps' | 'airDashes' | 'statusDur' | 'vortexK'
  // Kampf: Willenskraft, Erwachen, Auren, Ultimate
  | 'will' | 'awaken' | 'auraSight' | 'auraIron' | 'auraKing' | 'ultReach' | 'multiKill' | 'aftershock'
  // Kampf: Mechaniken (Schalter, Signaturen)
  | 'formStep' | 'form' | 'hyperHeavy' | 'autoChase' | 'elementFinisher' | 'stormBurst' | 'heavyWave' | 'apex'
  | 'gravity' | 'fusion' | 'meteorRain' | 'skyfall'
  // Kapitän: Schiff und Flotte
  | 'cannon' | 'reload' | 'sail' | 'turn' | 'hull' | 'range' | 'boarding'
  // Kapitän: Krieg
  | 'merit' | 'bastion' | 'troopPrice' | 'tribute'
  // Kapitän: Handel
  | 'buy' | 'sell' | 'cargo' | 'upkeep' | 'loot' | 'smuggle';

export type TalentFx = Partial<Record<FxKey, number>>;

/** Anzeige einer Wirkung: Bezeichnung, Einheit ('%' Anteil, 's', 'm', '' Zahl, 'flag' Schalter), Vorzeichen in der Anzeige (−1 = Senkung) */
export interface FxInfo { label: string; unit: '%' | 's' | 'm' | '' | 'flag'; sign: 1 | -1 }

export const FX_INFO: Record<FxKey, FxInfo> = {
  dmg: { label: 'Schaden', unit: '%', sign: 1 },
  crit: { label: 'Krit-Chance', unit: '%', sign: 1 },
  critDmg: { label: 'Krit-Schaden', unit: '%', sign: 1 },
  posture: { label: 'Haltungsschaden', unit: '%', sign: 1 },
  pen: { label: 'Durchschlag (Waffenstufen)', unit: '', sign: 1 },
  finisher: { label: 'Finisher-Schaden', unit: '%', sign: 1 },
  skillDmg: { label: 'Technik-Schaden', unit: '%', sign: 1 },
  airDmg: { label: 'Schaden gegen Ziele in der Luft', unit: '%', sign: 1 },
  meteor: { label: 'Meteor-Sturz (Schaden, Fläche)', unit: '%', sign: 1 },
  ult: { label: 'Ultimate-Schaden', unit: '%', sign: 1 },
  cosmicDmg: { label: 'Kosmischer Schaden (alle Stile)', unit: '%', sign: 1 },
  stance: { label: 'Schadensminderung im Angriff', unit: '%', sign: 1 },
  armor: { label: 'Schadensminderung', unit: '%', sign: 1 },
  hp: { label: 'Lebenspunkte', unit: '%', sign: 1 },
  combo: { label: 'Kombo-Tempo', unit: '%', sign: 1 },
  heavy: { label: 'Tempo schwerer Angriffe', unit: '%', sign: 1 },
  lunge: { label: 'Ausfallschritt und Magnet-Reichweite', unit: 'm', sign: 1 },
  reach: { label: 'Reichweite der Angriffe', unit: '%', sign: 1 },
  heavyReach: { label: 'Reichweite schwerer Angriffe', unit: '%', sign: 1 },
  arc: { label: 'Öffnungswinkel der Bögen', unit: '%', sign: 1 },
  launch: { label: 'Hochschleudern', unit: '%', sign: 1 },
  fling: { label: 'Verbände wegschleudern', unit: '%', sign: 1 },
  knock: { label: 'Rückstoß', unit: '%', sign: 1 },
  cd: { label: 'Abklingzeit der Techniken', unit: '%', sign: -1 },
  dashCost: { label: 'Ausdauer je Dash', unit: '%', sign: -1 },
  perfect: { label: 'Fenster des Sturm-Schritts', unit: 's', sign: 1 },
  chase: { label: 'Sturm-Verfolgung (Fenster)', unit: 's', sign: 1 },
  jumps: { label: 'Sprung in der Luft', unit: '', sign: 1 },
  airDashes: { label: 'Luft-Dash', unit: '', sign: 1 },
  statusDur: { label: 'Dauer der Zustände', unit: '%', sign: 1 },
  vortexK: { label: 'Sog-Stärke', unit: '%', sign: 1 },
  will: { label: 'Willenskraft-Gewinn', unit: '%', sign: 1 },
  awaken: { label: 'Dauer des Sturm-Erwachens', unit: 's', sign: 1 },
  auraSight: { label: 'Stärke Sturmblick', unit: '%', sign: 1 },
  auraIron: { label: 'Stärke Eisenwille', unit: '%', sign: 1 },
  auraKing: { label: 'Stärke Königsdruck', unit: '%', sign: 1 },
  ultReach: { label: 'Ultimate-Radius', unit: '%', sign: 1 },
  multiKill: { label: 'Willenskraft je Mehrfach-Bruch', unit: '', sign: 1 },
  aftershock: { label: 'Nachbeben nach dem Ultimate', unit: '', sign: 1 },
  formStep: { label: 'Formstufe (Faji)', unit: '', sign: 1 },
  form: { label: '7. Meisterform entfesselt', unit: 'flag', sign: 1 },
  hyperHeavy: { label: 'Hyper-Armor auf schweren Angriffen', unit: 'flag', sign: 1 },
  autoChase: { label: 'Auto-Verfolgung hochgeschleuderter Ziele', unit: 'flag', sign: 1 },
  elementFinisher: { label: 'Finisher tragen das Element der Faji-Kunst', unit: 'flag', sign: 1 },
  stormBurst: { label: 'Entladung beim Sturm-Schritt (Schaden)', unit: '%', sign: 1 },
  heavyWave: { label: 'Schockwelle schwerer Angriffe (Schaden)', unit: '%', sign: 1 },
  apex: { label: 'Apex-Form des Ultimates', unit: 'flag', sign: 1 },
  gravity: { label: 'Gravitationssog schwerer Angriffe', unit: '', sign: 1 },
  fusion: { label: 'Elementar-Verschmelzung der Ketten', unit: 'flag', sign: 1 },
  meteorRain: { label: 'Meteoriten beim Finisher', unit: '', sign: 1 },
  skyfall: { label: '15. Ultimate: Himmelssturz', unit: 'flag', sign: 1 },
  cannon: { label: 'Kanonenschaden', unit: '%', sign: 1 },
  reload: { label: 'Nachladezeit', unit: '%', sign: -1 },
  sail: { label: 'Höchstfahrt', unit: '%', sign: 1 },
  turn: { label: 'Wendigkeit', unit: '%', sign: 1 },
  hull: { label: 'Rumpfpunkte', unit: '%', sign: 1 },
  range: { label: 'Geschützreichweite', unit: '%', sign: 1 },
  boarding: { label: 'Enter- und Truppenkraft', unit: '%', sign: 1 },
  merit: { label: 'Lohn für Kriegspunkte', unit: '%', sign: 1 },
  bastion: { label: 'Schaden gegen Bastionen und Festungen', unit: '%', sign: 1 },
  troopPrice: { label: 'Preis der Truppen', unit: '%', sign: -1 },
  tribute: { label: 'Tribut besetzter Inseln', unit: '%', sign: 1 },
  buy: { label: 'Einkaufspreise', unit: '%', sign: -1 },
  sell: { label: 'Verkaufserlöse', unit: '%', sign: 1 },
  cargo: { label: 'Frachtraum', unit: '%', sign: 1 },
  upkeep: { label: 'Unterhalt und Sold', unit: '%', sign: -1 },
  loot: { label: 'Gold aus Beute', unit: '%', sign: 1 },
  smuggle: { label: 'Fahndungsdruck beim Schmuggel', unit: '%', sign: -1 },
};

// ---------- Mutationen der Techniken (Stufe 3) ----------

/**
 * Baustein einer Mutation: Wellen (jedes Trefferfenster läuft `v`-mal nach; Geschosse: `v`-mal so viele), in der Luft nutzbar, Hinrichtung
 * in der Luft (+Schaden gegen Ziele in der Luft), Auto-Verfolgung nach dem Hochschleudern, Reichweite, Abklingzeit, Hochschleudern, Sog,
 * Kettenblitz, weitere Geschosse, durchbohrend, Zustand (Element), Schaden.
 */
export type MutKind = 'waves' | 'air' | 'airExec' | 'chase' | 'reach' | 'cd' | 'launch' | 'vortex' | 'chain' | 'proj' | 'pierce' | 'status' | 'dmg';
export interface MutStep { kind: MutKind; v: number; status?: HitStatus }
export interface SkillMutation {
  slot: 1 | 2 | 3 | 4;
  /** gilt ab Rang 1 */
  add: MutStep[];
  /** je weiterem Rang (Rang 2, 3) */
  perRank: MutStep[];
}

// ---------- Knoten und Bäume ----------

export interface TalentNodeDef {
  /** `baum.knoten` */
  id: string;
  tree: TalentTreeId;
  /** Stufe im Baum (Kampf 1 … 7, Kapitän 1 … 5, Kosmos 1 … 6 = Sternbild-Reihen plus Krone) */
  tier: number;
  /** Spalte in der Ansicht (Kampfstufe 2: 0 … 2 Pfad A, 3 … 5 Pfad B; sonst fortlaufend) */
  col: number;
  /** Pfad der Stufe 2 (A und B schließen sich aus) */
  path?: 'A' | 'B';
  name: string;
  desc: string;
  icon: string;
  max: number;
  fx: TalentFx;
  mut?: SkillMutation;
  /** Knoten, die vorher mindestens Rang 1 haben müssen */
  needs?: string[];
  /** Mindeststufe der Spielfigur je Rang (Index = Rang − 1) */
  levels?: number[];
  /** Kaiser-Siegel je Rang (verbraucht) */
  seals?: number[];
  /** Besitz nötig (gezählt, nicht verbraucht): Mythische Baupläne bzw. Kaiser-Relikte je Rang */
  blueprints?: number[];
  relics?: number[];
  /** Sternbild (nur Kosmos) */
  constellation?: ConstellationId;
}

export interface TierDef { name: string; gate: number; level: number }

export interface TalentTreeDef {
  id: TalentTreeId;
  kind: TreeKind;
  name: string;
  title: string;
  desc: string;
  icon: string;
  color: string;
  accent: string;
  /** Kampfbäume: zugehöriger Stil */
  style: ActionStyleId | null;
  /** Kampfbäume: die beiden Pfade der Stufe 2 */
  paths: { A: { name: string; desc: string }; B: { name: string; desc: string } } | null;
  tiers: TierDef[];
  nodes: TalentNodeDef[];
  /** Summe aller Höchstränge (Pfad B zählt nicht mit, er schließt A aus) */
  capacity: number;
}

// ---------- Eckwerte ----------

export const TALENT = {
  /** reguläre Höchststufe (EP), Stufe nach dem Aufstieg */
  levelCap: 100,
  ascendedLevel: 101,
  /** 99 Stufenaufstiege + 21 Meisterschafts-Siegel = 120 Punkte */
  levelPoints: 99,
  sealPoints: 21,
  total: 120,
  /** Bindung: ab so vielen Punkten ist ein Kampfbaum der Meisterbaum – nur einer darf es sein (alle übrigen höchstens `commit − 1`) */
  commit: 55,
  /** Kosmische Punkte höchstens (5 Aufstieg + 5 Sternenprüfungen + 5 Revanchen) */
  cosmicMax: 15,
  /** Punkte im Baum, ab denen eine Stufe frei wird (Index = Stufe − 1), und die Mindeststufe der Spielfigur */
  combatGates: [0, 5, 14, 24, 34, 55, 56],
  combatLevels: [1, 5, 12, 20, 60, 70, 85],
  captainGates: [0, 4, 10, 18, 26],
  captainLevels: [1, 6, 15, 30, 50],
  /** Zurücksetzen: Gold (Grund + je Stufe, ab dem zweiten Mal teurer) und Kaiser-Siegel, sobald Meister-Knoten (Stufe 5 – 7) betroffen sind */
  respec: { goldBase: 400, goldPerLevel: 90, repeatK: 0.25, repeatMax: 2, masterSeals: 2, treeK: 0.4 },
  /** Aufstiegs-Prüfung (Stufe 101): Opfer am Sternenaltar */
  ascension: { blueprints: 5, relics: 2, seals: 5 },
  /** ausrüstbare Ultimate-Evolutionen je Baum */
  evoSlots: 2,
  /** Krone des Kosmos: Preis und Bedingung (so viele Sterne in so vielen Sternbildern) */
  skyfallCost: 3,
  skyfallStars: 6,
  skyfallConstellations: 3,
} as const;

/** Standard-Höchstränge einer Kampfstufe (Stufe 2: zwei Knoten zu 5, Signatur zu 3) */
const COMBAT_MAX = [5, 5, 3, 3, 3, 3, 2];
const MASTER_LEVELS = [60, 72, 85];
const EVO_LEVELS = [85, 95];
const COMBAT_TIER_NAMES = ['Fundament', 'Pfadwahl', 'Technik-Mutationen', 'Synergien', 'Meisterprüfung', 'Apex-Kataklysmus', 'Ultimate-Evolution'];
const CAPTAIN_TIER_NAMES = ['Grundausbildung', 'Handwerk', 'Kommando', 'Doktrin', 'Großmeister'];

// ---------- Baukasten der Kampfbäume ----------

/** Knoten-Eingabe: Schlüssel, Name, Zeichen, Wirkung je Rang, Beschreibung */
type NodeIn = [key: string, name: string, icon: string, fx: TalentFx, desc: string];
/** Mutation: Schlüssel, Name, Zeichen, Bausteine ab Rang 1, je weiterem Rang, Beschreibung */
type MutIn = [key: string, name: string, icon: string, add: MutStep[], perRank: MutStep[], desc: string];

interface CombatSpec {
  id: CombatTreeId;
  name: string;
  title: string;
  desc: string;
  icon: string;
  fund: [NodeIn, NodeIn, NodeIn];
  pathA: { name: string; desc: string; nodes: [NodeIn, NodeIn, NodeIn] };
  pathB: { name: string; desc: string; nodes: [NodeIn, NodeIn, NodeIn] };
  muts: [MutIn, MutIn, MutIn, MutIn];
  syn: [NodeIn, NodeIn, NodeIn, NodeIn];
  master: [NodeIn, NodeIn, NodeIn];
  apex: NodeIn;
  evo: [NodeIn, NodeIn, NodeIn];
}

const W = (kind: MutKind, v: number, status?: HitStatus): MutStep => (status ? { kind, v, status } : { kind, v });

function combatTree(s: CombatSpec): TalentTreeDef {
  const st = ACTION_STYLES[s.id];
  const id = s.id;
  const nodes: TalentNodeDef[] = [];
  const add = (tier: number, col: number, n: NodeIn, extra: Partial<TalentNodeDef> = {}) => {
    const node: TalentNodeDef = { id: `${id}.${n[0]}`, tree: id, tier, col, name: n[1], icon: n[2], fx: n[3], desc: n[4], max: COMBAT_MAX[tier - 1], ...extra };
    nodes.push(node);
    return node;
  };
  s.fund.forEach((n, i) => add(1, i + 1, n));
  s.pathA.nodes.forEach((n, i) => add(2, i, n, { path: 'A', max: i < 2 ? 5 : 3, needs: i > 0 ? [`${id}.${s.pathA.nodes[i - 1][0]}`] : undefined }));
  s.pathB.nodes.forEach((n, i) => add(2, i + 3, n, { path: 'B', max: i < 2 ? 5 : 3, needs: i > 0 ? [`${id}.${s.pathB.nodes[i - 1][0]}`] : undefined }));
  s.muts.forEach((m, i) => {
    nodes.push({ id: `${id}.${m[0]}`, tree: id, tier: 3, col: i, name: m[1], icon: m[2], fx: {}, desc: m[5], max: 3, mut: { slot: (i + 1) as 1 | 2 | 3 | 4, add: m[3], perRank: m[4] } });
  });
  s.syn.forEach((n, i) => add(4, i, n));
  // Meisterprüfung (Stufe 60 – 85); der dritte Knoten ist ein Kaiser-Siegel-Knoten (je Rang ein Siegel), die übrigen verlangen das Siegel im letzten Rang
  s.master.forEach((n, i) => add(5, i + 1, n, { levels: MASTER_LEVELS, seals: i === 2 ? [1, 1, 1] : [0, 0, 1] }));
  // Apex: ab 55 Punkten im Baum (Bindung), Stufe 70, zwei Kaiser-Siegel und ein Mythischer Bauplan im Besitz
  const apex = add(6, 2, s.apex, { levels: [70, 70, 70], seals: [2, 0, 0], blueprints: [1, 1, 1] });
  // Ultimate-Evolutionen (Stufe 85 – 100): der zweite Rang verlangt Kaiser-Relikte im Besitz (1, 2, 3 – aus Kaiser-Revanchen)
  s.evo.forEach((n, i) => add(7, i + 1, n, { levels: EVO_LEVELS, relics: [0, i + 1], needs: [apex.id] }));
  return {
    id, kind: st.faji ? 'faji' : 'waffe', name: s.name, title: s.title, desc: s.desc, icon: s.icon, color: st.color, accent: st.accent, style: id,
    paths: { A: { name: s.pathA.name, desc: s.pathA.desc }, B: { name: s.pathB.name, desc: s.pathB.desc } },
    tiers: COMBAT_TIER_NAMES.map((name, i) => ({ name, gate: TALENT.combatGates[i], level: TALENT.combatLevels[i] })),
    nodes, capacity: capacityOf(nodes),
  };
}

function capacityOf(nodes: readonly TalentNodeDef[]): number {
  return nodes.reduce((a, n) => a + (n.path === 'B' ? 0 : n.max), 0);
}

// gemeinsame Synergie- und Evolutions-Bausteine (Namen je Baum eigen)
const synElement = (name: string, desc: string): NodeIn => ['elementhieb', name, '✶', { elementFinisher: 1, finisher: 0.06 }, desc];
const synStorm = (name: string, desc: string, burst = 0.6): NodeIn => ['sturmschritt', name, '⚡', { stormBurst: burst, perfect: 0.01 }, desc];
const synAuras = (name: string): NodeIn => ['auren', name, '◎', { auraSight: 0.1, auraIron: 0.1, auraKing: 0.1 }, 'Sturmblick, Eisenwille und Königsdruck schwingen mit deinem Stil: längeres Ausweichfenster, mehr Durchschlag, weitere Druckwellen.'];
const synWill = (name: string, desc: string): NodeIn => ['willensstrom', name, '♨', { will: 0.08, awaken: 1 }, desc];
const evoRadius = (name: string, desc: string): NodeIn => ['evoradius', name, '◯', { ultReach: 0.12 }, desc];
const evoShock = (name: string, desc: string): NodeIn => ['evobeben', name, '≋', { aftershock: 1 }, desc];
const evoWill = (name: string, desc: string): NodeIn => ['evowille', name, '⚑', { multiKill: 4, will: 0.04 }, desc];

// ---------- Die sechs Waffenbäume ----------

const ZWEIHAENDER: CombatSpec = {
  id: 'zweihaender', name: 'Zweihänder', title: 'Weg des Kolosses', icon: '⚔',
  desc: 'Großschwert-Kunst: jeder Hieb ein Bergsturz. Wähle zwischen dem Koloss, der Schiffe spaltet, und dem Moloch, den nichts aufhält.',
  fund: [
    ['stand', 'Eiserner Stand', '⛨', { stance: 0.02, posture: 0.03 }, 'Breitbeinig wie ein Fels: weniger Schaden, solange die Klinge schwingt.'],
    ['ausfall', 'Weiter Ausfall', '➹', { lunge: 0.25, reach: 0.02 }, 'Der Schritt in den Hieb wird länger, die Klinge reicht weiter.'],
    ['schwung', 'Schwungmasse', '⟳', { combo: 0.03, heavy: 0.02 }, 'Das Gewicht arbeitet mit: jeder Schwung trägt den nächsten.'],
  ],
  pathA: {
    name: 'Koloss-Schiffsspalter', desc: 'Wucht gegen alles, was schwimmt und steht: weite Schockwellen, Kiel- und Rumpfbrecher.',
    nodes: [
      ['kielbrecher', 'Kielbrecher', '⚓', { heavyReach: 0.04, knock: 0.05 }, 'Schwere Hiebe reißen weiter aus und schleudern härter.'],
      ['rumpfbrecher', 'Rumpfbrecher', '⛏', { pen: 0.2, dmg: 0.02 }, 'Die Schneide frisst sich durch Planken und Plattenpanzer.'],
      ['kolosswelle', 'Koloss-Welle', '〰', { heavyWave: 0.35 }, 'Schwere Hiebe und Verzweigungen schicken eine Schockwelle 14 m weit über Deck und Wasser.'],
    ],
  },
  pathB: {
    name: 'Unaufhaltsamer Moloch', desc: 'Nichts bricht deinen Angriff: Panzerhaut, Sturmlauf und Hyper-Armor.',
    nodes: [
      ['molochhaut', 'Molochhaut', '⛊', { armor: 0.015, hp: 0.02 }, 'Narben wie Panzerplatten.'],
      ['sturmlauf', 'Sturmlauf', '⇶', { heavy: 0.03, fling: 0.08 }, 'Schwere Angriffe kommen schneller und fegen Verbände beiseite.'],
      ['unaufhaltsam', 'Unaufhaltsam', '✊', { hyperHeavy: 1, stance: 0.04 }, 'Schwere Angriffe und Verzweigungen tragen Hyper-Armor: kein Treffer unterbricht sie.'],
    ],
  },
  muts: [
    ['m_berg', 'Bergbrecher · Dreifach-Beben', '⛰', [W('waves', 2)], [W('dmg', 0.06)], 'Der Bergbrecher bebt dreimal nach – jedes Beben schleudert erneut.'],
    ['m_rad', 'Sturmrad · Sog-Rad', '✺', [W('vortex', 3.5)], [W('reach', 0.06)], 'Das Sturmrad saugt alles in die Klinge.'],
    ['m_wille', 'Unbeugsam · Trotzwall', '⛨', [W('cd', 0.15), W('launch', 6)], [W('cd', 0.05)], 'Der Kampfschrei schleudert Gegner hoch und kommt schneller wieder.'],
    ['m_titan', 'Titanenspalter · Dreifach-Welle', '⇝', [W('waves', 2)], [W('dmg', 0.06)], 'Drei Spaltwellen hintereinander über 16 m.'],
  ],
  syn: [
    synElement('Elementhieb: Himmelsspalter', 'Haltungsbruch- und Ketten-Finisher tragen das Element deiner Faji-Kunst (Brand, Frost, Schock …).'),
    synStorm('Sturm-Schritt: Bergsturz', 'Nach einem perfekten Ausweichen bricht hinter dem Angreifer ein Bergsturz los.', 0.7),
    synAuras('Drei-Auren-Resonanz'),
    synWill('Willensstrom des Kolosses', 'Die Willenskraft füllt sich schneller, das Sturm-Erwachen hält länger.'),
  ],
  master: [
    ['weltenbrecher', 'Meisterprüfung: Weltenbrecher', '☄', { heavyReach: 0.05, launch: 0.1 }, 'Schwere Angriffe greifen noch weiter und schleudern Gegner in den Himmel.'],
    ['meisterschaft', 'Großschwert-Meisterschaft', '★', { dmg: 0.04, crit: 0.015 }, 'Jeder Schwung sitzt.'],
    ['kronenbrecher', 'Siegel des Kronenbrechers', '♛', { posture: 0.08, pen: 0.34 }, 'Ein Kaiser-Siegel in der Parierstange: Haltung und Panzer der Kaiser brechen schneller.'],
  ],
  apex: ['apex', 'Apex: Horizont-Zäsur', '✹', { apex: 1, ult: 0.06, ultReach: 0.05 }, 'Das Ultimate erreicht seine Apex-Form: der Himmelsspalter teilt den Horizont mit voller Wucht.'],
  evo: [
    evoRadius('Horizont ohne Ende', 'Die Zäsur reicht weiter: größerer Spaltradius über Meer und Land.'),
    evoShock('Doppeltes Nachbeben', 'Nach dem Einschlag bebt die Welt ein zweites (und drittes) Mal nach.'),
    evoWill('Rausch des Kolosses', 'Bricht ein Hieb drei oder mehr Gegner, füllt sich die Willenskraft rasend schnell.'),
  ],
};

const SAEBEL: CombatSpec = {
  id: 'saebel', name: 'Säbel', title: 'Weg des Korsaren-Souveräns', icon: '🗡',
  desc: 'Säbelkunst der Korsaren: blitzschnelle Klingen und kritische Treffer. Duellant im Sturm oder Kommandant der Entermannschaft.',
  fund: [
    ['fechterstand', 'Fechterstand', '⛨', { stance: 0.015, crit: 0.006 }, 'Leicht auf den Ballen, die Spitze immer vorn.'],
    ['sprungweite', 'Sprungweite', '➹', { lunge: 0.3, reach: 0.015 }, 'Ein Satz über das halbe Deck.'],
    ['klingenrhythmus', 'Klingenrhythmus', '⟳', { combo: 0.04 }, 'Hieb, Hieb, Stoß – im Takt der Brandung.'],
  ],
  pathA: {
    name: 'Sturmblitz-Duellant', desc: 'Kritische Treffer, Sturm-Schritt-Konter und Verfolgung bis in die Wolken.',
    nodes: [
      ['blitzklinge', 'Blitzklinge', '⚡', { crit: 0.01, combo: 0.02 }, 'Schneller als das Auge, öfter ins Ziel.'],
      ['duellantenauge', 'Duellantenauge', '👁', { critDmg: 0.05, perfect: 0.008 }, 'Du siehst den Hieb kommen, bevor er beginnt.'],
      ['sturmblitz', 'Sturmblitz-Riposte', '↯', { stormBurst: 0.7, autoChase: 1 }, 'Nach dem Sturm-Schritt schlägt ein Blitz zurück; hochgeschleuderte Gegner verfolgst du von selbst.'],
    ],
  },
  pathB: {
    name: 'Korsaren-Kommandant', desc: 'Befehle mitten im Gefecht: Verbände zerstreuen, Auren stärken, die Crew mitreißen.',
    nodes: [
      ['enterbefehl', 'Enterbefehl', '⚓', { fling: 0.08, knock: 0.05 }, 'Wer im Weg steht, geht über Bord.'],
      ['kommandoton', 'Kommandoton', '📯', { auraKing: 0.08, will: 0.03 }, 'Dein Ruf trägt über den Sturm.'],
      ['flaggenwort', 'Wort des Kommandanten', '⚑', { auraIron: 0.1, armor: 0.02, awaken: 1 }, 'Eisenwille wird zur Mauer, das Erwachen hält länger.'],
    ],
  },
  muts: [
    ['m_sprint', 'Kronenblitz-Sprint · Kettenblitz', '↯', [W('chain', 2), W('status', 1.2, 'shock')], [W('dmg', 0.06)], 'Der Sprint springt als Kettenblitz auf zwei weitere Gegner über.'],
    ['m_faecher', 'Donnerfächer · Dreifach-Fächer', '✧', [W('waves', 2)], [W('dmg', 0.05)], 'Drei Donnerfächer hintereinander.'],
    ['m_tanz', 'Freibeuter-Tanz · Luft-Hinrichtung', '✈', [W('air', 1), W('airExec', 0.2)], [W('dmg', 0.05)], 'Der Tanz geht auch in der Luft und richtet hochgeschleuderte Gegner hin.'],
    ['m_krone', 'Sturmkrone · Krone des Sturms', '♛', [W('cd', 0.15), W('reach', 0.2)], [W('cd', 0.05)], 'Die Sturmkrone kommt schneller und reicht weiter.'],
  ],
  syn: [
    synElement('Elementhieb: Kronenfunke', 'Finisher tragen das Element deiner Faji-Kunst.'),
    synStorm('Sturm-Schritt: Donnerecho', 'Nach einem perfekten Ausweichen entlädt sich ein Donnerecho.'),
    synAuras('Drei-Auren-Resonanz'),
    synWill('Souveräner Wille', 'Mehr Willenskraft, längeres Erwachen.'),
  ],
  master: [
    ['meister', 'Meisterprüfung: Sieben-Meere-Fechter', '☄', { crit: 0.015, critDmg: 0.05 }, 'Die höchste Fechtkunst der sieben Meere.'],
    ['meisterschaft', 'Säbel-Meisterschaft', '★', { dmg: 0.04, combo: 0.02 }, 'Die Klinge ist ein Teil des Arms.'],
    ['sturmkronensiegel', 'Siegel der Sturmkrone', '♛', { crit: 0.01, perfect: 0.01 }, 'Ein Kaiser-Siegel im Korb des Säbels.'],
  ],
  apex: ['apex', 'Apex: Sieben-Meere-Zäsur', '✹', { apex: 1, ult: 0.06, ultReach: 0.05 }, 'Der Souverän-Orkan in seiner Apex-Form: die Geister-Armada feuert mit voller Breitseite.'],
  evo: [
    evoRadius('Weite der Sieben Meere', 'Die Zäsur deckt ein größeres Meer ab.'),
    evoShock('Doppeltes Donnerecho', 'Nach dem Einschlag hallen zwei Donnerwellen nach.'),
    evoWill('Souveräns Rausch', 'Mehrfach-Brüche laden die Willenskraft rasend schnell.'),
  ],
};

const DOPPEL: CombatSpec = {
  id: 'doppel', name: 'Doppelklinge', title: 'Weg des Wirbelsturm-Tänzers', icon: '⚔',
  desc: 'Zwei Klingen, ein Wirbel: endlose Ketten am Boden und in der Luft. Kreissäge über den Wolken oder Assassine aus dem Schatten.',
  fund: [
    ['tanzschritt', 'Tanzschritt', '⛨', { stance: 0.015, dashCost: 0.03 }, 'Leichtfüßig: Ausweichen kostet weniger Atem.'],
    ['zwillingsreichweite', 'Zwillingsreichweite', '➹', { lunge: 0.25, arc: 0.03 }, 'Die Klingen fächern weiter auf.'],
    ['wirbeltakt', 'Wirbeltakt', '⟳', { combo: 0.04 }, 'Der Wirbel wird schneller und schneller.'],
  ],
  pathA: {
    name: 'Luft-Kreissäge', desc: 'Der Kampf gehört dem Himmel: Aufwind, weitere Sprünge, Auto-Verfolgung.',
    nodes: [
      ['kreissaege', 'Kreissäge', '✺', { combo: 0.02, airDmg: 0.02 }, 'Die Klingen kreisen wie ein Sägeblatt.'],
      ['aufwind', 'Aufwind', '⇡', { launch: 0.06, jumps: 0.2 }, 'Gegner fliegen höher – und du mit ihnen (ab Rang 5 ein weiterer Luftsprung).'],
      ['luftsaege', 'Kreissäge über den Wolken', '☁', { autoChase: 1, airDashes: 0.34 }, 'Hochgeschleuderte Gegner verfolgst du von selbst; ab Rang 3 ein weiterer Luft-Dash.'],
    ],
  },
  pathB: {
    name: 'Schatten-Assassine', desc: 'Aus dem toten Winkel: Sturm-Schritt, Meuchelkritik und Schattenrausch.',
    nodes: [
      ['schattenschritt', 'Schattenschritt', '◐', { perfect: 0.01, crit: 0.008 }, 'Der Schatten weicht, bevor der Hieb fällt.'],
      ['meuchelklinge', 'Meuchelklinge', '🗡', { critDmg: 0.06 }, 'Ein Stich, der sitzt.'],
      ['schattenrausch', 'Schattenrausch', '◑', { stormBurst: 0.6, crit: 0.01 }, 'Jeder Sturm-Schritt hinterlässt einen Schnittwirbel.'],
    ],
  },
  muts: [
    ['m_wirbel', 'Klingenwirbel · Sog-Wirbel', '✺', [W('vortex', 3)], [W('dmg', 0.05)], 'Der Wirbel zieht Gegner in die Klingen.'],
    ['m_schwalbe', 'Schwalbensturz · Auto-Verfolgung', '⇡', [W('chase', 1), W('launch', 3)], [W('dmg', 0.06)], 'Nach dem Schwalbensturz folgst du dem Ziel per Blitz-Teleport.'],
    ['m_schatten', 'Zwillingsschatten · Dreifach-Schatten', '◐', [W('waves', 2)], [W('dmg', 0.05)], 'Drei Schattenpaare schlagen nach.'],
    ['m_tausend', 'Tausend Schnitte · Luft-Hinrichtung', '✈', [W('air', 1), W('airExec', 0.2)], [W('dmg', 0.05)], 'Tausend Schnitte auch in der Luft – Gegner in der Luft zerfallen schneller.'],
  ],
  syn: [
    synElement('Elementhieb: Schwalbenkreuz', 'Finisher tragen das Element deiner Faji-Kunst.'),
    synStorm('Sturm-Schritt: Klingenecho', 'Ein Schnittwirbel nach jedem perfekten Ausweichen.'),
    synAuras('Drei-Auren-Resonanz'),
    synWill('Tänzerwille', 'Mehr Willenskraft, längeres Erwachen.'),
  ],
  master: [
    ['meister', 'Meisterprüfung: Tausend-Schnitt-Tänzer', '☄', { combo: 0.03, airDmg: 0.04 }, 'Der Wirbel hört nicht mehr auf.'],
    ['meisterschaft', 'Doppelklingen-Meisterschaft', '★', { dmg: 0.04, crit: 0.01 }, 'Zwei Klingen, ein Gedanke.'],
    ['zyklonsiegel', 'Siegel des Zyklons', '♛', { arc: 0.04, critDmg: 0.04 }, 'Ein Kaiser-Siegel zwischen den Klingen.'],
  ],
  apex: ['apex', 'Apex: Tausend-Schnitt-Wirbel', '✹', { apex: 1, ult: 0.06, ultReach: 0.05 }, 'Der Klingen-Zyklon in seiner Apex-Form.'],
  evo: [
    evoRadius('Zyklon ohne Ufer', 'Der Wirbel erfasst einen größeren Kreis.'),
    evoShock('Doppelter Nachwirbel', 'Nach dem Einschlag schneiden zwei Nachwirbel.'),
    evoWill('Tänzerrausch', 'Mehrfach-Brüche laden die Willenskraft rasend schnell.'),
  ],
};

const LANGKLINGE: CombatSpec = {
  id: 'langklinge', name: 'Langklinge', title: 'Weg des Iaijutsu-Meisters', icon: '🗡',
  desc: 'Die Klinge ruht, bis sie trifft. Lautloser Zieh-Schnitt oder der Spiegel, der jeden Angriff zurückwirft.',
  fund: [
    ['ruhestand', 'Ruhender Stand', '⛨', { stance: 0.02, perfect: 0.004 }, 'Die Ruhe vor dem Schnitt.'],
    ['ziehweite', 'Ziehweite', '➹', { lunge: 0.3, reach: 0.02 }, 'Der Zug reicht bis an den Gegner heran.'],
    ['atemtakt', 'Atemtakt', '⟳', { combo: 0.03, heavy: 0.02 }, 'Ein Atemzug, ein Schnitt.'],
  ],
  pathA: {
    name: 'Lautloser Zieh-Schnitt', desc: 'Iai-Züge, die durch Panzer und Wellen schneiden.',
    nodes: [
      ['ziehschnitt', 'Zieh-Schnitt', '⇝', { heavy: 0.03, critDmg: 0.04 }, 'Schnell gezogen, tief geschnitten.'],
      ['mondglanz', 'Mondglanz der Klinge', '☾', { pen: 0.2, crit: 0.008 }, 'Die Schneide gleitet durch Stahl.'],
      ['lautlos', 'Lautloser Blitz', '⚡', { heavyReach: 0.06, finisher: 0.06 }, 'Iai-Züge reichen weiter, Finisher rasten mit doppeltem Echo ein.'],
    ],
  },
  pathB: {
    name: 'Spiegel-Kontermeister', desc: 'Jeder Angriff gegen dich wird zu deinem Angriff.',
    nodes: [
      ['spiegelauge', 'Spiegelauge', '👁', { perfect: 0.01, stance: 0.01 }, 'Du siehst die Klinge im Spiegel des Mondes.'],
      ['gegenzug', 'Gegenzug', '↺', { stormBurst: 0.4, critDmg: 0.03 }, 'Nach dem Sturm-Schritt antwortet ein Mondschnitt.'],
      ['mondspiegel', 'Vollkommener Spiegel', '◯', { perfect: 0.015, stormBurst: 0.5, armor: 0.015 }, 'Das Fenster des perfekten Ausweichens wird weit, der Gegenschnitt verheerend.'],
    ],
  },
  muts: [
    ['m_iai', 'Iai: Blitzzug · Dreifach-Zug', '⇝', [W('waves', 2)], [W('dmg', 0.06)], 'Drei Blitzzüge in einem Atemzug.'],
    ['m_spiegel', 'Mondspiegel · Spiegelwelle', '◯', [W('reach', 0.3), W('cd', 0.1)], [W('reach', 0.05)], 'Die Spiegelwelle reicht weiter und kommt schneller.'],
    ['m_kreuz', 'Kreuzwind · Luft-Hinrichtung', '✈', [W('air', 1), W('airExec', 0.2)], [W('dmg', 0.05)], 'Der Kreuzwind schneidet auch aus der Luft und richtet Gegner in der Luft hin.'],
    ['m_monde', 'Hundert Monde · Auto-Verfolgung', '⇡', [W('launch', 7), W('chase', 1)], [W('dmg', 0.05)], 'Hundert Monde schleudern hoch – du folgst per Blitz-Teleport.'],
  ],
  syn: [
    synElement('Elementhieb: Letzter Mondschein', 'Finisher tragen das Element deiner Faji-Kunst.'),
    synStorm('Sturm-Schritt: Mondecho', 'Ein Mondschnitt nach jedem perfekten Ausweichen.', 0.7),
    synAuras('Drei-Auren-Resonanz'),
    synWill('Stiller Wille', 'Mehr Willenskraft, längeres Erwachen.'),
  ],
  master: [
    ['meister', 'Meisterprüfung: Weltenbruch-Zug', '☄', { pen: 0.34, heavyReach: 0.04 }, 'Ein Zug, der Welten bricht.'],
    ['meisterschaft', 'Langklingen-Meisterschaft', '★', { dmg: 0.04, crit: 0.012 }, 'Die Klinge kennt ihren Weg.'],
    ['mondscheinsiegel', 'Siegel des Mondscheins', '♛', { critDmg: 0.05, perfect: 0.01 }, 'Ein Kaiser-Siegel im Stichblatt.'],
  ],
  apex: ['apex', 'Apex: Iaijutsu-Weltenbruch', '✹', { apex: 1, ult: 0.06, ultReach: 0.05 }, 'Der lautlose Blitz in seiner Apex-Form.'],
  evo: [
    evoRadius('Grenzenloser Zug', 'Der Weltenbruch schneidet weiter.'),
    evoShock('Doppelter Klingenhall', 'Zwei Nachhalle zerreißen, was der Zug verfehlt hat.'),
    evoWill('Stille vor dem Sturm', 'Mehrfach-Brüche laden die Willenskraft rasend schnell.'),
  ],
};

const STURMFAUST: CombatSpec = {
  id: 'sturmfaust', name: 'Sturmfaust', title: 'Weg der Schnellen Faust', icon: '✊',
  desc: 'Fäuste schneller als der Schall. Stakkato bis zur Schallmauer oder akrobatischer Orkan in der Luft.',
  fund: [
    ['boxerstand', 'Boxerstand', '⛨', { stance: 0.015, posture: 0.02 }, 'Deckung oben, Füße leicht.'],
    ['sprungschritt', 'Sprungschritt', '➹', { lunge: 0.3, dashCost: 0.02 }, 'Ein Schritt, und du bist da.'],
    ['stakkato', 'Stakkato', '⟳', { combo: 0.045 }, 'Schlag auf Schlag auf Schlag.'],
  ],
  pathA: {
    name: 'Überschall-Stakkato', desc: 'Fäuste, die die Schallmauer brechen.',
    nodes: [
      ['ueberschall', 'Überschallfaust', '💥', { combo: 0.02, dmg: 0.015 }, 'Jeder Schlag ein Knall.'],
      ['nachbildhagel', 'Nachbildhagel', '✦', { crit: 0.008, critDmg: 0.03 }, 'Zehn Fäuste, wo eine war.'],
      ['schallmauer', 'Schallmauer', '◎', { combo: 0.04, stormBurst: 0.4 }, 'Das Tempo durchbricht die Schallmauer: noch schnellere Ketten, Druckknall beim Sturm-Schritt.'],
    ],
  },
  pathB: {
    name: 'Orkan-Akrobat', desc: 'Der Kampf in der Luft: Sprünge, Tritte, Verfolgung.',
    nodes: [
      ['akrobat', 'Akrobatik', '⤴', { jumps: 0.2, airDmg: 0.02 }, 'Ab Rang 5 ein weiterer Luftsprung.'],
      ['wirbeltritt', 'Orkan-Wirbeltritt', '⟲', { launch: 0.06, airDashes: 0.2 }, 'Höhere Launcher; ab Rang 5 ein weiterer Luft-Dash.'],
      ['himmelsakrobat', 'Himmelsakrobat', '☁', { autoChase: 1, airDmg: 0.04 }, 'Hochgeschleuderte Gegner verfolgst du von selbst.'],
    ],
  },
  muts: [
    ['m_hagel', 'Nachbildfäuste · Luft-Hinrichtung', '✈', [W('air', 1), W('airExec', 0.2)], [W('dmg', 0.05)], 'Der Hagel auch in der Luft – Gegner in der Luft zerbrechen schneller.'],
    ['m_tritt', 'Donnertritt · Auto-Verfolgung', '⇡', [W('chase', 1), W('launch', 3)], [W('dmg', 0.06)], 'Nach dem Donnertritt folgst du dem Ziel per Blitz-Teleport.'],
    ['m_kette', 'Sturmschritt-Kette · Dreifach-Kette', '⇶', [W('waves', 2)], [W('dmg', 0.05)], 'Drei Ketten hintereinander.'],
    ['m_himmel', 'Himmelsfaust · Kettenblitz', '↯', [W('chain', 3), W('status', 1.2, 'shock')], [W('dmg', 0.05)], 'Die Himmelsfaust springt als Blitz auf drei weitere Gegner.'],
  ],
  syn: [
    synElement('Elementhieb: Tausend Donner', 'Finisher tragen das Element deiner Faji-Kunst.'),
    synStorm('Sturm-Schritt: Donnerknall', 'Ein Druckknall nach jedem perfekten Ausweichen.'),
    synAuras('Drei-Auren-Resonanz'),
    synWill('Faustwille', 'Mehr Willenskraft, längeres Erwachen.'),
  ],
  master: [
    ['meister', 'Meisterprüfung: Zehntausend Hiebe', '☄', { combo: 0.03, posture: 0.05 }, 'Zehntausend Hiebe in einem Atemzug.'],
    ['meisterschaft', 'Faust-Meisterschaft', '★', { dmg: 0.04, crit: 0.012 }, 'Die Faust ist die Waffe.'],
    ['donnersiegel', 'Siegel des Donnerschlags', '♛', { critDmg: 0.05, will: 0.03 }, 'Ein Kaiser-Siegel im Faustpanzer.'],
  ],
  apex: ['apex', 'Apex: Zehntausend-Hiebe-Orkan', '✹', { apex: 1, ult: 0.06, ultReach: 0.05 }, 'Das Stakkato in seiner Apex-Form.'],
  evo: [
    evoRadius('Orkan ohne Ende', 'Der Hiebe-Orkan erfasst mehr.'),
    evoShock('Doppelter Donnerhall', 'Zwei Donnerhalle nach dem Einschlag.'),
    evoWill('Faustrausch', 'Mehrfach-Brüche laden die Willenskraft rasend schnell.'),
  ],
};

const ERDSPALTER: CombatSpec = {
  id: 'erdspalter', name: 'Erdspalter', title: 'Weg der Starken Faust', icon: '✊',
  desc: 'Fäuste wie Felsen: Beben, Würfe, Gräben. Seismischer Brecher oder Titanen-Ringer.',
  fund: [
    ['wurzelstand', 'Wurzelstand', '⛨', { stance: 0.025, hp: 0.01 }, 'Wurzeln bis in den Fels.'],
    ['rammschritt', 'Rammschritt', '➹', { lunge: 0.25, knock: 0.04 }, 'Der Schritt in den Gegner hinein.'],
    ['felstakt', 'Felstakt', '⟳', { heavy: 0.03, combo: 0.015 }, 'Langsam wie ein Berg – bis er fällt.'],
  ],
  pathA: {
    name: 'Seismischer Brecher', desc: 'Jeder Schlag ein Erdbeben: Wellen, Risse, Launcher.',
    nodes: [
      ['bebenfaust', 'Bebenfaust', '⛰', { heavyReach: 0.04, launch: 0.04 }, 'Das Beben reicht weiter.'],
      ['kontinentalplatte', 'Kontinentalplatte', '▦', { posture: 0.05, dmg: 0.015 }, 'Haltung zerbricht wie Schiefer.'],
      ['seismik', 'Seismische Welle', '〰', { heavyWave: 0.3, knock: 0.06 }, 'Schwere Schläge reißen eine Bebenwelle 14 m weit durch den Boden.'],
    ],
  },
  pathB: {
    name: 'Titanen-Ringer', desc: 'Packen, werfen, aushalten.',
    nodes: [
      ['titanengriff', 'Titanengriff', '✋', { fling: 0.1, armor: 0.01 }, 'Ganze Verbände fliegen.'],
      ['ringerhaut', 'Ringerhaut', '⛊', { hp: 0.025, stance: 0.01 }, 'Haut wie gegerbtes Leder.'],
      ['titan', 'Titanenkörper', '⛰', { hyperHeavy: 1, armor: 0.02 }, 'Schwere Schläge tragen Hyper-Armor.'],
    ],
  },
  muts: [
    ['m_beben', 'Bebenstampfer · Dreifach-Beben', '⛰', [W('waves', 2)], [W('dmg', 0.06)], 'Drei Beben hintereinander.'],
    ['m_griff', 'Titanengriff · Wirbelwurf', '✺', [W('vortex', 2.5), W('launch', 3)], [W('dmg', 0.05)], 'Der Griff reißt alles in den Wurf.'],
    ['m_welle', 'Felsbrecher-Welle · Dreifach-Welle', '〰', [W('waves', 2)], [W('dmg', 0.05)], 'Drei Felswellen über 15 m.'],
    ['m_welt', 'Weltenspalter · Auto-Verfolgung', '⇡', [W('chase', 1), W('launch', 2)], [W('dmg', 0.05)], 'Nach dem Weltenspalter folgst du den Hochgeschleuderten.'],
  ],
  syn: [
    synElement('Elementhieb: Weltenbeben', 'Finisher tragen das Element deiner Faji-Kunst.'),
    synStorm('Sturm-Schritt: Felsenecho', 'Ein Felsbeben nach jedem perfekten Ausweichen.', 0.7),
    synAuras('Drei-Auren-Resonanz'),
    synWill('Felsenwille', 'Mehr Willenskraft, längeres Erwachen.'),
  ],
  master: [
    ['meister', 'Meisterprüfung: Kontinentbrecher', '☄', { posture: 0.06, heavyReach: 0.04 }, 'Kontinente brechen unter deiner Faust.'],
    ['meisterschaft', 'Erdspalter-Meisterschaft', '★', { dmg: 0.04, hp: 0.015 }, 'Fels und Faust sind eins.'],
    ['bebensiegel', 'Siegel des Weltenbebens', '♛', { armor: 0.015, pen: 0.34 }, 'Ein Kaiser-Siegel im Faustschild.'],
  ],
  apex: ['apex', 'Apex: Ozean-Teilung', '✹', { apex: 1, ult: 0.06, ultReach: 0.05 }, 'Das Erdspalter-Beben in seiner Apex-Form.'],
  evo: [
    evoRadius('Graben bis zum Horizont', 'Der Graben reicht weiter.'),
    evoShock('Doppeltes Erdbeben', 'Zwei Nachbeben nach dem Einschlag.'),
    evoWill('Rausch der Tiefe', 'Mehrfach-Brüche laden die Willenskraft rasend schnell.'),
  ],
};

// ---------- Die acht Faji-Bäume ----------

interface FajiSpec {
  id: CombatTreeId; name: string; title: string; icon: string; desc: string; el: string;
  /** Pfad A (Zerstörungs-Formen) und B (Kontroll- & Aura-Meisterschaft): Untertitel */
  aTitle: string; bTitle: string;
  fund: [NodeIn, NodeIn, NodeIn];
  a3: NodeIn;
  b3: NodeIn;
  muts: [MutIn, MutIn, MutIn, MutIn];
  apex: string;
  evo: [string, string, string];
}

/** Faji-Bäume: Pfad A schaltet die Formstufen 2 – 6 frei (Formsiegel, je Rang eine Stufe), die Meisterprüfung die 7. Meisterform */
function fajiTree(f: FajiSpec): TalentTreeDef {
  const tree = combatTree({
    id: f.id, name: f.name, title: f.title, icon: f.icon, desc: f.desc,
    fund: f.fund,
    pathA: {
      name: `Zerstörungs-Formen: ${f.aTitle}`, desc: 'Formsiegel öffnen die Formstufen 2 – 6 (je Rang eine), dazu Zerstörungskraft der Techniken.',
      nodes: [
        ['formsiegel', `Formsiegel: ${f.el}`, '⑦', { formStep: 1 }, 'Jeder Rang bricht ein Siegel: Formstufe 2, 3, 4, 5 und 6 – mit ihnen die Techniken der Form.'],
        ['zerstoerung', `Zerstörungskraft: ${f.el}`, '✹', { skillDmg: 0.04, reach: 0.015 }, 'Die Techniken treffen härter und weiter.'],
        f.a3,
      ],
    },
    pathB: {
      name: `Kontroll- & Aura-Meisterschaft: ${f.bTitle}`, desc: 'Längere Zustände, stärkerer Sog, mächtige Auren und ein längeres Erwachen.',
      nodes: [
        ['kontrollfeld', `Kontrollfeld: ${f.el}`, '◍', { statusDur: 0.08, vortexK: 0.06 }, 'Zustände halten länger, Sog zieht stärker.'],
        ['aurameister', `Aura-Meisterschaft: ${f.el}`, '◎', { auraSight: 0.08, auraIron: 0.08, auraKing: 0.08 }, 'Alle drei Auren werden stärker.'],
        f.b3,
      ],
    },
    muts: f.muts,
    syn: [
      synElement(`Elementhieb: ${f.el}`, 'Finisher tragen das Element dieser Kunst – auch im Wechsel mit den Waffenstilen.'),
      synStorm(`Sturm-Schritt: ${f.el}-Entladung`, 'Nach einem perfekten Ausweichen entlädt sich das Element hinter dem Angreifer.'),
      synAuras('Drei-Auren-Resonanz'),
      synWill(`Willensstrom: ${f.el}`, 'Mehr Willenskraft, längeres Erwachen.'),
    ],
    master: [
      ['meisterform', `Meisterprüfung: 7. Meisterform ${f.el}`, '⑦', { form: 1, skillDmg: 0.03 }, 'Die siebte Form erwacht ohne Meisterschafts-Punkte – samt Kataklysmus-Ultimate der Kunst.'],
      ['meisterschaft', `${f.el}-Meisterschaft`, '★', { dmg: 0.04, statusDur: 0.04 }, 'Das Element gehorcht dir.'],
      ['siegel', `Kaiser-Siegel: ${f.el}`, '♛', { skillDmg: 0.03, cd: 0.03 }, 'Ein Kaiser-Siegel bindet das Element an deinen Willen.'],
    ],
    apex: ['apex', `Apex: ${f.apex}`, '✹', { apex: 1, ult: 0.06, ultReach: 0.05 }, `${f.apex} in seiner Apex-Form.`],
    evo: [
      evoRadius(f.evo[0], 'Der Kataklysmus erfasst einen größeren Radius.'),
      evoShock(f.evo[1], 'Nach dem Einschlag folgen zwei Nachbeben des Elements.'),
      evoWill(f.evo[2], 'Mehrfach-Brüche laden die Willenskraft rasend schnell.'),
    ],
  });
  // Formsiegel: je Rang eine Formstufe, aber nur mit wachsender Erfahrung
  const seal = tree.nodes.find((n) => n.id === `${f.id}.formsiegel`);
  if (seal) seal.levels = [6, 12, 18, 26, 34];
  return tree;
}

const FAJI_SPECS: FajiSpec[] = [
  {
    id: 'schwarzloch', name: 'Schwarzes Loch', title: 'Weg der Finsternis-Gravitation', icon: '●', el: 'Gravitation',
    desc: 'Schwerkraft als Waffe: Sog, Bann der Auren, Ereignishorizont.', aTitle: 'Kollaps', bTitle: 'Ereignishorizont',
    fund: [
      ['massestand', 'Massestand', '⛨', { stance: 0.015, posture: 0.03 }, 'Schwer wie ein Stern.'],
      ['zugkraft', 'Zugkraft', '➹', { lunge: 0.2, vortexK: 0.05 }, 'Der Sog beginnt früher.'],
      ['umlauf', 'Umlaufbahn', '⟳', { combo: 0.03, cd: 0.01 }, 'Alles kreist schneller.'],
    ],
    a3: ['kollaps', 'Gravitationskollaps', '◉', { finisher: 0.06, launch: 0.06 }, 'Finisher fallen in sich zusammen und reißen Gegner hoch.'],
    b3: ['horizont', 'Horizont des Willens', '◌', { awaken: 1.2, will: 0.05, perfect: 0.008 }, 'Das Erwachen hält länger, der Wille wächst.'],
    muts: [
      ['m_griff', 'Gravitationsgriff · Ereignissog', '◉', [W('vortex', 2), W('reach', 0.15)], [W('dmg', 0.05)], 'Der Griff saugt aus größerer Entfernung.'],
      ['m_kugel', 'Ereigniskugel · Dreifach-Kugel', '●', [W('waves', 2)], [W('dmg', 0.05)], 'Drei Ereigniskugeln hintereinander.'],
      ['m_sturz', 'Schwerkraftsturz · Luft-Hinrichtung', '✈', [W('air', 1), W('airExec', 0.2)], [W('dmg', 0.05)], 'Der Sturz auch aus der Luft – Gegner in der Luft zerschellen.'],
      ['m_feld', 'Singularitätsfeld · Auto-Verfolgung', '⇡', [W('launch', 6), W('chase', 1)], [W('dmg', 0.05)], 'Das Feld schleudert hoch – du folgst per Blitz-Teleport.'],
    ],
    apex: 'Ereignishorizont – Schwarzer Abgrund', evo: ['Abgrund ohne Rand', 'Doppelter Kollaps', 'Hunger der Leere'],
  },
  {
    id: 'feuer', name: 'Feuer-Faji', title: 'Weg der Glut', icon: '🔥', el: 'Feuer',
    desc: 'Glut der Handflächen: Brand, Feuerwellen, Phönix.', aTitle: 'Inferno', bTitle: 'Glutherz',
    fund: [
      ['glutstand', 'Glutstand', '⛨', { stance: 0.015, statusDur: 0.03 }, 'Die Glut schützt ihren Träger.'],
      ['flammenweite', 'Flammenweite', '➹', { lunge: 0.2, reach: 0.02 }, 'Die Flammen greifen weiter.'],
      ['feueratem', 'Feueratem', '⟳', { combo: 0.03, cd: 0.01 }, 'Jeder Atemzug facht an.'],
    ],
    a3: ['inferno', 'Entfesseltes Inferno', '🔥', { finisher: 0.06, dmg: 0.02 }, 'Finisher explodieren in Glut.'],
    b3: ['glutherz', 'Glutherz', '♨', { awaken: 1.2, will: 0.05, perfect: 0.008 }, 'Das Herz brennt länger.'],
    muts: [
      ['m_faecher', 'Glutfächer · Dreifach-Glut', '✧', [W('waves', 2)], [W('dmg', 0.05)], 'Drei Glutfächer hintereinander.'],
      ['m_wirbel', 'Flammenwirbel · Feuersog', '✺', [W('vortex', 3)], [W('dmg', 0.05)], 'Der Wirbel zieht in die Flammen.'],
      ['m_welle', 'Brandwelle · Luft-Hinrichtung', '✈', [W('air', 1), W('airExec', 0.2)], [W('dmg', 0.05)], 'Die Brandwelle auch aus der Luft.'],
      ['m_phoenix', 'Phönixsprung · Auto-Verfolgung', '⇡', [W('launch', 8), W('chase', 1)], [W('dmg', 0.05)], 'Der Phönix trägt Gegner hoch – du folgst.'],
    ],
    apex: 'Purpur-Sonneninferno', evo: ['Feuerdrachen ohne Ufer', 'Doppelte Glutwelle', 'Flammenrausch'],
  },
  {
    id: 'eis', name: 'Eis-Faji', title: 'Weg des Ewigen Frosts', icon: '❄', el: 'Eis',
    desc: 'Frost der Ewigkeit: einfrieren, aufspießen, Gletscher.', aTitle: 'Gletscherbruch', bTitle: 'Frostkrone',
    fund: [
      ['froststand', 'Froststand', '⛨', { stance: 0.02, statusDur: 0.02 }, 'Eis um die Haut.'],
      ['reifweite', 'Reifweite', '➹', { lunge: 0.2, reach: 0.02 }, 'Der Frost kriecht weiter.'],
      ['kristalltakt', 'Kristalltakt', '⟳', { combo: 0.03, cd: 0.01 }, 'Klirrend schnell.'],
    ],
    a3: ['gletscherbruch', 'Gletscherbruch', '❄', { finisher: 0.06, posture: 0.04 }, 'Gefrorene Haltung zerspringt.'],
    b3: ['frostkrone', 'Frostkrone', '♛', { awaken: 1.2, will: 0.05, perfect: 0.008 }, 'Die Krone des Frosts.'],
    muts: [
      ['m_welle', 'Frostwelle · Dreifach-Frost', '〰', [W('waves', 2)], [W('dmg', 0.05)], 'Drei Frostwellen hintereinander.'],
      ['m_lanzen', 'Eislanzen · Auto-Verfolgung', '⇡', [W('chase', 1)], [W('dmg', 0.06)], 'Die Lanzen spießen auf – du folgst in die Luft.'],
      ['m_kristall', 'Kristallstoß · Luft-Hinrichtung', '✈', [W('air', 1), W('airExec', 0.2)], [W('dmg', 0.05)], 'Der Kristallstoß auch aus der Luft.'],
      ['m_kerker', 'Frostkerker · Frostsog', '◍', [W('vortex', 2.5), W('reach', 0.15)], [W('dmg', 0.05)], 'Der Kerker zieht seine Gefangenen zusammen.'],
    ],
    apex: 'Ewiger Gletscher-Kataklysmus', evo: ['Gletscher ohne Ende', 'Doppelter Eisbruch', 'Klirrender Rausch'],
  },
  {
    id: 'wasser', name: 'Wasser-Faji', title: 'Weg der Gezeiten', icon: '🌊', el: 'Wasser',
    desc: 'Gezeitenhand: Konter, Strudel, Sintflut.', aTitle: 'Sintflut', bTitle: 'Gezeitenherz',
    fund: [
      ['brandungsstand', 'Brandungsstand', '⛨', { stance: 0.015, hp: 0.01 }, 'Wie die Brandung am Fels.'],
      ['stroemung', 'Strömung', '➹', { lunge: 0.25, vortexK: 0.04 }, 'Die Strömung trägt dich heran.'],
      ['gezeitentakt', 'Gezeitentakt', '⟳', { combo: 0.03, cd: 0.01 }, 'Ebbe und Flut im Takt.'],
    ],
    a3: ['sintflut', 'Sintflut-Form', '🌊', { finisher: 0.06, knock: 0.06 }, 'Finisher werden zur Flutwelle.'],
    b3: ['gezeitenherz', 'Gezeitenherz', '♒', { awaken: 1.2, will: 0.05, perfect: 0.008 }, 'Das Herz schlägt mit den Gezeiten.'],
    muts: [
      ['m_konter', 'Gezeitenkonter · Dreifach-Gezeit', '〰', [W('waves', 2)], [W('dmg', 0.05)], 'Drei Gezeitenwellen hintereinander.'],
      ['m_strudel', 'Strudelfeger · Mahlstrom', '✺', [W('vortex', 2), W('reach', 0.2)], [W('dmg', 0.05)], 'Der Strudel wird zum Mahlstrom.'],
      ['m_strahl', 'Hochdruckstrahl · Luft-Hinrichtung', '✈', [W('air', 1), W('airExec', 0.2)], [W('dmg', 0.05)], 'Der Strahl auch aus der Luft.'],
      ['m_flut', 'Flutwand · Auto-Verfolgung', '⇡', [W('launch', 7), W('chase', 1)], [W('dmg', 0.05)], 'Die Flutwand schleudert hoch – du folgst.'],
    ],
    apex: 'Tiefsee-Sintflutdrache', evo: ['Flut ohne Ufer', 'Doppelte Sturmflut', 'Rausch der Tiefsee'],
  },
  {
    id: 'wind', name: 'Wind-Faji', title: 'Weg der Vakuumklinge', icon: '🌀', el: 'Wind',
    desc: 'Vakuum und Auftrieb: Klingen aus Luft, Kampf in den Wolken.', aTitle: 'Orkan', bTitle: 'Himmelsatem',
    fund: [
      ['windstand', 'Windstand', '⛨', { stance: 0.01, dashCost: 0.03 }, 'Der Wind trägt dich aus der Gefahr.'],
      ['boeenweite', 'Böenweite', '➹', { lunge: 0.3, reach: 0.015 }, 'Eine Böe vor jedem Schlag.'],
      ['wirbeltakt', 'Wirbeltakt', '⟳', { combo: 0.035, cd: 0.01 }, 'Schnell wie der Sturm.'],
    ],
    a3: ['orkan', 'Orkan-Form', '🌀', { finisher: 0.05, launch: 0.08 }, 'Finisher reißen Gegner in den Himmel.'],
    b3: ['himmelsatem', 'Himmelsatem', '☁', { awaken: 1.2, will: 0.05, perfect: 0.008 }, 'Ein Atem, so weit wie der Himmel.'],
    muts: [
      ['m_vakuum', 'Vakuumklinge · Dreifach-Vakuum', '⇝', [W('waves', 2)], [W('dmg', 0.05)], 'Drei Vakuumklingen hintereinander.'],
      ['m_auftrieb', 'Auftriebswirbel · Auto-Verfolgung', '⇡', [W('chase', 1)], [W('dmg', 0.06)], 'Nach dem Auftrieb folgst du per Blitz-Teleport.'],
      ['m_sprint', 'Überschallsprint · Luft-Hinrichtung', '✈', [W('airExec', 0.25)], [W('dmg', 0.05)], 'Der Sprint richtet Gegner in der Luft hin.'],
      ['m_orkan', 'Klingenorkan · Orkansog', '✺', [W('vortex', 2)], [W('dmg', 0.05)], 'Der Orkan saugt alles hinein.'],
    ],
    apex: 'Vakuum-Himmelssturm', evo: ['Himmel ohne Grenze', 'Doppelter Orkan', 'Sturmrausch'],
  },
  {
    id: 'blitz', name: 'Blitz-Faji', title: 'Weg der Hochspannung', icon: '⚡', el: 'Blitz',
    desc: 'Hochspannung: Schock, Kettenblitze, Gewittersäulen.', aTitle: 'Gewitter', bTitle: 'Donnerherz',
    fund: [
      ['spannungsstand', 'Spannungsstand', '⛨', { stance: 0.015, crit: 0.004 }, 'Die Luft knistert um dich.'],
      ['funkenweite', 'Funkenweite', '➹', { lunge: 0.25, reach: 0.015 }, 'Der Funke springt weiter.'],
      ['entladungstakt', 'Entladungstakt', '⟳', { combo: 0.035, cd: 0.01 }, 'Blitzschnell.'],
    ],
    a3: ['gewitter', 'Gewitter-Form', '⚡', { finisher: 0.05, critDmg: 0.04 }, 'Finisher schlagen ein wie Blitze.'],
    b3: ['donnerherz', 'Donnerherz', '♨', { awaken: 1.2, will: 0.05, perfect: 0.008 }, 'Das Herz schlägt wie Donner.'],
    muts: [
      ['m_entladung', 'Entladung · Kettensprung', '↯', [W('chain', 2)], [W('dmg', 0.05)], 'Die Entladung springt auf zwei weitere Gegner.'],
      ['m_schritt', 'Donnerschritt · Auto-Verfolgung', '⇡', [W('launch', 7), W('chase', 1)], [W('dmg', 0.05)], 'Der Donnerschritt schleudert hoch – du folgst.'],
      ['m_kette', 'Kettenblitz · Dreifach-Kette', '⇶', [W('waves', 2)], [W('dmg', 0.05)], 'Drei Kettenblitze hintereinander.'],
      ['m_saeule', 'Gewittersäule · Luft-Hinrichtung', '✈', [W('air', 1), W('airExec', 0.2)], [W('dmg', 0.05)], 'Die Säule auch aus der Luft.'],
    ],
    apex: 'Donnergott-Urteil', evo: ['Urteil über alle Meere', 'Doppelter Donnerschlag', 'Hochspannungsrausch'],
  },
  {
    id: 'sonne', name: 'Sonnen-Faji', title: 'Weg der Strahlenden Form', icon: '☀', el: 'Sonne',
    desc: 'Strahlende Form: Rüstungsbrand, Strahlenkranz, Sonnenaufgang.', aTitle: 'Zenit', bTitle: 'Morgenrot',
    fund: [
      ['lichtstand', 'Lichtstand', '⛨', { stance: 0.015, armor: 0.005 }, 'Licht umhüllt dich.'],
      ['strahlweite', 'Strahlweite', '➹', { lunge: 0.2, reach: 0.02 }, 'Die Strahlen reichen weiter.'],
      ['sonnentakt', 'Sonnentakt', '⟳', { combo: 0.03, cd: 0.01 }, 'Im Rhythmus der Sonne.'],
    ],
    a3: ['zenit', 'Zenit-Form', '☀', { finisher: 0.06, pen: 0.2 }, 'Finisher brennen durch jede Rüstung.'],
    b3: ['morgenrot', 'Morgenrot', '♨', { awaken: 1.2, will: 0.05, perfect: 0.008 }, 'Jeder Morgen bringt neue Kraft.'],
    muts: [
      ['m_hand', 'Sonnenhand · Dreifach-Strahl', '✋', [W('waves', 2)], [W('dmg', 0.05)], 'Drei Strahlen hintereinander.'],
      ['m_kranz', 'Strahlenkranz · Zenitkranz', '◎', [W('reach', 0.25), W('cd', 0.1)], [W('dmg', 0.05)], 'Der Kranz wird weiter und kommt schneller.'],
      ['m_glut', 'Mittagsglut · Luft-Hinrichtung', '✈', [W('air', 1), W('airExec', 0.2)], [W('dmg', 0.05)], 'Die Glut auch aus der Luft.'],
      ['m_aufgang', 'Sonnenaufgang · Auto-Verfolgung', '⇡', [W('launch', 7), W('chase', 1)], [W('dmg', 0.05)], 'Der Aufgang schleudert hoch – du folgst.'],
    ],
    apex: 'Zenit-Sonnentanz', evo: ['Sonne ohne Untergang', 'Doppelte Korona', 'Strahlenrausch'],
  },
  {
    id: 'mond', name: 'Mond-Faji', title: 'Weg der Sichelbahn', icon: '☾', el: 'Mond',
    desc: 'Sichelbahn: Wurfsicheln, Mondbögen, Blutmond.', aTitle: 'Blutmond', bTitle: 'Neumond',
    fund: [
      ['sichelstand', 'Sichelstand', '⛨', { stance: 0.015, crit: 0.004 }, 'Still wie der Mond.'],
      ['bahnweite', 'Bahnweite', '➹', { lunge: 0.2, reach: 0.02 }, 'Die Sicheln fliegen weiter.'],
      ['mondtakt', 'Mondtakt', '⟳', { combo: 0.035, cd: 0.01 }, 'Im Takt der Gezeiten des Mondes.'],
    ],
    a3: ['blutmond', 'Blutmond-Form', '☾', { finisher: 0.06, critDmg: 0.03 }, 'Finisher schneiden im roten Licht.'],
    b3: ['neumond', 'Neumond', '◑', { awaken: 1.2, will: 0.05, perfect: 0.008 }, 'Aus der Dunkelheit wächst der Wille.'],
    muts: [
      ['m_sichel', 'Sichelwurf · Dreifach-Sichel', '☾', [W('proj', 2)], [W('dmg', 0.05)], 'Drei Sicheln fliegen zugleich.'],
      ['m_bogen', 'Mondbogen · Durchbohrender Bogen', '➶', [W('pierce', 1), W('proj', 1)], [W('dmg', 0.05)], 'Der Bogen durchbohrt alles in seiner Bahn.'],
      ['m_tanz', 'Halbmondtanz · Luft-Hinrichtung', '✈', [W('air', 1), W('airExec', 0.2)], [W('dmg', 0.05)], 'Der Tanz auch aus der Luft.'],
      ['m_kreis', 'Neumondkreis · Auto-Verfolgung', '⇡', [W('launch', 6), W('chase', 1)], [W('dmg', 0.05)], 'Der Kreis schleudert hoch – du folgst.'],
    ],
    apex: 'Blutmond-Finsternis', evo: ['Finsternis ohne Ende', 'Doppelte Sichelflut', 'Mondrausch'],
  },
];

// ---------- Die drei Kapitäns- und Weltbäume ----------

interface CaptainNodeIn { key: string; name: string; icon: string; fx: TalentFx; desc: string; seals?: number[] }

function captainTree(id: CaptainTreeId, name: string, title: string, icon: string, color: string, accent: string, desc: string, tiers: CaptainNodeIn[][]): TalentTreeDef {
  const nodes: TalentNodeDef[] = [];
  tiers.forEach((row, t) => row.forEach((n, i) => {
    nodes.push({ id: `${id}.${n.key}`, tree: id, tier: t + 1, col: i + (row.length < 3 ? 1 : 0), name: n.name, icon: n.icon, fx: n.fx, desc: n.desc, max: 3, ...(n.seals ? { seals: n.seals } : {}) });
  }));
  return {
    id, kind: 'kapitaen', name, title, desc, icon, color, accent, style: null, paths: null,
    tiers: CAPTAIN_TIER_NAMES.map((n, i) => ({ name: n, gate: TALENT.captainGates[i], level: TALENT.captainLevels[i] })),
    nodes, capacity: capacityOf(nodes),
  };
}

const ADMIRAL = captainTree('admiral', 'Admiralität & Flotte', 'Herr der Breitseiten', '⚓', '#5AA9E6', '#FFD27A',
  'Seekriegskunst: Breitseiten, Ladedrill, Trimm und die Doktrin der eigenen Flotte.', [
    [
      { key: 'breitseite', name: 'Breitseiten-Drill', icon: '💥', fx: { cannon: 0.03 }, desc: 'Die Geschützmannschaften feuern geschlossen.' },
      { key: 'ladedrill', name: 'Ladedrill', icon: '⟲', fx: { reload: 0.03 }, desc: 'Auswischen, laden, ansetzen – im Takt.' },
      { key: 'trimm', name: 'Rahsegel-Trimm', icon: '⛵', fx: { sail: 0.02 }, desc: 'Jedes Segel steht im Wind.' },
    ],
    [
      { key: 'ruder', name: 'Ruderkunst', icon: '☸', fx: { turn: 0.04 }, desc: 'Das Schiff wendet auf dem Teller.' },
      { key: 'beplankung', name: 'Doppelte Beplankung', icon: '▤', fx: { hull: 0.03 }, desc: 'Eichenplanken in zwei Lagen.' },
      { key: 'ausguck', name: 'Fernrohr-Wache', icon: '🔭', fx: { range: 0.03 }, desc: 'Ziele erkannt, bevor sie dich sehen.' },
    ],
    [
      { key: 'enterhaken', name: 'Enterhaken-Drill', icon: '⚓', fx: { boarding: 0.05 }, desc: 'Haken fliegen, Planken fallen, die Crew stürmt.' },
      { key: 'kaliber', name: 'Schwere Kaliber', icon: '●', fx: { cannon: 0.03 }, desc: 'Größere Kugeln für größere Löcher.' },
      { key: 'kielwasser', name: 'Kielwasser-Taktik', icon: '〰', fx: { sail: 0.02, turn: 0.02 }, desc: 'Immer im Wind des Gegners.' },
    ],
    [
      { key: 'flottendoktrin', name: 'Flottendoktrin', icon: '⚑', fx: { boarding: 0.04, hull: 0.02 }, desc: 'Die Flotte kämpft als ein Schiff.' },
      { key: 'salvendisziplin', name: 'Salvendisziplin', icon: '⇶', fx: { reload: 0.03, cannon: 0.02 }, desc: 'Salve um Salve ohne Pause.' },
    ],
    [
      { key: 'grossadmiral', name: 'Großadmiral', icon: '★', fx: { cannon: 0.04, hull: 0.03, sail: 0.02 }, desc: 'Die höchste Würde der See.' },
      { key: 'kaiserflotte', name: 'Kaiserliche Flottenordnung', icon: '♛', fx: { reload: 0.03, boarding: 0.05 }, desc: 'Je Rang ein Kaiser-Siegel: die Ordnung der Kaiserflotten.', seals: [1, 1, 1] },
    ],
  ]);

const BELAGERUNG = captainTree('belagerung', 'Belagerung & Kriegsführung', 'Feldherr der Meere', '🏰', '#E0634A', '#FFD27A',
  'Krieg der Mächte: Sturmtruppen, Kriegskasse, Tribut und die Kunst, Festungen zu brechen.', [
    [
      { key: 'sappeure', name: 'Sappeur-Trupps', icon: '⛏', fx: { boarding: 0.04 }, desc: 'Pioniere vorneweg.' },
      { key: 'kriegskasse', name: 'Kriegskasse', icon: '💰', fx: { merit: 0.06 }, desc: 'Jeder Kriegspunkt zahlt sich aus.' },
      { key: 'belagerungsgeschuetz', name: 'Belagerungsgeschütze', icon: '🏰', fx: { bastion: 0.06 }, desc: 'Mauerbrecher an Bord.' },
    ],
    [
      { key: 'soeldner', name: 'Söldnerverträge', icon: '📜', fx: { troopPrice: 0.05 }, desc: 'Truppen werben günstiger.' },
      { key: 'marschordnung', name: 'Marschordnung', icon: '⇶', fx: { boarding: 0.03, hp: 0.01 }, desc: 'Geordnet in die Bresche.' },
      { key: 'beutezug', name: 'Beutezug', icon: '⚱', fx: { loot: 0.04 }, desc: 'Mehr Gold aus jeder Beute.' },
    ],
    [
      { key: 'frontlinie', name: 'Frontlinien-Drill', icon: '⛨', fx: { armor: 0.01 }, desc: 'Du stehst in der ersten Reihe.' },
      { key: 'kriegsherr', name: 'Kriegsherren-Ruf', icon: '⚔', fx: { merit: 0.06 }, desc: 'Die Mächte zahlen für deinen Namen.' },
      { key: 'sturmleitern', name: 'Sturmleitern', icon: '☰', fx: { boarding: 0.04 }, desc: 'Über jede Mauer.' },
    ],
    [
      { key: 'tribut', name: 'Tributordnung', icon: '⚖', fx: { tribute: 0.08 }, desc: 'Besetzte Inseln zahlen mehr.' },
      { key: 'zermuerbung', name: 'Zermürbung', icon: '⏳', fx: { posture: 0.03 }, desc: 'Jeder Verteidiger bricht irgendwann.' },
    ],
    [
      { key: 'feldherr', name: 'Feldherr der Meere', icon: '★', fx: { boarding: 0.05, merit: 0.05 }, desc: 'Armeen folgen deinem Banner.' },
      { key: 'kaiserbelagerung', name: 'Kaiser-Belagerungskunst', icon: '♛', fx: { bastion: 0.1, dmg: 0.02 }, desc: 'Je Rang ein Kaiser-Siegel: Bastionen der Kaiser fallen schneller.', seals: [1, 1, 1] },
    ],
  ]);

const HANDEL = captainTree('handel', 'Handelsimperium', 'Fürst der Kontore', '⚖', '#E8C45A', '#7BE0A0',
  'Märkte, Fracht und Gold: billiger kaufen, teurer verkaufen, weniger Unterhalt, volle Laderäume.', [
    [
      { key: 'feilschen', name: 'Feilschen', icon: '🤝', fx: { buy: 0.02 }, desc: 'Kein Preis ist fest.' },
      { key: 'kaufmannsauge', name: 'Kaufmannsauge', icon: '👁', fx: { sell: 0.02 }, desc: 'Du weißt, was die Ware wert ist.' },
      { key: 'laderaum', name: 'Gestauter Laderaum', icon: '📦', fx: { cargo: 0.04 }, desc: 'Jeder Winkel wird genutzt.' },
    ],
    [
      { key: 'kontorkette', name: 'Kontorkette', icon: '🏛', fx: { upkeep: 0.04 }, desc: 'Eigene Kontore senken die Kosten.' },
      { key: 'schatzsucher', name: 'Schatzsucher', icon: '⚱', fx: { loot: 0.04 }, desc: 'Mehr Gold aus Truhen und Beute.' },
      { key: 'schmuggelpfade', name: 'Schmuggelpfade', icon: '🌫', fx: { smuggle: 0.06 }, desc: 'Die Zöllner schauen weg.' },
    ],
    [
      { key: 'handelsflotte', name: 'Handelsflotte', icon: '⛵', fx: { cargo: 0.04 }, desc: 'Mehr Fracht je Fahrt.' },
      { key: 'zollbriefe', name: 'Zollbriefe', icon: '📜', fx: { buy: 0.02, sell: 0.01 }, desc: 'Gesiegelte Freibriefe in jedem Hafen.' },
      { key: 'goldader', name: 'Goldader', icon: '💰', fx: { loot: 0.03 }, desc: 'Gold findet zu dir.' },
    ],
    [
      { key: 'monopol', name: 'Monopol', icon: '⚖', fx: { sell: 0.03 }, desc: 'Du bestimmst den Markt.' },
      { key: 'reederei', name: 'Reederei', icon: '⚓', fx: { upkeep: 0.04 }, desc: 'Eigene Werften, eigene Mannschaften.' },
    ],
    [
      { key: 'handelsfuerst', name: 'Handelsfürst der Meere', icon: '★', fx: { buy: 0.02, sell: 0.02, cargo: 0.03 }, desc: 'Kein Hafen ohne deine Kontore.' },
      { key: 'kaiserkontor', name: 'Kaiserkontor', icon: '♛', fx: { loot: 0.05, tribute: 0.06 }, desc: 'Je Rang ein Kaiser-Siegel: die Schatzkammern der Kaiser öffnen sich.', seals: [1, 1, 1] },
    ],
  ]);

// ---------- Der 18. Baum: Kosmos ----------

export type ConstellationId = 'gravitation' | 'sternenlicht' | 'verschmelzung' | 'planetenschild' | 'meteoritenregen';
export interface ConstellationDef { id: ConstellationId; name: string; desc: string; color: string; icon: string }

/** Fünf Sternbild-Cluster des Kosmos-Baums (je drei Sterne), dazu die Krone „Himmelssturz“ */
export const CONSTELLATIONS: readonly ConstellationDef[] = [
  { id: 'gravitation', name: 'Gravitations-Singularität', desc: 'Schwerkraft folgt deinen schweren Angriffen.', color: '#B07DFF', icon: '◉' },
  { id: 'sternenlicht', name: 'Sternenlicht-Geschwindigkeit', desc: 'Bewegung und Ketten mit der Geschwindigkeit des Lichts.', color: '#FFF3C0', icon: '✦' },
  { id: 'verschmelzung', name: 'Elementar-Faji-Verschmelzung', desc: 'Waffe und Element werden eins.', color: '#FF8A5A', icon: '✶' },
  { id: 'planetenschild', name: 'Planeten-Schild', desc: 'Ein Planet kreist um dich und fängt Treffer ab.', color: '#7FD0FF', icon: '◍' },
  { id: 'meteoritenregen', name: 'Meteoriten-Regen', desc: 'Der Himmel fällt mit deinen Finishern.', color: '#FFB35A', icon: '☄' },
];

interface StarIn { key: string; name: string; icon: string; fx: TalentFx; desc: string }

function cosmicTree(): TalentTreeDef {
  const nodes: TalentNodeDef[] = [];
  const stars: Record<ConstellationId, StarIn[]> = {
    gravitation: [
      { key: 'ereignisfunke', name: 'Ereignisfunke', icon: '◉', fx: { gravity: 2.5 }, desc: 'Schwere Angriffe und Verzweigungen ziehen Gegner in ihren Mittelpunkt.' },
      { key: 'massekern', name: 'Massekern', icon: '●', fx: { posture: 0.1, knock: 0.1 }, desc: 'Deine Schläge wiegen wie Sterne.' },
      { key: 'singularitaet', name: 'Singularitätsherz', icon: '◌', fx: { cosmicDmg: 0.06, vortexK: 0.15 }, desc: 'Ein schwarzes Herz schlägt in jedem Treffer.' },
    ],
    sternenlicht: [
      { key: 'lichtschritt', name: 'Lichtschritt', icon: '✦', fx: { dashCost: 0.15, airDashes: 1 }, desc: 'Ausweichen kostet kaum Atem; ein weiterer Luft-Dash.' },
      { key: 'lichtjahr', name: 'Lichtjahr-Kombo', icon: '⟳', fx: { combo: 0.08 }, desc: 'Ketten schneller als das Licht.' },
      { key: 'kometenschweif', name: 'Kometenschweif', icon: '☄', fx: { perfect: 0.04, chase: 0.5 }, desc: 'Längeres Fenster für Sturm-Schritt und Verfolgung.' },
    ],
    verschmelzung: [
      { key: 'elementkern', name: 'Elementkern', icon: '✶', fx: { elementFinisher: 1, statusDur: 0.15 }, desc: 'Alle Finisher tragen das Element deiner Faji-Kunst.' },
      { key: 'fusionshieb', name: 'Fusionshieb', icon: '✷', fx: { fusion: 1 }, desc: 'Der letzte Schlag jeder Kette und jeder Luft-Kette trägt das Element.' },
      { key: 'urelement', name: 'Urelement', icon: '✺', fx: { skillDmg: 0.08, cosmicDmg: 0.04 }, desc: 'Techniken schlagen mit der Kraft der Urelemente.' },
    ],
    planetenschild: [
      { key: 'orbitalschild', name: 'Orbitalschild', icon: '◍', fx: { armor: 0.04 }, desc: 'Ein Mond fängt Treffer ab.' },
      { key: 'gravitationsmantel', name: 'Gravitationsmantel', icon: '◐', fx: { hp: 0.06 }, desc: 'Die Schwerkraft hält dich zusammen.' },
      { key: 'planetenkern', name: 'Planetenkern', icon: '●', fx: { stance: 0.06, hyperHeavy: 1 }, desc: 'Schwere Angriffe tragen Hyper-Armor, im Angriff stehst du wie ein Planet.' },
    ],
    meteoritenregen: [
      { key: 'sternschnuppe', name: 'Sternschnuppe', icon: '☄', fx: { meteor: 0.15 }, desc: 'Der Meteor-Sturz trifft härter und weiter.' },
      { key: 'meteorschauer', name: 'Meteorschauer', icon: '✸', fx: { meteorRain: 3 }, desc: 'Finisher rufen drei Meteoriten in einer Reihe vor dir herab.' },
      { key: 'einschlagskrater', name: 'Einschlagskrater', icon: '◎', fx: { ult: 0.08, cosmicDmg: 0.04 }, desc: 'Ultimates schlagen mit kosmischer Wucht ein.' },
    ],
  };
  CONSTELLATIONS.forEach((c, ci) => stars[c.id].forEach((s, i) => {
    nodes.push({ id: `kosmos.${s.key}`, tree: 'kosmos', tier: i + 1, col: ci, name: s.name, icon: s.icon, fx: s.fx, desc: s.desc, max: 1, constellation: c.id, needs: i > 0 ? [`kosmos.${stars[c.id][i - 1].key}`] : undefined });
  }));
  nodes.push({
    id: 'kosmos.himmelssturz', tree: 'kosmos', tier: 4, col: 2, name: 'Himmelssturz: Zwillings-Meteoriten & Planeten-Kollaps', icon: '✹', max: 1,
    fx: { skyfall: 1 },
    desc: `Das 15. Ultimate: der Himmel reißt auf, zwei Meteoriten stürzen mit Kometenschweif herab, ein Planet kollidiert mit der Welt. Kostet ${TALENT.skyfallCost} kosmische Punkte und verlangt ${TALENT.skyfallStars} Sterne in mindestens ${TALENT.skyfallConstellations} Sternbildern.`,
  });
  return {
    id: 'kosmos', kind: 'kosmos', name: 'Kosmos', title: 'Meteoriten, Sterne, Elemente und Planeten', icon: '✹', color: '#B07DFF', accent: '#FFD27A',
    desc: 'Der geheime 18. Baum – sichtbar erst nach dem Aufstieg auf Stufe 101. Kosmische Punkte stammen aus den Prüfungen des fünften Rings und den Revanchen gegen die Kaiser.',
    style: null, paths: null,
    tiers: [{ name: 'Erster Stern', gate: 0, level: 101 }, { name: 'Zweiter Stern', gate: 0, level: 101 }, { name: 'Dritter Stern', gate: 0, level: 101 }, { name: 'Krone', gate: 0, level: 101 }],
    nodes, capacity: nodes.reduce((a, n) => a + (n.id === 'kosmos.himmelssturz' ? TALENT.skyfallCost : n.max), 0),
  };
}

// ---------- Alle Bäume ----------

export const TALENT_TREES: readonly TalentTreeDef[] = [
  combatTree(ZWEIHAENDER), combatTree(SAEBEL), combatTree(DOPPEL), combatTree(LANGKLINGE), combatTree(STURMFAUST), combatTree(ERDSPALTER),
  ...FAJI_SPECS.map(fajiTree),
  ADMIRAL, BELAGERUNG, HANDEL,
  cosmicTree(),
];

export const TREE_BY_ID: Record<TalentTreeId, TalentTreeDef> = Object.fromEntries(TALENT_TREES.map((t) => [t.id, t])) as Record<TalentTreeId, TalentTreeDef>;
export const NODE_BY_ID: Readonly<Record<string, TalentNodeDef>> = Object.fromEntries(TALENT_TREES.flatMap((t) => t.nodes.map((n) => [n.id, n])));

/** Kosten eines Rangs in Punkten (die Krone des Kosmos kostet drei) */
export const rankCost = (n: TalentNodeDef): number => (n.id === 'kosmos.himmelssturz' ? TALENT.skyfallCost : 1);

// ---------- Meisterschafts-Siegel (21 Erstsiege) ----------

export type MilestoneKind = 'kaiser' | 'mega' | 'weltboss' | 'raid' | 'legende';
export interface MilestoneDef { id: string; kind: MilestoneKind; ref: string; label: string }

/**
 * 21 Meisterschafts-Siegel, je eins für den ersten Sieg über: die fünf Kaiser, die sechs Mega-Insel-Kommandanten, die drei Weltbosse, die sechs
 * Raid-Endbosse (fünf Fraktions-Zitadellen und Weißwacht) und die erste Legende der Rangliste. Jedes Siegel ist ein Talentpunkt.
 */
export const MILESTONES: readonly MilestoneDef[] = [
  ...KAISER_IDS.map((id): MilestoneDef => ({ id: `kaiser_${id}`, kind: 'kaiser', ref: id, label: `Kaiser besiegt: ${KAISER_SPEC_BY_ID[id].name}` })),
  ...MEGA_IDS.map((id): MilestoneDef => ({ id: `mega_${id}`, kind: 'mega', ref: id, label: `Kommandant von ${MEGA_BY_ID[id].name} besiegt` })),
  ...WORLD_BOSS_IDS.map((id): MilestoneDef => ({ id: `weltboss_${id}`, kind: 'weltboss', ref: id, label: `Weltboss besiegt: ${WORLD_BOSSES[id].name}` })),
  ...CITADELS.map((c): MilestoneDef => ({ id: `raid_${c.id}`, kind: 'raid', ref: c.id, label: `Belagerung gewonnen: ${c.name} (${c.boss})` })),
  { id: 'legende_erste', kind: 'legende', ref: '', label: 'Erste Legende der Rangliste besiegt' },
];
export const MILESTONE_BY_ID: Readonly<Record<string, MilestoneDef>> = Object.fromEntries(MILESTONES.map((m) => [m.id, m]));

// ---------- Kosmische Punkte (15) ----------

export type CosmicSourceKind = 'aufstieg' | 'pruefung' | 'revanche';
export interface CosmicSourceDef { id: string; kind: CosmicSourceKind; ref: string; label: string }

/**
 * 15 kosmische Punkte: fünf aus der Aufstiegs-Prüfung selbst, je Kaiser-Insel eine Sternenprüfung (erster Sieg nach dem Aufstieg) und eine
 * Revanche (zweiter Sieg nach dem Aufstieg).
 */
export const COSMIC_SOURCES: readonly CosmicSourceDef[] = [
  ...[1, 2, 3, 4, 5].map((i): CosmicSourceDef => ({ id: `aufstieg_${i}`, kind: 'aufstieg', ref: '', label: `Aufstiegs-Prüfung (${i}/5)` })),
  ...KAISER_IDS.map((id): CosmicSourceDef => ({ id: `pruefung_${id}`, kind: 'pruefung', ref: id, label: `Sternenprüfung: ${KAISER_SPEC_BY_ID[id].name}` })),
  ...KAISER_IDS.map((id): CosmicSourceDef => ({ id: `revanche_${id}`, kind: 'revanche', ref: id, label: `Kaiser-Revanche: ${KAISER_SPEC_BY_ID[id].name}` })),
];
export const COSMIC_SOURCE_IDS: ReadonlySet<string> = new Set(COSMIC_SOURCES.map((c) => c.id));
