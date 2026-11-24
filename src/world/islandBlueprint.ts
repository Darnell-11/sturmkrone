// IslandBlueprint (Phase 4.3B): die reinen Daten einer Insel, berechnet beim Weltstart allein aus ihrer Definition und ihrem Seed – ohne ein
// einziges three.js-Netz oder Material. Rein (ohne three.js) und JSON-tauglich bis auf nichts: Küste und Hügel, Böschung, Kollisionsradius und
// Wasserlinie, Rasterzellen, Stege (Liegeplätze), Markt (Profil und Gleichgewichtsvorrat), Ring, Gefahr, Sektor, Besitz und Entdeckung.
//
// Erst wenn der WorldStreamer eine Insel auf ACTIVE_HIGH holt, entstehen aus dem Blueprint die Netze (SeaWorld.islandStages). Beim ersten dieser
// Aufbauten fallen die Bau-Daten an, die heute nur zusammen mit den Netzen entstehen können (Hindernisse und Einebnungen unter Häusern, Feuerstellen,
// Dorfmitte, Wachrunden): sie bleiben danach dauerhaft in der Welt, jeder spätere Aufbau rechnet sie identisch nach und verwirft seine Kopie.
import type { IslandDef, IslandKind, IslandStyle, RegionDef } from '../data/regions';
import type { DangerTier } from '../data/balanceConfig';
import type { RingId } from '../data/worldRings';
import type { FactionId } from '../data/factions';
import { GOODS, profileOf, type GoodId, type MarketProfile } from '../data/economy';
import { eqStockOf } from '../core/economyEngine';
import { SITES, type SiteDef } from '../data/settlements';
import { coastK, coastMax, fitHills, ISLAND_BOUND_K, makeIslandShape, shelfOf, WATERLINE, type Hill, type Pier, type WalkIsland } from './islandGround';
import { hashId, seeded } from './waves';
import { chunkCoord, chunkKey, CHUNK_SIZE } from './worldGrid';
import type { IslandShape } from './ocean';

/** Steg der kleinen Außenposten-Häfen (ohne Siedlung): von 5 m vor bis 60 m hinter der Küste, quer zum Weltmittelpunkt */
export const OUTPOST_PIER = { from: -5, to: 60 };

const RAD = Math.PI / 180;

export interface IslandBlueprint {
  id: string;
  index: number;
  name: string;
  x: number;
  z: number;
  r: number;
  kind: IslandKind;
  /** Aussehen (Stilbaukasten und Bewuchs) */
  style: IslandStyle;
  site: string | null;
  ring: RingId;
  dangerTier: DangerTier;
  sectorIndex: number;
  factionId: FactionId | null;
  uncharted: boolean;
  /** Küstenlinie und Hügel in Inselkoordinaten (dieselben Werte nutzen Gelände, Laufhöhe und Schiffskollision) */
  coast: WalkIsland['coast'];
  hills: Hill[];
  /** Strandböschung (Anteil des Küstenradius), Höhen von Strand und Hügelfuß, Bodenrelief */
  shelf: number;
  beachY: number;
  hillY: number;
  reliefAmp: number;
  reliefSeed: number;
  /** Umkreis im Raster (1,9 · r: so weit reicht das Gelände höchstens) und größter Radius der Wasserlinie (Schiffe laufen hier auf) */
  bound: number;
  waterR: number;
  /** Rasterzellen (`"cx,cz"`), die der Umkreis berührt */
  chunks: string[];
  /** Stege mit Liegeplätzen in Weltkoordinaten */
  piers: Pier[];
  /** Markt (nur Häfen und Ankerglück): Profil und Gleichgewichtsvorrat je Ware, aus dem `marketAt` den Markt beim ersten Besuch anlegt */
  market: { profile: MarketProfile; eqStock: Record<GoodId, number> } | null;
}

/** Ist das eine Vulkaninsel des Glutrings (Vulkan in der Mitte, schlichte Form)? Siedlungs-Inseln nie (ihre Bauplätze liegen in der Mitte) */
export function isVolcanic(def: IslandDef): boolean {
  return !def.site && def.region === 'glut' && def.kind !== 'harbor' && def.kind !== 'treasure' && def.kind !== 'citadel' && def.kind !== 'marinefort';
}

/** Stil einer Insel: eigenes Biom, sonst der Stil ihrer Region */
export function styleOfDef(def: IslandDef, regions: readonly RegionDef[]): IslandStyle {
  return def.biome ?? regions.find((r) => r.id === def.region)?.style ?? 'tropisch';
}

/**
 * Küste und Hügel einer Insel – genau so, wie SeaWorld sie beim Aufbau würfelt (gleiche Zufallsfolge aus der Kennung). Liefert auch die
 * Zufallsfolge danach, damit der Aufbau dort weiterwürfelt, wo die Form aufgehört hat.
 */
export function islandForm(def: IslandDef): { coast: WalkIsland['coast']; hills: Hill[]; shapeRnd: () => number } {
  const shapeRnd = seeded(hashId(def.id));
  const site = def.site ? SITES[def.site] : null;
  const simple = def.kind === 'town' || def.kind === 'lighthouse' || isVolcanic(def);
  const form = site ? { coast: site.coast, hills: fitHills(def.r, site.coast, site.hills) } : makeIslandShape(def.r, def.hill, shapeRnd, simple);
  return { coast: form.coast, hills: form.hills, shapeRnd };
}

/** Relief der Laufhöhe: die Stadt bleibt fast eben, Dörfer und Wildnis rollen (Meter Ausschlag) */
export function reliefOf(def: IslandDef): number {
  return def.kind === 'town' ? 0.1 : def.site ? 0.55 : def.kind === 'harbor' || def.kind === 'quiet' ? 0.4 : 0.5;
}

// ---------- Stege ----------

/** Lage einer Siedlung auf der Insel: Mittelpunkt (Inselkoordinaten) und Ausrichtung („vorn“ zeigt von der Inselmitte weg) */
export function siteFrame(c: SiteDef['clusters'][number], r: number, coast: WalkIsland['coast']): { cx: number; cz: number; phi: number } {
  let cx: number, cz: number;
  if (c.at) [cx, cz] = c.at;
  else {
    const th = (c.deg ?? 0) * RAD;
    const e = r * coastK(coast, Math.atan2(Math.cos(th), Math.sin(th))) * (c.d ?? 0.7);
    cx = Math.sin(th) * e; cz = Math.cos(th) * e;
  }
  return { cx, cz, phi: Math.atan2(cx, cz) + (c.turn ?? 0) * RAD };
}

/** Länge eines Stegs, wie world/settlement.ts ihn baut (die Daten plus 22 m, ohne Angabe 8 m) */
export const stegLength = (len: number | undefined): number => (len ? len + 22 : 8);

/**
 * Lage eines Stegs einer Siedlung (Inselkoordinaten): seitlich um x versetzt, beginnt 3 m vor der Wasserlinie und läuft in Blickrichtung hinaus.
 * Dieselbe Rechnung benutzt world/settlement.ts für das Netz – so liegen Bohlen und Liegeplatz immer übereinander.
 */
export function stegPlacement(frame: { cx: number; cz: number; phi: number }, itX: number, itYaw: number | undefined, r: number, coast: WalkIsland['coast']): { x: number; z: number; yaw: number; dx: number; dz: number } {
  const yaw = frame.phi + (itYaw ?? 0) * RAD;
  const cs = Math.cos(frame.phi), sn = Math.sin(frame.phi);
  const dx = Math.sin(yaw), dz = Math.cos(yaw);
  const px = frame.cx + itX * cs, pz = frame.cz - itX * sn;
  const E = (a: number) => r * coastK(coast, a);
  let t = 0;
  for (let k = 0; k < 8; k++) {
    const qx = px + dx * t, qz = pz + dz * t;
    t += E(Math.atan2(qz, qx)) - Math.hypot(qx, qz);
  }
  t -= 3;
  return { x: px + dx * t, z: pz + dz * t, yaw, dx, dz };
}

/** Alle Stege einer Siedlungs-Insel in Weltkoordinaten */
export function sitePiers(def: Pick<IslandDef, 'x' | 'z' | 'r'>, site: SiteDef): Pier[] {
  const out: Pier[] = [];
  for (const c of site.clusters) {
    const f = siteFrame(c, def.r, site.coast);
    for (const it of c.items) {
      if (it.t !== 'steg') continue;
      const p = stegPlacement(f, it.x, it.yaw, def.r, site.coast);
      const L = stegLength(it.len) + 2.5;
      out.push({ ax: def.x + p.x, az: def.z + p.z, bx: def.x + p.x + p.dx * L, bz: def.z + p.z + p.dz * L, hw: 1.5, y: 1.45 });
    }
  }
  return out;
}

/** Steg eines Außenposten-Hafens: zeigt zum Weltmittelpunkt, setzt an der echten Wasserlinie an */
export function outpostPier(def: Pick<IslandDef, 'x' | 'z' | 'r'>, coast: WalkIsland['coast']): Pier {
  const facing = Math.atan2(-def.x, -def.z);
  const e = def.r * coastK(coast, Math.atan2(Math.cos(facing), Math.sin(facing)));
  const fx = Math.sin(facing), fz = Math.cos(facing);
  return { ax: def.x + fx * (e + OUTPOST_PIER.from), az: def.z + fz * (e + OUTPOST_PIER.from), bx: def.x + fx * (e + OUTPOST_PIER.to), bz: def.z + fz * (e + OUTPOST_PIER.to), hw: 1.5, y: 1.45 };
}

/** Steg der Hafenstadt Ankerglück: nach Süden, weit über den Inselrand hinaus (siehe buildTown) */
export const townPier = (def: Pick<IslandDef, 'x' | 'z' | 'r'>): Pier => ({ ax: def.x, az: def.z - def.r + 5, bx: def.x, bz: def.z - def.r - 75, hw: 2.4, y: 1.65 });

/** Stege einer Insel aus ihrer Definition (Siedlung, Außenposten-Hafen oder Stadt) */
export function piersOf(def: IslandDef, coast: WalkIsland['coast']): Pier[] {
  if (def.kind === 'town') return [townPier(def)];
  const site = def.site ? SITES[def.site] : null;
  if (site) return sitePiers(def, site);
  if (def.kind === 'harbor') return [outpostPier(def, coast)];
  return [];
}

// ---------- Blueprint ----------

/** Rasterzellen, die eine Scheibe berührt */
function chunksOf(x: number, z: number, r: number): string[] {
  const out: string[] = [];
  for (let cx = chunkCoord(x - r); cx <= chunkCoord(x + r); cx++) for (let cz = chunkCoord(z - r); cz <= chunkCoord(z + r); cz++) out.push(chunkKey(cx, cz));
  return out;
}

/** Blueprint einer Insel (rein, deterministisch) */
export function islandBlueprint(def: IslandDef, index: number, regions: readonly RegionDef[]): IslandBlueprint {
  const { coast, hills } = islandForm(def);
  const shelf = shelfOf(def.r);
  const wl = 1 + shelf * WATERLINE;
  const trading = def.kind === 'harbor' || def.kind === 'town';
  let market: IslandBlueprint['market'] = null;
  if (trading) {
    const profile = profileOf({ id: def.id, region: def.region, factionId: def.factionId });
    const eqStock = {} as Record<GoodId, number>;
    for (const g of GOODS) eqStock[g.id] = eqStockOf(profile, g.id);
    market = { profile, eqStock };
  }
  return {
    id: def.id, index, name: def.name, x: def.x, z: def.z, r: def.r, kind: def.kind, style: styleOfDef(def, regions), site: def.site ?? null,
    ring: def.ring ?? 1, dangerTier: def.dangerTier ?? 1, sectorIndex: def.sectorIndex ?? 0, factionId: def.factionId ?? null, uncharted: !!def.uncharted,
    coast, hills, shelf, beachY: 1.3, hillY: 1.2, reliefAmp: reliefOf(def), reliefSeed: hashId(def.id) & 0xffff,
    bound: def.r * ISLAND_BOUND_K, waterR: def.r * coastMax(coast) * wl,
    chunks: chunksOf(def.x, def.z, def.r * ISLAND_BOUND_K),
    piers: piersOf(def, coast),
    market,
  };
}

/** Alle Blueprints der Welt in der Reihenfolge der Definitionen */
export function buildBlueprints(defs: readonly IslandDef[], regions: readonly RegionDef[]): IslandBlueprint[] {
  return defs.map((d, i) => islandBlueprint(d, i, regions));
}

/** Die begehbare Insel (Kollision und Laufhöhe) aus dem Blueprint: Hindernisse und Einebnungen kommen beim ersten Aufbau dazu */
export function walkOf(bp: IslandBlueprint): WalkIsland {
  return {
    x: bp.x, z: bp.z, r: bp.r, beachY: bp.beachY, hillY: bp.hillY, coast: bp.coast, hills: bp.hills.map((h) => ({ ...h, x: bp.x + h.x, z: bp.z + h.z })),
    shelf: bp.shelf, blockers: [], reliefAmp: bp.reliefAmp, reliefSeed: bp.reliefSeed,
  };
}

/** Küstenform für Wasser und Brandung (ocean.ts) aus dem Blueprint */
export function shapeOf(bp: IslandBlueprint): IslandShape {
  const wl = 1 + bp.shelf * WATERLINE;
  return { x: bp.x, z: bp.z, r: bp.waterR, coast: bp.coast, base: bp.r * wl };
}

/** Kantenlänge einer Rasterzelle (für Anzeigen) */
export const BLUEPRINT_CHUNK = CHUNK_SIZE;
