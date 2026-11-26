// Phase 4.7B – feste Klassen, Rollen, 60-Punkte-Klassenbäume und Geistes-Faji. Jede Figur hat genau EINE Klasse (Faustkämpfer, Schwertkämpfer,
// Faji-Wirker) mit EINER Spezialisierung (15 insgesamt); es gibt keinen Waffen- oder Stilwechsel. Der Klassenbaum ist ein Pfad aus 60 Knoten:
// an den Knoten 1, 6, 12 … 54 werden die zehn Formen frei, Knoten 60 ist das Ultimate der Klasse, alle übrigen 49 Knoten sind Stärkungen
// (Krit, Krit-Schaden, Lebenspunkte, Angriffskraft, Tempo, Abklingzeit, Rüstung, Heilkraft, Regeneration). Die Geistes-Faji (Q/R/T/G) hat jede
// Klasse; ihre Ränge kosten Punkte aus demselben Topf. Datenmodell mit erweiterbaren Plätzen (`slots`), aber streng eine Klasse je Figur.
// Reine Daten und Regeln ohne three.js.
import { ACTION_STYLES, type ActionStyleId } from './actionStyles';
import type { FajiArtId } from './fajiArts';

// ---------- Klassen und Spezialisierungen ----------

export type ClassBase = 'faust' | 'schwert' | 'faji';
export type SpecId =
  | 'schnell' | 'kraeftig'
  | 'doppel' | 'saebel' | 'langschwert' | 'grossschwert'
  | 'feuer' | 'eis' | 'wasser' | 'wind' | 'blitz' | 'sonne' | 'mond' | 'schwarzloch' | 'priester';
export type RoleTag = 'DPS' | 'Tank-DPS' | 'Assassinen-DPS' | 'Kombo-DPS' | 'Midrange-DPS' | 'Elementar-DPS' | 'DPS/Heal';

export interface ClassBaseDef {
  id: ClassBase;
  label: string;
  icon: string;
  desc: string;
  /** Klassen-Ausrüstung, die Bodo in der Einführung überreicht */
  gear: string;
  /** Wann die Spezialisierung festgelegt wird */
  choice: string;
}

export const CLASS_BASES: Readonly<Record<ClassBase, ClassBaseDef>> = {
  faust: { id: 'faust', label: 'Faustkämpfer', icon: '✊', gear: 'Kampfhandschuhe', choice: 'Bei Konrad in der Einführung: Schnell oder Kräftig (für immer).', desc: 'Nahkampf mit bloßen Fäusten und Tritten – flink und gnadenlos oder schwer wie ein Felsrutsch.' },
  schwert: { id: 'schwert', label: 'Schwertkämpfer', icon: '⚔', gear: 'die gewählte Klinge', choice: 'Bei der Erschaffung: eine von vier Klingen (für immer).', desc: 'Klingenkunst in vier Schulen – vom lautlosen Doppelklingen-Mörder bis zum Großschwert-Bollwerk.' },
  faji: { id: 'faji', label: 'Faji-Wirker', icon: '✦', gear: 'einen Faji-Fokus', choice: 'Mit dem ersten Punkt in einem Element (oder am Kristall der Einführung) – für immer.', desc: 'Wirkt die Kraft des Faji: acht Elemente oder der Priester mit Licht- und Lebens-Faji.' },
};
export const CLASS_BASE_IDS: readonly ClassBase[] = ['faust', 'schwert', 'faji'];

export interface SpecDef {
  id: SpecId;
  base: ClassBase;
  label: string;
  /** Rolle (Anzeige in Erschaffung, Klassenbaum und Zielrahmen) */
  role: RoleTag;
  /** Action-Stil der Engine */
  style: ActionStyleId;
  color: string;
  accent: string;
  /** Runen-Zeichen der Baum-Gestaltung und Wappen */
  rune: string;
  crest: string;
  desc: string;
}

const S = (id: SpecId, base: ClassBase, label: string, role: RoleTag, style: ActionStyleId, rune: string, crest: string, desc: string): SpecDef => ({
  id, base, label, role, style, rune, crest, desc, color: ACTION_STYLES[style].color, accent: ACTION_STYLES[style].accent,
});

export const SPECS: Readonly<Record<SpecId, SpecDef>> = {
  schnell: S('schnell', 'faust', 'Schneller Faustkämpfer', 'DPS', 'sturmfaust', 'ᛋ', '⚡', 'Blitzschnelle Schlaghagel, Haken und Ansturm – höchster Schaden durch Tempo.'),
  kraeftig: S('kraeftig', 'faust', 'Kräftiger Faustkämpfer', 'Tank-DPS', 'erdspalter', 'ᛒ', '⛰', 'Schulterstöße, Stampfer und Bergspalter-Hämmer – steht in der ersten Reihe und hält aus.'),
  doppel: S('doppel', 'schwert', 'Doppelklinge', 'Assassinen-DPS', 'doppel', 'ᚾ', '✝', 'Zwei Klingen, Schattenschritte und Hinrichtungen – tödlich gegen einzelne Ziele.'),
  saebel: S('saebel', 'schwert', 'Säbel', 'Kombo-DPS', 'saebel', 'ᚲ', '♛', 'Freibeuter-Fechtkunst mit langen Kombos, Paraden und Blitz-Sprints.'),
  langschwert: S('langschwert', 'schwert', 'Langschwert', 'Midrange-DPS', 'langklinge', 'ᛗ', '☾', 'Zieh-Schnitte und Fernschnitt-Wellen aus mittlerer Distanz.'),
  grossschwert: S('grossschwert', 'schwert', 'Großschwert', 'Tank-DPS', 'zweihaender', 'ᛏ', '⛨', 'Das Großschwert als Bollwerk: Haltungsbrecher, Erdbeben-Räder, Titanenfall.'),
  feuer: S('feuer', 'faji', 'Feuer-Faji', 'Elementar-DPS', 'feuer', 'ᚠ', '🔥', 'Glut, Flammenwirbel und brennende Wellen.'),
  eis: S('eis', 'faji', 'Eis-Faji', 'Elementar-DPS', 'eis', 'ᛁ', '❄', 'Frostwellen, Eislanzen und Kerker aus Eis.'),
  wasser: S('wasser', 'faji', 'Wasser-Faji', 'Elementar-DPS', 'wasser', 'ᛚ', '🌊', 'Gezeiten-Konter, Strudel und Hochdruckstrahlen.'),
  wind: S('wind', 'faji', 'Wind-Faji', 'Elementar-DPS', 'wind', 'ᚹ', '🌪', 'Vakuumklingen, Auftrieb und Überschall-Sprints.'),
  blitz: S('blitz', 'faji', 'Blitz-Faji', 'Elementar-DPS', 'blitz', 'ᚦ', 'ϟ', 'Kettenblitze durch ganze Formationen.'),
  sonne: S('sonne', 'faji', 'Sonnen-Faji', 'Elementar-DPS', 'sonne', 'ᛊ', '☀', 'Strahlende Glut, die Rüstungen durchbrennt.'),
  mond: S('mond', 'faji', 'Mond-Faji', 'Elementar-DPS', 'mond', 'ᛜ', '☾', 'Mondsicheln fliegen bei jedem Schlag mit.'),
  schwarzloch: S('schwarzloch', 'faji', 'Schwarzes Loch', 'Elementar-DPS', 'schwarzloch', 'ᛟ', '◉', 'Gravitationsfelder ziehen alles zusammen und löschen Auren.'),
  priester: S('priester', 'faji', 'Priester', 'DPS/Heal', 'priester', 'ᛉ', '✟', 'Licht- & Lebens-Faji: Lichtstrahlen und Urteile, Heilung und Segen für dich und deine Verbündeten.'),
};

/** Die 15 Spezialisierungen in Anzeige-Reihenfolge */
export const SPEC_IDS: readonly SpecId[] = ['schnell', 'kraeftig', 'doppel', 'saebel', 'langschwert', 'grossschwert', 'feuer', 'eis', 'wasser', 'wind', 'blitz', 'sonne', 'mond', 'schwarzloch', 'priester'];
export const SPECS_OF: Readonly<Record<ClassBase, readonly SpecId[]>> = {
  faust: ['schnell', 'kraeftig'],
  schwert: ['doppel', 'saebel', 'langschwert', 'grossschwert'],
  faji: ['feuer', 'eis', 'wasser', 'wind', 'blitz', 'sonne', 'mond', 'schwarzloch', 'priester'],
};
export const isSpec = (v: unknown): v is SpecId => typeof v === 'string' && (SPEC_IDS as readonly string[]).includes(v);
export const isClassBase = (v: unknown): v is ClassBase => v === 'faust' || v === 'schwert' || v === 'faji';

/** Klinge der Erschaffung (Spielstand `player.blade`) ↔ Schwert-Spezialisierung */
export const BLADE_SPEC: Readonly<Record<string, SpecId>> = { doppel: 'doppel', saebel: 'saebel', langklinge: 'langschwert', zweihaender: 'grossschwert' };
export const SPEC_BLADE: Readonly<Partial<Record<SpecId, string>>> = { doppel: 'doppel', saebel: 'saebel', langschwert: 'langklinge', grossschwert: 'zweihaender' };

/** Kampfstil ohne Spezialisierung: Faustkämpfer vor Konrad mit der Sturmfaust, Faji-Wirker vor dem Kristall mit Faji-Wirken */
const BASE_STYLE: Readonly<Record<ClassBase, ActionStyleId>> = { faust: 'sturmfaust', schwert: 'saebel', faji: 'effekt' };

// ---------- Klassenbaum: 60 Knoten ----------

export const TREE_SIZE = 60;
/** Knoten der zehn Formen (Form k an `FORM_NODES[k − 1]`) und des Ultimates */
export const FORM_NODES: readonly number[] = [1, 6, 12, 18, 24, 30, 36, 42, 48, 54];
export const ULT_NODE = 60;

export type BuffKind = 'crit' | 'critDmg' | 'hp' | 'atk' | 'tempo' | 'cd' | 'armor' | 'heal' | 'regen';

export interface BuffInfo { label: string; icon: string; per: number }
/** Wert je Knoten (Anteil); die Summen laufen durch die Talent-Obergrenzen (`TALENT_CAP`) */
export const BUFF_INFO: Readonly<Record<BuffKind, BuffInfo>> = {
  crit: { label: 'Krit-Chance', icon: '✧', per: 0.008 },
  critDmg: { label: 'Krit-Schaden', icon: '✦', per: 0.04 },
  hp: { label: 'Max-LP', icon: '♥', per: 0.035 },
  atk: { label: 'Angriffskraft', icon: '⚔', per: 0.03 },
  tempo: { label: 'Tempo', icon: '»', per: 0.015 },
  cd: { label: 'Abklingzeit', icon: '⧗', per: 0.025 },
  armor: { label: 'Rüstung/Minderung', icon: '⛨', per: 0.02 },
  heal: { label: 'Heilkraft', icon: '✚', per: 0.05 },
  regen: { label: 'Ausdauer-/Faji-Regeneration', icon: '↻', per: 0.05 },
};
export const BUFF_KINDS: readonly BuffKind[] = ['crit', 'critDmg', 'hp', 'atk', 'tempo', 'cd', 'armor', 'heal', 'regen'];

/** Reihenfolge der Stärkungen je Rolle (sieben Arten, je siebenmal = 49 Knoten) */
const ROLE_BUFFS: Readonly<Record<RoleTag, readonly BuffKind[]>> = {
  'DPS': ['atk', 'crit', 'tempo', 'critDmg', 'regen', 'cd', 'hp'],
  'Tank-DPS': ['hp', 'armor', 'atk', 'regen', 'critDmg', 'cd', 'tempo'],
  'Assassinen-DPS': ['crit', 'critDmg', 'tempo', 'atk', 'regen', 'cd', 'hp'],
  'Kombo-DPS': ['tempo', 'atk', 'crit', 'regen', 'critDmg', 'cd', 'hp'],
  'Midrange-DPS': ['atk', 'cd', 'critDmg', 'crit', 'regen', 'hp', 'tempo'],
  'Elementar-DPS': ['atk', 'cd', 'regen', 'critDmg', 'crit', 'hp', 'armor'],
  'DPS/Heal': ['heal', 'atk', 'regen', 'cd', 'hp', 'crit', 'armor'],
};

export interface ClassNode {
  /** Knotennummer 1 … 60 */
  n: number;
  kind: 'form' | 'buff' | 'ult';
  /** Form 1 … 10 (sonst 0) */
  form: number;
  buff: BuffKind | null;
  /** Wert der Stärkung (Anteil) */
  v: number;
  label: string;
  icon: string;
}

const pct = (v: number) => `${(v * 100).toFixed(1).replace(/\.0$/, '').replace('.', ',')} %`;
/** Text einer Stärkung („+3 % Angriffskraft“, „−2,5 % Abklingzeit“) */
export const buffText = (k: BuffKind, v: number): string => `${k === 'cd' ? '−' : '+'}${pct(v)} ${BUFF_INFO[k].label}`;

const TREES = new Map<SpecId, readonly ClassNode[]>();

/** Der Klassenbaum einer Spezialisierung (60 Knoten, fest) */
export function classTree(spec: SpecId): readonly ClassNode[] {
  const memo = TREES.get(spec);
  if (memo) return memo;
  const sp = SPECS[spec];
  const st = ACTION_STYLES[sp.style];
  const order = ROLE_BUFFS[sp.role];
  const out: ClassNode[] = [];
  let b = 0;
  for (let n = 1; n <= TREE_SIZE; n++) {
    const fi = FORM_NODES.indexOf(n);
    if (fi >= 0) {
      const sk = st.skills[fi];
      out.push({ n, kind: 'form', form: fi + 1, buff: null, v: 0, label: `Form ${fi + 1}: ${sk.label}`, icon: sk.icon });
    } else if (n === ULT_NODE) {
      out.push({ n, kind: 'ult', form: 0, buff: null, v: 0, label: `Ultimate: ${st.ultimate?.label ?? 'Klassen-Ultimate'}`, icon: '✪' });
    } else {
      const k = order[b % order.length];
      b++;
      out.push({ n, kind: 'buff', form: 0, buff: k, v: BUFF_INFO[k].per, label: buffText(k, BUFF_INFO[k].per), icon: BUFF_INFO[k].icon });
    }
  }
  TREES.set(spec, out);
  return out;
}

// ---------- Geistes-Faji (alle Klassen, Q/R/T/G) ----------

export type GeistId = 'wille' | 'leben' | 'erwacht' | 'koenig';
export const GEIST_MAX = 5;

export interface GeistDef {
  id: GeistId;
  /** Standard-Taste (Anzeige; belegt über die Aktionen geist1 … geist4) */
  key: string;
  label: string;
  short: string;
  icon: string;
  color: string;
  accent: string;
  /** Beschreibung je Rang */
  desc: (rank: number) => string;
  /** Abklingzeit je Rang (s) */
  cd: (rank: number) => number;
}

const fmt = (v: number, d = 0) => v.toFixed(d).replace('.', ',');

/** Werte der vier Geistes-Faji-Kräfte je Rang (1 … 5) */
export const GEIST_VALUES = {
  /** Willens-Entfesselung: Dauer (s), Schadensbonus, zusätzlicher Durchschlag (Waffenstufen) */
  willeDur: (r: number) => 9 + r,
  willeDmg: (r: number) => 0.12 + 0.03 * r,
  willePen: 1,
  /** Lebensstrom-Fokus: Heilung als Anteil der Höchst-LP (mäßig) */
  lebenHeal: (r: number) => 0.14 + 0.02 * r,
  /** Erwachter Wille: Radius (m), Betäubung (s), Schaden (Faktor), Haltungsschaden */
  erwachtR: (r: number) => 6.5 + 0.5 * r,
  erwachtStun: (r: number) => 1.4 + 0.15 * r,
  erwachtDmg: (r: number) => 0.6 + 0.1 * r,
  /** Königsdruck: Radius (m), Schaden (Faktor), Furcht (s) – eine Stufe unter einem Ultimate, kein Boss-One-Shot */
  koenigR: (r: number) => 15 + r,
  koenigDmg: (r: number) => 2.0 + 0.25 * r,
  koenigFear: 2.5,
} as const;

export const GEIST: readonly GeistDef[] = [
  { id: 'wille', key: 'Q', label: 'Willens-Entfesselung', short: 'Wille', icon: '♛', color: '#FFD27A', accent: '#1A1206',
    desc: (r) => `Schwarz-goldene Aura: ${fmt(GEIST_VALUES.willeDur(r))} s lang +${fmt(GEIST_VALUES.willeDmg(r) * 100)} % Schaden und eine Waffenstufe mehr Durchschlag.`, cd: (r) => 32 - r },
  { id: 'leben', key: 'R', label: 'Lebensstrom-Fokus', short: 'Leben', icon: '❀', color: '#5AE8A0', accent: '#FFD27A',
    desc: (r) => `Smaragd-goldene Lebensströme heilen dich um ${fmt(GEIST_VALUES.lebenHeal(r) * 100)} % deiner Lebenspunkte. R wirkt nur, wenn gerade keine Handlung ansteht.`, cd: (r) => 26 - r },
  { id: 'erwacht', key: 'T', label: 'Erwachter Wille', short: 'Erwacht', icon: '✺', color: '#C8A8FF', accent: '#0A0614',
    desc: (r) => `Mehrschichtige Schockwelle mit schwarzen Blitzen: betäubt Gegner in ${fmt(GEIST_VALUES.erwachtR(r), 1)} m für ${fmt(GEIST_VALUES.erwachtStun(r), 1)} s und bricht ihre Haltung.`, cd: (r) => Math.round(20 - 0.8 * r) },
  { id: 'koenig', key: 'G', label: 'Königsdruck', short: 'König', icon: '♔', color: '#FFE2A0', accent: '#2A0A0A',
    desc: (r) => `Gewaltige Druckkuppel (${fmt(GEIST_VALUES.koenigR(r))} m): der Himmel verdunkelt sich, der Boden reißt, Splitter schweben – schwerer Schaden und Furcht, eine Stufe unter einem Ultimate (Bosse werden nie mit einem Schlag besiegt).`, cd: (r) => 75 - 3 * r },
];

// ---------- Spielstand ----------

/** Platz einer Klasse (erweiterbar: heute genau einer je Figur) */
export interface ClassSlot { base: ClassBase; spec: SpecId | null }

export interface ClassSave {
  v: 1;
  /** Klassen-Plätze – streng einer (weitere Plätze sind im Modell vorgesehen, aber gesperrt) */
  slots: ClassSlot[];
  /** gelernte Knoten des Klassenbaums (Pfad: 0 … 60, immer von vorn) */
  nodes: number;
  /** Geistes-Faji erwacht (Kristall der Einführung; alte Spielstände: ja) */
  awake: boolean;
  /** Ränge der vier Geistes-Faji-Kräfte 0 … 5 (Rang 1 kommt mit dem Erwachen, jeder weitere kostet einen Punkt) */
  geist: number[];
  /** Erster Einsatz einer Geistes-Faji im Kampf (Einführung) */
  geistUsed: boolean;
}

export function emptyClass(base: ClassBase = 'schwert', spec: SpecId | null = base === 'schwert' ? 'saebel' : null): ClassSave {
  return { v: 1, slots: [{ base, spec: spec && SPECS[spec].base === base ? spec : null }], nodes: 0, awake: false, geist: [0, 0, 0, 0], geistUsed: false };
}

export const classBase = (c: ClassSave): ClassBase => c.slots[0].base;
export const classSpec = (c: ClassSave): SpecId | null => c.slots[0].spec;

/** Kampfstil der Figur aus der Klasse */
export function classStyle(c: ClassSave): ActionStyleId {
  const sp = classSpec(c);
  return sp ? SPECS[sp].style : BASE_STYLE[classBase(c)];
}

/** Rolle der Figur ('' ohne Spezialisierung) */
export const classRole = (c: ClassSave): RoleTag | '' => { const sp = classSpec(c); return sp ? SPECS[sp].role : ''; };

/** Anzeige-Name „Schwertkämpfer · Säbel“ */
export function classTitle(c: ClassSave): string {
  const b = CLASS_BASES[classBase(c)];
  const sp = classSpec(c);
  return sp ? `${b.label} · ${SPECS[sp].label}` : b.label;
}

/** Faji-Element (nur Faji-Wirker mit Element; der Priester ist keine Meisterschafts-Kunst) */
export function classElement(c: ClassSave): FajiArtId | null {
  const sp = classSpec(c);
  return sp && classBase(c) === 'faji' && sp !== 'priester' ? (sp as FajiArtId) : null;
}

/** Ausgegebene Punkte: Knoten des Baums und Geistes-Ränge über Rang 1 */
export function classSpent(c: ClassSave): number {
  let n = c.nodes;
  for (const r of c.geist) n += Math.max(0, r - 1);
  return n;
}
/** Freie Punkte bei einem Punktetopf `pool` (Stufen, Siegel, Bonus) */
export const classFree = (c: ClassSave, pool: number): number => Math.max(0, pool - classSpent(c));

/** Wie viele Formen frei sind (0 … 10) und ob das Ultimate gelernt ist */
export function formsOpen(c: ClassSave): number {
  let n = 0;
  for (const k of FORM_NODES) if (c.nodes >= k) n++;
  return n;
}
export const ultOpen = (c: ClassSave): boolean => c.nodes >= ULT_NODE;

/** Formen, die zwischen zwei Ständen des Baums frei wurden (Nummern) */
export function formsGained(before: number, after: number): number[] {
  const out: number[] = [];
  FORM_NODES.forEach((k, i) => { if (k > before && k <= after) out.push(i + 1); });
  return out;
}

/** Summe der gelernten Stärkungen je Art */
export function classBuffs(c: ClassSave): Record<BuffKind, number> {
  const out = { crit: 0, critDmg: 0, hp: 0, atk: 0, tempo: 0, cd: 0, armor: 0, heal: 0, regen: 0 } as Record<BuffKind, number>;
  const sp = classSpec(c);
  if (!sp) return out;
  const tree = classTree(sp);
  for (let i = 0; i < Math.min(c.nodes, TREE_SIZE); i++) { const n = tree[i]; if (n.buff) out[n.buff] += n.v; }
  return out;
}

/**
 * Spezialisierung festlegen (einmalig): Faustkämpfer bei Konrad, Faji-Wirker mit dem ersten Punkt bzw. am Kristall. Schwertkämpfer legen ihre
 * Klinge bei der Erschaffung fest. Gibt einen Grund zurück, wenn es nicht geht (null = festgelegt).
 */
export function chooseSpec(c: ClassSave, spec: SpecId): string | null {
  const slot = c.slots[0];
  if (slot.spec) return slot.spec === spec ? null : `Deine Spezialisierung steht fest: ${SPECS[slot.spec].label}.`;
  if (SPECS[spec].base !== slot.base) return `${SPECS[spec].label} gehört nicht zu den ${CLASS_BASES[slot.base].label}n.`;
  slot.spec = spec;
  return null;
}

/** Nächsten Knoten lernen; `pool` = verdiente Punkte. null = gelernt, sonst der Grund */
export function learnNext(c: ClassSave, pool: number): string | null {
  if (!classSpec(c)) return classBase(c) === 'faji' ? 'Wähle zuerst dein Element – der erste Punkt legt es für immer fest.' : 'Wähle zuerst deine Spezialisierung.';
  if (c.nodes >= TREE_SIZE) return 'Dein Klassenbaum ist vollständig.';
  if (classFree(c, pool) <= 0) return 'Kein freier Talentpunkt – steige eine Stufe auf.';
  c.nodes++;
  return null;
}

/**
 * Faji-Wirker ohne Element: Element wählen und zugleich den ersten Punkt setzen (unumkehrbar). Ohne freien Punkt wird nur gewählt, wenn
 * `force` (Kristall der Einführung).
 */
export function lockElement(c: ClassSave, spec: SpecId, pool: number, force = false): string | null {
  if (classBase(c) !== 'faji') return 'Nur Faji-Wirker wählen ein Element.';
  if (classSpec(c)) return classSpec(c) === spec ? null : `Dein Element steht fest: ${SPECS[classSpec(c)!].label}.`;
  if (!force && classFree(c, pool) <= 0) return 'Der erste Punkt legt dein Element fest – du brauchst einen freien Talentpunkt.';
  const e = chooseSpec(c, spec);
  if (e) return e;
  if (classFree(c, pool) > 0 && c.nodes === 0) c.nodes = 1;
  return null;
}

/** Alle freien Punkte in den Klassenbaum (bis 60) */
export function autoFill(c: ClassSave, pool: number): number {
  if (!classSpec(c)) return 0;
  const add = Math.min(TREE_SIZE - c.nodes, classFree(c, pool));
  if (add > 0) c.nodes += add;
  return Math.max(0, add);
}

/** Geistes-Faji erwecken (Kristall): Rang 1 aller vier Kräfte */
export function awakenGeist(c: ClassSave) {
  c.awake = true;
  for (let i = 0; i < 4; i++) c.geist[i] = Math.max(1, c.geist[i]);
}

/** Rang einer Geistes-Kraft erhöhen (kostet einen Punkt) */
export function learnGeist(c: ClassSave, i: number, pool: number): string | null {
  if (!c.awake) return 'Deine Geistes-Faji ist noch nicht erwacht.';
  if (i < 0 || i > 3) return 'Unbekannte Kraft.';
  if (c.geist[i] >= GEIST_MAX) return 'Höchster Rang erreicht.';
  if (classFree(c, pool) <= 0) return 'Kein freier Talentpunkt – steige eine Stufe auf.';
  c.geist[i]++;
  return null;
}

/**
 * 4.7C: Klassenbaum zurücksetzen – alle Knoten und die Geistes-Ränge über Rang 1 kommen in den Topf zurück. Spezialisierung und Element bleiben
 * (sie gelten für immer). Liefert die Zahl der erstatteten Punkte.
 */
export function resetClass(c: ClassSave): number {
  const back = classSpent(c);
  c.nodes = 0;
  for (let i = 0; i < 4; i++) c.geist[i] = c.awake ? 1 : 0;
  return back;
}

/** Spielstand-Eintrag säubern (unbekannt → Standard der Erschaffung) */
export function cleanClass(raw: unknown, fallback: ClassSave): ClassSave {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ClassSave, unknown>>;
  const slots = Array.isArray(o.slots) ? o.slots : [];
  const s0 = (slots[0] && typeof slots[0] === 'object' ? slots[0] : {}) as Partial<ClassSlot>;
  const base = isClassBase(s0.base) ? s0.base : classBase(fallback);
  // ausdrücklich noch offen (null) bleibt offen – außer bei Schwertkämpfern, die ihre Klinge immer bei der Erschaffung wählen
  const fb = base === classBase(fallback) ? classSpec(fallback) : null;
  const spec = isSpec(s0.spec) && SPECS[s0.spec].base === base ? s0.spec
    : s0.spec === null && base !== 'schwert' ? null
    : fb ?? (base === 'schwert' ? 'saebel' : null);
  const n = Number(o.nodes);
  const geist = [0, 0, 0, 0].map((_, i) => { const g = Number(Array.isArray(o.geist) ? o.geist[i] : 0); return Number.isFinite(g) ? Math.max(0, Math.min(GEIST_MAX, Math.floor(g))) : 0; });
  const awake = o.awake === true;
  if (awake) for (let i = 0; i < 4; i++) geist[i] = Math.max(1, geist[i]);
  return {
    v: 1,
    slots: [{ base, spec }],
    nodes: spec && Number.isFinite(n) ? Math.max(0, Math.min(TREE_SIZE, Math.floor(n))) : 0,
    awake,
    geist: awake ? geist : [0, 0, 0, 0],
    geistUsed: o.geistUsed === true,
  };
}

/** Zu viele Punkte ausgegeben (z. B. Stufe gesunken): von hinten zurücknehmen – erst Geistes-Ränge, dann Knoten */
export function fitClass(c: ClassSave, pool: number) {
  let over = classSpent(c) - pool;
  for (let i = 3; i >= 0 && over > 0; i--) while (over > 0 && c.geist[i] > 1) { c.geist[i]--; over--; }
  if (over > 0) c.nodes = Math.max(0, c.nodes - over);
}

/**
 * Klasse aus einem alten Spielstand (bis Version 24): aktiver Kampfstil bzw. Erschaffung (Kampfstil, Klinge) und die ausgerüstete Faji-Kunst.
 * Wer zuletzt mit einer Faji-Kunst kämpfte oder Faji-Wirker war, wird Faji-Wirker dieses Elements; sonst bestimmt der Kampfstil die Klasse.
 */
export function classFromLegacy(p: { style?: unknown; blade?: unknown; actionStyle?: unknown; faji?: { equipped?: unknown } | null }): ClassSave {
  const act = typeof p.actionStyle === 'string' ? p.actionStyle : '';
  const eq = p.faji && typeof p.faji.equipped === 'string' ? p.faji.equipped : '';
  const ELEM = SPECS_OF.faji as readonly string[];
  const fromStyle = (s: string): ClassSave | null => {
    if (s === 'sturmfaust') return emptyClass('faust', 'schnell');
    if (s === 'erdspalter') return emptyClass('faust', 'kraeftig');
    if (BLADE_SPEC[s]) return emptyClass('schwert', BLADE_SPEC[s]);
    if (ELEM.includes(s)) return emptyClass('faji', s as SpecId);
    if (s === 'effekt') return emptyClass('faji', ELEM.includes(eq) ? (eq as SpecId) : null);
    return null;
  };
  const c = fromStyle(act);
  if (c) return c;
  if (p.style === 'faust') return emptyClass('faust', null);
  if (p.style === 'effekt') return emptyClass('faji', ELEM.includes(eq) ? (eq as SpecId) : null);
  const blade = typeof p.blade === 'string' ? p.blade : 'saebel';
  return emptyClass('schwert', BLADE_SPEC[blade] ?? 'saebel');
}

/** Klasse einer neuen Figur aus der Erschaffung (Kampfstil, Klinge) */
export function classOfCreation(style: string, blade: string): ClassSave {
  if (style === 'faust') return emptyClass('faust', null);
  if (style === 'effekt') return emptyClass('faji', null);
  return emptyClass('schwert', BLADE_SPEC[blade] ?? 'saebel');
}
