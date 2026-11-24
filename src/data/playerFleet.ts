// Spieler-Flotte (Phase 4.2D): bis zu drei Begleitschiffe neben dem Flaggschiff. Reine, JSON-taugliche Daten und Regeln ohne three.js: Plätze nach Rang,
// Speicherform samt Bereinigung, Einsetzen/Einmotten, Sold, Befehle und die Geometrie der See-Formation. Das Verhalten auf See steht in
// `naval/naval.ts` (`NavalSystem.setFleet`) und `naval/shipSteering.ts`; die Verwaltung im Spiel in `Game.fleet*`.
//
// Ein Begleitschiff ist ein BESESSENES Schiff (Klasse in `ship.owned`), das nicht gerade das Flaggschiff ist: jede Klasse gibt es einmal. Seine Ausbaustufen
// stehen weiter in `ship.evo[Klasse]` (eine Quelle); der Eintrag hier hält eine Kopie für Anzeige und Spielstand und wird beim Laden gegen sie abgeglichen.
import { SHIP_CLASSES, type ShipLook } from './ships';
import { BRANCH_FIELD, EVO_MAX, cleanEvolution, newShipEvolution, shipEvolutionTier, type EvoBranch, type EvoTier, type ShipEvolution } from './shipEvolution';
import { UPKEEP } from './economy';
import { EVO_UPKEEP_MAX } from './balanceConfig';
import { HEADS_PER_CREW_POINT } from '../naval/shipSim';
import { clamp, clamp01 } from '../core/mathUtil';
import { isRecord } from '../core/sanitize';
import type { ActionId } from './actions';

// ---------- Plätze nach Ruhm-Rang ----------

/** Rang, ab dem der 1., 2. und 3. Begleitschiff-Platz offen ist: Rang 4 – 5 → 1 Platz, 6 – 7 → 2, ab 8 → 3 (insgesamt höchstens vier eigene Schiffe auf See) */
export const FLEET_UNLOCK_RANKS: readonly number[] = [4, 6, 8];
export const FLEET_MAX = FLEET_UNLOCK_RANKS.length;

/** Freie Begleitschiff-Plätze eines Rangs (0 … 3); Unsinn zählt als Rang 0 */
export function fleetSlots(rank: number): number {
  const r = Number.isFinite(rank) ? rank : 0;
  let n = 0;
  for (const need of FLEET_UNLOCK_RANKS) if (r >= need) n++;
  return n;
}

// ---------- Befehle ----------

export type FleetOrder = 'hold' | 'attack' | 'rally';
export const FLEET_ORDERS: { id: FleetOrder; label: string; short: string; desc: string }[] = [
  { id: 'hold', label: 'Formation halten', short: 'Formation', desc: 'Die Begleitschiffe eskortieren das Flaggschiff und feuern nur zur Selbstverteidigung auf Gegner in der Nähe.' },
  { id: 'attack', label: 'Feuer frei / Angreifen', short: 'Feuer frei', desc: 'Die Begleitschiffe greifen feindliche Schiffe in Reichweite selbstständig an, mit Breitseite und (ab Rumpf-Stufe 4) Rammsporn.' },
  { id: 'rally', label: 'Sammeln / Rückzug', short: 'Sammeln', desc: 'Die Begleitschiffe brechen jede Verfolgung ab und kehren sofort zum Flaggschiff zurück.' },
];
/** Aktion (Taste, Gamepad-Kombination, Knopf) je Befehl: Anzeige und Auswertung nutzen dieselbe Zuordnung */
export const FLEET_ORDER_ACTIONS: Record<FleetOrder, ActionId> = { hold: 'fleetHold', attack: 'fleetAttack', rally: 'fleetRally' };
export const isFleetOrder = (v: unknown): v is FleetOrder => v === 'hold' || v === 'attack' || v === 'rally';

// ---------- Zustand (Spielstand) ----------

export type FleetStatus = 'active' | 'docked';

export interface FleetShipRecord {
  /** Stabile Kennung (`fleet-<Klasse>`): jede Klasse gibt es einmal */
  fleetShipId: string;
  shipClass: number;
  /** Ausbaustufen Rumpf, Segel, Kanonen (1 … 5), Kopie von `ship.evo[Klasse]` */
  evo: ShipEvolution;
  look: ShipLook;
  /** Rumpf und Segel-HP als Anteil 0 … 1 */
  hp: number;
  sailHp: number;
  /** aktiv = fährt mit (zählt gegen die Plätze, kostet Sold); eingemottet = liegt im Hafen (kostet nichts) */
  status: FleetStatus;
}

export interface FleetState { ships: FleetShipRecord[]; order: FleetOrder }

export const emptyFleet = (): FleetState => ({ ships: [], order: 'hold' });
export const fleetIdOf = (shipClass: number): string => `fleet-${shipClass}`;
export const activeShips = (f: FleetState): FleetShipRecord[] => f.ships.filter((s) => s.status === 'active');
export const activeCount = (f: FleetState): number => activeShips(f).length;
export const fleetShip = (f: FleetState, id: string): FleetShipRecord | undefined => f.ships.find((s) => s.fleetShipId === id);
/** Ein Schiff, das nach einem Untergang oder bei Totalschaden in den Hafen geschleppt wird, behält so viel Rumpf */
export const TOWED_HP = 0.25;

/** Was die Bereinigung über den Spielstand wissen muss */
export interface FleetCtx {
  /** Besessene Klassen, Klasse des Flaggschiffs, Ausbaustufen je Klasse (`ship.evo`) und das Aussehen des Flaggschiffs (Standard für fehlende Angaben) */
  owned: readonly number[];
  flagship: number;
  evo: Record<string, ShipEvolution>;
  look: ShipLook;
  /** Freie Plätze (aus dem Rang): mehr aktive Schiffe werden eingemottet */
  slots: number;
}

/**
 * Fremde oder alte Daten säubern (Spielstand laden, importieren): nur besessene Klassen außer dem Flaggschiff, jede höchstens einmal, Werte begrenzt,
 * Ausbaustufen aus `ship.evo` (eine Quelle), nie mehr aktive Schiffe als Plätze (der Rest wird eingemottet, in der Reihenfolge der Liste behalten die ersten ihren Platz).
 */
export function cleanFleet(raw: unknown, ctx: FleetCtx): FleetState {
  const o = isRecord(raw) ? raw : {};
  const seen = new Set<number>();
  const ships: FleetShipRecord[] = [];
  const list: unknown[] = Array.isArray(o.ships) ? o.ships : [];
  for (const it of list) {
    if (!isRecord(it)) continue;
    const c = typeof it.shipClass === 'number' && Number.isFinite(it.shipClass) ? Math.floor(it.shipClass) : -1;
    if (c < 0 || c >= SHIP_CLASSES.length || c === ctx.flagship || !ctx.owned.includes(c) || seen.has(c)) continue;
    seen.add(c);
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : d);
    ships.push({
      fleetShipId: fleetIdOf(c), shipClass: c,
      evo: cleanEvolution(ctx.evo[String(c)] ?? it.evo, newShipEvolution()),
      look: isRecord(it.look) ? { ...ctx.look, ...(it.look as Partial<ShipLook>) } : { ...ctx.look },
      hp: Math.max(0.05, num(it.hp, 1)), sailHp: num(it.sailHp, 1),
      status: it.status === 'active' ? 'active' : 'docked',
    });
  }
  let free = Math.max(0, Math.min(FLEET_MAX, Math.floor(ctx.slots)));
  for (const s of ships) { if (s.status === 'active') { if (free > 0) free--; else s.status = 'docked'; } }
  return { ships, order: isFleetOrder(o.order) ? o.order : 'hold' };
}

/** Besessene Klassen, die als Begleiter taugen: nicht das Flaggschiff und noch nicht in der Flotte (aufsteigend) */
export function assignableClasses(owned: readonly number[], flagship: number, fleet: FleetState): number[] {
  return [...new Set(owned)].filter((c) => c !== flagship && c >= 0 && c < SHIP_CLASSES.length && !fleetShip(fleet, fleetIdOf(c))).sort((a, b) => a - b);
}

export type FleetResult = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): FleetResult => ({ ok: false, reason });

/** Platz frei? (aktive Schiffe gegen die Plätze des Rangs) */
export const hasFreeSlot = (f: FleetState, slots: number): boolean => activeCount(f) < Math.min(FLEET_MAX, Math.max(0, slots));

/** Ein besessenes Schiff einsetzen (neu in die Flotte, aktiv): braucht einen freien Platz und darf nicht das Flaggschiff sein */
export function assignShip(f: FleetState, shipClass: number, ctx: FleetCtx): FleetResult {
  if (!Number.isInteger(shipClass) || shipClass < 0 || shipClass >= SHIP_CLASSES.length) return fail('Unbekannte Schiffsklasse.');
  if (!ctx.owned.includes(shipClass)) return fail('Dieses Schiff besitzt du nicht.');
  if (shipClass === ctx.flagship) return fail('Das Flaggschiff fährt ohnehin mit.');
  if (fleetShip(f, fleetIdOf(shipClass))) return fail('Dieses Schiff gehört schon zur Flotte.');
  if (!hasFreeSlot(f, ctx.slots)) return fail(ctx.slots <= 0 ? 'Noch kein Platz frei: Begleitschiffe gibt es ab Rang 4.' : 'Alle Plätze sind belegt: motte erst ein Schiff ein.');
  f.ships.push({ fleetShipId: fleetIdOf(shipClass), shipClass, evo: { ...(ctx.evo[String(shipClass)] ?? newShipEvolution()) }, look: { ...ctx.look }, hp: 1, sailHp: 1, status: 'active' });
  return { ok: true };
}

/** Ein eingemottetes Schiff wieder aktivieren (braucht einen freien Platz) */
export function activateShip(f: FleetState, id: string, slots: number): FleetResult {
  const s = fleetShip(f, id);
  if (!s) return fail('Dieses Schiff gehört nicht zur Flotte.');
  if (s.status === 'active') return { ok: true };
  if (!hasFreeSlot(f, slots)) return fail('Alle Plätze sind belegt: motte erst ein Schiff ein.');
  s.status = 'active';
  return { ok: true };
}

/** Ein aktives Schiff einmotten: es bleibt in der Flotte, liegt im Hafen und kostet keinen Sold */
export function dockShip(f: FleetState, id: string): FleetResult {
  const s = fleetShip(f, id);
  if (!s) return fail('Dieses Schiff gehört nicht zur Flotte.');
  s.status = 'docked';
  return { ok: true };
}

/** Ein Schiff aus der Flotte nehmen (Eintrag löschen; das Schiff bleibt in deinem Besitz) */
export function releaseShip(f: FleetState, id: string): FleetResult {
  const i = f.ships.findIndex((s) => s.fleetShipId === id);
  if (i < 0) return fail('Dieses Schiff gehört nicht zur Flotte.');
  f.ships.splice(i, 1);
  return { ok: true };
}

/** Untergang auf See: das Schiff wird in den Hafen geschleppt (eingemottet, nur noch `TOWED_HP` Rumpf, Segel zerfetzt) – ein Begleitschiff geht nie endgültig verloren */
export function towShip(f: FleetState, id: string): void {
  const s = fleetShip(f, id);
  if (!s) return;
  s.status = 'docked'; s.hp = TOWED_HP; s.sailHp = TOWED_HP;
}

// ---------- Sold ----------

/** Seeleute-Köpfe einer Klasse bei voller Crew (wie `makeCrew`: Crew-Punkte × 8, mindestens 4) */
export const fleetCrewHeads = (shipClass: number): number => Math.max(4, Math.round(SHIP_CLASSES[clamp(Math.floor(shipClass), 0, SHIP_CLASSES.length - 1)].crew * HEADS_PER_CREW_POINT));

/** Was ein Begleitschiff je Ingame-Tag kostet: Sold der Seeleute und Wartung der Klasse (wächst mit der Gesamtstufe der Ausbauten wie beim Flaggschiff); keine Offiziere, keine Truppen */
export function shipUpkeepDaily(i: { tier: number; seamen: number; evoTier: number }): { seamen: number; hull: number; daily: number } {
  const evoK = 1 + EVO_UPKEEP_MAX * (clamp(Math.round(i.evoTier), 1, 5) - 1) / 4;
  const hull = UPKEEP.hull[clamp(Math.floor(i.tier), 0, UPKEEP.hull.length - 1)] * evoK;
  const seamen = Math.max(0, i.seamen) * UPKEEP.seaman;
  return { seamen, hull, daily: seamen + hull };
}

/** Täglicher Sold samt Wartung eines Eintrags (auch eines eingemotteten: so sieht man vor dem Einsetzen, was es kostet) */
export function fleetShipUpkeep(rec: Pick<FleetShipRecord, 'shipClass' | 'evo'>): { seamen: number; hull: number; daily: number } {
  return shipUpkeepDaily({ tier: rec.shipClass, seamen: fleetCrewHeads(rec.shipClass), evoTier: shipEvolutionTier(rec.evo) });
}

/** Eintrag für den Gesamtsold (siehe `economyEngine.upkeepOf`): nur aktive Schiffe zahlen */
export function fleetUpkeepList(f: FleetState): { tier: number; seamen: number; evoTier: number }[] {
  return activeShips(f).map((s) => ({ tier: s.shipClass, seamen: fleetCrewHeads(s.shipClass), evoTier: shipEvolutionTier(s.evo) }));
}

/** Zusätzlicher Tages-Sold der ganzen aktiven Flotte */
export const fleetUpkeepDaily = (f: FleetState): number => activeShips(f).reduce((n, s) => n + fleetShipUpkeep(s).daily, 0);

// ---------- Kampfwerte ----------

/** Kanonenschaden eines Begleitschiffs im Verhältnis zu dem eines Schiffs des Spielers gleicher Stufe (die Besatzung zielt schlechter als der Kapitän) */
export const FLEET_DMG_K = 0.7;

// ---------- Formation auf See ----------

/** Plätze rund um das Flaggschiff: Backbord-Flanke, Steuerbord-Flanke, Nachhut (in dieser Reihenfolge besetzt) */
export type FormationSlot = 'port' | 'starboard' | 'rear';
export const FORMATION_SLOTS: readonly FormationSlot[] = ['port', 'starboard', 'rear'];
export const FORMATION_LABEL: Record<FormationSlot, string> = { port: 'Backbord-Flanke', starboard: 'Steuerbord-Flanke', rear: 'Nachhut' };
export const formationSlotOf = (index: number): FormationSlot => FORMATION_SLOTS[clamp(Math.floor(index), 0, FORMATION_SLOTS.length - 1)];

export interface Hull2 { L: number; W: number }
export interface FormationOffset {
  /** Abstand seitlich vom Flaggschiff (m, positiv = Backbord/links) und längs (m, positiv = voraus, negativ = achteraus), in Schiffsachsen des Flaggschiffs */
  side: number;
  ahead: number;
}

/** Bewegung des Flaggschiffs: Tempo (m/s) und Drehgeschwindigkeit des Bugs (rad/s, positiv = der Bug dreht nach Backbord/links, wie `heading` wächst) */
export interface FlagMotion { speed: number; yawRate: number }

/** Ab dieser Drehgeschwindigkeit (rad/s) gilt das Flaggschiff als in der Kurve */
export const FLEET_TURN_RATE = 0.03;

/**
 * Platz eines Begleitschiffs im Schiffssystem des Flaggschiffs. Alle Maße wachsen mit beiden Schiffsgrößen: die Flanken liegen mindestens 14 m + 30 % der
 * Längensumme neben dem Rumpf, die Nachhut mindestens 28 m + 20 % der Flaggschiff-Länge hinter dem Heck; so berühren sich nie zwei Rümpfe, auch nicht
 * Leviathan neben Schaluppe. Die Flanken liegen etwas achterlich der Mitte, damit das Flaggschiff als Erstes in den Wind kommt.
 */
export function formationOffset(slot: FormationSlot, flag: Hull2, own: Hull2, out: FormationOffset = { side: 0, ahead: 0 }, mo?: FlagMotion, behindRear = 0): FormationOffset {
  if (slot === 'rear') { out.side = 0; out.ahead = -(0.5 * (flag.L + own.L) + 28 + 0.2 * flag.L); return out; }
  const gap = 0.5 * (flag.W + own.W) + 14 + 0.3 * (flag.L + own.L);
  out.side = slot === 'port' ? gap : -gap;
  out.ahead = -0.1 * flag.L;
  // Enge Kurve: liegt der Platz auf der Innenseite näher am Drehpunkt, als ein Schiff dort fahren kann (Kurvenradius des Flaggschiffs minus Seitenabstand), würde er rückwärts
  // laufen und das Begleitschiff quer vor das Flaggschiff treiben. Dann fällt es in die Kiellinie zurück (Nachhut, bei besetzter Nachhut dahinter) und kehrt nach der Kurve auf seine Flanke zurück.
  if (mo && Math.abs(mo.yawRate) > FLEET_TURN_RATE && mo.speed > 1) {
    const radius = mo.speed / Math.abs(mo.yawRate);
    const inner = (out.side > 0) === (mo.yawRate > 0);
    if (inner && radius - Math.abs(out.side) < 0.75 * own.L + 25) { out.side = 0; out.ahead = -(0.5 * (flag.L + own.L) + 28 + 0.2 * flag.L) - behindRear; }
  }
  return out;
}

/**
 * Tempo, mit dem der Platz selbst läuft (m/s): auf der Außenseite einer Kurve schneller als das Flaggschiff, innen langsamer (`v − Drehrate · Seitenabstand`, positiver Abstand
 * = Backbord). Das Begleitschiff fährt dieses Tempo statt dem des Flaggschiffs und bleibt so in der Kurve auf seinem Platz.
 */
export const slotSpeed = (flagSpeed: number, yawRate: number, side: number): number => Math.max(0, flagSpeed - yawRate * side);

export interface FlagPose { x: number; z: number; heading: number; L: number; W: number }

/** Platz in Weltkoordinaten (Bug voraus = (sin h, cos h), Backbord = (cos h, −sin h)) */
export function formationPoint(slot: FormationSlot, flag: FlagPose, own: Hull2, out: { x: number; z: number } = { x: 0, z: 0 }, mo?: FlagMotion, behindRear = 0, offOut?: FormationOffset): { x: number; z: number } {
  const o = formationOffset(slot, flag, own, offOut ?? _off, mo, behindRear);
  const fx = Math.sin(flag.heading), fz = Math.cos(flag.heading), lx = Math.cos(flag.heading), lz = -Math.sin(flag.heading);
  out.x = flag.x + fx * o.ahead + lx * o.side;
  out.z = flag.z + fz * o.ahead + lz * o.side;
  return out;
}
const _off: FormationOffset = { side: 0, ahead: 0 };

/**
 * Wunschtempo in der Formation (m/s): das des Flaggschiffs, korrigiert um den Rückstand zum Platz (`behind` in m, positiv = der Platz liegt weiter voraus als das
 * Schiff): höchstens +4 m/s zum Aufschließen; liegt der Platz achteraus, bremst das Schiff mit dem Viertel des Abstands bis zum Stillstand (ein Platz 40 m hinter dem
 * Schiff heißt: stehen bleiben und das Flaggschiff vorbeilassen, nie überholen). Nie unter 0.
 */
export function escortSpeed(flagSpeed: number, behind: number): number {
  return Math.max(0, flagSpeed + clamp(behind * 0.25, -Math.max(0, flagSpeed), 4));
}

/** Ab dieser Entfernung zum Flaggschiff (m) werden Nachzügler direkt auf ihren Platz gesetzt (Schnellreise, Heimschleppen, Raid-Wechsel, Boost) */
export const FLEET_RECALL_DIST = 700;
/** Beim Ankern halten Begleitschiffe mindestens so viel Abstand (m) zu allen Stegen und zur Küste */
export const FLEET_ANCHOR_CLEAR = 45;
/** Gegner, auf die ein Begleitschiff je Befehl feuert bzw. losfährt: Reichweite um das Begleitschiff und um das Flaggschiff (m); `hold` nur Selbstverteidigung */
export const FLEET_ORDER_RANGE: Record<FleetOrder, { self: number; leash: number }> = {
  hold: { self: 110, leash: 300 },
  attack: { self: 360, leash: 520 },
  rally: { self: 0, leash: 0 },
};

/**
 * Startpunkt eines Begleitschiffs neben dem Flaggschiff: erst sein Platz der Formation, dann die Nachhut, dann immer weiter hinter dem Flaggschiff (bis 600 m).
 * `free(x, z)` meldet offenes Wasser mit dem verlangten Abstand zu Küste und Stegen. Liefert false, wenn nirgends Platz war (dann steht `out` auf dem letzten
 * Versuch). Rein: dieselbe Rechnung für Auslaufen, Schnellreise und Tests.
 */
export function fleetSpawnPoint(index: number, flag: FlagPose, own: Hull2, free: (x: number, z: number) => boolean, out: { x: number; z: number }): boolean {
  let ok = false;
  for (const slot of [formationSlotOf(index), 'rear' as const]) { formationPoint(slot, flag, own, out); ok = free(out.x, out.z); if (ok) return true; }
  for (let back = 100; back <= 600; back += 100) { out.x = flag.x - Math.sin(flag.heading) * back; out.z = flag.z - Math.cos(flag.heading) * back; ok = free(out.x, out.z); if (ok) return true; }
  return ok;
}

/**
 * Direkter Ausbau eines Begleitschiffs (Werft → Flotte, Phase 4.3D): hebt einen Zweig um eine Stufe, in der einen Quelle `ship.evo[Klasse]` und im
 * Eintrag der Flotte (beide gleich). Prüft nur Flotte und Stufe; Gold, Material, Siegel und Tore bucht und prüft das Spiel vorher.
 */
export function applyFleetEvo(ship: { evo?: Record<string, ShipEvolution> }, f: FleetState, id: string, branch: EvoBranch): FleetResult & { next?: number } {
  const rec = fleetShip(f, id);
  if (!rec) return fail('Dieses Schiff gehört nicht zur Flotte.');
  const cur = cleanEvolution(ship.evo?.[String(rec.shipClass)] ?? rec.evo, rec.evo);
  const field = BRANCH_FIELD[branch];
  if (cur[field] >= EVO_MAX) return fail('Höchste Stufe erreicht.');
  const next = (cur[field] + 1) as EvoTier;
  const after: ShipEvolution = { ...cur, [field]: next };
  (ship.evo ??= {})[String(rec.shipClass)] = after;
  rec.evo = { ...after };
  return { ok: true, next };
}
