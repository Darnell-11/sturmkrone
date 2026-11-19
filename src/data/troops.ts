// Massentruppen (Stufe 2 der Crew): namenlose, billige Söldnertrupps ohne Namen, Treue oder Aufträge.
// Reine Daten und Funktionen ohne three.js. Ein Truppentyp hat Werte je Kopf; Stufe = Stufe der Spielfigur (je Stufe etwas stärker).
import { MAX_SQUADS, SQUAD_MAX_HEADS } from './crewTiers';

export type TroopType = 'schwert' | 'musketier' | 'schlaeger';

export interface TroopDef {
  id: TroopType;
  label: string;
  desc: string;
  /** Handgeld je Kopf (Gold) */
  price: number;
  /** Lebenspunkte je Kopf bei Stufe 1 */
  hp: number;
  /** Schaden je Kopf und Angriff bei Stufe 1 */
  dmg: number;
  /** Pause zwischen zwei Angriffen (s) */
  cd: number;
  /** Reichweite in Metern (Nahkampf ≈ 1,8, Muskete 13) */
  range: number;
  /** Lauftempo in m/s */
  speed: number;
  ranged: boolean;
  /** Trupp-Radius je Kopf (Breite der Aufstellung) */
  spacing: number;
  /** Beitrag zur Enterkraft je Kopf */
  boarding: number;
  /** Farben für die Darstellung (Rock, Hose, Kopfbedeckung) */
  cloth: string; pants: string; hat: string;
}

export const TROOP_TYPES: TroopType[] = ['schwert', 'musketier', 'schlaeger'];

export const TROOPS: Record<TroopType, TroopDef> = {
  schwert: {
    id: 'schwert', label: 'Schwertträger', desc: 'Ausgewogene Nahkämpfer mit Säbel und Schild.',
    price: 14, hp: 44, dmg: 3.4, cd: 1.1, range: 1.9, speed: 4.1, ranged: false, spacing: 0.95, boarding: 1,
    cloth: '#7A2E2A', pants: '#3A3A44', hat: '#5A4A3A',
  },
  musketier: {
    id: 'musketier', label: 'Musketiere', desc: 'Schießen aus der Ferne, sind aber leicht gepanzert.',
    price: 18, hp: 30, dmg: 4.6, cd: 2.4, range: 13, speed: 3.8, ranged: true, spacing: 1.05, boarding: 0.7,
    cloth: '#2F5A8A', pants: '#D9D2C0', hat: '#2A2A34',
  },
  schlaeger: {
    id: 'schlaeger', label: 'Enter-Schläger', desc: 'Schwere Brecher: wenig Reichweite, viel Wucht beim Entern.',
    price: 22, hp: 72, dmg: 5.2, cd: 1.5, range: 1.8, speed: 3.6, ranged: false, spacing: 1.1, boarding: 1.4,
    cloth: '#5A4A2E', pants: '#2A2A2E', hat: '#8C8F96',
  },
};

/** Werte-Faktor je Stufe der Spielfigur: Stufe 1 = 1, je Stufe +5 % (höchstens ×4) */
export const troopLevelMult = (level: number) => Math.min(4, 1 + 0.05 * (Math.max(1, level) - 1));

/** Lebenspunkte und Schaden eines Kopfes bei einer Stufe */
export function troopHeadStats(typ: TroopType, level: number) {
  const d = TROOPS[typ], k = troopLevelMult(level);
  return { hp: d.hp * k, dmg: d.dmg * k };
}

// ---------- Bestand (Truppentyp → Köpfe) ----------

export type TroopRoster = Partial<Record<TroopType, number>>;

export const rosterTotal = (r: TroopRoster): number => TROOP_TYPES.reduce((n, t) => n + Math.max(0, Math.floor(r[t] ?? 0)), 0);

/** Unbekannte Typen und Unsinnswerte aus einem Spielstand entfernen */
export function cleanRoster(raw: unknown): TroopRoster {
  const out: TroopRoster = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const t of TROOP_TYPES) {
    const v = Number((raw as Record<string, unknown>)[t]);
    if (Number.isFinite(v) && v > 0) out[t] = Math.floor(v);
  }
  return out;
}

/** Auf höchstens `cap` Köpfe kürzen (verhältnismäßig) */
export function clampRoster(r: TroopRoster, cap: number): TroopRoster {
  return rosterTotal(r) > cap ? scaleRoster(r, cap) : { ...r };
}

/** Bestand auf genau `total` Köpfe bringen, die Mischung bleibt (größter Rest zuerst); bei `total` ≥ Summe wird der Rest dem größten Typ zugeschlagen */
export function scaleRoster(r: TroopRoster, total: number): TroopRoster {
  const want = Math.max(0, Math.round(total));
  const sum = rosterTotal(r);
  const out: TroopRoster = {};
  if (want <= 0 || sum <= 0) return out;
  const parts = TROOP_TYPES.map((t) => {
    const exact = ((r[t] ?? 0) / sum) * want;
    return { t, n: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let left = want - parts.reduce((n, p) => n + p.n, 0);
  for (const p of [...parts].sort((a, b) => b.frac - a.frac)) { if (left <= 0) break; if ((r[p.t] ?? 0) > 0) { p.n++; left--; } }
  for (const p of parts) if (p.n > 0) out[p.t] = p.n;
  return out;
}

/** Köpfe eines Typs dazugeben (bis zur Kapazität); liefert die tatsächlich hinzugefügten Köpfe */
export function addTroops(r: TroopRoster, typ: TroopType, heads: number, cap: number): number {
  const room = Math.max(0, cap - rosterTotal(r));
  const add = Math.max(0, Math.min(Math.floor(heads), room));
  if (add > 0) r[typ] = (r[typ] ?? 0) + add;
  return add;
}

// ---------- Aufstellung in Trupps ----------

export interface SquadPlan { typ: TroopType; heads: number }

/**
 * Bestand in höchstens `maxSquads` Trupps zu je höchstens `maxHeads` Köpfen aufteilen (jeder Typ bekommt mindestens einen Trupp,
 * die Köpfe eines Typs verteilen sich gleichmäßig). Reihenfolge: Schwertträger vorn, Musketiere hinten.
 */
export function planSquads(r: TroopRoster, maxSquads = MAX_SQUADS, maxHeads = SQUAD_MAX_HEADS): SquadPlan[] {
  const types = TROOP_TYPES.filter((t) => (r[t] ?? 0) > 0);
  if (!types.length) return [];
  // Trupps je Typ: mindestens einer, so viele wie die Köpfe verlangen, in der Summe höchstens maxSquads
  const need = types.map((t) => Math.max(1, Math.ceil((r[t] ?? 0) / maxHeads)));
  let sum = need.reduce((a, b) => a + b, 0);
  while (sum > maxSquads) {
    // den Typ mit den wenigsten Köpfen je Trupp zusammenlegen, solange ein Trupp noch Platz für die Köpfe hat
    let best = -1, bestAvg = Infinity;
    need.forEach((n, i) => { if (n > 1) { const avg = (r[types[i]] ?? 0) / n; if (avg < bestAvg) { bestAvg = avg; best = i; } } });
    if (best < 0) break;
    need[best]--; sum--;
  }
  const plans: SquadPlan[] = [];
  types.forEach((t, i) => {
    const n = need[i], heads = r[t] ?? 0;
    for (let k = 0; k < n; k++) plans.push({ typ: t, heads: Math.floor(heads / n) + (k < heads % n ? 1 : 0) });
  });
  // Notfall: mehr Trupps als erlaubt (sehr viele Typen) – kleinste Trupps gleicher Art verschmelzen
  while (plans.length > maxSquads) {
    plans.sort((a, b) => a.heads - b.heads);
    const a = plans.shift()!;
    const mate = plans.find((p) => p.typ === a.typ) ?? plans[0];
    mate.heads += a.heads;
  }
  return plans.sort((a, b) => TROOP_TYPES.indexOf(a.typ) - TROOP_TYPES.indexOf(b.typ));
}

// ---------- Befehle ----------

/** Befehlszustand der Trupps und Offiziere: Sturmangriff, Folgen, Position halten */
export type CommandState = 'sturm' | 'folgen' | 'halten';

export const COMMANDS: { id: CommandState; label: string; short: string }[] = [
  { id: 'sturm', label: 'Sturmangriff', short: 'Sturm' },
  { id: 'folgen', label: 'Folgen', short: 'Folgen' },
  { id: 'halten', label: 'Position halten', short: 'Halten' },
];
