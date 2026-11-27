// Phase 4.8B – Gruppen-Beute (rein: kein DOM, kein three.js; läuft im leitenden Tab und unverändert auf dem Relay-Server).
//
// Zweistufige Verteilung in Gruppen von 2 bis 5 Kapitänen, die im Einsatzgebiet sind (`MMO.lootLand` an Land, `MMO.lootSea` auf See):
// - **Gewöhnlich (Grau / Weiß / Grün):** Gold und Ruf werden fair geteilt (`splitEven`: ganze Zahlen, die Summe bleibt exakt), Stücke wandern
//   reihum ins Inventar.
// - **Ab Selten (Blau), Episch (Violett), Legendär (Gold), Mythisch (Kosmos):** eine Würfel-Sitzung (`RollSession`) mit 30 s Frist. Jeder wählt
//   **Bedarf** (nur, wenn das Stück zur eigenen festen Klasse bzw. Schiffsstufe passt: `needBlock`), **Gier** oder **Passen** (auch automatisch
//   bei Ablauf oder Verbindungsabbruch). Wer nicht passt, würfelt 1 – 100; Bedarf schlägt Gier, bei Gleichstand an der Spitze wird gestochen.
//   Das Protokoll für den Chat baut `rollChatLines`.
import { LOOT_GRADES, MMO, type LootAffinity, type LootGrade, type LootItemNet, type MmoDomain, type RollChoice } from './mmoProtocol';

export const NOT_FOR_CLASS = 'Nicht für deine Klasse geeignet';
export const SHIP_TOO_SMALL = 'Dein Schiff ist dafür noch zu klein';

/** Anzeige der Güte (Farben stehen in `tokens.css`: `--grade-*`) */
export const GRADE_LABEL: Readonly<Record<LootGrade, string>> = {
  grau: 'Grau', weiss: 'Gewöhnlich', gruen: 'Ungewöhnlich', blau: 'Selten', violett: 'Episch', gold: 'Legendär', kosmos: 'Mythisch',
};
export const CHOICE_LABEL: Readonly<Record<RollChoice, string>> = { bedarf: 'Bedarf', gier: 'Gier', passen: 'Passen' };

export const gradeRank = (g: LootGrade): number => LOOT_GRADES.indexOf(g);
/** Ab Blau (Selten) wird gewürfelt, darunter verteilt */
export const rollsFor = (g: LootGrade): boolean => gradeRank(g) >= gradeRank('blau');
/** Einsatzgebiet eines Funds (m) nach dem Ort des Finders */
export const lootRadius = (dom: MmoDomain): number => (dom === 'sea' ? MMO.lootSea : MMO.lootLand);

/** Güte eines Beutestücks aus der Seltenheit des Spiels (gewöhnliches Gut = Weiß, gewöhnliche Ausrüstung = Grün, Endgame = Kosmos) */
export function gradeOf(rarity: string, kind: 'gear' | 'trinket' | 'consumable', opts: { endgame?: boolean; junk?: boolean } = {}): LootGrade {
  if (opts.endgame) return 'kosmos';
  switch (rarity) {
    case 'selten': return 'blau';
    case 'episch': return 'violett';
    case 'legendaer': return 'gold';
    default: return opts.junk ? 'grau' : kind === 'consumable' ? 'weiss' : 'gruen';
  }
}

/** Werte eines Stücks (Rüstungsteil `GearBonus` oder Talisman `TrinketBonus`) – nur, was die Eignung bestimmt */
export interface BonusLike { atk?: number; crit?: number; faji?: number; cannon?: number; speed?: number; hp?: number; armor?: number; reduce?: number; gold?: number }

/**
 * Für wen ein Stück „Bedarf“ ist: Waffen in der Hand nur für Schwertkämpfer (sie ersetzen den Säbel), sonst nach dem Schwerpunkt der Werte –
 * Kanonen/Tempo = Schiff, Faji = Faji-Wirker, Angriff/Krit = Nahkämpfer (Faust und Schwert); Leben, Rüstung und Gold passen allen.
 * Bei Rüstungsteilen zählt ein Schwerpunkt erst ab `ARMOR_FOCUS` (5 %): ein Hut mit +2 % Faji ist für alle.
 */
/** Rüstungsplätze: kleine Zusatzwerte (unter `ARMOR_FOCUS`) machen ein Rüstungsteil noch nicht zum Klassen-Stück */
const ARMOR_CATS: readonly string[] = ['head', 'shoulder', 'chest', 'cloak', 'hands', 'legs', 'feet'];
export const ARMOR_FOCUS = 0.05;

export function affinityOf(b: BonusLike, cat: string): LootAffinity {
  if (cat === 'mainhand' || cat === 'offhand') return 'schwert';
  const floor = ARMOR_CATS.includes(cat) ? ARMOR_FOCUS : 0;
  const keep = (v: number) => (v >= floor ? v : 0);
  const ship = keep((b.cannon ?? 0) + (b.speed ?? 0)), faji = keep(b.faji ?? 0), melee = keep((b.atk ?? 0) + (b.crit ?? 0));
  const top = Math.max(ship, faji, melee);
  if (top <= 0) return 'alle';
  if (ship === top) return 'schiff';
  if (faji === top) return 'faji';
  return 'nahkampf';
}

/** Schiffsstufe, ab der ein Schiffs-Stück „Bedarf“ ist (nach Güte) */
export const shipNeedOf = (g: LootGrade): number => Math.max(0, gradeRank(g) - 2);

export interface NeedProfile { base: string; role: string; shipTier: number }

/** Darf dieser Kapitän „Bedarf“ wählen? '' = ja, sonst der deutsche Grund */
export function needBlock(item: Pick<LootItemNet, 'aff' | 'ship'>, p: NeedProfile): string {
  switch (item.aff) {
    case 'alle': return '';
    case 'nahkampf': return p.base === 'faust' || p.base === 'schwert' ? '' : NOT_FOR_CLASS;
    case 'schwert': return p.base === 'schwert' ? '' : NOT_FOR_CLASS;
    case 'faji': return p.base === 'faji' ? '' : NOT_FOR_CLASS;
    case 'schiff': return p.shipTier >= item.ship ? '' : SHIP_TOO_SMALL;
  }
}

/** Faire Teilung in ganzen Zahlen: die ersten `total mod n` bekommen eins mehr, die Summe bleibt `total` (negativer Ruf ebenso) */
export function splitEven(total: number, n: number, out: number[] = []): number[] {
  out.length = 0;
  if (n <= 0) return out;
  const sign = total < 0 ? -1 : 1, abs = Math.abs(Math.round(total));
  const base = Math.floor(abs / n), rest = abs - base * n;
  for (let i = 0; i < n; i++) out.push(sign * (base + (i < rest ? 1 : 0)));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Würfel-Sitzung
// ---------------------------------------------------------------------------------------------------------------

export interface RollEntry {
  id: string;
  name: string;
  /** darf Bedarf wählen; sonst der Grund */
  needOk: boolean;
  needWhy: string;
  choice: RollChoice | '';
  /** Wurf 1 – 100 (0 = nicht gewürfelt) */
  roll: number;
  bot: boolean;
}

export interface RollSession {
  id: string;
  item: LootItemNet;
  /** Finder (bekommt das Stück, wenn alle passen) */
  from: string;
  fromName: string;
  party: string;
  started: number;
  until: number;
  entries: RollEntry[];
  done: boolean;
}

export interface RollResult {
  winner: string;
  winnerName: string;
  choice: RollChoice | '';
  /** Stechen bei Gleichstand: je Runde die Würfe der Gleichauf-Liegenden */
  ties: { id: string; name: string; roll: number }[][];
  lines: string[];
}

export function createRoll(id: string, item: LootItemNet, from: string, fromName: string, party: string, t: number, entries: RollEntry[]): RollSession {
  return { id, item, from, fromName, party, started: t, until: t + MMO.rollTime, entries, done: false };
}

/** Eine Wahl übernehmen; '' = angenommen, sonst der Grund (Bedarf gesperrt, schon gewählt, vorbei, nicht beteiligt) */
export function chooseRoll(s: RollSession, who: string, choice: RollChoice, t: number): string {
  if (s.done || t > s.until + 0.5) return 'Die Würfel sind schon gefallen.';
  const e = s.entries.find((x) => x.id === who);
  if (!e) return 'Du würfelst bei diesem Stück nicht mit.';
  if (e.choice) return 'Du hast schon gewählt.';
  if (choice === 'bedarf' && !e.needOk) return e.needWhy || NOT_FOR_CLASS;
  e.choice = choice;
  return '';
}

/** Alle haben gewählt oder die Frist ist um */
export const rollReady = (s: RollSession, t: number): boolean => !s.done && (t >= s.until || s.entries.every((e) => e.choice !== ''));

/** Wer noch nicht gewählt hat, passt (Ablauf, Verbindungsabbruch) */
export function passOpen(s: RollSession, only?: string): void {
  for (const e of s.entries) if (!e.choice && (!only || e.id === only)) e.choice = 'passen';
}

const d100 = (rnd: () => number) => 1 + Math.min(99, Math.floor(rnd() * 100));

/** Auswerten: jeder, der nicht passt, würfelt 1 – 100; Bedarf vor Gier; Gleichstand an der Spitze wird gestochen (höchstens 6 Runden) */
export function resolveRoll(s: RollSession, rnd: () => number): RollResult {
  passOpen(s);
  s.done = true;
  for (const e of s.entries) e.roll = e.choice === 'passen' ? 0 : d100(rnd);
  const need = s.entries.filter((e) => e.choice === 'bedarf');
  const pool = need.length ? need : s.entries.filter((e) => e.choice === 'gier');
  const res: RollResult = { winner: '', winnerName: '', choice: '', ties: [], lines: [] };
  if (pool.length) {
    let top = Math.max(...pool.map((e) => e.roll));
    let tied = pool.filter((e) => e.roll === top).map((e) => ({ id: e.id, name: e.name, roll: e.roll }));
    for (let round = 0; tied.length > 1 && round < 6; round++) {
      for (const x of tied) x.roll = d100(rnd);
      res.ties.push(tied.map((x) => ({ ...x })));
      top = Math.max(...tied.map((x) => x.roll));
      tied = tied.filter((x) => x.roll === top);
    }
    const w = tied[0];
    res.winner = w.id; res.winnerName = w.name; res.choice = need.length ? 'bedarf' : 'gier';
  }
  res.lines = rollChatLines(s, res);
  return res;
}

/**
 * Chat-Protokoll: „[Beute]: Anna würfelt Gier: 94 (1–100) · Bert würfelt Bedarf: 61 (1–100) → Bert (Bedarf) gewinnt [Sturmklinge]!“ –
 * bei vielen Teilnehmern auf mehrere Zeilen verteilt (eine Chat-Zeile hat höchstens `MMO.chatMax` Zeichen).
 */
export function rollChatLines(s: RollSession, r: RollResult, max: number = MMO.chatMax): string[] {
  const parts: string[] = [];
  for (const e of s.entries) parts.push(e.choice === 'passen' || !e.choice ? `${e.name} passt` : `${e.name} würfelt ${CHOICE_LABEL[e.choice]}: ${e.roll} (1–100)`);
  for (const round of r.ties) parts.push(`Stechen: ${round.map((x) => `${x.name} ${x.roll}`).join(', ')}`);
  const end = r.winner ? `→ ${r.winnerName} (${CHOICE_LABEL[r.choice as RollChoice]}) gewinnt [${s.item.name}]!` : `→ Alle passen – [${s.item.name}] bleibt bei ${s.fromName}.`;
  const head = '[Beute]: ';
  const lines: string[] = [];
  let cur = head;
  for (const p of parts) {
    const add = cur === head ? p : ` · ${p}`;
    if (cur.length + add.length > max && cur !== head) { lines.push(cur); cur = head + p; } else cur += add;
  }
  if (cur.length + 1 + end.length > max && cur !== head) { lines.push(cur); cur = head + end; } else cur += (cur === head ? '' : ' ') + end;
  lines.push(cur);
  return lines;
}

/** Wahl eines Stellvertreters (lokaler Shard): Bedarf, wenn erlaubt und das Stück episch oder besser ist, sonst Gier oder Passen */
export function botChoice(e: RollEntry, item: LootItemNet, rnd: () => number): RollChoice {
  const r = rnd();
  if (e.needOk && gradeRank(item.grade) >= gradeRank('violett') && r < 0.45) return 'bedarf';
  return r < 0.7 ? 'gier' : 'passen';
}
