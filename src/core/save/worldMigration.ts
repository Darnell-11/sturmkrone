// Spielstand 20 → 21 (Phase 4.5C): die Welt ist von 10 400 m auf 15 600 m Radius gewachsen und alle Inseln sind nach außen entzerrt
// (data/worldSpread.ts). Was im Spielstand als Weltkoordinate steht, wandert mit: das Schiff, die kartierten Zonen der Seekarte, die Ereignisse,
// Konvois und Wetterzellen des lebendigen Meeres und die Armadas, Großschlachten und Kontrollpunkte des Kriegs der Mächte. Alles andere (entdeckte
// Inseln, Inselbesitz, Kassen, Verträge, Kriegspunkte, Flotte) hängt an Kennungen und bleibt unverändert. Rein, ohne three.js.
//
// Regel je Punkt (`migratePoint`): liegt er nah an einer Insel der alten Welt (Hafen, Steg, Belagerung, Blockade), bleibt er relativ zu ihr gleich –
// sonst stünde ein festgemachtes Schiff plötzlich 30 % weiter draußen. Auf offener See wandert er radial mit (`spreadPoint`). Danach liegt er nie
// in einer Insel, auch keiner der 36 neuen (dann wird er bis vor die Küste geschoben).
import { ISLAND_REACH, REGIONS, type IslandDef } from '../../data/regions';
import { EXPANSION_ISLANDS } from '../../data/openWorld';
import { spreadPoint, unspreadPoint } from '../../data/worldSpread';

/** Bis zu diesem Abstand von der Küste (m, über dem Platzbedarf) gilt ein Punkt als „an der Insel“ und bleibt relativ zu ihr */
export const ANCHOR_REACH = 600;

interface Anchor { id: string; ox: number; oz: number; nx: number; nz: number; r: number }

let anchors: Anchor[] | null = null;
let all: IslandDef[] | null = null;

/** Inseln, die es in Version 20 schon gab, mit ihrer alten und neuen Lage (einmal berechnet) */
function anchorList(): Anchor[] {
  if (anchors) return anchors;
  const fresh = new Set(EXPANSION_ISLANDS.map((s) => s.id));
  const defs = REGIONS.flatMap((r) => r.islands);
  const byId = new Map(defs.map((d) => [d.id, d]));
  const tmp = { x: 0, z: 0 };
  const out: Anchor[] = [];
  for (const d of defs) {
    if (fresh.has(d.id)) continue;
    let ox: number, oz: number;
    // Schären und Riff-Felsen hängen an ihrer Mega-Insel (fester Versatz): die alte Lage ist die alte Mega-Mitte plus derselbe Versatz
    const mega = d.skerry ? byId.get(d.id.replace(/_schaere\d+$/, '')) : undefined;
    if (mega) { unspreadPoint(mega.x, mega.z, tmp); ox = tmp.x + (d.x - mega.x); oz = tmp.z + (d.z - mega.z); }
    else { unspreadPoint(d.x, d.z, tmp); ox = tmp.x; oz = tmp.z; }
    out.push({ id: d.id, ox, oz, nx: d.x, nz: d.z, r: d.r });
  }
  anchors = out;
  return out;
}

/** Alte Lage einer Insel aus Version 20 (für Prüfungen); unbekannte oder neue Inseln: null */
export function legacyIslandPos(id: string): { x: number; z: number } | null {
  const a = anchorList().find((q) => q.id === id);
  return a ? { x: a.ox, z: a.oz } : null;
}

/**
 * Einen Punkt aus Version 20 auf das 15 600-m-Raster heben (siehe Kopf); `out` wird gefüllt. `water` = der Punkt gehört aufs Wasser (Schiff, Kiste,
 * Armada) und wird aus jeder Insel geschoben; Landpunkte (Kontrollpunkte einer Belagerung, Suchbereich einer Schatzsuche) bleiben auf ihrer Insel.
 */
export function migratePoint(x: number, z: number, out: { x: number; z: number } = { x: 0, z: 0 }, water = true): { x: number; z: number } {
  if (!Number.isFinite(x) || !Number.isFinite(z)) { out.x = 0; out.z = 0; return out; }
  let best: Anchor | null = null, bd = Infinity;
  for (const a of anchorList()) {
    const d = Math.hypot(x - a.ox, z - a.oz) - a.r * ISLAND_REACH;
    if (d < bd) { bd = d; best = a; }
  }
  if (best && bd < ANCHOR_REACH) { out.x = best.nx + (x - best.ox); out.z = best.nz + (z - best.oz); }
  else spreadPoint(x, z, out);
  if (water) pushOutOfIslands(out);
  return out;
}

/** Nie in einer Insel: liegt der Punkt in einem Küstenring (r · 1,2 + 15 m), wird er radial von der Inselmitte bis davor geschoben */
export function pushOutOfIslands(p: { x: number; z: number }): void {
  const defs = (all ??= REGIONS.flatMap((r) => r.islands));
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const d of defs) {
      const need = d.r * 1.2 + 15;
      const dx = p.x - d.x, dz = p.z - d.z, dist = Math.hypot(dx, dz);
      if (dist >= need) continue;
      const k = dist > 1e-3 ? 1 / dist : 0;
      const ux = k ? dx * k : 0, uz = k ? dz * k : 1;
      p.x = d.x + ux * (need + 10); p.z = d.z + uz * (need + 10);
      moved = true;
    }
    if (!moved) return;
  }
}

type Rec = Record<string, any>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const tmp = { x: 0, z: 0 };

/** x/z-Felder eines Objekts auf das neue Raster heben (nur wenn beide Zahlen sind); `water` wie bei `migratePoint` */
function movePos(o: unknown, water = true): void {
  if (!isRec(o) || typeof o.x !== 'number' || typeof o.z !== 'number') return;
  migratePoint(o.x, o.z, tmp, water);
  o.x = Math.round(tmp.x * 10) / 10; o.z = Math.round(tmp.z * 10) / 10;
}

/** Flache Route (x, z, x, z, …) auf das neue Raster heben: Wegpunkte auf offener See wandern radial mit */
function moveRoute(r: unknown): void {
  if (!Array.isArray(r)) return;
  for (let k = 0; k + 1 < r.length; k += 2) {
    if (typeof r[k] !== 'number' || typeof r[k + 1] !== 'number') continue;
    migratePoint(r[k], r[k + 1], tmp);
    r[k] = Math.round(tmp.x * 10) / 10; r[k + 1] = Math.round(tmp.z * 10) / 10;
  }
}

/**
 * Die Migration 20 → 21: schreibt die Weltkoordinaten im Spielstand auf das neue Raster um (in einer Kopie der betroffenen Teile) und lässt alles,
 * was an Kennungen hängt, unverändert.
 */
export function migrateWorldTo21(d: Rec): Rec {
  const world: Rec = isRec(d.world) ? JSON.parse(JSON.stringify(d.world)) : {};
  // eigenes Schiff
  if (isRec(world.boat)) movePos(world.boat);
  // Seekarte: kartierte Zonen stehen um die Insel, die sie kartiert hat – sie zieht mit ihr
  if (isRec(world.chart) && Array.isArray(world.chart.zones)) {
    const byId = new Map(REGIONS.flatMap((r) => r.islands).map((i) => [i.id, i]));
    for (const z of world.chart.zones) {
      if (!isRec(z)) continue;
      const i = typeof z.src === 'string' ? byId.get(z.src) : undefined;
      if (i) { z.x = i.x; z.z = i.z; } else movePos(z);
    }
  }
  // lebendiges Meer: Ereignisse (Lage, Routen, Schiffe, Kisten), Konvois, Wetterzellen
  const se = world.seaEvents;
  if (isRec(se)) {
    for (const ev of Array.isArray(se.events) ? se.events : []) {
      if (!isRec(ev)) continue;
      movePos(ev); moveRoute(ev.route);
      for (const s of Array.isArray(ev.ships) ? ev.ships : []) movePos(s);
      for (const c of Array.isArray(ev.crates) ? ev.crates : []) movePos(c);
      if (isRec(ev.site)) movePos(ev.site, false);
      // eine Schatzsuche steht auf ihrer Insel: Ereignis-Mitte = Suchbereich
      if (ev.kind === 'schatzjagd' && isRec(ev.site)) { ev.x = ev.site.x; ev.z = ev.site.z; }
    }
    for (const c of Array.isArray(se.convoys) ? se.convoys : []) {
      if (!isRec(c)) continue;
      movePos(c); moveRoute(c.route);
      for (const s of [...(Array.isArray(c.ships) ? c.ships : []), ...(Array.isArray(c.corsairs) ? c.corsairs : [])]) movePos(s);
      // die Länge der Route hat sich geändert (Fortschritt rechnet `progressOf` neu)
      if (Array.isArray(c.route)) { let L = 0; for (let k = 2; k + 1 < c.route.length; k += 2) L += Math.hypot(c.route[k] - c.route[k - 2], c.route[k + 1] - c.route[k - 1]); if (L > 0) c.length = L; }
    }
    for (const c of Array.isArray(se.cells) ? se.cells : []) movePos(c);
  }
  // Krieg der Mächte: Armadas (Lage, Route), Großschlachten, Kontrollpunkte der Belagerungen
  const fw = world.factionWar;
  if (isRec(fw)) {
    for (const a of Array.isArray(fw.armadas) ? fw.armadas : []) { if (isRec(a)) { movePos(a); moveRoute(a.route); } }
    for (const b of Array.isArray(fw.battles) ? fw.battles : []) movePos(b);
    for (const sg of Array.isArray(fw.sieges) ? fw.sieges : []) { if (isRec(sg)) for (const p of Array.isArray(sg.points) ? sg.points : []) movePos(p, false); }
  }
  return { ...d, version: 21, world };
}
