// Schiffs-Simulation ohne three.js: Segel-HP, Crew, Reparatur und die Wirkung auf Fahrt, Nachladen und Rumpf.
// Alles hier ist serialisierbarer Zustand (`ShipSimState`, nur Zahlen/Zeichenketten, Kennung = `shipId`) plus reine Funktionen.
// Das Schiff (`entities/ship/ship.ts`) hält einen solchen Zustand und stellt ihn dar; Absichten (`SailRepairIntent`,
// `CrewRefillIntent`) laufen durch `startRepair` / `refillCrew`, egal ob sie lokal oder später von einem Server kommen.
import type { AmmoDef } from '../data/ships';
import type { EntityId } from '../sim/entityId';
import type { CrewRefillIntent, RepairMaterial, SailRepairIntent } from '../sim/intents';
import { TROOPS, type TroopType } from '../data/troops';
import { clamp01 } from '../core/mathUtil';
import { BONUS_CAP, softCap } from '../data/balanceConfig';

// ---------- Crew (je Schiff, in Gruppen, damit ein Zwei-Stufen-System andocken kann) ----------

/** Eine Gruppe der Besatzung (Matrosen, Truppen). Weitere Stufen kommen als weiterer Eintrag in `CREW_POOLS`. */
export interface CrewPool { n: number; max: number }

export interface ShipCrewState {
  /** Schiff, zu dem die Besatzung gehört */
  shipId: EntityId;
  pools: Record<string, CrewPool>;
}

/**
 * Gruppen der Besatzung: Gewicht in der Crew-%, Verluste treffen die Gruppen in `casualty`-Reihenfolge (kleiner = zuerst).
 * Matrosen (Seeleute) bedienen Kanonen, Segel und Reparatur (Gewicht 1). Truppen (Massentruppen, nur Leviathan) zählen NICHT zur Crew-%
 * (Gewicht 0): sie wirken beim Entern und an Land (`boardingStrength`), fallen aber bei Beschuss als Erste. Offiziere sind keine Gruppe:
 * sie sind benannte Einzelpersonen (data/crew.ts) und sterben nie dauerhaft.
 */
export const CREW_POOLS: Record<string, { label: string; weight: number; casualty: number }> = {
  truppen: { label: 'Truppen', weight: 0, casualty: -1 },
  matrosen: { label: 'Matrosen', weight: 1, casualty: 0 },
};

/** Besatzungsstärke (Köpfe) je Schiffsklasse: `cls.crew` × 8 (Schaluppe 16, Leviathan 104) */
export const HEADS_PER_CREW_POINT = 8;

/**
 * Besatzung einer Klasse. `troopCap` > 0 legt zusätzlich den Truppen-Pool an (er startet leer: Truppen werden im Hafen angeheuert).
 */
export function makeCrew(shipId: EntityId, classCrew: number, troopCap = 0): ShipCrewState {
  const max = Math.max(4, Math.round(classCrew * HEADS_PER_CREW_POINT));
  const pools: Record<string, CrewPool> = { matrosen: { n: max, max } };
  if (troopCap > 0) pools.truppen = { n: 0, max: Math.round(troopCap) };
  return { shipId, pools };
}

/** Crew-% 0 … 1: gewichteter Anteil aller Gruppen */
export function crewFrac(c: ShipCrewState): number {
  let w = 0, v = 0;
  for (const [id, p] of Object.entries(c.pools)) {
    const def = CREW_POOLS[id] ?? { weight: 1 };
    w += def.weight; v += def.weight * (p.max > 0 ? p.n / p.max : 1);
  }
  return w > 0 ? v / w : 1;
}

export function crewHeads(c: ShipCrewState): { n: number; max: number } {
  let n = 0, max = 0;
  for (const p of Object.values(c.pools)) { n += p.n; max += p.max; }
  return { n, max };
}

/** Köpfe einer Gruppe (0, wenn das Schiff die Gruppe nicht hat) */
export const poolHeads = (c: ShipCrewState, pool: string): number => c.pools[pool]?.n ?? 0;

/** Anteil einer Gruppe 0 … 1 (0, wenn es sie nicht gibt) */
export const poolFrac = (c: ShipCrewState, pool: string): number => {
  const p = c.pools[pool];
  return p && p.max > 0 ? p.n / p.max : 0;
};

/** Verluste in Köpfen verteilen: zuerst die Truppen, dann die Matrosen (Reihenfolge `casualty`); Offiziere sind nie betroffen */
export function loseCrew(c: ShipCrewState, heads: number): number {
  let left = heads;
  const order = Object.keys(c.pools).sort((a, b) => (CREW_POOLS[a]?.casualty ?? 0) - (CREW_POOLS[b]?.casualty ?? 0));
  for (const id of order) {
    const p = c.pools[id];
    const take = Math.min(p.n, left);
    p.n -= take; left -= take;
    if (left <= 0) break;
  }
  return heads - left;
}

/** Seeleute (alle Gruppen mit Gewicht > 0) auf einen Anteil setzen (Spielstand, Tests); Truppen bleiben unberührt */
export function setCrewFrac(c: ShipCrewState, f: number) {
  for (const [id, p] of Object.entries(c.pools)) if ((CREW_POOLS[id]?.weight ?? 1) > 0) p.n = Math.max(0, Math.min(p.max, p.max * f));
}

/** Eine Gruppe auf eine Kopfzahl setzen (gerundet, höchstens bis zum Maximum) */
export function setPoolHeads(c: ShipCrewState, pool: string, heads: number): boolean {
  const p = c.pools[pool];
  if (!p) return false;
  p.n = Math.max(0, Math.min(p.max, Math.round(heads)));
  return true;
}

// ---------- Enterkraft der Truppen ----------

export interface BoardingStrength {
  /** Truppen-Köpfe an Bord */
  heads: number;
  /** Anteil der Truppen-Kapazität 0 … 1 */
  frac: number;
  /** Faktor auf die Durchschlagskraft (Schaden) der eigenen Enterer */
  damage: number;
  /** Faktor auf die Trefferpunkte der eigenen Enterer */
  hp: number;
}

/**
 * Enterkraft: wächst mit dem Truppen-Pool. Ohne Truppen (andere Klassen, leerer Pool) bleibt alles bei 1. Voller Pool: +45 % Durchschlagskraft
 * und +60 % Trefferpunkte für Offiziere und Enterer. Nachladen, Segeln und Reparatur hängen NICHT daran (siehe `crewEffects`, nur Seeleute).
 */
export function boardingStrength(c: ShipCrewState, out: BoardingStrength = { heads: 0, frac: 0, damage: 1, hp: 1 }, extra = 0): BoardingStrength {
  const f = poolFrac(c, 'truppen');
  out.heads = poolHeads(c, 'truppen');
  out.frac = f;
  // Truppen, Offiziers-Perks und Fraktions-Buffs (`extra`, Anteil) stapeln sich über einen weichen Deckel (data/balanceConfig.ts): bis +80 % voll, darüber asymptotisch bis +120 %
  out.damage = 1 + softCap(0.45 * f + extra, BONUS_CAP.boarding + 0.2, 0.8);
  out.hp = 1 + softCap(0.6 * f + extra, BONUS_CAP.boarding + 0.2, 0.8);
  return out;
}

// ---------- Wirkung der Crew ----------

export interface CrewEffects {
  /** Faktor auf die Nachladezeit der Kanonen (1 = volle Crew, 2,8 = niemand an den Geschützen) */
  reloadMult: number;
  /** Segel-Setzgeschwindigkeit in Anteilen der Segelfläche je Sekunde */
  sailSetRate: number;
  /** Passive Rumpfreparatur in Rumpfanteilen je Sekunde (nur nach einer Ruhepause ohne Treffer) */
  repairPerSec: number;
  /** Faktor auf die Dauer einer Reparatur auf See (1 = volle Crew) */
  repairTime: number;
}

/** Passive Rumpfreparatur bei voller Crew (Anteil des Rumpfs je Sekunde): etwa 5 Minuten von halb auf voll */
const REPAIR_PER_SEC_FULL = 0.0016;

export function crewEffects(frac: number, out: CrewEffects = { reloadMult: 1, sailSetRate: 0, repairPerSec: 0, repairTime: 1 }): CrewEffects {
  const c = clamp01(frac);
  out.reloadMult = 1 + 1.8 * Math.pow(1 - c, 1.2);
  out.sailSetRate = 0.36 * (0.12 + 0.88 * c);
  out.repairPerSec = c < 0.15 ? 0 : REPAIR_PER_SEC_FULL * Math.pow(c, 1.6);
  out.repairTime = 1 / (0.35 + 0.65 * c);
  return out;
}

// ---------- Segel ----------

/** Segel-HP: Höchstwert hängt an der Rumpfklasse */
export interface SailState { hp: number; max: number }
export const SAIL_HP_PER_HULL = 0.36;

/** Segelschaden je Punkt Kanonenschaden und `AmmoDef.sail`; trifft eine Kugel das Tuch (Segelzone), zählt mindestens `SAIL_ZONE_MIN` */
export const SAIL_DAMAGE_K = 0.7;
export const SAIL_ZONE_MIN = 0.7;
/** Ein Sturm allein reißt die Segel nie unter diesen Anteil (nur Beschuss kann sie ganz zerstören) */
export const STORM_SAIL_FLOOR = 0.2;
/** Segel-HP-Verlust je Sekunde im schwersten Sturm bei voll gesetztem Tuch (Anteil der Segel-HP) */
export const STORM_SAIL_RATE = 0.0035;

/** Fahrleistung nach Segelzustand (0 … 1 je Wert) */
export interface SailPerformance {
  /** Faktor auf das Höchsttempo */
  speed: number;
  /** Faktor auf die Beschleunigung */
  accel: number;
  /** Faktor auf die Wendigkeit */
  turn: number;
  /** Ohne Segel: das Schiff treibt mit Wind und Strömung, das Ruder greift nicht (0 … 1: wie stark es treibt) */
  drift: number;
}

/**
 * Stufenlose Kopplung: 100 % = volle Fahrt, unter 30 % stark verlangsamt (bei 30 % noch 45 % Tempo, bei 10 % etwa 18 %),
 * bei 0 % nur noch Treiben. Stetig und streng steigend, ohne Sprünge.
 */
export function sailCurve(f: number): number {
  const s = clamp01(f);
  if (s < 0.3) return 0.45 * Math.pow(s / 0.3, 1.15);
  return 0.45 + 0.55 * Math.pow((s - 0.3) / 0.7, 0.8);
}

export function sailPerformance(frac: number, out: SailPerformance = { speed: 1, accel: 1, turn: 1, drift: 0 }): SailPerformance {
  const c = sailCurve(frac);
  out.speed = c;
  out.accel = c * c * 0.4 + c * 0.6;
  out.turn = Math.pow(c, 0.85);
  out.drift = frac < 0.08 ? 1 - frac / 0.08 : 0;
  return out;
}

// ---------- Zustand des Schiffs ----------

export interface RepairJob {
  intent: SailRepairIntent;
  /** Verbleibende und Gesamtdauer (s) */
  left: number;
  total: number;
}

export interface ShipSimState {
  shipId: EntityId;
  hull: number;
  maxHull: number;
  sail: SailState;
  crew: ShipCrewState;
  /** Gesetzte Segelfläche 0 … 1: folgt dem Gashebel, so schnell wie die Crew das Tuch setzt */
  sailSet: number;
  /** Sekunden seit dem letzten Treffer (passive Reparatur beginnt nach einer Ruhepause) */
  sinceHit: number;
  repair: RepairJob | null;
}

export function createShipSim(shipId: EntityId, hull: number, classHp: number, classCrew: number, troopCap = 0): ShipSimState {
  return {
    shipId, hull, maxHull: hull,
    sail: { hp: Math.round(classHp * SAIL_HP_PER_HULL), max: Math.round(classHp * SAIL_HP_PER_HULL) },
    crew: makeCrew(shipId, classCrew, troopCap),
    sailSet: 0.55, sinceHit: 99, repair: null,
  };
}

/** Rumpfpunkte in der Enterphase: das Schiff hält sich gerade noch über Wasser (nie 0 durch normalen Schaden) */
export const ENTER_HULL = 1;

/**
 * Schiffe, die nie durch Kanonen oder Kräfte allein untergehen: Legenden (Piraten- und Marine-Legenden) und die zwei größten Klassen
 * (Linienschiff, Leviathan). In der Enterphase bleiben sie unzerstörbar; nur Entern beendet den Kampf.
 */
export function cannotBeSunk(o: { tier: number; legend?: boolean }): boolean {
  return !!o.legend || o.tier >= 5;
}

/**
 * Enterphase auslösen, wenn der Rumpf auf 0 fiele: Rumpf bleibt bei `ENTER_HULL`, die Segel sind ganz zerfetzt. Gilt nur für Schiffe, die
 * sie haben dürfen (Gegner). Liefert, ob die Phase jetzt beginnt.
 */
export function enterPhaseCheck(s: ShipSimState, canDisable: boolean, alreadyDisabled: boolean): boolean {
  if (!canDisable || alreadyDisabled || s.hull > 0) return false;
  s.hull = ENTER_HULL;
  s.sail.hp = 0;
  return true;
}

/** Gnadenstoß: wirkt nur auf ein Schiff in der Enterphase, das untergehen darf; liefert, ob es untergeht (Rumpf 0) */
export function finishingBlow(s: ShipSimState, noKill: boolean): boolean {
  if (noKill) return false;
  s.hull = 0;
  return true;
}

export const sailFrac = (s: ShipSimState) => (s.sail.max > 0 ? s.sail.hp / s.sail.max : 1);
export const hullFrac = (s: ShipSimState) => (s.maxHull > 0 ? s.hull / s.maxHull : 0);

export interface DamageResult { hull: number; sail: number; crewHeads: number }
const _dmg: DamageResult = { hull: 0, sail: 0, crewHeads: 0 };

/**
 * Kanonentreffer. `zone` 'sail' = die Kugel traf das Tuch über dem Deck (Rumpf kaum betroffen, Segel mindestens zu `SAIL_ZONE_MIN`),
 * 'hull' = Rumpf (Segel und Crew nur nebenbei). Kettenkugeln zerfetzen das Tuch in beiden Zonen am stärksten.
 */
export function applyDamage(s: ShipSimState, base: number, a: AmmoDef, zone: 'hull' | 'sail'): DamageResult {
  const hull = base * (zone === 'sail' ? Math.min(a.hull, 0.35) : a.hull);
  const sail = base * (zone === 'sail' ? Math.max(a.sail, SAIL_ZONE_MIN) : a.sail) * SAIL_DAMAGE_K;
  // Basis sind die Matrosen (wie vor den Truppen): die Truppen fangen die Verluste nur zuerst ab, sie vergrößern sie nicht
  const heads = (base * a.crew * (zone === 'sail' ? 0.4 : 1)) / s.maxHull * 1.4 * (s.crew.pools.matrosen?.max ?? crewHeads(s.crew).max);
  s.hull = Math.max(0, s.hull - hull);
  s.sail.hp = Math.max(0, s.sail.hp - sail);
  const lost = loseCrew(s.crew, heads);
  s.sinceHit = 0;
  _dmg.hull = hull; _dmg.sail = sail; _dmg.crewHeads = lost;
  return _dmg;
}

/**
 * Schwerer Sturm: das gesetzte Tuch leidet. `severity` 0 … 1 (0 = ruhige See). Gerefftes Tuch (`sailSet` klein) hält deutlich länger.
 * Liefert den Verlust an Segel-HP. Unter `STORM_SAIL_FLOOR` reißt der Sturm allein nichts mehr.
 */
export function applyStorm(s: ShipSimState, dt: number, severity: number): number {
  if (severity <= 0.02 || s.sail.hp <= 0) return 0;
  const floor = s.sail.max * STORM_SAIL_FLOOR;
  if (s.sail.hp <= floor) return 0;
  const loss = severity * severity * (0.2 + 0.8 * s.sailSet) * STORM_SAIL_RATE * s.sail.max * dt;
  const take = Math.min(loss, s.sail.hp - floor);
  s.sail.hp -= take;
  return take;
}

/** Segelfläche dem Ziel (Gashebel 0 … 1) nähern: so schnell, wie die Crew arbeitet (Reffen geht schneller als Setzen) */
export function stepSailSet(s: ShipSimState, target: number, dt: number, fx: CrewEffects) {
  const d = target - s.sailSet;
  const rate = fx.sailSetRate * (d < 0 ? 1.8 : 1);
  s.sailSet += Math.max(-rate * dt, Math.min(rate * dt, d));
}

/** Passive Rumpfreparatur durch die Crew (nach `sinceHit` ≥ 8 s); `bonusPerSec` in Rumpfpunkten (z. B. Schiffskoch). Liefert die Heilung. */
export function stepPassiveRepair(s: ShipSimState, dt: number, fx: CrewEffects, bonusPerSec = 0): number {
  s.sinceHit += dt;
  if (s.hull <= 0 || s.hull >= s.maxHull || s.sinceHit < 8) return 0;
  // der Bonus (Koch, Zimmermann) wirkt nur, solange genug Leute da sind: skaliert mit crew^1,6, derselben Größe wie die Grundreparatur
  const add = Math.min(s.maxHull - s.hull, (fx.repairPerSec * s.maxHull + bonusPerSec * (fx.repairPerSec / REPAIR_PER_SEC_FULL)) * dt);
  s.hull += add;
  return add;
}

// ---------- Reparatur ----------

/** Was ein Material ausbessert (Anteile von Segel-HP und Rumpf) und wie lange es dauert (s, bei voller Crew) */
export const REPAIR_MATERIALS: Record<RepairMaterial, { label: string; sail: number; hull: number; time: number }> = {
  segeltuch: { label: 'Segeltuch', sail: 0.4, hull: 0, time: 5 },
  planken: { label: 'Holzplanken', sail: 0.15, hull: 0.12, time: 6 },
  hafen: { label: 'Werft', sail: 1, hull: 1, time: 0 },
  // ohne Material: die Crew näht aus Segelresten ein Notsegel (nur wenn das Tuch fast ganz fehlt), damit man nie hilflos treibt
  notsegel: { label: 'Notsegel', sail: 0.15, hull: 0, time: 12 },
};

/** Gibt es etwas zu flicken? */
export function needsRepair(s: ShipSimState, material: RepairMaterial): boolean {
  const m = REPAIR_MATERIALS[material];
  if (material === 'notsegel') return s.sail.hp < s.sail.max * m.sail - 0.5;
  return (m.sail > 0 && s.sail.hp < s.sail.max - 0.5) || (m.hull > 0 && s.hull < s.maxHull - 0.5);
}

/** Wirkt die Reparatur sofort an? (Werft) */
export function applyRepair(s: ShipSimState, material: RepairMaterial): { sail: number; hull: number } {
  const m = REPAIR_MATERIALS[material];
  // Notsegel hebt das Tuch nur bis zu seinem Anteil an (nicht darüber hinaus)
  const sail = material === 'notsegel' ? Math.max(0, m.sail * s.sail.max - s.sail.hp) : Math.min(s.sail.max - s.sail.hp, m.sail * s.sail.max);
  const hull = s.hull > 0 ? Math.min(s.maxHull - s.hull, m.hull * s.maxHull) : 0;
  s.sail.hp += sail; s.hull += hull;
  return { sail, hull };
}

/** Reparatur beginnen (Absicht prüfen); false, wenn schon eine läuft oder nichts zu tun ist oder die Kennung nicht zum Schiff passt */
export function startRepair(s: ShipSimState, intent: SailRepairIntent, fx: CrewEffects): boolean {
  if (intent.shipId !== s.shipId || s.repair || s.hull <= 0 || !needsRepair(s, intent.material)) return false;
  if (intent.material === 'hafen') { applyRepair(s, 'hafen'); return true; }
  const total = REPAIR_MATERIALS[intent.material].time * fx.repairTime;
  s.repair = { intent, left: total, total };
  return true;
}

/** Laufende Reparatur vorrücken; liefert die fertige Absicht samt Wirkung, sonst null */
export function stepRepair(s: ShipSimState, dt: number): { intent: SailRepairIntent; sail: number; hull: number } | null {
  const r = s.repair;
  if (!r) return null;
  r.left -= dt;
  if (r.left > 0) return null;
  s.repair = null;
  return { intent: r.intent, ...applyRepair(s, r.intent.material) };
}

// ---------- Besatzung auffüllen (Taverne, Hafen) ----------

/** Preis je angeheuertem Seemann (Gold), wächst mit der Klasse */
export const crewPricePerHead = (tier: number) => 6 + tier * 3;

/** Fehlende Köpfe (aller Gruppen oder nur einer) */
export function missingHeads(c: ShipCrewState, pool?: string): number {
  if (pool) { const p = c.pools[pool]; return p ? Math.max(0, Math.round(p.max - p.n)) : 0; }
  const h = crewHeads(c);
  return Math.max(0, Math.round(h.max - h.n));
}

/** Preis je angeheuertem Truppenkopf (Gold) eines Typs */
export const troopPricePerHead = (typ: TroopType) => TROOPS[typ].price;

/**
 * Besatzung aufstocken; liefert die angeheuerten Köpfe. `intent.pool` nennt die Gruppe ('matrosen', 'truppen'); ohne Angabe füllen
 * alle Gruppen auf (Gruppe mit der höchsten `casualty` zuerst).
 */
export function refillCrew(c: ShipCrewState, intent: CrewRefillIntent): number {
  if (intent.shipId !== c.shipId) return 0;
  let left = intent.heads ?? Infinity;
  let added = 0;
  const ids = intent.pool ? Object.keys(c.pools).filter((id) => id === intent.pool) : Object.keys(c.pools);
  const order = ids.sort((a, b) => (CREW_POOLS[b]?.casualty ?? 0) - (CREW_POOLS[a]?.casualty ?? 0));
  for (const id of order) {
    const p = c.pools[id];
    const add = Math.min(p.max - p.n, left);
    p.n += add; left -= add; added += add;
  }
  return added;
}

// ---------- Anzeige ----------

/** Erklärung für das Schiffs-HUD: was Segel-% und Crew-% gerade bewirken */
export function shipTooltip(s: ShipSimState): string {
  const sf = sailFrac(s), cf = crewFrac(s.crew);
  const sp = sailPerformance(sf), fx = crewEffects(cf);
  const sailors = s.crew.pools.matrosen ?? { n: 0, max: 0 };
  const troops = s.crew.pools.truppen;
  const bs = boardingStrength(s.crew);
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const sailNote = sf <= 0.0001 ? 'manövrierunfähig – das Schiff treibt' : sf < 0.3 ? 'stark verlangsamt' : sf < 1 ? 'beschädigt' : 'volle Fahrt';
  return [
    `Segel ${pct(sf)} (${Math.round(s.sail.hp)}/${s.sail.max}): ${sailNote}. Höchsttempo ${pct(sp.speed)}, Beschleunigung ${pct(sp.accel)}, Wendigkeit ${pct(sp.turn)}.`,
    `Crew ${pct(cf)} (${Math.round(sailors.n)}/${sailors.max} Seeleute): Nachladen ×${fx.reloadMult.toFixed(1)} der Zeit, Segel setzen ${pct(fx.sailSetRate / 0.36)}, Rumpfreparatur ${cf < 0.15 ? 'keine' : pct(Math.pow(cf, 1.6))}.`,
    ...(troops ? [`Truppen ${Math.round(troops.n)}/${troops.max}: Enterkraft +${Math.round((bs.damage - 1) * 100)} % Schaden, +${Math.round((bs.hp - 1) * 100)} % Trefferpunkte – bei Beschuss fallen zuerst die Truppen, dann die Seeleute.`] : []),
    'Segel flicken: Segeltuch oder Holzplanken (Taste G), ohne Material ein Notsegel. Crew auffüllen: Taverne oder Werft.',
  ].join('\n');
}
