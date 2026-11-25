// Entdeckung und Kartierung (Phase 4.3D): welche Inseln die Weltkarte zeigt und wie viel von ihnen. Rein (ohne three.js, ohne DOM) und JSON-tauglich;
// den Zustand im Spielstand (`SaveData.world.chart`) und die Anbindung an die Seewelt besorgen SeaWorld und Game.
//
// Drei Stufen je Insel (`chartLevel`):
//   • known    – voll kartiert: Form, Name, Hafen, Markt, Besatzung. Start: Ankerglück und alles bis 3 050 m um den Mittelpunkt (Ring 1 und die innersten Häfen).
//   • outline  – schemenhafter Pergament-Umriss ohne Einzelheiten (alle normalen, noch nicht entdeckten Inseln). Bis auf 1 600 m Küstenabstand wird sie known.
//   • hidden   – die vier Geheim-Inseln (`uncharted`): auf der Karte unsichtbar, bis man auf 1 400 m Küstenabstand heransegelt.
// Eine Karte (Zone) um einen Hafen oder Leuchtturm kartiert weit (3 200 m): alle normalen Inseln darin sind known, Geheim-Inseln nie.
import type { IslandDef } from '../data/regions';

export const DISCOVERY = {
  /** Beim Start voll kartiert: Abstand der Inselmitte vom Weltmittelpunkt (Ring 1 und die innersten Häfen; seit 4.5C entzerrt, dieselben Inseln wie zuvor bei 2 400 m) */
  startRadius: 3050,
  /** Normale Inseln: Küstenabstand, ab dem sie entdeckt sind (m) */
  near: 1600,
  /** Geheim-Inseln (`uncharted`) */
  secret: 1400,
  /** Karte um einen Hafen oder Leuchtturm (m, gemessen von der Küste der kartierten Insel zur Küste der anderen) */
  harborChart: 3200,
  /** Obergrenze der gespeicherten Zonen (ältere fallen weg; die entdeckten Inseln bleiben) */
  maxZones: 64,
} as const;

export interface ChartZone { /** Insel, die die Karte kartiert hat */ src: string; x: number; z: number; r: number }
/** Zustand im Spielstand: entdeckte Inseln und kartierte Zonen */
export interface ChartState { islands: string[]; zones: ChartZone[] }
export const emptyChart = (): ChartState => ({ islands: [], zones: [] });

export type ChartLevel = 'hidden' | 'outline' | 'known';
export type ChartDef = Pick<IslandDef, 'id' | 'x' | 'z' | 'r' | 'kind'> & { uncharted?: boolean };

/** Von Anfang an voll kartiert: Ankerglück und jede normale Insel bis 2 400 m um den Mittelpunkt */
export function isStartCharted(d: ChartDef): boolean {
  return !d.uncharted && (d.id === 'ankerglueck' || Math.hypot(d.x, d.z) <= DISCOVERY.startRadius);
}

/** Wie viel zeigt die Karte von dieser Insel? */
export function chartLevel(d: ChartDef, known: ReadonlySet<string>): ChartLevel {
  if (known.has(d.id)) return 'known';
  return d.uncharted ? 'hidden' : 'outline';
}

/** Entdeckungsradius (Küstenabstand); `bonus` = Ausguck (Fernsicht) nur für normale Inseln */
export const seeRange = (d: ChartDef, bonus = 1): number => (d.uncharted ? DISCOVERY.secret : DISCOVERY.near * Math.max(1, bonus));

/** Liegt die Küste dieser Insel in Sichtweite von (px, pz)? */
export function inSight(d: ChartDef, px: number, pz: number, bonus = 1): boolean {
  return Math.hypot(d.x - px, d.z - pz) - d.r <= seeRange(d, bonus);
}

/** Beim Spielstart: Ankerglück und Ring 1 gelten als kartiert */
export function seedStartCharts(defs: readonly ChartDef[], known: Set<string>): void {
  for (const d of defs) if (isStartCharted(d)) known.add(d.id);
}

/**
 * Segeln: alle Inseln, die jetzt in Sichtweite liegen, werden entdeckt. Die neuen Kennungen stehen danach in `out` (vorher geleert, kein neues Feld
 * je Aufruf). Liefert die Zahl der neuen.
 */
export function discoverNear(defs: readonly ChartDef[], known: Set<string>, px: number, pz: number, bonus: number, out: string[]): number {
  out.length = 0;
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    if (known.has(d.id) || !inSight(d, px, pz, bonus)) continue;
    known.add(d.id);
    out.push(d.id);
  }
  return out.length;
}

/** Häfen, Städte und Leuchttürme kartieren ihre Umgebung (Anlegen / Leuchtfeuer) */
export const chartsSurroundings = (d: Pick<IslandDef, 'kind'>): boolean => d.kind === 'harbor' || d.kind === 'town' || d.kind === 'lighthouse';

/**
 * Eine Karte um `src` anlegen: alle normalen Inseln innerhalb von 3 200 m Küstenabstand werden known (Geheim-Inseln bleiben unsichtbar), `src` selbst
 * auch. Die Zone wird gemerkt (eine je Insel, die neueste ersetzt die ältere). Neue Kennungen landen in `out`.
 */
export function chartAround(defs: readonly ChartDef[], known: Set<string>, zones: ChartZone[], src: ChartDef, out: string[]): number {
  out.length = 0;
  const at = zones.findIndex((z) => z.src === src.id);
  const zone: ChartZone = { src: src.id, x: src.x, z: src.z, r: src.r + DISCOVERY.harborChart };
  if (at >= 0) zones.splice(at, 1);
  zones.push(zone);
  while (zones.length > DISCOVERY.maxZones) zones.shift();
  if (!known.has(src.id)) { known.add(src.id); out.push(src.id); }
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    if (d.uncharted || known.has(d.id)) continue;
    if (Math.hypot(d.x - src.x, d.z - src.z) - d.r - src.r <= DISCOVERY.harborChart) { known.add(d.id); out.push(d.id); }
  }
  return out.length;
}

/** Liegt der Punkt in einer kartierten Zone (für die Karte: aufgehellte Fläche)? */
export function zoneCovers(zones: readonly ChartZone[], x: number, z: number): boolean {
  for (let i = 0; i < zones.length; i++) if (Math.hypot(x - zones[i].x, z - zones[i].z) <= zones[i].r) return true;
  return false;
}

/** Zustand für den Spielstand (Kennungen sortiert, damit gleiche Karten gleiche Spielstände ergeben) */
export function chartToSave(known: ReadonlySet<string>, zones: readonly ChartZone[]): ChartState {
  return { islands: [...known].sort(), zones: zones.map((z) => ({ ...z })) };
}

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Fremde oder kaputte Daten säubern (Spielstand laden, importieren) */
export function cleanChart(raw: unknown): ChartState {
  const o = isRec(raw) ? raw : {};
  const islands = [...new Set((Array.isArray(o.islands) ? o.islands : []).filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length <= 48))].slice(0, 512);
  const zones: ChartZone[] = [];
  for (const z of Array.isArray(o.zones) ? o.zones : []) {
    if (!isRec(z) || typeof z.src !== 'string' || !fin(z.x) || !fin(z.z) || !fin(z.r) || z.r <= 0) continue;
    if (zones.some((q) => q.src === z.src)) continue;
    zones.push({ src: z.src.slice(0, 48), x: Math.round(z.x), z: Math.round(z.z), r: Math.min(20000, Math.round(z.r)) });
  }
  return { islands, zones: zones.slice(-DISCOVERY.maxZones) };
}

/** Marken im Spielstand, die einen Besuch einer Insel belegen: betreten, Lager geräumt (`loot_`), Kristall erweckt, Boss besiegt, Belagerung gewonnen */
const VISIT_FLAGS = ['seen_', 'loot_', 'crystal_', 'beat_', 'raidwon_'] as const;

/**
 * Alter Spielstand (Version 18, oder 19 ohne Karte): bereits besuchte oder eroberte Inseln gelten als entdeckt. Quellen: die Liste `flags.disc` der alten
 * Entdeckung, die Besuchsmarken (`VISIT_FLAGS`) und die Eroberungen (`progress.conquest`). Ankerglück und Ring 1 setzt der Start der Welt ohnehin (`seedStartCharts`).
 */
export function legacyDiscovered(progress: { flags?: Record<string, unknown>; conquest?: Record<string, unknown> } | undefined): string[] {
  const out = new Set<string>();
  const flags = progress?.flags ?? {};
  const disc = flags.disc;
  if (Array.isArray(disc)) for (const s of disc) if (typeof s === 'string') out.add(s);
  for (const k of Object.keys(flags)) {
    if (!flags[k]) continue;
    for (const p of VISIT_FLAGS) if (k.startsWith(p)) { out.add(k.slice(p.length)); break; }
  }
  for (const id of Object.keys(progress?.conquest ?? {})) out.add(id);
  return [...out];
}

/** Der Zustand nach dem Laden: gespeicherte Karte plus alles, was der alte Stand schon wusste (nie weniger als vorher) */
export function chartOnLoad(raw: unknown, progress: Parameters<typeof legacyDiscovered>[0]): ChartState {
  const c = cleanChart(raw);
  return { islands: [...new Set([...c.islands, ...legacyDiscovered(progress)])].sort(), zones: c.zones };
}
