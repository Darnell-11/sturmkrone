// Schiffs-Evolution (Phase 4.2): drei unabhängige Ausbau-Zweige (Rumpf, Segel, Kanonen) mit je einer Stufe 1 … 5. Reine, JSON-taugliche Daten
// und Regeln ohne three.js: der Zustand liegt je Schiffsklasse im Spielstand (`ship.evo`), alle Zahlen stehen in data/balanceConfig.ts.
// Neu gekaufte Schiffe beginnen auf 1/1/1 (schwach, flickbedürftig), das Startschiff auf 2/2/2; Stufe 3 entspricht den alten Grundwerten.
import {
  CANNON_DMG_K, CANNON_PEN, CANNON_PORTS_K, CANNON_RELOAD_K, EVO_COST, EVO_MATERIAL, EVO_TRADE_IN, HULL_ARMOR_K, HULL_HP_K, RAM_MIN_TIER, SAIL_ACCEL_K, SAIL_HP_K,
  SAIL_SPEED_K, SAIL_TURN_K, SAIL_UPWIND_K, SWIVEL_MIN_TIER, evoClassK, evoK, evoMaterialK,
} from './balanceConfig';
import type { GoodId } from './economy';

export type EvoTier = 1 | 2 | 3 | 4 | 5;
export type EvoBranch = 'hull' | 'sail' | 'cannon';
export const EVO_BRANCHES: readonly EvoBranch[] = ['hull', 'sail', 'cannon'];
export const EVO_MAX = 5;

export interface ShipEvolution { hullTier: EvoTier; sailTier: EvoTier; cannonTier: EvoTier }
export const BRANCH_FIELD: Record<EvoBranch, keyof ShipEvolution> = { hull: 'hullTier', sail: 'sailTier', cannon: 'cannonTier' };
export const BRANCH_LABEL: Record<EvoBranch, { n: string; icon: string }> = {
  hull: { n: 'Rumpf', icon: '🛠' }, sail: { n: 'Segel', icon: '⛵' }, cannon: { n: 'Kanonen', icon: '💥' },
};

export const clampEvo = (n: unknown, d: EvoTier = 1): EvoTier => (typeof n === 'number' && Number.isFinite(n) ? (Math.max(1, Math.min(EVO_MAX, Math.round(n))) as EvoTier) : d);

/** Neu gekauftes Schiff: alles auf Stufe 1 */
export const newShipEvolution = (): ShipEvolution => ({ hullTier: 1, sailTier: 1, cannonTier: 1 });
/** Das Schiff, mit dem ein neues Spiel beginnt (nicht gekauft): Stufe 2 in allen Zweigen */
export const starterEvolution = (): ShipEvolution => ({ hullTier: 2, sailTier: 2, cannonTier: 2 });
/** Neutrale Stufe 3 (alte Grundwerte): Begleitschiffe und alles ohne Ausbau-Zustand */
export const neutralEvolution = (): ShipEvolution => ({ hullTier: 3, sailTier: 3, cannonTier: 3 });
export const evolutionOfTier = (t: number): ShipEvolution => ({ hullTier: clampEvo(t), sailTier: clampEvo(t), cannonTier: clampEvo(t) });

/** Gesamtstufe: Mittel der drei Zweige, gerundet (die eine Quelle für Anzeige, Unterhalt und Erfolge) */
export const shipEvolutionTier = (e: ShipEvolution): EvoTier => clampEvo(Math.round((e.hullTier + e.sailTier + e.cannonTier) / 3));

export const tierOf = (e: ShipEvolution, b: EvoBranch): EvoTier => e[BRANCH_FIELD[b]];

/** Fremde oder alte Daten säubern */
export function cleanEvolution(raw: unknown, d: ShipEvolution = newShipEvolution()): ShipEvolution {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { hullTier: clampEvo(o.hullTier, d.hullTier), sailTier: clampEvo(o.sailTier, d.sailTier), cannonTier: clampEvo(o.cannonTier, d.cannonTier) };
}

/** Der Zustand eines Schiffs im Spielstand: je Klasse (Schlüssel = Klassenindex als Text); fehlt ein Eintrag, gilt ein neues Schiff (1/1/1) */
export function evolutionOf(ship: { evo?: Record<string, ShipEvolution> }, classIndex: number): ShipEvolution {
  const e = ship.evo?.[String(classIndex)];
  return e ? cleanEvolution(e) : newShipEvolution();
}

// ---------- Abgeleitete Werte ----------

export interface EvoStats {
  hullHpK: number; hullArmorK: number;
  sailHpK: number; speedK: number; accelK: number; turnK: number;
  /** Anteil des Gegenwind-Tempoverlusts, der bleibt (1 = ganz, kleiner = besser am Wind) */
  upwindK: number;
  portsK: number; cannonDmgK: number; reloadK: number; penOffset: number;
  ram: boolean; swivel: boolean;
}

export function evoStats(e: ShipEvolution): EvoStats {
  return {
    hullHpK: evoK(HULL_HP_K, e.hullTier), hullArmorK: evoK(HULL_ARMOR_K, e.hullTier),
    sailHpK: evoK(SAIL_HP_K, e.sailTier), speedK: evoK(SAIL_SPEED_K, e.sailTier), accelK: evoK(SAIL_ACCEL_K, e.sailTier), turnK: evoK(SAIL_TURN_K, e.sailTier),
    upwindK: evoK(SAIL_UPWIND_K, e.sailTier),
    portsK: evoK(CANNON_PORTS_K, e.cannonTier), cannonDmgK: evoK(CANNON_DMG_K, e.cannonTier), reloadK: evoK(CANNON_RELOAD_K, e.cannonTier), penOffset: CANNON_PEN[e.cannonTier - 1],
    ram: e.hullTier >= RAM_MIN_TIER, swivel: e.cannonTier >= SWIVEL_MIN_TIER,
  };
}

/** Aktive Stückpforten einer Seite: der Anteil der Stufe an `total` Pforten, mindestens eine (Stufe 1 = 50 %, 2 = 75 %, ab 3 alle) */
export function activePorts(total: number, cannonTier: number): number {
  if (total <= 0) return 0;
  return Math.max(1, Math.min(total, Math.round(total * evoK(CANNON_PORTS_K, cannonTier))));
}

/** Welche der `total` Pforten bestückt sind: gleichmäßig über die Länge verteilt (Index 0 … total − 1) */
export function portIndices(total: number, count: number): number[] {
  const n = Math.max(0, Math.min(total, count));
  return Array.from({ length: n }, (_, i) => Math.min(total - 1, Math.floor(((i + 0.5) * total) / n)));
}

// ---------- Kosten, Material, Inzahlungnahme ----------

/** Gold für den Ausbau auf Stufe `targetTier` (2 … 5), ohne Hafen-Tarif; wächst mit der Schiffsklasse */
export function evoCost(classIndex: number, targetTier: number): number {
  const t = Math.max(2, Math.min(EVO_MAX, Math.round(targetTier)));
  return Math.round(EVO_COST[t - 1] * evoClassK(classIndex));
}

/** Welche Handelsware ein Ausbau braucht (nur Stufe 3 – 5): Rumpf Hartholz, Segel Tuch (Stufe 5 Seide), Kanonen Kanonenstahl; Menge wächst mit der Klasse */
export function evoMaterial(branch: EvoBranch, classIndex: number, targetTier: number): { good: GoodId; n: number } | null {
  const t = Math.round(targetTier);
  if (t < 3 || t > EVO_MAX) return null;
  const good: GoodId = branch === 'hull' ? 'hartholz' : branch === 'sail' ? (t >= 5 ? 'seide' : 'tuch') : 'kanonenstahl';
  return { good, n: Math.max(2, Math.ceil(EVO_MATERIAL[t - 1] * evoMaterialK(classIndex))) };
}

/** Goldwert aller Ausbauten eines Schiffs (Summe der Kosten bis zu den erreichten Stufen, ohne Tarif) */
export function evoValue(classIndex: number, e: ShipEvolution): number {
  let v = 0;
  for (const b of EVO_BRANCHES) for (let t = 2; t <= tierOf(e, b); t++) v += evoCost(classIndex, t);
  return v;
}

/** Inzahlungnahme: die Werft erstattet beim Kauf einer neuen Klasse die Hälfte des Goldwerts der Ausbauten des alten Schiffs (das Material ist verbaut) */
export const tradeInRefund = (classIndex: number, e: ShipEvolution): number => Math.round(evoValue(classIndex, e) * EVO_TRADE_IN);

// ---------- Beschreibung ----------

const pct = (k: number) => `${Math.round(k * 100)} %`;
/** Wirkung einer Stufe in einem Zweig als kurzer Satz (Werft und Kompendium) */
export function evoEffectText(branch: EvoBranch, tier: number): string {
  const t = clampEvo(tier);
  const st = evoStats(evolutionOfTier(t));
  if (branch === 'hull') return `Rumpf ${pct(st.hullHpK)} · Panzerung ${pct(st.hullArmorK)}${st.ram ? ` · Rammsporn${t >= 5 ? ' (panzerbrechend)' : ''}` : ' · stößt man frontal, schadet man sich selbst'}`;
  if (branch === 'sail') return `Segel-HP ${pct(st.sailHpK)} · Tempo ${pct(st.speedK)} · Wendigkeit ${pct(st.turnK)} · besser am Wind ${pct(1 - st.upwindK)}`;
  return `${pct(st.portsK)} der Stückpforten · Schaden ${pct(st.cannonDmgK)} · Nachladen ${pct(1 / st.reloadK)}${st.swivel ? ' · Deck-Drehbassen' : ''}`;
}

// ---------- Alte Spielstände ----------

/**
 * Alte Ausbaustufen (`ship.up`, 0 … 5 je Zweig) auf die neuen Stufen abbilden, so dass kein Schiff schwächer wird als vorher: die Grundwerte
 * entsprechen jetzt Stufe 3. Rumpf (+15 %/Stufe): 0 → 3, 1 → 4, ab 2 → 5. Segel (+5 % Tempo/Stufe): 0 → 3, 1–2 → 4, ab 3 → 5.
 * Kanonen (+12 %/Stufe): 0 → 3, 1 → 4, ab 2 → 5 (Schaden bis zu 4 Punkte weniger, dafür Durchschlag und Drehbassen).
 */
const LEGACY_HULL: readonly EvoTier[] = [3, 4, 5, 5, 5, 5];
const LEGACY_SAIL: readonly EvoTier[] = [3, 4, 4, 5, 5, 5];
const LEGACY_CANNON: readonly EvoTier[] = [3, 4, 5, 5, 5, 5];
export function legacyUpToEvo(up: unknown): ShipEvolution {
  const o = (up && typeof up === 'object' ? up : {}) as Record<string, unknown>;
  const lv = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(5, Math.floor(v))) : 0);
  return { hullTier: LEGACY_HULL[lv(o.hull)], sailTier: LEGACY_SAIL[lv(o.sail)], cannonTier: LEGACY_CANNON[lv(o.can)] };
}

// ---------- Kauf eines Schiffs ----------

/**
 * Neue Klasse kaufen (die Prüfungen von Rang und Gold macht der Aufrufer): die Werft nimmt das bisher gefahrene Schiff in Zahlung und erstattet 50 %
 * des Goldwerts seiner Ausbauten (es wird dafür auf Stufe 1 zurückgebaut, sonst ließe sich das Geld mehrfach holen); das neue Schiff beginnt auf
 * Stufe 1 in allen Zweigen. Verändert `ship.evo` und `ship.owned`, liefert den Erstattungsbetrag in Gold.
 */
export function applyShipPurchase(ship: { tier: number; owned: number[]; evo?: Record<string, ShipEvolution> }, newTier: number): { refund: number } {
  ship.evo ??= {};
  const refund = tradeInRefund(ship.tier, evolutionOf(ship, ship.tier));
  if (refund > 0) ship.evo[String(ship.tier)] = newShipEvolution();
  if (!ship.owned.includes(newTier)) ship.owned.push(newTier);
  ship.evo[String(newTier)] = newShipEvolution();
  return { refund };
}
