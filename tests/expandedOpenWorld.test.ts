// Phase 4.5C: erweiterte offene Welt – 15 600 m Radius (2,25-fache Fläche), Sturm-Barriere bis 15 850 m, fünf Meeres-Ringe, entzerrte Inseln,
// 36 neue Inseln (105 – 112 Hauptinseln auf der Hauptkarte), freigehaltene Kaiser-Bauplätze in Ring 5, Tiefsee-Strömungen, vier interaktive
// Begegnungen (Schiffbrüchige, Schmuggler-Rendezvous, Schatzsuche an Land, Kriegs-Nachschub), Weltkarte mit 10 % Rand und Spielstand 21.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ISLAND_REACH, REGIONS } from '../src/data/regions';
import { EXPANSION_ISLANDS, THEME_ISLANDS, THEME_ISLANDS_43B } from '../src/data/openWorld';
import { ISLAND_PROFILES, profileOf } from '../src/data/economy';
import { CITADELS, SECTORS, sectorAt } from '../src/data/factions';
import { EDGE_WALL, HOME_SPAWN, PLAYABLE_RADIUS, WORLD_RADIUS } from '../src/data/world';
import { KAISER_SITES, KAISER_SITE_CLEAR, RINGS, ringAtDistance } from '../src/data/worldRings';
import { SPREAD_KNOTS, spreadDist, spreadPoint, unspreadDist } from '../src/data/worldSpread';
import { dangerOfDistance } from '../src/data/balanceConfig';
import { CURRENT_BOOST, CURRENT_LANES, DIRECTOR, HUNT, RESCUE, SMUGGLER, SUPPLY, WORLD_EVENT_DEFS } from '../src/data/seaEvents';
import { buildBlueprints } from '../src/world/islandBlueprint';
import { HARD_WORLD_RADIUS, SOFT_WORLD_RADIUS, applyEdgeDrift, newEdgeZone } from '../src/world/stormEdge';
import { CurrentField, buildCurrentLanes, currentBoost, newCurrentSample } from '../src/world/oceanCurrents';
import { WorldEventDirector, cleanWorldEvents, type DirectorIsland, type SupplyFront, type WorldEvent } from '../src/world/worldEventDirector';
import type { ConvoySite } from '../src/world/tradeConvoys';
import { FactionWarEngine, NationRegistry, warWorldFromDefs } from '../src/world/factionWarEngine';
import { RESOURCE_IDS, RESOURCE_TARGET } from '../src/data/nations';
import { migrateSave } from '../src/core/save/migrations';
import { SAVE_VERSION, createSave } from '../src/core/save/types';
import { legacyIslandPos, migratePoint } from '../src/core/save/worldMigration';
import { DISCOVERY } from '../src/world/mapDiscovery';
import { LABEL_ZOOM, MAP_MARGIN, discMargins, fitAll, fitScale, setMapSafeArea } from '../src/ui/mapView';
import { defaultLayers, drawWorldMap, lastLabels } from '../src/ui/worldMapDraw';
import type { WorldMapData } from '../src/ui/minimap';

const ALL = REGIONS.flatMap((r) => r.islands);
const MAIN = ALL.filter((i) => !i.skerry);
const BP = buildBlueprints(ALL, REGIONS);
const NEW_IDS = new Set(EXPANSION_ISLANDS.map((s) => s.id));
const byId = (id: string) => ALL.find((i) => i.id === id)!;

// ---------- 1. Radius, Sturm-Barriere, Ringe ----------

describe('1,5-facher Radius: 15 600 m, Sturm-Barriere bis 15 850 m, fünf Meeres-Ringe', () => {
  it('spielbarer Radius 15 600 m (2,25-fache Fläche von 4.5.1), Sturm-Barriere ab 15 600 m, voller Stopp bei 15 850 m', () => {
    expect(PLAYABLE_RADIUS).toBe(15600);
    expect(PLAYABLE_RADIUS / 10400).toBeCloseTo(1.5, 9);
    expect(SOFT_WORLD_RADIUS).toBe(15600);
    expect(HARD_WORLD_RADIUS).toBe(15850);
    expect(EDGE_WALL).toBe(15850);
    expect(WORLD_RADIUS).toBeGreaterThan(EDGE_WALL);
    // mit Stoßfahrt hinaus: die harte Kappe hält, treibend geht es zurück
    const b = { x: 0, z: 15840, speed: 30 };
    const zone = newEdgeZone();
    for (let i = 0; i < 600; i++) { b.z += b.speed / 60; applyEdgeDrift(b, 1 / 60, zone); expect(Math.hypot(b.x, b.z)).toBeLessThanOrEqual(15850 + 1e-6); }
  });

  it('fünf lückenlose Ringe 0 – 2 800 – 6 600 – 10 200 – 13 000 – 15 600 m mit Gefahr 1 · 2 · 3 · 4–5 · 5 (Kaiser-Stufe)', () => {
    expect(RINGS.map((r) => r.ring)).toEqual([1, 2, 3, 4, 5]);
    expect(RINGS.map((r) => [r.from, r.to])).toEqual([[0, 2800], [2800, 6600], [6600, 10200], [10200, 13000], [13000, 15600]]);
    expect(RINGS[4].tierName).toBe('Kaiser-Stufe');
    for (const r of RINGS) for (let d = r.from; d < r.to; d += 53) {
      expect(ringAtDistance(d).ring).toBe(r.ring);
      const t = dangerOfDistance(d);
      expect(t).toBeGreaterThanOrEqual(r.danger[0]);
      expect(t).toBeLessThanOrEqual(r.danger[1]);
    }
  });

  it('Zonen: Bernsteinsee in Ring 1 um Ankerglück, die sechs Mega-Inseln in Ring 3, die sechs Königsinseln in Ring 4', () => {
    expect(byId('ankerglueck')).toMatchObject({ x: 0, z: 160, ring: 1, dangerTier: 1 });
    expect(Math.hypot(HOME_SPAWN.x, HOME_SPAWN.z)).toBeLessThan(250);
    for (const i of REGIONS[0].islands) expect(i.ring, i.id).toBe(1);
    const megas = ALL.filter((i) => i.mega);
    expect(megas).toHaveLength(6);
    for (const m of megas) { expect(m.ring, m.id).toBe(3); expect(m.dangerTier, m.id).toBe(3); }
    const kings = ['albion', 'adlerstein', 'soleilmont', 'oranjehaven', 'yamikura', 'weisswacht'];
    expect(CITADELS.map((c) => c.id).sort()).toEqual([...kings].sort());
    for (const id of kings) expect(byId(id).ring, id).toBe(4);
  });
});

// ---------- 2. Entzerrung ----------

describe('Entzerrung: alte Lagen wandern radial nach außen', () => {
  it('die Abbildung ist streng steigend und umkehrbar, Ankerglück bleibt, die Ringgrenzen landen auf den neuen', () => {
    for (let i = 1; i < SPREAD_KNOTS.length; i++) { expect(SPREAD_KNOTS[i][0]).toBeGreaterThan(SPREAD_KNOTS[i - 1][0]); expect(SPREAD_KNOTS[i][1]).toBeGreaterThan(SPREAD_KNOTS[i - 1][1]); }
    for (let d = 0; d < 12000; d += 37) { expect(spreadDist(d + 1)).toBeGreaterThan(spreadDist(d)); expect(unspreadDist(spreadDist(d))).toBeCloseTo(d, 6); }
    expect(spreadDist(160)).toBe(160);
    expect(spreadDist(2200)).toBe(2800);
    expect(spreadDist(5200)).toBe(6600);
    expect(spreadDist(8200)).toBe(10200);
    expect(spreadDist(10400)).toBe(13000);
    const p = spreadPoint(3000, 4000);
    expect(Math.atan2(p.x, p.z)).toBeCloseTo(Math.atan2(3000, 4000), 9);
  });

  it('die Inseln aus 4.5.1 stehen dort, wohin die Abbildung ihre alte Lage bringt (Albion 9 500 m → 11 855 m)', () => {
    expect(legacyIslandPos('albion')!.z).toBeCloseTo(9500, -1);
    expect(Math.hypot(byId('albion').x, byId('albion').z)).toBeCloseTo(11855, -1);
    expect(legacyIslandPos('ankerglueck')).toEqual({ x: 0, z: 160 });
    expect(legacyIslandPos('eichenhain')).toBeNull();
  });

  it('die Kartenmitte ist entzerrt: in Ring 1 liegen die Inseln weiter auseinander als bis 4.5.1', () => {
    const inner = REGIONS[0].islands;
    let near = Infinity;
    for (let a = 0; a < inner.length; a++) for (let b = a + 1; b < inner.length; b++) {
      const A = inner[a], B = inner[b];
      near = Math.min(near, Math.hypot(A.x - B.x, A.z - B.z) - (A.r + B.r) * ISLAND_REACH);
    }
    expect(near).toBeGreaterThan(50);
    expect(Math.max(...inner.map((i) => Math.hypot(i.x, i.z)))).toBeGreaterThan(2000);
  });
});

// ---------- 3. 105 – 112 Hauptinseln, 36 neue ----------

describe('105 – 112 Hauptinseln: 36 neue Inseln über die Ringe 2 bis 5', () => {
  it('36 neue Inseln, davon 3 unkartierte; die Hauptkarte zeigt 105 – 112 Hauptinseln (ohne Schären und Unkartierte)', () => {
    expect(EXPANSION_ISLANDS).toHaveLength(36);
    expect(THEME_ISLANDS).toHaveLength(THEME_ISLANDS_43B.length + 36);
    expect(EXPANSION_ISLANDS.filter((s) => s.uncharted && s.power === null)).toHaveLength(3);
    const charted = MAIN.filter((i) => !i.uncharted);
    expect(charted.length).toBeGreaterThanOrEqual(105);
    expect(charted.length).toBeLessThanOrEqual(112);
    expect(MAIN.length).toBeGreaterThanOrEqual(105);
    expect(new Set(ALL.map((i) => i.id)).size).toBe(ALL.length);
    expect(new Set(ALL.map((i) => i.name)).size).toBe(ALL.length);
  });

  it('verteilt über die Ringe 2 bis 5 und alle fünf Kuchenstücke; Minen, Forste, Manufakturen, Gewürz-/Wein-Kolonien, Leuchtturm-Atolle', () => {
    const rings = new Map<number, number>();
    for (const s of EXPANSION_ISLANDS) { const i = byId(s.id); rings.set(i.ring!, (rings.get(i.ring!) ?? 0) + 1); }
    expect([...rings.keys()].sort()).toEqual([2, 3, 4, 5]);
    for (const k of [2, 3, 4, 5]) expect(rings.get(k)!, `Ring ${k}`).toBeGreaterThanOrEqual(7);
    for (const sec of SECTORS) expect(EXPANSION_ISLANDS.filter((s) => s.power === sec.factionId).length, sec.factionId).toBeGreaterThanOrEqual(6);
    const themes = (t: string) => EXPANSION_ISLANDS.filter((s) => s.plots.some((p) => p.theme === t)).length;
    expect(themes('mine')).toBeGreaterThanOrEqual(5);
    expect(themes('forst')).toBeGreaterThanOrEqual(4);
    expect(themes('manufaktur')).toBeGreaterThanOrEqual(4);
    expect(themes('plantage') + themes('weinberg')).toBeGreaterThanOrEqual(4);
    expect(EXPANSION_ISLANDS.filter((s) => s.biome === 'atoll' && s.plots.some((p) => p.theme === 'leuchtfeuer')).length).toBeGreaterThanOrEqual(4);
    for (const s of EXPANSION_ISLANDS) if (s.power) expect(sectorAt(byId(s.id).x, byId(s.id).z).factionId, s.id).toBe(s.power);
  });

  it('keine Überlappung: alle Wasserlinien mindestens 80 m auseinander, neue Inseln mit vollem Platzbedarf und 600 m Fahrwasser', () => {
    for (let a = 0; a < BP.length; a++) for (let b = a + 1; b < BP.length; b++) {
      const A = BP[a], B = BP[b];
      expect(Math.hypot(A.x - B.x, A.z - B.z) - A.waterR - B.waterR, `${A.id} – ${B.id}`).toBeGreaterThan(80);
    }
    for (const id of NEW_IDS) for (const o of ALL) {
      if (o.id === id) continue;
      const n = byId(id), d = Math.hypot(n.x - o.x, n.z - o.z);
      expect(d, `${id} – ${o.id}`).toBeGreaterThan((n.r + o.r) * ISLAND_REACH + 50);
      expect(d, `${id} – ${o.id}`).toBeGreaterThan(600);
    }
    for (const b of BP) expect(Math.hypot(b.x, b.z) + b.waterR, b.id).toBeLessThan(PLAYABLE_RADIUS - 100);
  });

  it('jede neue Insel: Markt in ISLAND_PROFILES, Stege im Blueprint (ground.piers), im Krieg der Mächte eroberbar oder produzierend', () => {
    const reg = new NationRegistry();
    const war = warWorldFromDefs(ALL, reg);
    for (const s of EXPANSION_ISLANDS) {
      expect(ISLAND_PROFILES[s.id], s.id).toBeDefined();
      const b = BP.find((x) => x.id === s.id)!;
      expect(b.piers.length, s.id).toBeGreaterThan(0);
      if (s.kind === 'harbor') { expect(b.market, s.id).not.toBeNull(); expect(profileOf(byId(s.id)).produce.length, s.id).toBeGreaterThan(0); }
      const w = war.islands.find((x) => x.id === s.id);
      if (s.power) { expect(w, s.id).toBeDefined(); expect(w!.conquerable, s.id).toBe(true); expect(w!.produces, s.id).toBe(true); }
      else expect(w?.conquerable ?? false, s.id).toBe(false);
    }
    // Rohstoff-Minen liefern Kanonenstahl, Forste Hartholz, Manufakturen Segeltuch an ihre Macht
    const yieldOf = (id: string, r: 'kanonenstahl' | 'hartholz' | 'segeltuch') => war.islands.find((x) => x.id === id)!.yield[r];
    expect(yieldOf('zinnfels', 'kanonenstahl')).toBeGreaterThan(0);
    expect(yieldOf('harzwald', 'hartholz')).toBeGreaterThan(0);
    expect(yieldOf('webersund', 'segeltuch')).toBeGreaterThan(0);
  });

  it('der Blueprint-Start bleibt ohne three.js (alle 156 Inseln als reine Daten, JSON-Rundlauf ohne Verlust)', () => {
    const path = (u: URL) => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1');
    const seen = new Set<string>(), bare = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      const re = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (m[1].startsWith('.')) { const base = path(new URL(m[1], new URL(`file:///${file.replace(/\\/g, '/')}`))); visit(base.endsWith('.ts') ? base : `${base}.ts`); } else bare.add(m[1]);
      }
    };
    visit(path(new URL('../src/world/islandBlueprint.ts', import.meta.url)));
    expect([...bare].filter((b) => b.startsWith('three'))).toEqual([]);
    expect(BP).toHaveLength(ALL.length);
    expect(ALL.length).toBeGreaterThanOrEqual(150);
    expect(JSON.parse(JSON.stringify(BP))).toEqual(BP);
  });
});

// ---------- 4. Ring 5: Kaiser-Bauplätze ----------

describe('Ring 5: je Kuchenstück ein freigehaltener Bauplatz für die Kaiser-Zitadellen (4.5D)', () => {
  it('fünf Bauplätze bei 14 200 m auf der Mittellinie jedes Sektors, je mindestens 1 200 m frei', () => {
    expect(KAISER_SITES).toHaveLength(5);
    expect(new Set(KAISER_SITES.map((k) => k.power)).size).toBe(5);
    for (const k of KAISER_SITES) {
      expect(Math.hypot(k.x, k.z)).toBeCloseTo(14200, -1);
      expect(ringAtDistance(Math.hypot(k.x, k.z)).ring).toBe(5);
      expect(sectorAt(k.x, k.z).factionId).toBe(k.power);
      expect(k.clear).toBeGreaterThanOrEqual(KAISER_SITE_CLEAR);
      expect(KAISER_SITE_CLEAR).toBeGreaterThanOrEqual(1200);
      // kein Insel-Rand (auch keine Schäre) im Freiraum; der Bauplatz selbst bleibt diesseits der Sturm-Barriere
      for (const i of ALL) expect(Math.hypot(i.x - k.x, i.z - k.z) - i.r * ISLAND_REACH, `${k.id} – ${i.id}`).toBeGreaterThanOrEqual(k.clear);
      expect(Math.hypot(k.x, k.z) + 600).toBeLessThan(PLAYABLE_RADIUS);
    }
  });
});

// ---------- 5. Tiefsee-Strömungen ----------

describe('Hochsee-Strömungen: fünf Tiefsee-Strömungen zwischen Ring 2, 3 und 4 (+35 %)', () => {
  const lanes = buildCurrentLanes(ALL);
  const deep = lanes.filter((l) => l.deep);
  it('fünf weitläufige Bänder, jedes über mehrere Ringe, +35 % Fahrt in Strömungsrichtung', () => {
    expect(CURRENT_LANES.filter((l) => l.deep)).toHaveLength(5);
    expect(deep).toHaveLength(5);
    expect(CURRENT_BOOST).toBeCloseTo(0.35, 9);
    const field = new CurrentField(lanes), s = newCurrentSample();
    for (const l of deep) {
      expect(l.length, l.id).toBeGreaterThan(4000);
      const rings = new Set<number>();
      for (let k = 0; k < l.pts.length; k += 2) rings.add(ringAtDistance(Math.hypot(l.pts[k], l.pts[k + 1])).ring);
      expect(rings.size, l.id).toBeGreaterThanOrEqual(2);
      for (const r of rings) expect(r, l.id).toBeGreaterThanOrEqual(2);
      // mitten im Band in Fahrtrichtung: +35 %
      const k = Math.floor(l.pts.length / 4) * 2;
      const hd = Math.atan2(l.pts[k + 2] - l.pts[k], l.pts[k + 3] - l.pts[k + 1]);
      field.sample(l.pts[k], l.pts[k + 1], s);
      expect(currentBoost(hd, s), l.id).toBeCloseTo(1 + CURRENT_BOOST, 1);
    }
  });
});

// ---------- 6. Interaktive Begegnungen ----------

const DIS: DirectorIsland[] = ALL.map((i) => ({
  id: i.id, name: i.name, x: i.x, z: i.z, r: i.r, ring: i.ring ?? 1, kind: i.kind, factionId: i.factionId ?? null, uncharted: !!i.uncharted,
  harbor: i.kind === 'harbor' || i.kind === 'town', blackMarket: !!profileOf(i).blackMarket, mega: !!i.mega, skerry: !!i.skerry,
}));
const SITES: ConvoySite[] = ALL.filter((i) => (i.kind === 'harbor' || i.kind === 'town') && !i.uncharted && (i.ring ?? 1) <= 3).map((i) => ({
  id: i.id, name: i.name, x: i.x, z: i.z, r: i.r, ring: i.ring ?? 1, dangerTier: i.dangerTier ?? 1, factionId: i.factionId ?? null, profile: profileOf(i),
}));
/** Eine Belagerung von Kohlenstieg (Deutschland) durch Kurogane, Nachschub aus Rußhafen bzw. Harzwald */
const FRONTS: SupplyFront[] = (() => {
  const t = byId('kohlenstieg'), a = byId('russhafen'), d = byId('harzwald');
  return [{ siegeId: 'bel1', islandId: t.id, name: t.name, x: t.x, z: t.z, r: t.r, attacker: 'kurogane', defender: 'deutschland', sources: [
    { side: 'angreifer', nation: 'kurogane', islandId: a.id, name: a.name, x: a.x, z: a.z, r: a.r },
    { side: 'verteidiger', nation: 'deutschland', islandId: d.id, name: d.name, x: d.x, z: d.z, r: d.r },
  ] }];
})();
const world = (fronts = true) => ({ islands: DIS, sites: SITES, fronts: fronts ? () => FRONTS : undefined });

describe('WorldEventDirector 4.5C: 6 – 8 Ereignisse, 2 200 m Abstand, über die Ringe 1 bis 4 verteilt', () => {
  // ein Spieler fährt einmal quer durch die Welt (die Hälfte der Ereignisse entsteht in seiner Sichtweite, der Rest im leersten Ring)
  const d = new WorldEventDirector(world(), null, 4512);
  const counts: number[] = [], spawnRings = new Map<number, number>(), kinds = new Set<string>();
  let spacingBad = 0, nearBad = 0;
  const P = [{ x: 0, z: 0 }];
  for (let t = 0; t < 5400; t++) {
    const a = t / 900;
    P[0].x = Math.sin(a) * 6000; P[0].z = Math.cos(a * 0.7) * 6000;
    const before = d.active().map((e) => ({ id: e.id, x: e.x, z: e.z }));
    d.update(1, P);
    for (const n of d.drain()) {
      if (n.type !== 'eventStart') continue;
      const ev = n.event;
      kinds.add(ev.kind);
      spawnRings.set(ringAtDistance(Math.hypot(ev.x, ev.z)).ring, (spawnRings.get(ringAtDistance(Math.hypot(ev.x, ev.z)).ring) ?? 0) + 1);
      for (const o of before) if (d.active().some((e) => e.id === o.id) && Math.hypot(o.x - ev.x, o.z - ev.z) < DIRECTOR.minSpacing - 1e-6) spacingBad++;
      if (Math.hypot(ev.x - P[0].x, ev.z - P[0].z) < DIRECTOR.spawnMin - 1e-6) nearBad++;
    }
    counts.push(d.active().length);
  }

  it('6 bis 8 laufen gleichzeitig (nach dem Auffüllen), nie mehr als 8', () => {
    expect(DIRECTOR.minActive).toBe(6);
    expect(DIRECTOR.maxActive).toBe(8);
    expect(Math.max(...counts)).toBeLessThanOrEqual(8);
    const after = counts.slice(120);
    expect(after.filter((c) => c >= 6).length / after.length).toBeGreaterThan(0.9);
  });

  it('Mindestabstand 2 200 m, nie näher als 1 100 m am Spieler, kein Spawn-Spam (Abstand zwischen zwei neuen ≥ 3 s)', () => {
    expect(DIRECTOR.minSpacing).toBeGreaterThanOrEqual(2200);
    expect(spacingBad).toBe(0);
    expect(nearBad).toBe(0);
    expect(DIRECTOR.bootstrapGap).toBeGreaterThanOrEqual(3);
  });

  it('gleichmäßig über die Ringe 1 bis 4, alle Arten inklusive der vier Begegnungen', () => {
    for (const r of [1, 2, 3, 4]) expect(spawnRings.get(r) ?? 0, `Ring ${r}`).toBeGreaterThan(3);
    expect(spawnRings.get(5) ?? 0).toBe(0);
    for (const k of ['schiffbruch', 'schmuggler', 'schatzjagd', 'nachschub']) expect(kinds.has(k), k).toBe(true);
  });
});

/** Ein frischer Director mit einem Ereignis der Art `kind` neben dem Spieler */
function oneEvent(kind: 'schiffbruch' | 'schmuggler' | 'schatzjagd' | 'nachschub', seed = 3) {
  const d = new WorldEventDirector(world(), null, seed);
  let ev: WorldEvent | null = null;
  for (let i = 0; i < 40 && !ev; i++) ev = d.create(kind, [{ x: 2000 + i * 50, z: 2000 }]);
  d.state.events.push(ev!);
  return { d, ev: ev! };
}

describe('Schiffbrüchige: anheuern, eskortieren oder Wrack-Koordinaten', () => {
  it('Floß mit 3 – 6 Personen und rotem Notruf-Signal auf offener See', () => {
    const { ev } = oneEvent('schiffbruch');
    expect(ev.beacon).toBe('notfackel');
    expect(ev.survivors).toBeGreaterThanOrEqual(RESCUE.survivors[0]);
    expect(ev.survivors).toBeLessThanOrEqual(RESCUE.survivors[1]);
  });

  it('als Crew anheuern: sofort gerettet (durch den Spieler), nur einmal', () => {
    const { d, ev } = oneEvent('schiffbruch');
    expect(d.rescue(ev.id, 'crew')?.outcome).toBe('gerettet');
    expect(ev.byPlayer).toBe(true);
    expect(d.rescue(ev.id, 'crew')).toBeNull();
  });

  it('eskortieren: Ziel ist der nächste freie Hafen, das Ereignis zieht mit dem Schiff, am Hafen gerettet; ohne Ankunft läuft die Frist ab', () => {
    const { d, ev } = oneEvent('schiffbruch');
    const r = d.rescue(ev.id, 'eskorte')!;
    expect(r.rescue?.choice).toBe('eskorte');
    const port = DIS.find((i) => i.id === r.rescue!.portId)!;
    expect(port.harbor).toBe(true);
    expect(r.expiresAt - d.state.t).toBeCloseTo(RESCUE.escortTime, 6);
    d.follow(ev.id, port.x + port.r + 100, port.z);
    expect(ev.x).toBeCloseTo(port.x + port.r + 100, 6);
    expect(d.rescueArrived(ev.id)?.outcome).toBe('gerettet');
    // zweiter Fall: Frist verstreicht
    const b = oneEvent('schiffbruch', 8);
    b.d.rescue(b.ev.id, 'eskorte');
    for (let t = 0; t < RESCUE.escortTime + 5; t++) b.d.update(1, [{ x: b.ev.x, z: b.ev.z }]);
    expect(b.ev.outcome).toBe('abgelaufen');
  });

  it('Wrack-Koordinaten: ein reiches Wrackfeld mit sicherer Schatzkarte 0,8 – 1,5 km entfernt', () => {
    const { d, ev } = oneEvent('schiffbruch');
    const x0 = ev.x, z0 = ev.z;
    d.rescue(ev.id, 'wrack');
    const w = d.state.events.find((e) => e.kind === 'treibgut' && e.name === 'Wrackfeld')!;
    expect(w).toBeDefined();
    expect(ev.rescue?.wreckX).toBeCloseTo(w.x, 6);
    const dist = Math.hypot(w.x - x0, w.z - z0);
    expect(dist).toBeGreaterThanOrEqual(RESCUE.wreckDist[0] - 1e-6);
    expect(dist).toBeLessThanOrEqual(RESCUE.wreckDist[1] + 1e-6);
    expect(w.crates!.length).toBeGreaterThanOrEqual(RESCUE.wreckCrates[0]);
    expect(w.crates!.some((c) => c.kind === 'karte' && c.islandId)).toBe(true);
  });
});

describe('Schmuggler-Rendezvous: Schwarzmarkt auf See oder in einer Bucht, oder für die Marine hochnehmen', () => {
  it('violett-goldene Leuchtrakete, ein Schmuggler vor Anker mit Begleit-Logger, vier Angebote (Bauplan, Relikt-Splitter, Schmuggelware)', () => {
    const { ev } = oneEvent('schmuggler');
    expect(ev.beacon).toBe('violettrakete');
    expect(ev.ships.map((s) => s.role)).toEqual(['schmuggler', 'eskorte']);
    expect(ev.offers).toHaveLength(SMUGGLER.offers);
    expect(ev.offers!.map((o) => o.kind).sort()).toEqual(['bauplan', 'splitter', 'ware', 'ware']);
    for (const o of ev.offers!) expect(o.price).toBeGreaterThan(0);
  });

  it('jedes Angebot gibt es nur einmal; nach dem Hochnehmen wird nichts mehr verkauft, alle Schiffe erledigt = gesiegt', () => {
    const { d, ev } = oneEvent('schmuggler');
    const o = ev.offers![1];
    expect(d.buyOffer(ev.id, o.id)?.sold).toBe(true);
    expect(d.buyOffer(ev.id, o.id)).toBeNull();
    expect(d.bust(ev.id)?.busted).toBe(true);
    expect(ev.engagedUntil).toBeGreaterThan(d.state.t);
    expect(d.buyOffer(ev.id, ev.offers![0].id)).toBeNull();
    for (const s of ev.ships) { s.down = true; s.byPlayer = true; }
    d.update(1, [{ x: 0, z: 0 }]);
    expect(ev.outcome).toBe('gesiegt');
    expect(ev.byPlayer).toBe(true);
  });
});

describe('Insel-Schatzsuche an Land: Suchbereich, Hinterhalt, Truhe', () => {
  it('der Suchbereich liegt auf einer ruhigen Insel (keine Stadt, keine Mega-Insel), mitten im Land', () => {
    for (let seed = 1; seed < 12; seed++) {
      const { ev } = oneEvent('schatzjagd', seed);
      const isl = byId(ev.islandId!);
      expect(!!(isl.kind === 'town' || isl.mega || isl.skerry || isl.uncharted), isl.id).toBe(false);
      expect(Math.hypot(ev.site!.x - isl.x, ev.site!.z - isl.z)).toBeLessThanOrEqual(isl.r * HUNT.siteK + 1e-6);
      expect(ev.site!.r).toBe(HUNT.searchR);
      expect(ev.beacon).toBe('schatzrauch');
    }
  });

  it('Hinterhalt nur einmal; die Truhe bergen beendet die Suche (geborgen, durch den Spieler)', () => {
    const { d, ev } = oneEvent('schatzjagd');
    expect(d.ambush(ev.id)?.ambushed).toBe(true);
    expect(d.ambush(ev.id)).toBeNull();
    expect(d.claimTreasure(ev.id)?.outcome).toBe('geborgen');
    expect(ev.byPlayer).toBe(true);
  });

  it('eine gefundene Schatzkarte wird zur Schatzsuche auf ihrer Insel (höchstens drei zugleich)', () => {
    const d = new WorldEventDirector(world(), null, 9);
    const islands = DIS.filter((i) => (i.kind === 'quiet' || i.kind === 'treasure') && !i.uncharted && !i.skerry && !i.mega).slice(0, 4);
    const hunts = islands.map((i) => d.startTreasureHunt(i.id));
    expect(hunts.slice(0, 3).every((h) => h?.mapped === true)).toBe(true);
    expect(hunts[3]).toBeNull();
    expect(d.startTreasureHunt(islands[0].id)).toBe(hunts[0]);
  });
});

describe('Kriegs-Nachschub: Transporte zwischen Rohstoff-Inseln und belagerten Fronten (FactionWarEngine)', () => {
  it('entsteht nur mit einer laufenden Belagerung; fährt von einer Rohstoff-Insel der Partei zur Front', () => {
    expect(new WorldEventDirector(world(false), null, 3).create('nachschub', [{ x: 0, z: 0 }])).toBeNull();
    const { ev } = oneEvent('nachschub');
    expect(ev.beacon).toBe('signalfeuer');
    expect(ev.siegeId).toBe('bel1');
    expect(['angreifer', 'verteidiger']).toContain(ev.side);
    expect(ev.power).toBe(ev.side === 'angreifer' ? 'kurogane' : 'deutschland');
    expect(ev.foe).toBe(ev.side === 'angreifer' ? 'deutschland' : 'kurogane');
    expect(ev.ships.filter((s) => s.role === 'frachter')).toHaveLength(1);
    expect(ev.ships.filter((s) => s.role === 'eskorte').length).toBe(SUPPLY.escorts[ev.dangerTier - 1]);
    const r = ev.route!, t = byId('kohlenstieg');
    expect(Math.hypot(r[r.length - 2] - t.x, r[r.length - 1] - t.z)).toBeLessThan(t.r * ISLAND_REACH + 260);
  });

  it('eskortiert: Kaperschiffe der Gegenseite greifen an, am Ziel „angekommen“ mit Lohn; abgefangen: „gesiegt“ durch den Spieler', () => {
    const { d, ev } = oneEvent('nachschub');
    let raided = false;
    for (let t = 0; t < 4000 && ev.phase !== 'beendet'; t++) {
      d.update(1, [{ x: ev.x + 300, z: ev.z }]);
      for (const n of d.drain()) if (n.type === 'supplyRaid') raided = true;
    }
    expect(raided).toBe(true);
    expect(ev.ships.some((s) => s.role === 'korsar')).toBe(true);
    expect(ev.outcome).toBe('angekommen');
    expect(ev.byPlayer).toBe(true);
    const b = oneEvent('nachschub', 11);
    const fr = b.ev.ships.find((s) => s.role === 'frachter')!;
    fr.down = true; fr.byPlayer = true;
    b.d.update(1, [{ x: 0, z: 0 }]);
    expect(b.ev.outcome).toBe('gesiegt');
    expect(b.ev.byPlayer).toBe(true);
  });

  it('die Engine liefert die Fronten und bucht Ankunft und Verlust auf die Belagerung', () => {
    const reg = new NationRegistry();
    const w = warWorldFromDefs(ALL, reg);
    const eng = new FactionWarEngine(reg, w.islands, w.obstacles, null, 12);
    for (const id in eng.state.nations) eng.state.nations[id].nextBrainAt = 1e9;
    for (const r of RESOURCE_IDS) eng.state.nations.kurogane.stock[r] = RESOURCE_TARGET[r] * 3;
    eng.declareWar('kurogane', 'deutschland');
    const ti = eng.islands.findIndex((i) => i.id === 'kohlenstieg');
    const a = eng.launch(eng.registry.indexOf('kurogane'), ti, 'angriff', 8)!;
    a.x = a.route[a.route.length - 2]; a.z = a.route[a.route.length - 1]; a.leg = a.route.length / 2;
    for (let t = 0; t < 3; t++) eng.update(1);
    const sg = eng.siegeOf('kohlenstieg')!;
    expect(sg).toBeTruthy();
    const fronts = eng.supplyFronts();
    const f = fronts.find((x) => x.siegeId === sg.id)!;
    expect(f.sources.some((s) => s.side === 'angreifer' && s.nation === 'kurogane')).toBe(true);
    expect(f.sources.some((s) => s.side === 'verteidiger' && s.nation === 'deutschland')).toBe(true);
    const troops = sg.troops, prog = sg.progress;
    expect(eng.supplyArrived(sg.id, 'angreifer', { troops: SUPPLY.arriveTroops, morale: SUPPLY.arriveMorale, progress: SUPPLY.arriveProgress })).toBe(true);
    expect(sg.troops).toBe(troops + SUPPLY.arriveTroops);
    expect(sg.progress).toBeGreaterThan(prog);
    const m = sg.morale;
    expect(eng.supplyLost(sg.id, 'angreifer', SUPPLY.lostMorale)).toBe(true);
    expect(sg.morale).toBeLessThan(m);
  });
});

describe('Begegnungen im Spielstand: JSON-Rundlauf ohne Verlust', () => {
  it('alle neuen Felder (Personen, Wahl, Angebote, Suchbereich, Front, Begleitzeit) überstehen Speichern und Laden', () => {
    const d = new WorldEventDirector(world(), null, 77);
    for (const k of ['schiffbruch', 'schmuggler', 'schatzjagd', 'nachschub'] as const) {
      let ev: WorldEvent | null = null;
      for (let i = 0; i < 40 && !ev; i++) ev = d.create(k, [{ x: -3000 + i * 400, z: -3000 }]);
      d.state.events.push(ev!);
    }
    d.rescue(d.state.events[0].id, 'eskorte');
    d.buyOffer(d.state.events[1].id, d.state.events[1].offers![0].id);
    d.ambush(d.state.events[2].id);
    const json = JSON.parse(JSON.stringify(d.snapshot()));
    const back = cleanWorldEvents(json)!;
    expect(back.events).toHaveLength(4);
    for (const e of back.events) e.live = false;
    const ref = d.snapshot();
    for (const e of ref.events) { e.live = false; e.engagedUntil = 0; e.phase = e.phase === 'gefecht' ? 'aktiv' : e.phase; }
    expect(back.events).toEqual(ref.events);
  });
});

// ---------- 7. Weltkarte ----------

function fakeCtx(texts: string[]): CanvasRenderingContext2D {
  const grad = { addColorStop() {} };
  const target: Record<string, unknown> = {
    measureText: (t: string) => ({ width: t.length * 6.5 }),
    fillText: (t: string) => { texts.push(t); },
    createRadialGradient: () => grad, createLinearGradient: () => grad,
  };
  return new Proxy(target, { get: (o, k: string) => (k in o ? o[k] : () => undefined), set: (o, k: string, v) => { o[k] = v; return true; } }) as unknown as CanvasRenderingContext2D;
}
function overlaps(): number {
  const L = lastLabels(), a: number[] = [], b: number[] = [];
  let bad = 0;
  for (let i = 0; i < L.count; i++) for (let j = i + 1; j < L.count; j++) { L.at(i, a); L.at(j, b); if (a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]) bad++; }
  return bad;
}

describe('Weltkarte (M): 10 % Rand bei 1,00×, nichts abgeschnitten, Beschriftung ohne Überlappung', () => {
  it('bei 1,00× bleibt auf der kürzeren Fensterseite je 10 % Rand; Albion und Ring 5 liegen im freien Band zwischen den Leisten', () => {
    expect(MAP_MARGIN).toBeCloseTo(0.1, 9);
    // Leistenhöhen wie im Spiel gemessen (Playwright): Desktop oben 220 px (Ebenen-Leiste), unten 84 px; Handy oben 150, unten 120
    for (const [W, H, top, bottom] of [[1440, 900, 220, 84], [390, 844, 150, 120]]) {
      setMapSafeArea(top, bottom);
      const v = fitAll({ cx: 0, cz: 0, scale: 1 }, W, H, top, bottom);
      expect(v.scale).toBeCloseTo(fitScale(W, H), 12);
      const m = discMargins(v, W, H, WORLD_RADIUS);
      const short = Math.min(W, H - top - bottom);
      expect(Math.min(m.left, m.right)).toBeGreaterThanOrEqual(short * 0.1 - 1);
      expect(m.top - top).toBeGreaterThanOrEqual(short * 0.1 - 1);
      expect(m.bottom - bottom).toBeGreaterThanOrEqual(short * 0.1 - 1);
      // Weltscheibe mittig im freien Band: Albion, die nördlichsten Inseln und Bauplätze von Ring 5 liegen unter der Titelleiste, die südlichsten über der Legende
      const yOf = (z: number) => H / 2 - (z - v.cz) * v.scale;
      expect(yOf(byId('albion').z + byId('albion').r)).toBeGreaterThan(top);
      const north = Math.max(...ALL.map((i) => i.z + i.r), ...KAISER_SITES.map((k) => k.z));
      const south = Math.min(...ALL.map((i) => i.z - i.r), ...KAISER_SITES.map((k) => k.z));
      expect(yOf(north)).toBeGreaterThan(top);
      expect(yOf(south)).toBeLessThan(H - bottom);
      expect(yOf(byId('weisswacht').z - byId('weisswacht').r)).toBeLessThan(H - bottom);
      setMapSafeArea(0, 0);
    }
  });

  it('über alle Inseln: bei 1,00× und 2,50× keine überlappenden Beschriftungen und Ereignis-Symbole', () => {
    const evs = [
      { x: 3000, z: 3000, kind: 'castaway' as const, name: 'Schiffbrüchige' },
      { x: -2500, z: 4200, kind: 'smuggler' as const, name: 'Schmuggler-Rendezvous' },
      { x: byId('muschelruh').x, z: byId('muschelruh').z, kind: 'hunt' as const, name: 'Schatzsuche auf Muschelruh' },
      { x: 4000, z: -1500, kind: 'supply' as const, name: 'Kriegs-Nachschub → Kohlenstieg', color: '#B0187A' },
    ];
    const d: WorldMapData = {
      islands: ALL, regions: REGIONS, known: () => true, islandMarks: new Map(),
      markers: { player: { x: 0, z: 0, heading: 0 }, enemies: [], target: null, digs: [] },
      seaEvents: evs,
    };
    for (const [W, H] of [[1440, 900], [390, 844]]) for (const zoom of [1, 2.5]) {
      const texts: string[] = [];
      drawWorldMap(fakeCtx(texts), W, H, 1, { cx: 0, cz: 0, scale: fitScale(W, H) * zoom }, d, { selected: null, layers: defaultLayers(), fog: null, zoom });
      expect(overlaps(), `${W}×${H} bei ${zoom}×`).toBe(0);
      expect(texts.length).toBeGreaterThan(zoom >= LABEL_ZOOM ? 20 : 8);
      // der Rechteckspeicher läuft nie über (sonst fielen Namen still weg)
      expect(lastLabels().count).toBeLessThan(720);
    }
  });
});

// ---------- 8. Spielstand 21 ----------

/** Ein Punkt der alten Welt bei `d` m Abstand, mindestens 900 m von jeder alten Küste (offene See) */
function openSea(d: number): { x: number; z: number } {
  for (let a = 0; a < 360; a += 1) {
    const x = Math.sin((a * Math.PI) / 180) * d, z = Math.cos((a * Math.PI) / 180) * d;
    if (ALL.every((i) => { const o = legacyIslandPos(i.id); return !o || Math.hypot(o.x - x, o.z - z) - i.r * ISLAND_REACH > 900; })) return { x, z };
  }
  throw new Error(`keine offene See bei ${d} m`);
}

describe('Spielstand 21: Migration aus Version 20 auf das 15 600-m-Raster', () => {
  it('Schiff, Seekarten-Zonen, Ereignisse und Krieg wandern mit; entdeckte Inseln, Flotte und Besitz bleiben', () => {
    expect(SAVE_VERSION).toBe(21);
    const old = { ...createSave('Alt', 'pirat', '4.5.1'), version: 20 } as Record<string, any>;
    const albion = legacyIslandPos('albion')!;
    // festgemacht vor Albion (alte Lage) und auf offener See im alten Ring 3
    old.world.boat = { x: albion.x + 20, z: albion.z - 420, heading: 1 };
    old.world.chart = { islands: ['ankerglueck', 'albion', 'kronenklippe'], zones: [{ src: 'albion', x: albion.x, z: albion.z, r: 3530 }] };
    // Punkte auf offener See (fern jeder alten Insel) wandern radial mit
    const e7 = openSea(7000), c9 = openSea(9000), a8 = openSea(8000);
    old.world.seaEvents = { v: 1, t: 50, seq: 3, rng: 1, events: [{ id: 'ev1', kind: 'treibgut', name: 'Treibgut-Feld', x: e7.x, z: e7.z, zone: 0, level: 9, dangerTier: 3, power: null, createdAt: 0, expiresAt: 900, phase: 'aktiv', outcome: null, byPlayer: false, endedAt: -1, crates: [{ id: 'k', x: e7.x + 10, z: e7.z + 10, kind: 'planken', good: null, units: 1, islandId: null, taken: false }], ships: [] }], cooldowns: {}, nextSpawnAt: 0, convoys: [], nextConvoyAt: 0, cells: [{ id: 'c', kind: 'nebelbank', x: c9.x, z: c9.z, r: 500, vx: 0, vz: 0, age: 0, life: 900 }], bossKills: { leviathan: 2 }, stats: {} };
    old.world.factionWar = { v: 1, t: 10, armadas: [{ id: 'a1', x: a8.x, z: a8.z, route: [a8.x, a8.z, c9.x, c9.z] }], battles: [{ id: 'b1', x: e7.x, z: e7.z }], sieges: [{ id: 's1', islandId: 'albion', points: [{ x: albion.x + 30, z: albion.z - 200 }] }] };
    const r = migrateSave(JSON.parse(JSON.stringify(old)), '4.5.2');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const w = r.data.world;
    expect(r.data.version).toBe(21);
    const A = byId('albion');
    // relativ zu Albion gleich geblieben
    expect(w.boat!.x).toBeCloseTo(A.x + 20, 0);
    expect(w.boat!.z).toBeCloseTo(A.z - 420, 0);
    expect(w.chart!.islands).toEqual(expect.arrayContaining(['ankerglueck', 'albion', 'kronenklippe']));
    expect(w.chart!.zones[0]).toMatchObject({ src: 'albion', x: A.x, z: A.z });
    const ev = w.seaEvents!.events[0];
    expect(Math.hypot(ev.x, ev.z)).toBeCloseTo(spreadDist(7000), -1);
    expect(Math.hypot(w.seaEvents!.cells[0].x, w.seaEvents!.cells[0].z)).toBeCloseTo(spreadDist(9000), -1);
    expect(w.seaEvents!.bossKills.leviathan).toBe(2);
    const fw = w.factionWar as unknown as { armadas: { x: number; z: number; route: number[] }[]; sieges: { points: { x: number; z: number }[] }[] };
    expect(Math.hypot(fw.armadas[0].x, fw.armadas[0].z)).toBeCloseTo(spreadDist(8000), -1);
    expect(Math.hypot(fw.armadas[0].route[2], fw.armadas[0].route[3])).toBeCloseTo(spreadDist(9000), -1);
    expect(fw.sieges[0].points[0].x).toBeCloseTo(A.x + 30, 0);
    expect(fw.sieges[0].points[0].z).toBeCloseTo(A.z - 200, 0);
  });

  it('kein migrierter Punkt landet in einer Insel – auch nicht in einer der 36 neuen', () => {
    const p = { x: 0, z: 0 };
    for (let a = 0; a < 360; a += 7) for (let dd = 300; dd < 10400; dd += 211) {
      migratePoint(Math.sin((a * Math.PI) / 180) * dd, Math.cos((a * Math.PI) / 180) * dd, p);
      for (const i of ALL) expect(Math.hypot(p.x - i.x, p.z - i.z), `${a}°/${dd} m in ${i.id}`).toBeGreaterThan(i.r * 1.2 + 14);
    }
  });

  it('die Startkarte kennt dieselben Inseln wie vor der Entzerrung (Ring 1 und die innersten Häfen)', () => {
    const known = ALL.filter((i) => !i.uncharted && Math.hypot(i.x, i.z) <= DISCOVERY.startRadius).map((i) => i.id);
    const before = ALL.filter((i) => !i.uncharted && !NEW_IDS.has(i.id) && legacyIslandPos(i.id) && Math.hypot(legacyIslandPos(i.id)!.x, legacyIslandPos(i.id)!.z) <= 2400).map((i) => i.id);
    expect(known.sort()).toEqual(before.sort());
    void WORLD_EVENT_DEFS;
  });
});
