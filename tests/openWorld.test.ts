// Phase 4.3B: offene Welt, Themen-Inseln, Blueprint-Phase ohne Netze, Sturm-Barriere am Rand. Seit 4.5C: 15 600 m Radius, fünf Ringe, 60 Themen-Inseln
// (24 aus 4.3B, 36 aus 4.5C); die Prüfungen der Erweiterung selbst stehen in tests/expandedOpenWorld.test.ts.
// Alles deterministisch und ohne three.js: die Blueprints entstehen hier genau so wie beim Weltstart.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DANGER, dangerOfDistance, dangerOfLevel } from '../src/data/balanceConfig';
import { GOODS, ISLAND_PROFILES, emptyEconomy, profileOf } from '../src/data/economy';
import { marketAt } from '../src/core/economyEngine';
import { BORDERS, CITADELS, FACTIONS, sectorAt, type PowerId } from '../src/data/factions';
import { SITE_BIOMES, THEME_ISLANDS, THEME_ISLANDS_43B, plotCenter, coastOf } from '../src/data/openWorld';
import { REGIONS, seaLevelAt } from '../src/data/regions';
import { SITES } from '../src/data/settlements';
import { EDGE_WALL, PLAYABLE_RADIUS, WORLD_RADIUS } from '../src/data/world';
import { RINGS, ringAtDistance } from '../src/data/worldRings';
import { coastK, WATERLINE } from '../src/world/islandGround';
import { buildBlueprints, siteFrame, walkOf, type IslandBlueprint } from '../src/world/islandBlueprint';
import { CAMERA_PLANES } from '../src/data/qualityTiers';
import { STREAM } from '../src/world/worldStreamer';
import {
  EDGE_PUSH_MAX, HARD_WORLD_RADIUS, SOFT_WORLD_RADIUS, applyEdgeDrift, edgeStrength, newEdgeZone,
} from '../src/world/stormEdge';
import { SEA_SPEED, SHIP_CLASSES } from '../src/data/ships';
import { evoStats, evolutionOfTier } from '../src/data/shipEvolution';
import { newMotion, stepMotion, windSpeedK, type MotionParams } from '../src/naval/shipMotion';

const ALL = REGIONS.flatMap((r) => r.islands);
// die Themen-Inseln (24 aus 4.3B, 36 aus 4.5C); Mega-Inseln und ihre Schären (4.3.6) prüft tests/megaIslands.test.ts
const NEW = ALL.filter((i) => i.themePower !== undefined && !i.mega && !i.skerry);
const BP: IslandBlueprint[] = buildBlueprints(ALL, REGIONS);
const bpOf = (id: string) => BP.find((b) => b.id === id)!;
const POWERS: PowerId[] = ['england', 'niederlande', 'deutschland', 'frankreich', 'kurogane'];

// ---------- 1. Welt, Ringe, Radien ----------

describe('Offene Welt seit 4.5C: Radius 15 600 m, fünf Ringe', () => {
  it('spielbarer Radius 15 600 m (2,25-fache Fläche gegenüber 10 400 m), Wasserfall dahinter', () => {
    expect(PLAYABLE_RADIUS).toBe(15600);
    expect((PLAYABLE_RADIUS / 10400) ** 2).toBeCloseTo(2.25, 9);
    expect(WORLD_RADIUS).toBeGreaterThan(EDGE_WALL);
    expect(EDGE_WALL).toBe(15850);
  });

  it('fünf lückenlose Ringe mit den Gefahrenstufen 1 · 2 · 3 · 4–5 · 5 (Kaiser-Stufe)', () => {
    expect(RINGS.map((r) => [r.from, r.to])).toEqual([[0, 2800], [2800, 6600], [6600, 10200], [10200, 13000], [13000, 15600]]);
    expect(RINGS.map((r) => r.danger)).toEqual([[1, 1], [2, 2], [3, 3], [4, 5], [5, 5]]);
    for (const r of RINGS) {
      for (let d = r.from; d < r.to; d += 37) {
        expect(ringAtDistance(d).ring).toBe(r.ring);
        const t = dangerOfDistance(d);
        expect(t, `${d} m`).toBeGreaterThanOrEqual(r.danger[0]);
        expect(t, `${d} m`).toBeLessThanOrEqual(r.danger[1]);
      }
    }
  });

  it('Streaming und Kamera wachsen mit: HORIZON_LOD 1 100 – 4 200 m (Abbau 4 500), Fernebene 4 800 m', () => {
    expect(STREAM.activeIn).toBe(1100);
    expect(STREAM.horizonIn).toBe(4200);
    expect(STREAM.horizonOut).toBeLessThan(CAMERA_PLANES.far);
    expect(CAMERA_PLANES.far).toBe(4800);
  });

  it('jede Insel trägt Ring und Gefahrenstufe ihres Ortes', () => {
    for (const i of ALL) {
      const d = Math.hypot(i.x, i.z);
      expect(i.ring, i.id).toBe(ringAtDistance(d).ring);
      expect(i.dangerTier, i.id).toBe(dangerOfDistance(d));
    }
  });

  it('die fünf Königsinseln und das Marine-Hauptquartier liegen in Ring 4, den Königs-Meeren (Gefahrenstufe 5)', () => {
    expect(CITADELS).toHaveLength(6);
    for (const c of CITADELS) {
      const i = ALL.find((x) => x.id === c.id)!;
      expect(i.ring, c.id).toBe(4);
      expect(i.dangerTier, c.id).toBe(5);
      expect(Math.hypot(i.x, i.z), c.id).toBeGreaterThan(11600);
    }
  });
});

// ---------- 2. Abstände ----------

describe('Abstände: keine Insel berührt eine andere, auch nicht mit der Strandböschung', () => {
  it('Wasserlinien aller Inseln und Festungen liegen mindestens 80 m auseinander', () => {
    let tight = Infinity, pair = '';
    for (let a = 0; a < BP.length; a++) for (let b = a + 1; b < BP.length; b++) {
      const A = BP[a], B = BP[b];
      const gap = Math.hypot(A.x - B.x, A.z - B.z) - A.waterR - B.waterR;
      if (gap < tight) { tight = gap; pair = `${A.id}/${B.id}`; }
      expect(gap, `${A.id} – ${B.id}`).toBeGreaterThan(80);
    }
    expect(pair).not.toBe('');
  });

  it('neue Inseln halten den Platzbedarf der Welt ein ((r₁ + r₂) · 1,45 + 50 m) und mindestens 600 m Fahrwasser', () => {
    for (const n of NEW) for (const o of ALL) {
      if (o === n) continue;
      const d = Math.hypot(n.x - o.x, n.z - o.z);
      expect(d, `${n.id} – ${o.id}`).toBeGreaterThan((n.r + o.r) * 1.45 + 50);
      expect(d, `${n.id} – ${o.id}`).toBeGreaterThan(600);
    }
  });

  it('alles liegt vor der Sturmsee: Wasserlinie mindestens 100 m innerhalb von 15 600 m', () => {
    for (const b of BP) expect(Math.hypot(b.x, b.z) + b.waterR, b.id).toBeLessThan(PLAYABLE_RADIUS - 100);
  });

  it('neue Inseln liegen fern der Grenzlinien (mindestens 700 m), damit Grenz-Seeschlachten nicht an ihrem Strand toben', () => {
    for (const n of NEW) for (const b of BORDERS) {
      const a = (b.deg * Math.PI) / 180, along = Math.sin(a) * n.x + Math.cos(a) * n.z;
      if (along < 0) continue;
      const across = Math.abs(Math.cos(a) * n.x - Math.sin(a) * n.z);
      expect(across, `${n.id} an Grenze ${b.borderIndex}`).toBeGreaterThan(700);
    }
  });
});

// ---------- 3. Die 24 Themen-Inseln ----------

describe('Themen-Inseln (24 aus 4.3B, 36 aus 4.5C): Sektor, Gefahr, Markt, Stege', () => {
  it('4.3B: genau 24, je vier in jedem Kuchenstück, vier unkartierte; insgesamt 60; eindeutige Kennungen und Namen', () => {
    expect(THEME_ISLANDS_43B).toHaveLength(24);
    expect(THEME_ISLANDS).toHaveLength(60);
    expect(NEW).toHaveLength(60);
    for (const p of POWERS) expect(THEME_ISLANDS_43B.filter((s) => s.power === p), p).toHaveLength(4);
    expect(THEME_ISLANDS_43B.filter((s) => s.power === null && s.uncharted)).toHaveLength(4);
    expect(new Set(ALL.map((i) => i.id)).size).toBe(ALL.length);
    expect(new Set(ALL.map((i) => i.name)).size).toBe(ALL.length);
  });

  it('jede Insel liegt im Kuchenstück ihrer Macht und gehört ihr; unkartierte sind herrenlos und tragen das Flag', () => {
    for (const s of THEME_ISLANDS) {
      const i = ALL.find((x) => x.id === s.id)!;
      if (s.power) {
        expect(sectorAt(i.x, i.z).factionId, s.id).toBe(s.power);
        expect(i.factionId, s.id).toBe(s.power);
        expect(FACTIONS[s.power].sector, s.id).toBe(i.sectorIndex);
        expect(i.uncharted ?? false, s.id).toBe(false);
      } else {
        expect(i.factionId, s.id).toBeNull();
        expect(i.uncharted, s.id).toBe(true);
        expect(i.ring, s.id).toBeGreaterThanOrEqual(3);
        expect(bpOf(s.id).uncharted).toBe(true);
      }
    }
  });

  it('über vier Gefahrenzonen verteilt (Stufe 2 bis 5) und in den Ringen 2 bis 5; Lager haben eine Stufe ihres Meeres', () => {
    expect(new Set(NEW.map((i) => i.dangerTier))).toEqual(new Set([2, 3, 4, 5]));
    expect(new Set(NEW.map((i) => i.ring))).toEqual(new Set([2, 3, 4, 5]));
    for (const i of NEW) {
      if (i.kind === 'camp' || i.kind === 'ruin' || i.kind === 'treasure') {
        expect(i.level, i.id).toBeDefined();
        expect(Math.abs(dangerOfLevel(i.level!) - i.dangerTier!), i.id).toBeLessThanOrEqual(1);
      }
      // Meer rund um die Insel: nie schwächer als die untere Stufe ihres Gefahrenbandes (ab Ring 3)
      if (i.ring! >= 3) expect(seaLevelAt(i.x, i.z), i.id).toBeGreaterThanOrEqual(DANGER[i.dangerTier!].levelMin);
    }
  });

  it('eigener Markt je Insel: Überschuss und Bedarf, Schwarzmärkte ohne Kontrolle; Gleichgewichtsvorrat im Blueprint', () => {
    for (const s of THEME_ISLANDS) {
      const own = ISLAND_PROFILES[s.id];
      expect(own, s.id).toBeDefined();
      const i = ALL.find((x) => x.id === s.id)!;
      const p = profileOf({ id: i.id, region: i.region, factionId: i.factionId });
      for (const g of p.produce) expect(p.demand, s.id).not.toContain(g);
      if (i.kind !== 'harbor') continue;
      expect(p.produce.length, s.id).toBeGreaterThan(0);
      expect(p.demand.length, s.id).toBeGreaterThan(0);
      const m = bpOf(s.id).market!;
      expect(m, s.id).not.toBeNull();
      // der Markt, den das Spiel beim ersten Besuch anlegt (MarketState), steht genau auf dem Gleichgewicht des Blueprints
      const state = marketAt(emptyEconomy(), { id: i.id, name: i.name, profile: p, war: { borderDist: 9999, occupied: false, fort: false } }, 0);
      for (const g of GOODS) { expect(state.stock[g.id], `${s.id}/${g.id}`).toBe(m.eqStock[g.id]); expect(m.eqStock[g.id]).toBeGreaterThan(0); }
    }
    expect(THEME_ISLANDS.filter((s) => ISLAND_PROFILES[s.id].blackMarket).map((s) => s.id).sort()).toEqual(['fluesterlagune', 'irrlichtbucht', 'sandbankatoll', 'schattenbucht']);
    for (const id of ['fluesterlagune', 'irrlichtbucht', 'sandbankatoll', 'schattenbucht']) expect(profileOf({ id }).blackMarket, id).toBe(true);
    // die Themen-Inseln handeln zusammen alles: jede Ware wird auf mindestens einer erzeugt oder gebraucht
    for (const g of GOODS) {
      const used = NEW.some((i) => { const p = profileOf({ id: i.id, region: i.region, factionId: i.factionId }); return p.produce.includes(g.id) || p.demand.includes(g.id); });
      expect(used, g.id).toBe(true);
    }
  });

  it('jede neue Insel hat mindestens einen Steg: beginnt am Strand, reicht weit ins tiefe Wasser, kreuzt keine Insel', () => {
    for (const s of THEME_ISLANDS) {
      const b = bpOf(s.id);
      expect(b.piers.length, s.id).toBeGreaterThan(0);
      for (const p of b.piers) {
        const a = Math.atan2(p.az - b.z, p.ax - b.x);
        const coast = b.r * coastK(b.coast, a);
        const start = Math.hypot(p.ax - b.x, p.az - b.z), end = Math.hypot(p.bx - b.x, p.bz - b.z);
        expect(Math.abs(start - (coast - 3)), `${s.id} Steg-Anfang`).toBeLessThan(2.5);
        const ae = Math.atan2(p.bz - b.z, p.bx - b.x);
        expect(end, `${s.id} Steg-Ende`).toBeGreaterThan(b.r * coastK(b.coast, ae) * (1 + b.shelf * WATERLINE) + 15);
        for (const o of BP) {
          if (o === b) continue;
          for (let t = 0; t <= 1; t += 0.1) {
            const x = p.ax + (p.bx - p.ax) * t, z = p.az + (p.bz - p.az) * t;
            expect(Math.hypot(x - o.x, z - o.z), `${s.id} Steg über ${o.id}`).toBeGreaterThan(o.waterR + 10);
          }
        }
      }
    }
  });

  it('Siedlungen stehen auf Land und überlappen einander nicht; Wege laufen auf der Insel', () => {
    for (const s of THEME_ISLANDS) {
      const site = SITES[s.id];
      expect(site, s.id).toBeDefined();
      expect(site.themed).toBe(true);
      expect(SITE_BIOMES, s.id).toContain(s.biome);
      const E = (a: number) => s.r * coastK(site.coast, a);
      const frames = site.clusters.map((c) => siteFrame(c, s.r, site.coast));
      site.clusters.forEach((c, ci) => {
        const f = frames[ci], cs = Math.cos(f.phi), sn = Math.sin(f.phi);
        for (const it of c.items) {
          if (it.t === 'steg') continue;
          const x = f.cx + it.x * cs + it.z * sn, z = f.cz - it.x * sn + it.z * cs;
          expect(Math.hypot(x, z), `${s.id}: ${it.t} bei (${x.toFixed(0)}, ${z.toFixed(0)})`).toBeLessThan(E(Math.atan2(z, x)) * 0.97);
        }
      });
      for (let a = 0; a < frames.length; a++) for (let b = a + 1; b < frames.length; b++) {
        const d = Math.hypot(frames[a].cx - frames[b].cx, frames[a].cz - frames[b].cz);
        expect(d, `${s.id}: Plätze ${a} und ${b}`).toBeGreaterThan((site.clusters[a].clear + site.clusters[b].clear) * 0.62);
      }
      for (const road of site.roads) for (const [x, z] of road.pts) expect(Math.hypot(x, z), `${s.id}: Weg`).toBeLessThan(E(Math.atan2(z, x)) * 0.96);
      expect(site.roads.length, s.id).toBe(s.plots.length - 1);
      // Mittelpunkte der Daten und der Bau-Rechnung stimmen überein
      s.plots.forEach((pl, k) => { const [x, z] = plotCenter(s, pl, coastOf(s)); expect(x).toBeCloseTo(frames[k].cx, 9); expect(z).toBeCloseTo(frames[k].cz, 9); });
    }
  });
});

// ---------- 4. Blueprint-Phase ohne Netze ----------

/** Alle Module, die ein Modul zur Laufzeit lädt (ohne `import type`), rekursiv; Rückgabe: die nackten Paketnamen */
function runtimeImports(entry: string): Set<string> {
  const path = (u: URL) => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1');
  const seen = new Set<string>(), bare = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    const re = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        const base = path(new URL(spec, new URL(`file:///${file.replace(/\\/g, '/')}`)));
        visit(base.endsWith('.ts') ? base : `${base}.ts`);
      } else bare.add(spec);
    }
  };
  visit(path(new URL(`../src/world/${entry}.ts`, import.meta.url)));
  return bare;
}

describe('Blueprint-Phase beim Weltstart: reine Daten, kein Netz', () => {
  it('das Blueprint-Modul und alles, was es lädt, kommt ohne three.js aus', () => {
    const bare = runtimeImports('islandBlueprint');
    expect([...bare].filter((b) => b.startsWith('three'))).toEqual([]);
    // Gegenprobe: die Prüfung erkennt three.js, wo es geladen wird (Silhouetten der Horizont-Stufe)
    expect(runtimeImports('islandHorizon').has('three')).toBe(true);
  });

  it('Blueprints sind deterministisch und reines JSON (Rundlauf ohne Verlust)', () => {
    const again = buildBlueprints(ALL, REGIONS);
    expect(JSON.stringify(again)).toBe(JSON.stringify(BP));
    expect(JSON.parse(JSON.stringify(BP))).toEqual(BP);
    expect(BP).toHaveLength(ALL.length);
  });

  it('enthalten Küste, Böschung, Kollisionsradius, Rasterzellen, Stege und Markt für jede Insel', () => {
    for (const b of BP) {
      expect(b.coast.length, b.id).toBeGreaterThan(1);
      expect(b.shelf, b.id).toBeGreaterThan(0);
      expect(b.bound, b.id).toBeCloseTo(b.r * 1.9, 9);
      expect(b.waterR, b.id).toBeGreaterThan(b.r);
      expect(b.chunks.length, b.id).toBeGreaterThan(0);
      for (const k of b.chunks) expect(k).toMatch(/^-?\d+,-?\d+$/);
      if (b.kind === 'harbor' || b.kind === 'town') { expect(b.piers.length, b.id).toBeGreaterThan(0); expect(b.market, b.id).not.toBeNull(); }
    }
    // die begehbare Insel startet ohne Hindernisse und ohne Einebnungen: die kommen erst mit dem ersten Aufbau durch den WorldStreamer
    for (const b of BP) { const w = walkOf(b); expect(w.blockers).toHaveLength(0); expect(w.pads).toBeUndefined(); expect(w.lift).toBeUndefined(); }
  });

  it('SeaWorld legt beim Start nur Blueprints an; Netze entstehen erst im Aufbau des WorldStreamers', () => {
    const src = readFileSync(new URL('../src/world/seaWorld.ts', import.meta.url), 'utf8');
    const prep = src.slice(src.indexOf('private prepareIslands()'), src.indexOf('/**', src.indexOf('private prepareIslands()')));
    expect(prep).toContain('buildBlueprints');
    expect(prep).not.toMatch(/new (Group|Mesh|InstancedMesh)|islandStages|toon\(/);
    // keine Insel wird beim Eintragen als fertig gebaut gemeldet (früher: level 2 für alle)
    expect(prep).not.toMatch(/level:\s*2/);
    const steps = src.slice(src.indexOf('*buildSteps()'), src.indexOf('settleStreaming(): number'));
    expect(steps).toContain('forceSyncAround');
    expect(steps).not.toMatch(/islandStages|buildIslands/);
    expect(src).not.toContain('private *buildIslands');
  });
});

// ---------- 5. Sturm-Barriere am neuen Rand ----------

describe('Sturm-Barriere bei 15 600 – 15 850 m (seit 4.5C)', () => {
  it('beginnt bei 15 600 m, ist bei 15 850 m voll (voller Stopp)', () => {
    expect(SOFT_WORLD_RADIUS).toBe(15600);
    expect(HARD_WORLD_RADIUS).toBe(15850);
    expect(edgeStrength(15599)).toBe(0);
    expect(edgeStrength(15850)).toBe(1);
    expect(EDGE_PUSH_MAX).toBeGreaterThan(14.5);
  });

  it('Vollfahrt nach außen bleibt vor 15 850 m stehen, ohne NaN; mit Stoßfahrt hält die harte Kappe', () => {
    for (const tier of [0, 3, 6]) for (const boost of [false, true]) {
      const cls = SHIP_CLASSES[tier], evo = evoStats(evolutionOfTier(3));
      const mp: MotionParams = { L: cls.L, turnMult: 1, turnK: evo.turnK, perfTurn: 1, perfAccel: 1, accelK: evo.accelK };
      const m = newMotion(0, 15400, 0, 10);
      const zone = newEdgeZone();
      let maxD = 0;
      for (let i = 0; i < 60 * 120; i++) {
        const target = Math.min(cls.spd * SEA_SPEED * evo.speedK * windSpeedK(m.heading, 0.6, 0.6, evo.upwindK), 14.5) * (boost ? 1.7 : 1);
        stepMotion(m, 0, target, mp, 1 / 60);
        applyEdgeDrift(m, 1 / 60, zone);
        maxD = Math.max(maxD, Math.hypot(m.x, m.z));
        expect(Number.isFinite(m.x + m.z + m.speed)).toBe(true);
      }
      expect(maxD).toBeLessThanOrEqual(15850 + 1e-6);
      if (!boost) expect(maxD, `Klasse ${tier}`).toBeLessThan(15840);
    }
  });

  it('treibend zurück ins Spielgebiet', () => {
    const b = { x: 0, z: 15830, speed: 0 };
    const zone = newEdgeZone();
    let t = 0;
    while (t < 300 && Math.hypot(b.x, b.z) > 15610) { applyEdgeDrift(b, 1 / 60, zone); t += 1 / 60; }
    expect(Math.hypot(b.x, b.z)).toBeLessThanOrEqual(15610);
  });
});
