// Phase 4.3A: Chunk-Raster, Broadphase, WorldStreamer (3 Stufen mit Hysterese, Time-Slicing, forceSyncAround) und natürlicher Sturm-Rand.
// Alles deterministisch: feste Zufallsfolge, feste Zeitschritte, eine Uhr, die der Test selbst weiterstellt.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EDGE_WALL, WORLD_RADIUS } from '../src/data/world';
import { REGIONS } from '../src/data/regions';
import { evoStats, evolutionOfTier } from '../src/data/shipEvolution';
import { SEA_SPEED, SHIP_CLASSES } from '../src/data/ships';
import { newMotion, stepMotion, windSpeedK, type MotionParams } from '../src/naval/shipMotion';
import { IslandGround, ISLAND_BOUND_K, WATERLINE, coastK, shelfOf, type Pier, type WalkIsland } from '../src/world/islandGround';
import { buildHorizonData } from '../src/world/islandHorizon';
import {
  EDGE_PUSH_MAX, EDGE_WARNING, HARD_WORLD_RADIUS, SOFT_WORLD_RADIUS, applyEdgeDrift, edgePush, edgeStrength, edgeWarningLevel, edgeZoneAt, newEdgeZone,
} from '../src/world/stormEdge';
import { CHUNK_SIZE, SpatialGrid, chunkCoord, chunkKey, chunkKeyAt, parseChunkKey } from '../src/world/worldGrid';
import { LOD, STREAM, WorldStreamer, nextLevel, type StreamHost, type StreamLevel } from '../src/world/worldStreamer';

/** Zufall mit fester Folge */
function lcg(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

/** Insel wie im Spiel (Küstenlinie aus Sinus-Termen, Strandböschung nach `shelfOf`); nur die Felder, die Küste und Schiffskontakt brauchen */
function island(x: number, z: number, r: number): WalkIsland {
  return { x, z, r, coast: [{ a: 0.06, f: 3, p: 0.4 }, { a: 0.04, f: 5, p: 1.1 }], shelf: shelfOf(r), hills: [], blockers: [], beachY: 1.3, hillY: 1.2 } as unknown as WalkIsland;
}

/** Die echte Inselkarte (Mitte und Radius aus den Weltdaten) */
const REAL = REGIONS.flatMap((r) => r.islands);

function realGround(): IslandGround {
  const g = new IslandGround();
  for (const d of REAL) g.add(island(d.x, d.z, d.r));
  return g;
}

// ---------- 1. Zellen-Hashing ----------

describe('Chunk-Raster (750 m): Zellenschlüssel und Hashing', () => {
  it('Zelle = floor(x / 750), Schlüssel "cx,cz", auch bei negativen Koordinaten und genau auf den Grenzen', () => {
    expect(CHUNK_SIZE).toBe(750);
    expect(chunkKey(3, -2)).toBe('3,-2');
    expect(chunkKeyAt(0, 0)).toBe('0,0');
    expect(chunkKeyAt(749.999, 0)).toBe('0,0');
    expect(chunkKeyAt(750, 0)).toBe('1,0');
    expect(chunkKeyAt(-0.001, -0.001)).toBe('-1,-1');
    expect(chunkKeyAt(-750, 749)).toBe('-1,0');
    expect(chunkKeyAt(-750.001, 1500)).toBe('-2,2');
    expect(chunkCoord(1499.99)).toBe(1);
  });

  it('Schlüssel und Zahlen sind umkehrbar (1000 Zufallspunkte)', () => {
    const rnd = lcg(7);
    for (let i = 0; i < 1000; i++) {
      const x = (rnd() - 0.5) * 14000, z = (rnd() - 0.5) * 14000;
      const key = chunkKeyAt(x, z);
      expect(key).toMatch(/^-?\d+,-?\d+$/);
      const { cx, cz } = parseChunkKey(key);
      expect(cx).toBe(Math.floor(x / 750));
      expect(cz).toBe(Math.floor(z / 750));
      expect(chunkKey(cx, cz)).toBe(key);
    }
    expect(Number.isNaN(parseChunkKey('kaputt').cx)).toBe(true);
  });

  it('eine Insel über der Zellgrenze steht in allen berührten Zellen, die Heimatzelle ist dabei', () => {
    const g = new SpatialGrid();
    const a = g.add(740, 10, 60); // reicht von x 680 bis 800 und z −50 bis 70: Zellen 0/1 × −1/0
    expect(g.chunksOf(a).sort()).toEqual(['0,-1', '0,0', '1,-1', '1,0']);
    const b = g.add(-30, 1480, 40);
    expect(g.chunksOf(b)).toContain(chunkKeyAt(-30, 1480));
    // jede Insel der echten Karte liegt in ihrer Heimatzelle
    const real = new SpatialGrid();
    REAL.forEach((d) => real.add(d.x, d.z, d.r * ISLAND_BOUND_K));
    REAL.forEach((d, i) => expect(real.chunksOf(i)).toContain(chunkKeyAt(d.x, d.z)));
  });

  it('JSON-Rundlauf: Raster → Text → Raster liefert dieselben Abfragen, Zellen tragen ihre Nummern', () => {
    const g = new SpatialGrid();
    REAL.forEach((d) => g.add(d.x, d.z, d.r * ISLAND_BOUND_K));
    const json = JSON.parse(JSON.stringify(g.toJSON()));
    expect(json.chunkSize).toBe(750);
    expect(json.discs.length).toBe(REAL.length);
    for (const k of Object.keys(json.chunks)) expect(k).toMatch(/^-?\d+,-?\d+$/);
    const g2 = SpatialGrid.fromJSON(json);
    expect(JSON.stringify(g2.toJSON())).toBe(JSON.stringify(g.toJSON()));
    const rnd = lcg(11), a: number[] = [], b: number[] = [];
    for (let i = 0; i < 300; i++) {
      const x = (rnd() - 0.5) * 12000, z = (rnd() - 0.5) * 12000, q = rnd() * 900;
      g.query(x, z, q, a); g2.query(x, z, q, b);
      expect(b).toEqual(a);
    }
  });
});

// ---------- 2. Broadphase getNearbyIslands ----------

describe('Broadphase: getNearbyIslands', () => {
  const ground = realGround();

  /** Referenz ohne Raster: alle Inseln, deren Umkreis die Suchscheibe berührt */
  const brute = (x: number, z: number, q: number) => ground.islands.filter((i) => Math.hypot(x - i.x, z - i.z) <= i.r * ISLAND_BOUND_K + q);

  it('liefert genau die Inseln der Brute-Force-Suche, in der Reihenfolge der Inselliste (3000 Abfragen)', () => {
    const rnd = lcg(21), out: WalkIsland[] = [];
    for (let i = 0; i < 3000; i++) {
      const x = (rnd() - 0.5) * 12000, z = (rnd() - 0.5) * 12000, q = rnd() < 0.5 ? rnd() * 120 : rnd() * 1500;
      const got = ground.getNearbyIslands(x, z, q, out);
      expect(got.map((g) => ground.islands.indexOf(g))).toEqual(brute(x, z, q).map((b) => ground.islands.indexOf(b)));
    }
  });

  it('findet Inseln über Zellgrenzen hinweg: Suchpunkt in der Nachbarzelle, Insel mit Radius über die Grenze', () => {
    const g = new IslandGround();
    g.add(island(740, 0, 100)); // Umkreis 190: reicht bis x 550 … 930, also in die Zellen 0 und 1
    expect(g.getNearbyIslands(900, 10, 0).length).toBe(1);   // Zelle 1
    expect(g.getNearbyIslands(600, 10, 0).length).toBe(1);   // Zelle 0
    expect(g.getNearbyIslands(1500, 0, 0).length).toBe(0);   // Zelle 2: leer
    expect(g.getNearbyIslands(1500, 0, 700).length).toBe(1); // Suchscheibe reicht zurück
    expect(g.islandAt(750, 0, 0)).not.toBeNull();            // innerhalb der Küste, genau auf der Zellgrenze
  });

  it('auf der echten Karte sind es je Schiffsabfrage höchstens 3 Inseln (Suchradius = Schiffsbreite + Fühlerreichweite)', () => {
    const rnd = lcg(5), out: WalkIsland[] = [];
    let max = 0, sum = 0, n = 0;
    for (let i = 0; i < 4000; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 5600;
      const got = ground.getNearbyIslands(Math.cos(a) * d, Math.sin(a) * d, 40 + 60, out);
      max = Math.max(max, got.length); sum += got.length; n++;
    }
    expect(max).toBeLessThanOrEqual(3);
    // gegenüber 55 Inseln ohne Raster: im Mittel weit unter einer
    expect(sum / n).toBeLessThan(1);
    expect(ground.islands.length).toBeGreaterThan(40);
  });

  it('islandAt, shipClearance und height stimmen mit der Rechnung ohne Raster überein (20 000 Punkte)', () => {
    const rnd = lcg(33);
    const edge = (i: WalkIsland, x: number, z: number) => ground.edge(i, x, z);
    for (let n = 0; n < 20000; n++) {
      // Hälfte der Punkte nahe an Inseln, die andere gleichverteilt
      let x: number, z: number;
      if (n % 2) { const d = REAL[Math.floor(rnd() * REAL.length)], a = rnd() * 6.283, rr = d.r * (0.4 + rnd() * 1.8); x = d.x + Math.cos(a) * rr; z = d.z + Math.sin(a) * rr; }
      else { x = (rnd() - 0.5) * 12000; z = (rnd() - 0.5) * 12000; }
      const margin = rnd() < 0.3 ? 40 : 4;
      // islandAt: erste Insel in Listenreihenfolge, deren Küste (plus Rand) den Punkt enthält
      let ref: WalkIsland | null = null;
      for (const i of ground.islands) { const d = Math.hypot(x - i.x, z - i.z); if (d > i.r * 1.5 + margin) continue; if (d < edge(i, x, z) + margin) { ref = i; break; } }
      expect(ground.islandAt(x, z, margin)).toBe(ref);
      // shipClearance
      const W = 6 + rnd() * 16, reach = 120 + rnd() * 300;
      let best = reach;
      for (const i of ground.islands) {
        const d = Math.hypot(x - i.x, z - i.z);
        if (d > i.r * 1.9 + W + reach) continue;
        const lim = i.r * (1 + 0) * 0 + edge(i, x, z) * (1 + i.shelf * (1.3 / 3)) + W * 0.5 + 1.2;
        best = Math.min(best, d - lim);
      }
      expect(ground.shipClearance(x, z, W, reach)).toBeCloseTo(best, 9);
      // height: das Maximum über alle Inseln
      let h = -Infinity;
      for (const i of ground.islands) h = Math.max(h, ground.islandHeight(i, x, z));
      expect(ground.height(x, z)).toBe(h);
    }
  });

  it('pushShip schiebt wie bisher: ein Schiff, das in eine Küste fährt, wird herausgeschoben (alle Prüfpunkte, 6 000 Fahrten)', () => {
    const rnd = lcg(44);
    let hits = 0;
    for (let n = 0; n < 6000; n++) {
      const d = REAL[Math.floor(rnd() * REAL.length)], a = rnd() * 6.283, rr = d.r * (0.9 + rnd() * 0.9);
      const x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr, h = rnd() * 6.283;
      const L = 20 + rnd() * 60, W = 6 + rnd() * 14;
      const o = ground.pushShip(x, z, h, L, W);
      if (o.hit) {
        hits++;
        // nach dem Schieben ist kein Prüfpunkt mehr in der Insel
        for (const k of [0.44, 0, -0.44]) expect(ground.shipClearance(o.x + Math.sin(h) * L * k, o.z + Math.cos(h) * L * k, W)).toBeGreaterThan(-0.5);
      } else {
        expect(o.x).toBe(x); expect(o.z).toBe(z);
      }
    }
    expect(hits).toBeGreaterThan(500);
  });

  it('Stege: dieselbe Broadphase, auch bei Länge über Zellgrenzen; Austausch der Liste baut das Raster neu auf', () => {
    const g = new IslandGround();
    const rnd = lcg(3);
    const mk = (): Pier => { const ax = (rnd() - 0.5) * 8000, az = (rnd() - 0.5) * 8000, a = rnd() * 6.283, l = 20 + rnd() * 90; return { ax, az, bx: ax + Math.cos(a) * l, bz: az + Math.sin(a) * l, hw: 1.5, y: 1.4 }; };
    for (let i = 0; i < 30; i++) g.piers.push(mk());
    const out: Pier[] = [];
    for (let i = 0; i < 400; i++) {
      const p = g.piers[Math.floor(rnd() * 30)];
      const x = (p.ax + p.bx) / 2 + (rnd() - 0.5) * 120, z = (p.az + p.bz) / 2 + (rnd() - 0.5) * 120, q = rnd() * 80;
      const ref = g.piers.filter((s) => Math.hypot(x - (s.ax + s.bx) / 2, z - (s.az + s.bz) / 2) <= Math.hypot(s.bx - s.ax, s.bz - s.az) / 2 + s.hw + q);
      expect(g.getNearbyPiers(x, z, q, out)).toEqual(ref);
    }
    // neuer Steg in derselben Liste: Länge ändert sich, das Raster zieht nach
    const extra: Pier = { ax: 100, az: 100, bx: 140, bz: 100, hw: 1.5, y: 1.4 };
    g.piers.push(extra);
    expect(g.getNearbyPiers(120, 100, 3, out)).toContain(extra);
    // Austausch der ganzen Liste (Raid): alte Stege sind weg
    g.piers = [{ ...extra, ax: -900, bx: -860 }];
    expect(g.getNearbyPiers(120, 100, 3, out)).toHaveLength(0);
    expect(g.pierNear(-880, 100, 1)?.p).toBe(g.piers[0]);
  });

  it('Austausch der Inselliste (Raid-Instanz) wird erkannt: reindex() und Längenwechsel bauen neu auf', () => {
    const g = new IslandGround();
    g.add(island(0, 0, 100));
    expect(g.islandAt(10, 10)).not.toBeNull();
    const main = g.islands.splice(0);
    g.islands.push(island(3000, 0, 100));
    expect(g.islandAt(10, 10)).toBeNull();
    expect(g.islandAt(3010, 10)).not.toBeNull();
    g.islands.length = 0; g.islands.push(...main);
    g.reindex();
    expect(g.islandAt(10, 10)).not.toBeNull();
    expect(g.maxIslandR).toBe(100);
  });
});

// ---------- 3. Hysterese ----------

describe('Hysterese: UNLOADED ↔ HORIZON_LOD ↔ ACTIVE_HIGH', () => {
  // Schwellen seit 4.3B (3,7-fache Welt): ACTIVE ≤ 1 100 m (zurück > 1 300 m), HORIZON ≤ 4 200 m (Abbau > 4 500 m)
  const { activeIn: AI, activeOut: AO, horizonIn: HI, horizonOut: HO } = STREAM;

  it('Schwellen: Aktivierung 4 200 / 1 100 m, Abbau und Rückstufung 4 500 / 1 300 m', () => {
    expect(HI).toBe(4200); expect(HO).toBe(4500);
    expect(AI).toBe(1100); expect(AO).toBe(1300);
    // von UNLOADED aus
    expect(nextLevel(0, HI)).toBe(1); expect(nextLevel(0, HI + 0.01)).toBe(0); expect(nextLevel(0, HO)).toBe(0);
    expect(nextLevel(0, AI)).toBe(2); expect(nextLevel(0, AI + 0.01)).toBe(1);
    // von HORIZON_LOD aus: bleibt bis zum Abbau, steigt erst bei der Aktivierung
    expect(nextLevel(1, HO)).toBe(1); expect(nextLevel(1, HO + 0.01)).toBe(0);
    expect(nextLevel(1, AI + 0.01)).toBe(1); expect(nextLevel(1, AI)).toBe(2);
    // von ACTIVE_HIGH aus: bleibt bis zur Rückstufung, danach HORIZON, jenseits des Abbaus unloaded
    expect(nextLevel(2, AO)).toBe(2); expect(nextLevel(2, AO + 0.01)).toBe(1); expect(nextLevel(2, HO)).toBe(1); expect(nextLevel(2, HO + 0.01)).toBe(0);
  });

  /** Läuft ein Abstand durch eine Folge und zählt die Stufenwechsel */
  const changes = (start: StreamLevel, dists: number[]) => { let l = start, n = 0; for (const d of dists) { const m = nextLevel(l, d); if (m !== l) n++; l = m; } return { n, l }; };

  it('kein Flattern an der ACTIVE-Grenze: Rauschen von ±40 m ergibt höchstens einen Wechsel je Richtung', () => {
    const rnd = lcg(1);
    // Anflug von AO + 100 auf AI − 100 und wieder zurück, dabei überall ±40 m Rauschen (Wellengang, Kamera)
    const there: number[] = [], back: number[] = [];
    for (let d = AO + 100; d >= AI - 100; d -= 0.5) there.push(d + (rnd() - 0.5) * 80);
    for (let d = AI - 100; d <= AO + 100; d += 0.5) back.push(d + (rnd() - 0.5) * 80);
    const a = changes(1, there);
    expect(a.l).toBe(2); expect(a.n).toBe(1);
    // zurück: zwischen Aktivierung und Rückstufung bleibt ACTIVE, erst darüber geht es zurück: genau ein Wechsel
    const b = changes(2, back); expect(b.l).toBe(1); expect(b.n).toBe(1);
    // Zittern genau um die Aktivierungsgrenze: nur das erste Überschreiten zählt
    expect(changes(1, Array.from({ length: 2000 }, (_, i) => AI + (i % 2 ? 9 : -9)))).toEqual({ n: 1, l: 2 });
    // Zittern um die Rückstufung startet aus ACTIVE: nur ein Wechsel nach HORIZON, dann wieder erst unter der Aktivierung
    expect(changes(2, Array.from({ length: 2000 }, (_, i) => AO + (i % 2 ? 9 : -9)))).toEqual({ n: 1, l: 1 });
  });

  it('kein Flattern an der HORIZON-Grenze (4 200 / 4 500 m)', () => {
    expect(changes(0, Array.from({ length: 2000 }, (_, i) => HI + (i % 2 ? 40 : -40)))).toEqual({ n: 1, l: 1 }); // einmal sichtbar, und bleibt bis zum Abbau
    expect(changes(1, Array.from({ length: 2000 }, (_, i) => HO + (i % 2 ? 9 : -9)))).toEqual({ n: 1, l: 0 });
    const rnd = lcg(5), noisy: number[] = [];
    for (let d = HO + 300; d >= HI - 300; d -= 0.5) noisy.push(d + (rnd() - 0.5) * 60);
    expect(changes(0, noisy)).toEqual({ n: 1, l: 1 });
  });
});

// ---------- 4. Streamer mit Protokoll-Host ----------

interface Log { frame: number; what: string; i: number }

/** Stellt eine Darstellung nur nach: je Insel `shown` (Silhouette), `built` (Detail fertig), `visible` (Detail sichtbar) und ein Protokoll */
function fakeHost(opts: { stages?: number; stageMs?: number; clock?: { t: number }; frame?: () => number } = {}) {
  const stages = opts.stages ?? 3;
  const log: Log[] = [];
  const st = new Map<number, { shown: boolean; built: boolean; visible: boolean; partial: number; aborted: number }>();
  const get = (i: number) => { let s = st.get(i); if (!s) { s = { shown: false, built: false, visible: false, partial: 0, aborted: 0 }; st.set(i, s); } return s; };
  const frame = opts.frame ?? (() => 0);
  const L = (what: string, i: number) => log.push({ frame: frame(), what, i });
  const host: StreamHost = {
    showHorizon(i) { get(i).shown = true; L('show', i); },
    hideHorizon(i) { get(i).shown = false; L('hide', i); },
    buildActive(i) {
      const s = get(i);
      L('begin', i);
      return (function* (): Generator<void, void> {
        try {
          for (let k = 0; k < stages; k++) {
            s.partial = k + 1;
            L(`stage${k + 1}`, i);
            if (opts.clock) opts.clock.t += opts.stageMs ?? 1;
            if (k < stages - 1) yield;
          }
          s.built = true; s.partial = 0;
        } finally {
          if (!s.built) { s.partial = 0; s.aborted++; L('abort', i); }
        }
      })();
    },
    commitActive(i) { const s = get(i); s.visible = true; L('commit', i); },
    disposeActive(i) { const s = get(i); s.built = false; s.visible = false; L('dispose', i); },
  };
  return { host, log, st, get };
}

/** Kleine Welt: drei Inseln in einer Reihe */
const WORLD = [
  { id: 'a', x: 0, z: 0, r: 100 },
  { id: 'b', x: 1500, z: 0, r: 100 },
  { id: 'c', x: 6400, z: 0, r: 200 },
];

/** Drei weit auseinanderliegende Inseln: an Insel a ist sonst nichts in der Nähe (für die Zeitplan-Tests) */
const SOLO = [
  { id: 'a', x: 0, z: 0, r: 100 },
  { id: 'b', x: 4000, z: 0, r: 100 },
  { id: 'c', x: 9000, z: 0, r: 200 },
];

function setup(o: { stages?: number; stageMs?: number; pinned?: string[]; world?: typeof WORLD; maxSteps?: number } = {}) {
  const clock = { t: 0 };
  let frame = 0;
  const f = fakeHost({ ...o, clock, frame: () => frame });
  // Standard hier: ein Teilschritt je Bild (so lassen sich Reihenfolge und Bildzahl genau prüfen); die Zeitbudget-Packung hat eigene Tests
  const s = new WorldStreamer(f.host, () => clock.t, { maxStepsPerFrame: o.maxSteps ?? 1 });
  (o.world ?? WORLD).forEach((d) => s.addIsland(d, { pinned: o.pinned?.includes(d.id) }));
  const tick = (x: number, z: number, extra: [number, number][] = []) => {
    frame++;
    s.beginInterest(); s.addInterest(x, z); for (const e of extra) s.addInterest(e[0], e[1]);
    s.update();
  };
  return { s, f, clock, tick, frameNo: () => frame };
}

describe('WorldStreamer: Stufen und Hysterese im Betrieb', () => {
  it('Anfahrt: UNLOADED → HORIZON_LOD (≤ 4 200 m Küstenabstand) → ACTIVE_HIGH (≤ 1 100 m), Rückfahrt mit Hysterese, ohne Flattern', () => {
    const { s, f, tick } = setup();
    // Insel a: Küste bei x = 100. Spieler fährt von x = 5 000 (Küstenabstand 4 900) bis x = 600 (500 m) und wieder hinaus bis 5 200.
    const trace: StreamLevel[] = [];
    for (let x = 5000; x >= 600; x -= 25) { tick(x, 0); for (let k = 0; k < 6; k++) tick(x, 0); trace.push(s.levelOf(0)); }
    for (let x = 600; x <= 5200; x += 25) { tick(x, 0); for (let k = 0; k < 6; k++) tick(x, 0); trace.push(s.levelOf(0)); }
    // Folge der Stufen: nur 0 → 1 → 2 → 1 → 0, jede höchstens einmal
    const seq = trace.filter((l, i) => i === 0 || l !== trace[i - 1]);
    expect(seq).toEqual([0, 1, 2, 1, 0]);
    // die Darstellung bekam jeden Wechsel genau einmal
    const per = (what: string) => f.log.filter((e) => e.i === 0 && e.what === what).length;
    expect(per('show')).toBe(2);      // beim Anflug und beim Rückzug von ACTIVE auf HORIZON
    expect(per('hide')).toBe(2);      // beim Tausch gegen die Insel und beim Abbau jenseits von 2 850 m
    expect(per('begin')).toBe(1);
    expect(per('commit')).toBe(1);
    expect(per('dispose')).toBe(1);
    expect(f.get(0).visible).toBe(false);
  });

  it('Interessenpunkte: ein Flottenschiff weit weg hält seine Insel aktiv', () => {
    const { s, tick } = setup();
    for (let i = 0; i < 30; i++) tick(0, 0, [[1500, 0]]);
    expect(s.levelOf(0)).toBe(2);
    expect(s.levelOf(1)).toBe(2);     // das Flottenschiff steht an Insel b
    expect(s.levelOf(2)).toBe(0);     // Insel c: Küstenabstand 4 700 m vom Flottenschiff, bleibt aus
    for (let i = 0; i < 30; i++) tick(0, 0);
    expect(s.levelOf(1)).toBe(1);     // ohne das Flottenschiff: nur noch Silhouette (Küstenabstand 1 400)
  });

  it('angeheftete Inseln (Ankerglück) werden nie abgebaut', () => {
    const { s, tick } = setup({ pinned: ['a'] });
    s.forceSyncAround(0, 0);
    expect(s.levelOf(0)).toBe(2);
    for (let i = 0; i < 60; i++) tick(9000, 0);
    expect(s.levelOf(0)).toBe(2);
  });
});

describe('Time-Slicing: gestaffelter Aufbau', () => {
  it('ein Teilschritt je Bild: Gelände, Bauten, Props in drei aufeinanderfolgenden Bildern, der Tausch im vierten', () => {
    const { s, f, tick, frameNo } = setup({ world: SOLO });
    tick(1100, 0); // Küstenabstand 1 000: ACTIVE gewünscht, Silhouette steht
    const f0 = frameNo();
    for (let i = 0; i < 6; i++) tick(1100, 0);
    const own = f.log.filter((e) => e.i === 0);
    const stage = (n: number) => own.find((e) => e.what === `stage${n}`)!;
    const commit = own.find((e) => e.what === 'commit')!;
    expect(stage(1).frame).toBeGreaterThanOrEqual(f0);
    expect(stage(2).frame).toBe(stage(1).frame + 1);
    expect(stage(3).frame).toBe(stage(1).frame + 2);
    expect(commit.frame).toBe(stage(1).frame + 3);
    expect(s.levelOf(0)).toBe(2);
    // höchstens ein Teilschritt je update()
    expect(s.stats.steps).toBe(3);
    expect(s.stats.commits).toBe(1);
  });

  it('kein Aufpoppen: die Silhouette bleibt sichtbar, bis die Insel fertig ist; beim Tausch ist nie beides weg', () => {
    const { f, tick } = setup({ world: SOLO });
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      tick(1100, 0);
      const s0 = f.get(0);
      seen.push(`${s0.shown ? 'S' : '-'}${s0.visible ? 'D' : '-'}`);
      // in jedem Bild ist Silhouette oder Insel zu sehen
      expect(s0.shown || s0.visible).toBe(true);
    }
    expect(seen[0]).toBe('S-');
    expect(seen[seen.length - 1]).toBe('-D');
    // Reihenfolge im Protokoll: erst commit, dann hide
    const own = f.log.filter((e) => e.i === 0);
    expect(own.findIndex((e) => e.what === 'commit')).toBeLessThan(own.findIndex((e) => e.what === 'hide'));
  });

  it('Zeitbudget: Teilschritte unter 2,5 ms zählen nicht als Überschreitung, ein zu langer schon', () => {
    const a = setup({ stageMs: 1.0, world: SOLO });
    a.tick(1100, 0); for (let i = 0; i < 6; i++) a.tick(1100, 0);
    expect(a.s.stats.steps).toBe(3);
    expect(a.s.stats.maxStepMs).toBeCloseTo(1.0, 9);
    expect(a.s.stats.overBudget).toBe(0);
    expect(a.s.stats.maxStepMs).toBeLessThanOrEqual(STREAM.budgetMs);
    const b = setup({ stageMs: 4.0, world: SOLO });
    b.tick(1100, 0); for (let i = 0; i < 6; i++) b.tick(1100, 0);
    expect(b.s.stats.overBudget).toBe(3);
  });

  it('Zeitbudget packt kleine Teilschritte in ein Bild, hört nach dem Budget auf, und der Tausch steht allein in einem Bild', () => {
    const clock = { t: 0 };
    let frame = 0;
    const f = fakeHost({ stages: 20, stageMs: 0.5, clock, frame: () => frame });
    const s = new WorldStreamer(f.host, () => clock.t); // Standard: Budget 2,5 ms, höchstens 24 Schritte je Bild
    s.addIsland(SOLO[0]);
    const perFrame: number[] = [];
    let before = 0;
    for (let i = 0; i < 12; i++) {
      frame++;
      s.beginInterest(); s.addInterest(1100, 0); s.update();
      perFrame.push(s.stats.steps - before); before = s.stats.steps;
    }
    // 20 Schritte zu je 0,5 ms: fünf je Bild (nach dem fünften sind 2,5 ms verbraucht), vier Bilder, danach der Tausch allein
    expect(perFrame.slice(0, 4)).toEqual([5, 5, 5, 5]);
    expect(s.stats.steps).toBe(20);
    const commit = f.log.find((e) => e.what === 'commit')!;
    const lastStage = f.log.filter((e) => e.what === 'stage20')[0];
    expect(commit.frame).toBe(lastStage.frame + 1);
    expect(s.stats.overBudget).toBe(0);
    expect(s.stats.maxStepMs).toBeCloseTo(0.5, 9);
    expect(s.levelOf(0)).toBe(2);
  });

  it('ein einzelner Schritt, der das Budget allein sprengt, wird gezählt und gemeldet (die Welt bleibt benutzbar)', () => {
    const clock = { t: 0 };
    let frame = 0;
    const f = fakeHost({ stages: 3, stageMs: 40, clock, frame: () => frame });
    const s = new WorldStreamer(f.host, () => clock.t);
    s.addIsland(SOLO[0]);
    for (let i = 0; i < 6; i++) { frame++; s.beginInterest(); s.addInterest(1100, 0); s.update(); }
    expect(s.stats.overBudget).toBe(3);
    expect(s.stats.maxStepMs).toBe(40);
    // trotzdem höchstens ein solcher Schritt je Bild: das Budget ist nach dem ersten verbraucht
    expect(f.log.filter((e) => e.i === 0 && e.what.startsWith('stage')).map((e) => e.frame)).toEqual([1, 2, 3]);
  });

  it('mehrere Inseln werden nacheinander gebaut, die nächste zuerst; nie zwei Aufbauten gleichzeitig', () => {
    const clock = { t: 0 };
    let frame = 0;
    const f = fakeHost({ clock, frame: () => frame });
    const s = new WorldStreamer(f.host, () => clock.t);
    s.addIsland({ id: 'n', x: 0, z: 0, r: 50 });
    s.addIsland({ id: 'm', x: 500, z: 0, r: 50 });
    s.addIsland({ id: 'k', x: -700, z: 0, r: 50 });
    let maxBuilding = 0;
    for (let i = 0; i < 40; i++) {
      frame++;
      s.beginInterest(); s.addInterest(200, 0); s.update();
      maxBuilding = Math.max(maxBuilding, s.counts().building);
    }
    expect(maxBuilding).toBe(1);
    expect(s.counts().active).toBe(3);
    const firstStage = [...new Set(f.log.filter((e) => e.what === 'stage1').map((e) => e.i))];
    expect(firstStage[0]).toBe(0); // Abstand 150 (Insel n) gegen 250 (m) und 850 (k)
    expect(firstStage[1]).toBe(1);
    expect(firstStage[2]).toBe(2);
    // jeder Aufbau lief genau einmal
    expect(f.log.filter((e) => e.what === 'begin').length).toBe(3);
  });

  it('Abbruch: wer sich abwendet, bevor die Insel fertig ist, bekommt keinen Tausch; das Halbfertige wird abgebaut', () => {
    const { s, f, tick } = setup({ world: SOLO });
    tick(1100, 0);                         // Stufe 1 gelaufen (das erste Bild legt die Silhouette an und führt den ersten Schritt aus)
    expect(f.get(0).partial).toBe(1);
    for (let i = 0; i < 3; i++) tick(1500, 0); // Küstenabstand 1 400: über 1 200, Wunsch HORIZON
    expect(f.get(0).aborted).toBe(1);
    expect(f.get(0).visible).toBe(false);
    expect(s.levelOf(0)).toBe(1);
    expect(s.counts().building).toBe(0);
    expect(f.log.filter((e) => e.i === 0 && e.what === 'commit')).toHaveLength(0);
  });

  it('fertig gebaute, aber noch nicht getauschte Insel wird beim Abwenden freigegeben (kein Leck)', () => {
    const { s, f, tick } = setup({ world: SOLO });
    // drei Bilder bis die Stufen durch sind (Stufe 1, 2, 3), dann abwenden, bevor der Tausch kam
    tick(1100, 0); tick(1100, 0); tick(1100, 0);
    expect(f.get(0).built).toBe(true);
    expect(f.get(0).visible).toBe(false);
    tick(2000, 0);
    expect(f.get(0).built).toBe(false);
    expect(s.counts().building).toBe(0);
  });

  it('Abbau der ACTIVE-Inseln: höchstens eine je Bild', () => {
    const clock = { t: 0 };
    const f = fakeHost({ clock });
    const s = new WorldStreamer(f.host, () => clock.t);
    for (let i = 0; i < 4; i++) s.addIsland({ id: `i${i}`, x: i * 300, z: 0, r: 40 });
    s.forceSyncAround(450, 0);
    expect(s.counts().active).toBe(4);
    const before = f.log.filter((e) => e.what === 'dispose').length;
    s.beginInterest(); s.addInterest(9000, 0); s.update();
    expect(f.log.filter((e) => e.what === 'dispose').length - before).toBe(1);
    for (let i = 0; i < 6; i++) { s.beginInterest(); s.addInterest(9000, 0); s.update(); }
    expect(s.counts().active).toBe(0);
    expect(s.counts().horizon).toBe(0);
    expect(s.counts().unloaded).toBe(4);
  });
});

describe('forceSyncAround: sofort fertig (Laden, Raid-Rückkehr, Schnellreise)', () => {
  it('baut alle Inseln im ACTIVE-Radius vollständig und synchron, die im Horizont-Radius als Silhouette', () => {
    const { s, f } = setup();
    expect(s.counts().active).toBe(0);
    const built = s.forceSyncAround(700, 0); // a: Küstenabstand 600, b: 700 (beide ACTIVE), c: Küstenabstand 5 500
    expect(built).toBe(2);
    expect(s.levelOf(0)).toBe(2); expect(s.levelOf(1)).toBe(2); expect(s.levelOf(2)).toBe(0);
    expect(s.counts().building).toBe(0);
    expect(f.get(0).visible && f.get(1).visible).toBe(true);
    expect(f.get(0).shown).toBe(false);  // Silhouette ist gegen die Insel getauscht
    // Silhouette im Horizontbereich: Punkt bei x = 2 400 → a: 2 300 (HORIZON), b: Küstenabstand 800 (ACTIVE), c: 3 800 (HORIZON)
    s.forceSyncAround(2400, 0);
    expect(s.levelOf(1)).toBe(2); expect(s.levelOf(2)).toBe(1); expect(f.get(2).shown).toBe(true);
    expect(s.levelOf(0)).toBe(1); expect(f.get(0).built).toBe(false); // a wurde abgebaut, Daten bleiben beim Host
  });

  it('läuft ein Aufbau schon, wird er zu Ende geführt (kein doppelter Aufbau)', () => {
    const { s, f, tick } = setup({ world: SOLO });
    tick(1100, 0); // Stufe 1 gelaufen
    expect(f.get(0).partial).toBe(1);
    s.forceSyncAround(1100, 0);
    expect(s.levelOf(0)).toBe(2);
    expect(f.log.filter((e) => e.i === 0 && e.what === 'begin')).toHaveLength(1);
    expect(f.log.filter((e) => e.i === 0 && e.what === 'commit')).toHaveLength(1);
  });

  it('danach ändert ein normaler Takt am selben Ort nichts mehr (stabil, kein Nachbau, kein Abbau)', () => {
    const { s, f, tick } = setup();
    s.forceSyncAround(700, 0);
    const n = f.log.length;
    for (let i = 0; i < 40; i++) tick(700, 0);
    expect(f.log.length).toBe(n);
    expect(s.counts()).toMatchObject({ active: 2, building: 0 });
  });

  it('Schnellreise ans andere Ende: die alte Gegend wird abgebaut, die neue steht sofort', () => {
    const { s, f } = setup();
    s.forceSyncAround(700, 0);
    expect(s.counts().active).toBe(2);
    s.forceSyncAround(6400, 0);
    expect(s.levelOf(2)).toBe(2);
    expect(s.levelOf(0)).toBe(0); expect(s.levelOf(1)).toBe(0);
    expect(f.get(0).shown || f.get(0).visible || f.get(1).shown || f.get(1).visible).toBe(false);
  });

  it('Stufenwahl entspricht einer Brute-Force-Rechnung über alle Inseln (Zufallsorte, echte Karte)', () => {
    const clock = { t: 0 };
    const f = fakeHost({ clock });
    const s = new WorldStreamer(f.host, () => clock.t);
    REAL.forEach((d) => s.addIsland(d));
    const rnd = lcg(99);
    for (let n = 0; n < 40; n++) {
      const a = rnd() * 6.283, d = Math.sqrt(rnd()) * 5600, x = Math.cos(a) * d, z = Math.sin(a) * d;
      s.forceSyncAround(x, z);
      for (let i = 0; i < REAL.length; i++) {
        const dist = Math.max(0, Math.hypot(x - REAL[i].x, z - REAL[i].z) - REAL[i].r);
        const lvl = s.levelOf(i);
        // innerhalb der festen Schwellen stimmt die Stufe immer; dazwischen entscheidet die Hysterese
        if (dist <= STREAM.activeIn) expect(lvl).toBe(2);
        if (dist > STREAM.horizonOut) expect(lvl).toBe(0);
        if (dist > STREAM.activeOut && dist <= STREAM.horizonIn) expect(lvl).toBe(1);
      }
      expect(s.counts().building).toBe(0);
    }
    // im Spiel sind höchstens wenige Inseln gleichzeitig im ACTIVE-Radius
    const c = s.counts();
    expect(c.active + c.horizon + c.unloaded).toBe(REAL.length);
  });
});

describe('Daten bleiben, Darstellung kommt und geht', () => {
  it('der Schnappschuss ist reines JSON: Inseln mit Zelle und Stufe, dazu das Raster', () => {
    const { s } = setup();
    s.forceSyncAround(700, 0);
    const snap = JSON.parse(JSON.stringify(s.snapshot()));
    expect(snap.chunkSize).toBe(750);
    expect(snap.islands.map((i: { id: string }) => i.id)).toEqual(['a', 'b', 'c']);
    expect(snap.islands[0]).toMatchObject({ id: 'a', chunk: '0,0', level: LOD.ACTIVE_HIGH, levelName: 'ACTIVE_HIGH' });
    expect(snap.islands[1].chunk).toBe('2,0');
    expect(snap.islands[2]).toMatchObject({ chunk: '8,0', level: 0 });
    expect(snap.grid.discs).toHaveLength(3);
  });

  it('disposeAll baut alles ab und lässt nichts stehen', () => {
    const { s, f } = setup();
    s.forceSyncAround(700, 0);
    s.disposeAll();
    expect(s.counts()).toEqual({ unloaded: 3, horizon: 0, active: 0, building: 0 });
    for (const i of [0, 1, 2]) { const g = f.get(i); expect(g.shown || g.built || g.visible).toBe(false); }
  });

  it('ein fehlschlagender Aufbau blockiert die Welt nicht: Fehler gezählt, Insel später neu versucht', () => {
    const clock = { t: 0 };
    let boom = true;
    const f = fakeHost({ clock });
    const host: StreamHost = {
      ...f.host,
      buildActive(i) { if (boom && i === 0) { boom = false; return (function* () { yield; throw new Error('Test'); })(); } return f.host.buildActive(i); },
    };
    const s = new WorldStreamer(host, () => clock.t);
    WORLD.forEach((d) => s.addIsland(d));
    const orig = console.error; console.error = () => {};
    try {
      for (let i = 0; i < 20; i++) { s.beginInterest(); s.addInterest(700, 0); s.update(); }
      expect(s.stats.failures).toBe(1);
      expect(s.levelOf(1)).toBe(2); // die andere Insel kam trotzdem
      for (let i = 0; i < 400; i++) { s.beginInterest(); s.addInterest(700, 0); s.update(); }
      expect(s.levelOf(0)).toBe(2);
    } finally { console.error = orig; }
  });
});

// ---------- 5. Natürlicher Sturm-Rand ----------

describe('Sturm-Rand: Sturm-Zone statt unsichtbarer Wand', () => {
  const zone = newEdgeZone();

  it('Zone zwischen soft und hard, hinter allen Inseln und vor dem Wasserfall', () => {
    expect(SOFT_WORLD_RADIUS).toBeLessThan(HARD_WORLD_RADIUS);
    expect(HARD_WORLD_RADIUS).toBe(EDGE_WALL);
    expect(HARD_WORLD_RADIUS).toBeLessThan(WORLD_RADIUS);
    // keine Insel (samt Küstenzug 1,3 und Böschung) reicht in die Zone, außer der Außenküste des Marine-Hauptquartiers, die erst weit drin endet
    for (const d of REAL) if (d.kind !== 'marinefort') expect(Math.hypot(d.x, d.z) + d.r * 1.3).toBeLessThan(SOFT_WORLD_RADIUS);
  });

  it('Stärke: 0 bis zur weichen Grenze, 1 an der harten, stetig und steigend', () => {
    expect(edgeStrength(0)).toBe(0);
    expect(edgeStrength(SOFT_WORLD_RADIUS)).toBe(0);
    expect(edgeStrength(HARD_WORLD_RADIUS)).toBe(1);
    expect(edgeStrength(HARD_WORLD_RADIUS + 500)).toBe(1);
    let last = 0;
    for (let d = SOFT_WORLD_RADIUS; d <= HARD_WORLD_RADIUS; d += 1) { const k = edgeStrength(d); expect(k).toBeGreaterThanOrEqual(last); expect(k - last).toBeLessThan(0.02); last = k; }
    expect(edgePush(1)).toBe(EDGE_PUSH_MAX);
    expect(edgeWarningLevel(0)).toBe(0); expect(edgeWarningLevel(0.1)).toBe(1); expect(edgeWarningLevel(0.9)).toBe(2);
    expect(EDGE_WARNING).toBe('Unerforschte Sturmsee – Rückkehr empfohlen');
  });

  it('Mitte der Welt, NaN und Unendlich erzeugen keine NaN', () => {
    const z0 = edgeZoneAt(0, 0, newEdgeZone());
    expect(z0.k).toBe(0); expect(Number.isNaN(z0.inX)).toBe(false);
    expect(edgeZoneAt(NaN, 5, newEdgeZone()).k).toBe(0);
    const b = { x: NaN, z: 3, speed: 5 };
    expect(applyEdgeDrift(b, 1 / 60, zone)).toBe(false);
    expect(Number.isFinite(b.x + b.z + b.speed)).toBe(true);
    const inf = { x: Infinity, z: 0, speed: 2 };
    applyEdgeDrift(inf, 1 / 60, zone);
    expect(Number.isFinite(inf.x)).toBe(true);
  });

  /** Ein Schiff mit der echten Fahrphysik: Segel gesetzt, Kurs vorgegeben, optional Stoßfahrt */
  function sail(tier: number, x: number, z: number, course: () => number, secs: number, boost: boolean, onStep?: (m: ReturnType<typeof newMotion>, t: number) => void) {
    const cls = SHIP_CLASSES[tier], evo = evoStats(evolutionOfTier(3));
    const mp: MotionParams = { L: cls.L, turnMult: 1, turnK: evo.turnK, perfTurn: 1, perfAccel: 1, accelK: evo.accelK };
    const m = newMotion(x, z, course(), 8);
    const z1 = newEdgeZone();
    const DT = 1 / 60;
    let maxD = 0, minD = Infinity, inZone = 0;
    for (let i = 0; i < secs * 60; i++) {
      const want = course();
      let dh = want - m.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const wind = windSpeedK(m.heading, 0.6, 0.6, evo.upwindK);
      const target = Math.min(cls.spd * SEA_SPEED * evo.speedK * wind, 14.5) * (boost ? 1.7 : 1);
      stepMotion(m, Math.max(-1, Math.min(1, -dh * 2)), target, mp, DT);
      if (applyEdgeDrift(m, DT, z1)) inZone++;
      const d = Math.hypot(m.x, m.z);
      maxD = Math.max(maxD, d); minD = Math.min(minD, d);
      expect(Number.isFinite(m.x + m.z + m.speed + m.heading)).toBe(true);
      onStep?.(m, i * DT);
    }
    return { m, maxD, minD, inZone };
  }

  it('Vollfahrt nach außen (auch mit Stoßfahrt) kommt nie über die harte Grenze und bleibt dabei endlich; der Sturm wird stärker', () => {
    for (const tier of [0, 2, 4, 6]) for (const boost of [false, true]) {
      const x0 = SOFT_WORLD_RADIUS - 300;
      const r = sail(tier, 0, x0, () => 0, 180, boost); // Kurs 0 = +z = nach außen
      expect(r.maxD).toBeLessThanOrEqual(HARD_WORLD_RADIUS + 1e-6);
      expect(r.inZone).toBeGreaterThan(300);
    }
  });

  it('wer treiben lässt, wird zurück ins Spielgebiet getragen (Gegenströmung, ohne Segel)', () => {
    const b = { x: 0, z: HARD_WORLD_RADIUS - 40, speed: 0 };
    const z1 = newEdgeZone();
    let t = 0;
    while (t < 600 && Math.hypot(b.x, b.z) > SOFT_WORLD_RADIUS + 10) { applyEdgeDrift(b, 1 / 60, z1); t += 1 / 60; }
    expect(Math.hypot(b.x, b.z)).toBeLessThanOrEqual(SOFT_WORLD_RADIUS + 10);
    expect(t).toBeLessThan(600);
  });

  it('kein Feststecken: am Gleichgewichtspunkt gegen die Strömung gedreht, fährt das Schiff in wenigen Minuten wieder hinaus aus der Zone', () => {
    let outward = true;
    const r = sail(2, 0, SOFT_WORLD_RADIUS + 30, () => (outward ? 0 : Math.PI), 400, false, (m, t) => { if (t > 150) outward = false; void m; });
    expect(r.minD).toBeLessThan(SOFT_WORLD_RADIUS - 5);
    expect(Math.hypot(r.m.x, r.m.z)).toBeLessThan(SOFT_WORLD_RADIUS);
  });

  it('Fahrt entlang des Rands in jeder Richtung bleibt endlich (Kreisfahrt, 300 s)', () => {
    for (const a of [0, 1.3, 2.9, 4.4]) {
      const x0 = Math.sin(a) * (SOFT_WORLD_RADIUS + 100), z0 = Math.cos(a) * (SOFT_WORLD_RADIUS + 100);
      const r = sail(3, x0, z0, () => a + Math.PI / 2, 300, false);
      expect(r.maxD).toBeLessThanOrEqual(HARD_WORLD_RADIUS + 1e-6);
    }
  });
});

// ---------- 6. Horizont-Silhouette ----------

describe('HORIZON_LOD: ultraleichte, gecachte Silhouette', () => {
  const kinds = ['town', 'harbor', 'camp', 'ruin', 'quiet', 'treasure', 'lighthouse', 'boss', 'marinefort', 'citadel'];

  it('jede Insel der echten Karte: wenige Dreiecke, gültige Indizes, nur endliche Zahlen, höchstens vier Zeichenaufrufe', () => {
    for (const d of REAL) {
      const walk = island(d.x, d.z, d.r);
      walk.hills = [{ x: d.x + d.r * 0.1, z: d.z, r: d.r * 0.5, h: 0.4 }];
      const h = buildHorizonData(walk, d.kind);
      const nv = h.pos.length / 3, nf = h.foamPos.length / 3;
      expect(nv).toBeGreaterThan(20);
      expect(nv).toBeLessThan(300);                 // ultraleicht
      expect(h.idx.length / 3).toBeLessThan(400);
      for (const i of h.idx) expect(i).toBeLessThan(nv);
      for (const i of h.foamIdx) expect(i).toBeLessThan(nf);
      for (const v of [...h.pos, ...h.foamPos]) expect(Number.isFinite(v)).toBe(true);
      // Silhouette (1) + Gischtband (1) + Feuer (0 oder 1): höchstens 3 Zeichenaufrufe
      expect(2 + (h.beacon ? 1 : 0)).toBeLessThanOrEqual(4);
      expect(h.top).toBeGreaterThan(1);
    }
  });

  it('deterministisch (gleiche Zahlen bei jedem Aufruf) und der Küste folgend: Gischtband liegt auf der Wasserlinie', () => {
    const walk = island(100, -50, 80);
    walk.hills = [{ x: 100, z: -50, r: 40, h: 0.5 }];
    const a = buildHorizonData(walk, 'quiet'), b = buildHorizonData(walk, 'quiet');
    expect(Array.from(a.pos)).toEqual(Array.from(b.pos));
    expect(Array.from(a.foamPos)).toEqual(Array.from(b.foamPos));
    // jeder Gischt-Eckpunkt unten (y = 0) liegt auf der Wasserlinie der Küste (Radius × Küstenfaktor × (1 + Böschung · WATERLINE))
    for (let k = 0; k < a.foamPos.length / 6; k++) {
      const x = a.foamPos[k * 6], y = a.foamPos[k * 6 + 1], z = a.foamPos[k * 6 + 2];
      const ang = Math.atan2(z, x), e = walk.r * coastK(walk.coast, ang) * (1 + walk.shelf * WATERLINE);
      expect(y).toBe(0);
      expect(Math.hypot(x, z)).toBeCloseTo(e, 5);
    }
  });

  it('Leuchtturm: Turm und Feuer, das auch am Tag brennt; Häfen und Festungen haben ein Feuer, ruhige Inseln keins', () => {
    const w = island(0, 0, 30);
    const lh = buildHorizonData(w, 'lighthouse');
    expect(lh.top).toBeGreaterThan(25);
    expect(lh.beacon?.dayK).toBeGreaterThan(0);
    expect(buildHorizonData(w, 'harbor').beacon).not.toBeNull();
    expect(buildHorizonData(w, 'citadel').beacon).not.toBeNull();
    expect(buildHorizonData(w, 'quiet').beacon).toBeNull();
    expect(kinds.every((k) => buildHorizonData(w, k).idx.length > 0)).toBe(true);
  });
});

// ---------- 7. Verdrahtung im Quelltext ----------

describe('Verdrahtung', () => {
  const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
  const strip = (s: string) => s.replace(new RegExp('//.*$', 'gm'), '').replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), '');

  it('Küstenabfragen des Bodens laufen über das Raster, nicht mehr über die ganze Inselliste', () => {
    const g = strip(src('world/islandGround.ts'));
    // keine Schleife mehr über die ganze Inselliste (nur der Neuaufbau des Rasters liest sie, über eine Kurzschreibung)
    expect((g.match(/of this\.islands\b/g) ?? []).length).toBe(0);
    expect(g).toContain('islandGrid.query');
    expect(strip(src('world/dockingSystem.ts'))).toContain('getNearbyIslands');
  });

  it('Lenkung (Fühler), Wasserprüfung der Flotte und Schiffskollision fragen nur die nächsten Stege', () => {
    const st = strip(src('naval/shipSteering.ts'));
    expect(st).toContain('getNearbyPiers');
    expect(st).not.toMatch(/world\.piers/);
    expect(strip(src('naval/naval.ts'))).toContain('getNearbyPiers');
  });

  it('SeaWorld streamt die Inseln über den WorldStreamer und ersetzt die unsichtbare Wand durch die Sturm-Zone', () => {
    const w = strip(src('world/seaWorld.ts'));
    expect(w).toContain('new WorldStreamer');
    expect(w).toContain('applyEdgeDrift');
    expect(w).not.toMatch(/d > EDGE_WALL/);
  });
});
