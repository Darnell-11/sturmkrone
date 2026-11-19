// Fraktions-Ehre und Ansehen (`FactionReputationState`): reine Daten und Regeln ohne three.js (JSON-tauglich, testbar).
//
// Zwei Größen je Macht (die fünf Großmächte und die Marine):
//  • Ansehen (`progress.standing`, −100 … +100): wie die Macht dem Spieler gesinnt ist. Es bestimmt friedliche Durchfahrt, Hafen-Rabatte und
//    – bei der Marine ab 60 – den Dienststatus. Es kann fallen und steigen.
//  • Ehre (`progress.reputation.honor`): das Lebenswerk bei einer Macht, wächst nur. Sie gibt Ehrentitel und zählt als Verdienst.
//
// Seeschlachten an den Grenzen (naval/seaBattles.ts) liefern den Anlass: wer nur EINE Seite angreift, ergreift Partei und erntet Ehre; wer BEIDE
// Seiten versenkt, bekommt maximalen Doppel-Loot, verliert aber bei beiden Mächten Ansehen und zieht Kopfgeldjäger und die Marine auf sich.
import type { FactionId } from './factions';
import { FACTION_IDS, FACTIONS } from './factions';

export const REP = {
  /** Ab diesem Ansehen lässt eine Macht den Spieler in ihrem Sektor friedlich passieren (außer er hat auf sie geschossen) */
  peaceAt: 20,
  /** Marine-Dienststatus: Weißwacht ist sicherer Stützpunkt, Marine-Schiffe helfen im Kampf */
  serviceAt: 60,
  /** Rabattstufen im Hafen einer Macht: [Ansehen ab, Rabatt] */
  discounts: [[20, 0.05], [40, 0.1], [60, 0.15], [80, 0.2]] as [number, number][],
  /** Ein Schiff der Seite gilt als „angegriffen“, wenn der Spieler so viel seiner Rumpfpunkte (Anteil) zerstört hat oder eins versenkte */
  attackedFrac: 0.3,
  /** Doppelspiel erst, wenn die weniger getroffene Seite mindestens so viel Schaden bekam wie dieser Anteil der stärker getroffenen (Streuschüsse zählen nicht) */
  bothShare: 0.5,
  sided: { standing: 6, perSunk: 5, cap: 24, honor: 20, honorPerSunk: 15, hitPenalty: 4, hitPenaltyPerSunk: 3, hitPenaltyCap: 20, marineStanding: 6, marineHonor: 10 },
  both: { standing: 18, perSunk: 6, cap: 40, marinePenalty: 12, marineBounty: 200, bounty: 400, bountyPerSunk: 250, lootMult: 2.5, goods: 3 },
  /** Schiff einer Macht außerhalb einer Seeschlacht versenkt / geentert (Marine: siehe STANDING_EVENTS) */
  sinkOutside: -4,
  boardOutside: -3,
  /** Bauplan: Werftrabatt je Bauplan, höchstens so viele zählen */
  blueprintDiscount: 0.04,
  blueprintMax: 5,
} as const;

export type RepTier = 'erzfeind' | 'feindlich' | 'neutral' | 'freundlich' | 'verbuendet' | 'ehrenbund';
export const REP_TIERS: { id: RepTier; min: number; label: string }[] = [
  { id: 'erzfeind', min: -100, label: 'Erzfeind' },
  { id: 'feindlich', min: -60, label: 'Feindlich' },
  { id: 'neutral', min: 0, label: 'Neutral' },
  { id: 'freundlich', min: 20, label: 'Freundlich' },
  { id: 'verbuendet', min: 40, label: 'Verbündet' },
  { id: 'ehrenbund', min: 70, label: 'Ehrenbund' },
];

export function repTier(standing: number): { id: RepTier; label: string } {
  let t = REP_TIERS[0];
  for (const x of REP_TIERS) if (standing >= x.min) t = x;
  return t;
}

/** Feindlich gesinnt: die Schiffe der Macht greifen den Spieler an */
export const isHostile = (standing: number) => standing < 0;
/** Friedliche Durchfahrt im Sektor der Macht */
export const isPeaceful = (standing: number) => standing >= REP.peaceAt;
/** Marine-Dienststatus */
export const hasService = (marineStanding: number) => marineStanding >= REP.serviceAt;

/** Rabatt auf Werft, Mannschaft und Rast im Hafen einer Macht (0 … 0,2) */
export function harborDiscount(standing: number): number {
  let d = 0;
  for (const [min, v] of REP.discounts) if (standing >= min) d = v;
  return d;
}

/** Werftrabatt durch Baupläne (verschiedene Mächte, höchstens `blueprintMax`) */
export const blueprintDiscount = (blueprints: readonly string[]): number => Math.min(REP.blueprintMax, new Set(blueprints).size) * REP.blueprintDiscount;

/** Ehrentitel je Macht nach Lebenswerk */
export function honorTitle(honor: number): string {
  return honor >= 800 ? 'Ehrenmitglied' : honor >= 400 ? 'Vertrauter' : honor >= 150 ? 'Freund des Hauses' : honor >= 50 ? 'Gern gesehener Gast' : 'Unbekannt';
}

// ---------- Zustand im Spielstand ----------

export interface FactionReputationState {
  /** Ehre je Macht: nur wachsend */
  honor: Partial<Record<FactionId, number>>;
  /** Kopfgeld, das eine Macht auf den Spieler ausgesetzt hat (Gold); zieht Kopfgeldjäger an */
  bounty: Partial<Record<FactionId, number>>;
  /** Erbeutete Baupläne (`bauplan_<macht>`): senken die Werftkosten dauerhaft */
  blueprints: string[];
  /** Zahl der Seeschlachten: miterlebt (beteiligt), Partei ergriffen, beide Seiten angegriffen */
  battles: { joined: number; sided: number; both: number };
  /** Letzte Taten für das Ruf-Fenster (Spielzeit in Sekunden, Text) */
  log: { t: number; text: string }[];
}

export const emptyReputation = (): FactionReputationState => ({ honor: {}, bounty: {}, blueprints: [], battles: { joined: 0, sided: 0, both: 0 }, log: [] });

/** Fremde oder alte Daten säubern (Migration, Import) */
export function cleanReputation(raw: unknown): FactionReputationState {
  const out = emptyReputation();
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, any>;
  const rec = (v: unknown): Partial<Record<FactionId, number>> => {
    const r: Partial<Record<FactionId, number>> = {};
    if (v && typeof v === 'object') for (const f of FACTION_IDS) { const n = Number((v as Record<string, unknown>)[f]); if (Number.isFinite(n) && n > 0) r[f] = Math.round(n); }
    return r;
  };
  out.honor = rec(o.honor);
  out.bounty = rec(o.bounty);
  out.blueprints = Array.isArray(o.blueprints) ? [...new Set(o.blueprints.filter((x: unknown): x is string => typeof x === 'string'))] : [];
  const b = o.battles && typeof o.battles === 'object' ? o.battles : {};
  const n = (x: unknown) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Math.floor(Number(x)) : 0);
  out.battles = { joined: n(b.joined), sided: n(b.sided), both: n(b.both) };
  out.log = Array.isArray(o.log) ? o.log.filter((l: any) => l && typeof l.text === 'string').slice(-8).map((l: any) => ({ t: Number(l.t) || 0, text: String(l.text) })) : [];
  return out;
}

// ---------- Seeschlacht auswerten ----------

/** Bilanz des Spielers in einer Seeschlacht zwischen zwei Mächten (Seite 0 und Seite 1) */
export interface BattleStats {
  sides: [FactionId, FactionId];
  /** Zerstörte Rumpfpunkte durch den Spieler je Seite, vom Spieler versenkte Schiffe je Seite, durchschnittliche Rumpfpunkte eines Schiffs je Seite */
  dmg: [number, number];
  sunk: [number, number];
  hull: [number, number];
}

export const newStats = (a: FactionId, b: FactionId, hullA: number, hullB: number): BattleStats => ({ sides: [a, b], dmg: [0, 0], sunk: [0, 0], hull: [hullA, hullB] });

/** Hat der Spieler diese Seite angegriffen? */
export const attackedSide = (s: BattleStats, side: 0 | 1): boolean => s.sunk[side] > 0 || s.dmg[side] >= Math.max(1, s.hull[side]) * REP.attackedFrac;

export type BattleVerdict = { kind: 'none' } | { kind: 'sided'; backed: 0 | 1 } | { kind: 'both' };

/** Nur eine Seite angegriffen = Partei ergriffen (die andere wird unterstützt); beide = Doppelspiel; keine = unbeteiligt */
export function judgeBattle(s: BattleStats): BattleVerdict {
  const a = attackedSide(s, 0), b = attackedSide(s, 1);
  if (a && b) {
    const hi = Math.max(s.dmg[0], s.dmg[1]), lo = Math.min(s.dmg[0], s.dmg[1]);
    if (lo >= hi * REP.bothShare) return { kind: 'both' };
    // Kugeln, die am Ziel vorbeiflogen und die andere Flotte streiften, sind kein Verrat: die weniger getroffene Seite hat der Spieler unterstützt
    return { kind: 'sided', backed: s.dmg[0] > s.dmg[1] ? 1 : 0 };
  }
  if (a) return { kind: 'sided', backed: 1 };
  if (b) return { kind: 'sided', backed: 0 };
  return { kind: 'none' };
}

export interface BattleOutcome {
  verdict: BattleVerdict;
  /** Änderungen des Ansehens, der Ehre und des Kopfgelds je Macht */
  standing: Partial<Record<FactionId, number>>;
  honor: Partial<Record<FactionId, number>>;
  bounty: Partial<Record<FactionId, number>>;
  /** Mächte, die Kopfgeldjäger schicken (bei Doppelspiel auch die Marine) */
  hunters: FactionId[];
  /** Faktor auf die Beute der versenkten Schiffe (Doppel-Loot) */
  lootMult: number;
  /** Zusätzliche Handelswaren (Anzahl Güter) und ein Bauplan (ID oder null, wenn schon alle da sind) */
  goods: number;
  blueprint: string | null;
  text: string;
}


/**
 * Folgen einer Seeschlacht. `ownedBlueprints`: schon erbeutete Baupläne (ein Bauplan je Macht, nie doppelt).
 * Partei ergreifen: Ansehen und Ehre bei der unterstützten Macht (je versenktem Schiff der anderen mehr), bei Hilfe gegen Kurogane auch bei
 * der Marine; die angegriffene Macht ist verstimmt. Doppelspiel: maximaler Loot (×2,5, drei Waren, ein Bauplan), aber bei beiden Mächten
 * und der Marine sinkt das Ansehen stark, es wird Kopfgeld ausgesetzt, und Kopfgeldjäger und Marine jagen den Spieler.
 */
export function battleOutcome(s: BattleStats, ownedBlueprints: readonly string[] = []): BattleOutcome {
  const v = judgeBattle(s);
  const out: BattleOutcome = { verdict: v, standing: {}, honor: {}, bounty: {}, hunters: [], lootMult: 1, goods: 0, blueprint: null, text: '' };
  if (v.kind === 'none') return out;
  const [A, B] = s.sides;
  if (v.kind === 'sided') {
    const backed = s.sides[v.backed], hit = s.sides[v.backed === 0 ? 1 : 0], hitSide = v.backed === 0 ? 1 : 0;
    const k = REP.sided, sunk = s.sunk[hitSide];
    out.standing[backed] = Math.min(k.cap, k.standing + k.perSunk * sunk);
    out.honor[backed] = k.honor + k.honorPerSunk * sunk;
    out.standing[hit] = -Math.min(k.hitPenaltyCap, k.hitPenalty + k.hitPenaltyPerSunk * sunk);
    // Hilfe gegen die Schwarzsegel gefällt der Marine
    if (hit === 'kurogane') { out.standing.marine = k.marineStanding; out.honor.marine = k.marineHonor; }
    out.text = `Du hast für ${FACTIONS[backed].name} Partei ergriffen`;
    return out;
  }
  const k = REP.both;
  for (const side of [0, 1] as const) {
    const f = s.sides[side];
    out.standing[f] = -Math.min(k.cap, k.standing + k.perSunk * s.sunk[side]);
    out.bounty[f] = k.bounty + k.bountyPerSunk * s.sunk[side];
    out.hunters.push(f);
  }
  out.standing.marine = -k.marinePenalty;
  out.bounty.marine = k.marineBounty;
  out.hunters.push('marine');
  out.lootMult = k.lootMult;
  out.goods = k.goods;
  out.blueprint = [A, B].map((f) => `bauplan_${f}`).find((id) => !ownedBlueprints.includes(id)) ?? null;
  out.text = `Du hast ${FACTIONS[A].name} und ${FACTIONS[B].name} zugleich angegriffen`;
  return out;
}

/** Spielstand-Teil: Folgen anwenden (Ansehen über `shift`, damit der Aufrufer Meldungen und Grenzen setzen kann) */
export function applyOutcome(rep: FactionReputationState, o: BattleOutcome, shift: (f: FactionId, delta: number) => void, now: number, text: string): void {
  rep.battles.joined++;
  if (o.verdict.kind === 'sided') rep.battles.sided++;
  if (o.verdict.kind === 'both') rep.battles.both++;
  for (const [f, d] of Object.entries(o.standing)) shift(f as FactionId, d as number);
  for (const [f, d] of Object.entries(o.honor)) rep.honor[f as FactionId] = (rep.honor[f as FactionId] ?? 0) + (d as number);
  for (const [f, d] of Object.entries(o.bounty)) rep.bounty[f as FactionId] = (rep.bounty[f as FactionId] ?? 0) + (d as number);
  if (o.blueprint && !rep.blueprints.includes(o.blueprint)) rep.blueprints.push(o.blueprint);
  rep.log.push({ t: Math.round(now), text });
  if (rep.log.length > 8) rep.log.splice(0, rep.log.length - 8);
}
