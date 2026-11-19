// Insel-Besatzung nach einem Raid-Sieg: reine Zustandsmaschine ohne three.js (JSON-tauglich, testbar).
//
// Nach dem Fall des Endbosses gehört die Festungsinsel dem Spieler – für eine begrenzte Zeit aktiver Spielzeit (`OCCUPATION.minutes`).
// Zeit läuft in `meta.playTime` (Sekunden aktiver Spielzeit, steht in Menüs und Pausen still), nicht in Echtzeit: `occupiedUntil` ist ein
// Zeitpunkt auf dieser Uhr. Während der Besatzung: Spieler-Flagge, freundliche Wachen, Tribute, sicherer Hafen. In den letzten Minuten schickt
// die ursprüngliche Macht eine Rückeroberungs-Flotte: wer sie versenkt, verlängert die Besatzung (und bekommt Ehre), sonst fällt die Insel
// zurück – dann ist der ganze Raid samt Endboss wieder frisch spielbar. Dauerhaft bleiben `conquestCount` und alle Freischaltungen.
import type { FactionId } from '../data/factions';
import { clamp01 } from '../core/mathUtil';
import { finiteOrNull } from '../core/sanitize';

export const OCCUPATION = {
  /** Dauer der Besatzung in Minuten aktiver Spielzeit (ein Ingame-Tag dauert `DAY_MINUTES` = 24 Minuten) */
  minutes: 25,
  /** Ab diesem Rest (Sekunden) kommt die Rückeroberungs-Flotte */
  endgame: 5 * 60,
  /** Erfolgreich abgewehrte Flotte: Verlängerung in Sekunden, höchstens so oft */
  extension: 10 * 60,
  maxExtensions: 4,
  /** Tribut alle so viele Sekunden */
  tributeEvery: 120,
  /** Flotte braucht so lange vom Aufbruch bis zur Insel (Sekunden); die Anfahrt ist auf der Karte sichtbar */
  fleetTravel: 150,
  /** Ehre (Ruhm) für eine abgewehrte Flotte */
  fameBonus: 150,
} as const;

/** Sekunden Besatzung insgesamt */
export const occupationSeconds = () => OCCUPATION.minutes * 60;

export type CounterState = 'none' | 'inbound' | 'repelled';

/** Spielstand-Eintrag je Festungsinsel (progress.conquest[islandId]) */
export interface ConquestRecord {
  islandId: string;
  factionId: FactionId;
  /** Wie oft der Spieler die Insel erobert hat (nur wachsend; geht nie verloren) */
  conquestCount: number;
  /** Ende der Besatzung auf der Uhr `meta.playTime` (null = die Macht hält die Insel) */
  occupiedUntil: number | null;
  /** Beginn der laufenden Besatzung (playTime) */
  occupiedAt: number | null;
  /** Rückeroberungs-Flotte: unterwegs seit `counterAt` (playTime) */
  counter: CounterState;
  counterAt: number | null;
  /** Wie oft die Besatzung durch abgewehrte Flotten verlängert wurde (laufende Besatzung) */
  extensions: number;
  /** Letzter Tribut (playTime) */
  lastTribute: number | null;
  /** Wie viele Flotten in der laufenden Besatzung abgewehrt wurden (steigert die nächste Flotte) */
  repelled: number;
}

export const newRecord = (islandId: string, factionId: FactionId): ConquestRecord => ({
  islandId, factionId, conquestCount: 0, occupiedUntil: null, occupiedAt: null, counter: 'none', counterAt: null, extensions: 0, lastTribute: null, repelled: 0,
});

/** Zustand der Insel für Anzeige und Regeln */
export type OccupationPhase = 'free' | 'held' | 'endgame';

export const isOccupied = (r: ConquestRecord | undefined | null, now: number): boolean => !!r && r.occupiedUntil !== null && r.occupiedUntil > now;
/** Verbleibende Sekunden (0, wenn nicht besetzt) */
export const remaining = (r: ConquestRecord | undefined | null, now: number): number => (r && r.occupiedUntil !== null ? Math.max(0, r.occupiedUntil - now) : 0);
export function phase(r: ConquestRecord | undefined | null, now: number): OccupationPhase {
  if (!isOccupied(r, now)) return 'free';
  return remaining(r, now) <= OCCUPATION.endgame ? 'endgame' : 'held';
}

/** Der Raid wurde gewonnen: die Insel gehört dem Spieler. Liefert den neuen Eintrag (der alte bleibt unverändert). */
export function beginOccupation(prev: ConquestRecord | undefined, islandId: string, factionId: FactionId, now: number): ConquestRecord {
  const r = { ...(prev ?? newRecord(islandId, factionId)) };
  r.islandId = islandId;
  r.factionId = factionId;
  r.conquestCount += 1;
  r.occupiedAt = now;
  r.occupiedUntil = now + occupationSeconds();
  r.counter = 'none'; r.counterAt = null; r.extensions = 0; r.lastTribute = now; r.repelled = 0;
  return r;
}

/** Muss jetzt die Rückeroberungs-Flotte aufbrechen? (letzte Minuten und noch keine unterwegs) */
export const fleetDue = (r: ConquestRecord, now: number): boolean => phase(r, now) === 'endgame' && r.counter === 'none';

/** Flotte bricht auf: Ankunft in `fleetTravel` Sekunden (aber nie nach Ablauf der Besatzung, die Karte zeigt die Anfahrt) */
export function dispatchFleet(r: ConquestRecord, now: number): ConquestRecord {
  return { ...r, counter: 'inbound', counterAt: now };
}

/** Fortschritt der Anfahrt 0 … 1 (1 = vor der Insel) */
export function fleetProgress(r: ConquestRecord, now: number): number {
  if (r.counter !== 'inbound' || r.counterAt === null) return 0;
  return clamp01((now - r.counterAt) / OCCUPATION.fleetTravel);
}

/** Flotte versenkt: die Besatzung verlängert sich (bis zum Höchstwert), die nächste Flotte kommt, wenn der Rest wieder unter den Endspurt fällt */
export function repelFleet(r: ConquestRecord, now: number): { rec: ConquestRecord; extended: number; fame: number } {
  if (r.occupiedUntil === null) return { rec: r, extended: 0, fame: 0 };
  const can = r.extensions < OCCUPATION.maxExtensions;
  const add = can ? OCCUPATION.extension : 0;
  const rec: ConquestRecord = { ...r, occupiedUntil: Math.max(r.occupiedUntil, now) + add, extensions: r.extensions + (can ? 1 : 0), counter: 'none', counterAt: null, repelled: r.repelled + 1 };
  return { rec, extended: add, fame: OCCUPATION.fameBonus + 40 * r.repelled };
}

/** Die Besatzung ist abgelaufen (oder die Flotte hat die Insel erreicht): die Macht erobert sie zurück; Zählung und Freischaltungen bleiben */
export function loseIsland(r: ConquestRecord): ConquestRecord {
  return { ...r, occupiedUntil: null, occupiedAt: null, counter: 'none', counterAt: null, extensions: 0, lastTribute: null, repelled: 0 };
}

/** Wann ist die Besatzung verloren? Läuft der Rest ab, solange die Flotte noch unterwegs ist, oder ist sie angekommen und lebt noch */
export const isLost = (r: ConquestRecord, now: number): boolean => r.occupiedUntil !== null && r.occupiedUntil <= now;

/** Stärke der Flotte: Zahl der Kriegsschiffe wächst mit der Zahl der Eroberungen und abgewehrten Flotten (3 … 6) */
export const fleetShips = (r: ConquestRecord): number => Math.min(6, 3 + Math.floor((r.conquestCount - 1) / 2) + r.repelled);

/** Tribut: wie viele Zahlungen sind fällig (höchstens eine je Aufruf, damit nach langen Pausen nichts auf einmal ausgezahlt wird) */
export function tributeDue(r: ConquestRecord, now: number): boolean {
  return isOccupied(r, now) && r.lastTribute !== null && now - r.lastTribute >= OCCUPATION.tributeEvery;
}
export const payTribute = (r: ConquestRecord, now: number): ConquestRecord => ({ ...r, lastTribute: now });

/** Höhe des Tributs: Gold nach Stufe, dazu ein Vorrat (Proviant) bei jedem zweiten Tribut */
export function tributeAmount(level: number, conquests: number): { gold: number; proviant: number } {
  return { gold: Math.round(180 + level * 14 + Math.min(5, conquests) * 40), proviant: 1 + (conquests >= 3 ? 1 : 0) };
}

// ---------- Anzeige ----------

/** „24:10“ */
export function clockText(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Ingame-Tage (24 Minuten je Tag) für die Anzeige „≈ 1,0 Tage“ */
export const ingameDays = (sec: number, dayMinutes = 24): number => Math.round((sec / (dayMinutes * 60)) * 10) / 10;

/** Alles, was Karte, Kompass und Insel-Banner zeigen (reine Daten) */
export interface OccupationView {
  islandId: string;
  name: string;
  factionId: FactionId;
  phase: OccupationPhase;
  remaining: number;
  text: string;
  /** Rückeroberungs-Flotte: unterwegs, Fortschritt, wie viele Schiffe noch fehlen */
  counter: CounterState;
  fleetProgress: number;
  fleetLeft: number;
  extensions: number;
  conquestCount: number;
}

export function viewOf(r: ConquestRecord, name: string, now: number, fleetLeft = 0): OccupationView {
  const rest = remaining(r, now);
  return {
    islandId: r.islandId, name, factionId: r.factionId, phase: phase(r, now), remaining: rest,
    text: `${clockText(rest)} · ≈ ${String(ingameDays(rest)).replace('.', ',')} Ingame-Tage`,
    counter: r.counter, fleetProgress: fleetProgress(r, now), fleetLeft, extensions: r.extensions, conquestCount: r.conquestCount,
  };
}

/** Freischaltungen im Spielstand (dauerhaft): Segel, Verzierungen, erbeutete Boss-Stücke */
export interface Unlocks { sails: string[]; ornaments: string[]; bossLoot: string[] }
export const emptyUnlocks = (): Unlocks => ({ sails: [], ornaments: [], bossLoot: [] });

/** Fremdes oder altes Datenstück säubern (Migration, Import) */
export function cleanConquest(raw: unknown): Record<string, ConquestRecord> {
  const out: Record<string, ConquestRecord> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw as Record<string, any>)) {
    if (!v || typeof v !== 'object') continue;
    out[id] = {
      islandId: id, factionId: (typeof v.factionId === 'string' ? v.factionId : 'england') as FactionId,
      conquestCount: Math.max(0, Math.floor(finiteOrNull(v.conquestCount) ?? 0)), occupiedUntil: finiteOrNull(v.occupiedUntil), occupiedAt: finiteOrNull(v.occupiedAt),
      counter: v.counter === 'inbound' || v.counter === 'repelled' ? v.counter : 'none', counterAt: finiteOrNull(v.counterAt),
      extensions: Math.max(0, Math.floor(finiteOrNull(v.extensions) ?? 0)), lastTribute: finiteOrNull(v.lastTribute), repelled: Math.max(0, Math.floor(finiteOrNull(v.repelled) ?? 0)),
    };
  }
  return out;
}

export function cleanUnlocks(raw: unknown): Unlocks {
  const strs = (a: unknown) => (Array.isArray(a) ? [...new Set(a.filter((x): x is string => typeof x === 'string'))] : []);
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { sails: strs(o.sails), ornaments: strs(o.ornaments), bossLoot: strs(o.bossLoot) };
}
