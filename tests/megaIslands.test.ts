import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { REGIONS, ISLAND_REACH, type IslandDef } from '../src/data/regions';
import { BORDERS, sectorAt } from '../src/data/factions';
import { PLAYABLE_RADIUS } from '../src/data/world';
import { ringAtDistance } from '../src/data/worldRings';
import { SITES } from '../src/data/settlements';
import {
  MEGA_BY_ID, MEGA_COMBAT, MEGA_IDS, MEGA_ISLANDS, clearDistrict, commanderRoam, commanderShouldAppear, districtWorld, districtsToWake, megaItems, megaLevel,
  megaPlotCenter, newMegaRuntime, polylineT, rollMegaLoot, type MegaIslandSpec,
} from '../src/data/megaIslands';
import { buildBlueprints, sitePiers } from '../src/world/islandBlueprint';
import { coastK } from '../src/world/islandGround';
import { RIFT_GAP, inCrossing, pointAt, polyLength, riftBlockHalf, riftWallOff } from '../src/world/riftMath';
import { STREAM, WorldStreamer, nextLevel, streamLead, type StreamHost } from '../src/world/worldStreamer';
import { LabelPlacer, centerOn, labelShown, worldToScreenInto, type MapView } from '../src/ui/mapView';
import { labelRank } from '../src/ui/worldMapDraw';

const ALL: IslandDef[] = REGIONS.flatMap((r) => r.islands);
// die fünf Kaiser-Zitadellen (4.5D) nutzen das Format der Mega-Inseln, zählen hier aber nicht mit (eigene Prüfung: tests/kaiserCitadels.test.ts)
const MEGAS = ALL.filter((i) => i.mega && !i.kaiser);
const SKERRIES = ALL.filter((i) => i.skerry);
const BP = buildBlueprints(ALL, REGIONS);
const bpOf = (id: string) => BP.find((b) => b.id === id)!;
const defOf = (id: string) => ALL.find((i) => i.id === id)!;

// ---------- 1. Lage und Kollisionsfreiheit ----------

describe('Sechs Mega-Inseln: Lage, Größe, Kollisionsfreiheit', () => {
  it('genau sechs: eine je Macht in ihrem Kuchenstück (Ring 2 – 3), dazu das neutrale Kaiser-Atoll; 550 – 900 m Durchmesser', () => {
    expect(MEGAS).toHaveLength(6);
    expect(MEGA_IDS).toHaveLength(6);
    for (const m of MEGA_ISLANDS) {
      const i = defOf(m.id);
      expect(2 * m.r, m.id).toBeGreaterThanOrEqual(550);
      expect(2 * m.r, m.id).toBeLessThanOrEqual(900);
      const ring = ringAtDistance(Math.hypot(i.x, i.z)).ring;
      expect([2, 3], m.id).toContain(ring);
      if (m.power) {
        expect(sectorAt(i.x, i.z).factionId, m.id).toBe(m.power);
        expect(i.factionId, m.id).toBe(m.power);
      } else {
        expect(i.factionId, m.id).toBeNull();
        expect(ring, m.id).toBe(3);
      }
      // Gefahrenstufe 3 – 4: dort kämpfen die Bezirke
      expect([3, 4], m.id).toContain(i.dangerTier);
    }
    expect(new Set(MEGA_ISLANDS.map((m) => m.power)).size).toBe(6);
  });

  it('halten zu allen Inseln den Platzbedarf der Welt ((r₁ + r₂) · 1,45 + 50 m) ein, auch ihre Schären', () => {
    for (const n of [...MEGAS, ...SKERRIES]) for (const o of ALL) {
      if (o === n) continue;
      const d = Math.hypot(n.x - o.x, n.z - o.z);
      expect(d, `${n.id} – ${o.id}`).toBeGreaterThan((n.r + o.r) * ISLAND_REACH + 50);
    }
  });

  it('Wasserlinien (mit Strandböschung) liegen mindestens 80 m von jeder anderen Insel, alles bleibt vor der Sturmsee', () => {
    for (const n of [...MEGAS, ...SKERRIES]) {
      const A = bpOf(n.id);
      expect(Math.hypot(A.x, A.z) + A.waterR, n.id).toBeLessThan(PLAYABLE_RADIUS - 100);
      for (const B of BP) {
        if (B.id === A.id) continue;
        expect(Math.hypot(A.x - B.x, A.z - B.z) - A.waterR - B.waterR, `${A.id} – ${B.id}`).toBeGreaterThan(80);
      }
    }
  });

  it('Mega-Inseln liegen fern der Grenzlinien (Küste mindestens 700 m), damit Grenz-Seeschlachten nicht an ihrem Strand toben', () => {
    for (const n of MEGAS) for (const b of BORDERS) {
      const a = (b.deg * Math.PI) / 180, along = Math.sin(a) * n.x + Math.cos(a) * n.z;
      if (along < 0) continue;
      const across = Math.abs(Math.cos(a) * n.x - Math.sin(a) * n.z);
      expect(across - n.r * 1.15, `${n.id} an Grenze ${b.borderIndex}`).toBeGreaterThan(700);
    }
  });

  it('je Mega-Insel sieben vorgelagerte Felsen: Leuchtturm-Fels, Schären und eine Riff-Passage; alle mindestens 30 m (Schiffskollision)', () => {
    for (const m of MEGA_ISLANDS) {
      const own = SKERRIES.filter((s) => s.id.startsWith(`${m.id}_`));
      expect(own, m.id).toHaveLength(7);
      expect(own.filter((s) => s.kind === 'lighthouse'), m.id).toHaveLength(1);
      expect(own.filter((s) => / I{1,3}$/.test(s.name)), m.id).toHaveLength(3);
      for (const s of own) {
        expect(s.r, s.id).toBeGreaterThanOrEqual(30);
        const d = Math.hypot(s.x - defOf(m.id).x, s.z - defOf(m.id).z);
        expect(d, s.id).toBeLessThan(1100);
      }
    }
    // Kennungen und Namen bleiben weltweit eindeutig
    expect(new Set(ALL.map((i) => i.id)).size).toBe(ALL.length);
    expect(new Set(ALL.map((i) => i.name)).size).toBe(ALL.length);
  });
});

// ---------- 2. Stege, Spalten und Brücken ----------

/** Begehbarkeit einer Insel als Raster: Land innerhalb der Küste, Spalten gesperrt außer an ihren Übergängen (Brücken) */
function reachable(m: MegaIslandSpec, withBridges: boolean): (x: number, z: number) => boolean {
  const site = SITES[m.id];
  const cell = 2, R = m.r * 1.25, n = Math.ceil((2 * R) / cell);
  const walk = new Uint8Array(n * n);
  const p = { x: 0, z: 0, dx: 0, dz: 0 };
  // wie im Spiel: quer zur Spalte bis zur halben Sperrbreite gesperrt, außer an der Brückenstelle (nächster Punkt der Mittellinie im Übergang)
  // wie im Spiel: Quer-Sperren je Abschnitt der Spalte (halbe Breite `riftBlockHalf`), nur an den Brückenstellen nicht – als Stempel ins Raster
  const blocked = new Uint8Array(n * n);
  for (const r of site.rifts ?? []) {
    const L = polyLength(r.pts);
    for (let s = 0; s <= L; s += 0.5) {
      if (withBridges && inCrossing(r, L, s)) continue;
      pointAt(r.pts, s, p);
      const half = riftBlockHalf(r.w);
      for (let o = -half; o <= half; o += cell / 2) {
        const x = p.x - p.dz * o, z = p.z + p.dx * o;
        const i = Math.floor((x + R) / cell), j = Math.floor((z + R) / cell);
        if (i >= 0 && j >= 0 && i < n && j < n) blocked[j * n + i] = 1;
      }
    }
  }
  const blockedAt = (x: number, z: number) => blocked[Math.floor((z + R) / cell) * n + Math.floor((x + R) / cell)] === 1;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -R + (i + 0.5) * cell, z = -R + (j + 0.5) * cell;
    const inside = Math.hypot(x, z) < m.r * coastK(m.coast, Math.atan2(z, x)) * 0.97;
    walk[j * n + i] = inside && !blockedAt(x, z) ? 1 : 0;
  }
  const seen = new Uint8Array(n * n);
  const idx = (x: number, z: number) => { const i = Math.floor((x + R) / cell), j = Math.floor((z + R) / cell); return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i; };
  // Start: Mitte des ersten Bauplatzes (Hafen), auf die nächste begehbare Zelle gerückt
  const snap = (x: number, z: number) => {
    let best = -1, bd = Infinity;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const k = idx(x + dx * cell, z + dz * cell); if (k >= 0 && walk[k] && dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = k; } }
    return best;
  };
  const [hx, hz] = megaPlotCenter(m, m.plots[0]);
  const q = [snap(hx, hz)];
  if (q[0] >= 0) seen[q[0]] = 1;
  while (q.length) {
    const k = q.pop()!, i = k % n, j = (k / n) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const kk = jj * n + ii;
      if (walk[kk] && !seen[kk]) { seen[kk] = 1; q.push(kk); }
    }
  }
  return (x, z) => { const k = snap(x, z); return k >= 0 && seen[k] === 1; };
}

describe('Mega-Inseln: Stege, Spalten und Brücken', () => {
  it('jede Mega-Insel hat mindestens zwei Häfen (Stege); jeder Steg setzt an der Wasserlinie an und läuft hinaus aufs Meer', () => {
    for (const m of MEGA_ISLANDS) {
      const i = defOf(m.id);
      const piers = sitePiers(i, SITES[m.id]);
      expect(piers.length, m.id).toBeGreaterThanOrEqual(2);
      for (const p of piers) {
        const da = Math.hypot(p.ax - i.x, p.az - i.z), db = Math.hypot(p.bx - i.x, p.bz - i.z);
        const edge = i.r * coastK(m.coast, Math.atan2(p.az - i.z, p.ax - i.x));
        expect(Math.abs(da - edge), `${m.id} Steg`).toBeLessThan(8);
        expect(db, `${m.id} Steg`).toBeGreaterThan(da + 20);
      }
      // die Stege stehen auch im Blueprint (Liegeplätze und Schiffskollision schon beim Weltstart)
      expect(bpOf(m.id).piers.length).toBe(piers.length);
    }
  });

  it('Spalten haben Übergänge auf ihrer Linie, mitten auf der Insel; Bauten stehen nie in einer Spalte', () => {
    for (const m of MEGA_ISLANDS) {
      const site = SITES[m.id];
      for (const r of site.rifts ?? []) {
        expect(r.cross.length, `${m.id} ${r.name}`).toBeGreaterThanOrEqual(1);
        const L = polyLength(r.pts);
        for (const t of r.cross) {
          const p = pointAt(r.pts, t * L, { x: 0, z: 0, dx: 0, dz: 0 });
          expect(Math.hypot(p.x, p.z), `${m.id} ${r.name}`).toBeLessThan(m.r * coastK(m.coast, Math.atan2(p.z, p.x)) * 0.92);
        }
      }
      // kein Bauplatz und keine Bezirksmitte liegt in einer Spalte
      const P = { x: 0, z: 0, dx: 0, dz: 0 };
      const pts = [...m.plots.map((pl) => megaPlotCenter(m, pl)), ...m.districts.map((d) => d.at)];
      for (const [x, z] of pts) for (const r of site.rifts ?? []) {
        const L = polyLength(r.pts);
        let near = Infinity;
        for (let s = 0; s <= L; s += 2) { pointAt(r.pts, s, P); near = Math.min(near, Math.hypot(P.x - x, P.z - z)); }
        expect(near, `${m.id} (${x}, ${z}) an ${r.name}`).toBeGreaterThan(r.w / 2 + 4);
      }
    }
  });

  it('Brücken verbinden alles: vom ersten Hafen aus ist jeder Bauplatz und jeder Bezirk zu Fuß erreichbar – ohne Brücken nicht (geteilte Inseln)', () => {
    for (const m of MEGA_ISLANDS) {
      const ok = reachable(m, true);
      for (const pl of m.plots) { const [x, z] = megaPlotCenter(m, pl); expect(ok(x, z), `${m.id} ${pl.theme}`).toBe(true); }
      for (const d of m.districts) expect(ok(d.at[0], d.at[1]), `${m.id} ${d.name}`).toBe(true);
    }
    // die Kronenkluft trennt die Zitadelle, Meeresarme die Felsinseln des Atolls, Grachten die Stadtteile von Gouden Stad
    for (const id of ['kronenklippe', 'sturmkroneruinen', 'goudenstad'] as const) {
      const m = MEGA_BY_ID[id], cut = reachable(m, false);
      expect(m.districts.some((d) => !cut(d.at[0], d.at[1])) || m.plots.some((pl) => { const [x, z] = megaPlotCenter(m, pl); return !cut(x, z); }), id).toBe(true);
    }
  });

  it('Übergänge stehen genau dort, wo die Daten sie wollen (Anteil der Länge), und die Brückenstelle ist breiter als die Brücke', () => {
    const r = MEGA_BY_ID.kronenklippe.rifts[0];
    const t = polylineT(r.pts, r.crossAt[0]);
    const p = pointAt(r.pts, t * polyLength(r.pts), { x: 0, z: 0, dx: 0, dz: 0 });
    expect(Math.hypot(p.x - r.crossAt[0][0], p.z - r.crossAt[0][1])).toBeLessThan(1);
    expect(2 * RIFT_GAP).toBeGreaterThan(4.6);
    // die Sperren reichen über die Wand hinaus: kein begehbarer Rand zwischen Wand und Sperre
    for (const w of [6, 8, 10, 14]) expect(riftBlockHalf(w) - 0.35).toBeGreaterThan(riftWallOff(w));
  });

  it('jede Insel hat ihr Gepräge: Zitadelle, Kontor-Viertel, Erzterrassen, Palast mit Arena, Dojos mit Korsarenlager, Tempel mit Statuen', () => {
    const themes = (id: string) => MEGA_BY_ID[id as keyof typeof MEGA_BY_ID].plots.map((p) => p.theme);
    expect(themes('kronenklippe')).toEqual(expect.arrayContaining(['zitadelle', 'exerzierplatz', 'mole', 'hafen']));
    expect(themes('goudenstad')).toEqual(expect.arrayContaining(['kontorviertel', 'lagerviertel', 'mole']));
    expect(themes('drachenamboss')).toEqual(expect.arrayContaining(['erzterrassen', 'giesserei', 'wehrmauer', 'festung']));
    expect(themes('chateausoleil')).toEqual(expect.arrayContaining(['palast', 'terrassengarten', 'amphitheater', 'batterie']));
    expect(themes('kuroganeschlund')).toEqual(expect.arrayContaining(['dojo', 'korsarenlager']));
    expect(themes('sturmkroneruinen')).toEqual(expect.arrayContaining(['tempel', 'schatzkammer', 'statuenhain']));
    expect(MEGA_BY_ID.kuroganeschlund.rifts.every((r) => r.kind === 'lava')).toBe(true);
    expect(MEGA_BY_ID.goudenstad.rifts.every((r) => r.kind === 'kanal')).toBe(true);
    // neue Bauten tauchen in den Bausteinen auf
    const types = new Set(MEGA_ISLANDS.flatMap((m) => m.plots.flatMap((p) => megaItems(p.theme, m.biome).items.map((it) => it.t))));
    for (const t of ['statue', 'pagode', 'fahne', 'zinnenmauer', 'torhaus'] as const) expect(types.has(t), t).toBe(true);
  });
});

// ---------- 3. Streaming-Fenster nach Radius ----------

describe('WorldStreamer: Fenster ab der Küstenlinie, Vorlauf für große Inseln', () => {
  it('Vorlauf wächst mit dem Radius über 150 m; kleine Inseln wie bisher', () => {
    expect(streamLead(90)).toBe(0);
    expect(streamLead(150)).toBe(0);
    for (const m of MEGA_ISLANDS) expect(streamLead(m.r), m.id).toBeGreaterThan(150);
    const lead = streamLead(420);
    expect(nextLevel(1, STREAM.activeIn + lead - 1, lead)).toBe(2);
    expect(nextLevel(1, STREAM.activeIn + lead - 1, 0)).toBe(1);
    expect(nextLevel(2, STREAM.activeOut + lead - 1, lead)).toBe(2);
    expect(nextLevel(2, STREAM.activeOut + lead + 1, lead)).toBe(1);
  });

  it('eine Mega-Insel wird früher und vor der Küste fertig aufgebaut; abgebaut wird sie vollständig (kein Rest im Speicher)', () => {
    const log: string[] = [];
    let resident = 0;
    const host: StreamHost = {
      showHorizon: () => { resident++; }, hideHorizon: () => { resident--; },
      buildActive: (i) => (function* () { for (let k = 0; k < 30; k++) yield; log.push(`built ${i}`); })(),
      commitActive: (i) => { log.push(`commit ${i}`); resident += 10; },
      disposeActive: (i) => { log.push(`dispose ${i}`); resident -= 10; },
    };
    const s = new WorldStreamer(host, () => 0, { budgetMs: 1e9, maxStepsPerFrame: 10 });
    const mega = s.addIsland({ id: 'mega', x: 0, z: 0, r: 420 });
    const small = s.addIsland({ id: 'klein', x: 0, z: 6000, r: 90 });
    // Schiff 1 400 m vor der Mega-Küste: die Mega-Insel baut schon (kleine Insel in gleichem Küstenabstand nicht)
    for (let f = 0; f < 20; f++) { s.beginInterest(); s.addInterest(0, -(420 + STREAM.activeIn + 300)); s.addInterest(0, 6000 + 90 + STREAM.activeIn + 300); s.update(); }
    expect(s.levelOf(mega)).toBe(2);
    expect(s.levelOf(small)).toBe(1);
    // weit weg: alles abgebaut
    for (let f = 0; f < 40; f++) { s.beginInterest(); s.addInterest(0, -9000); s.update(); }
    expect(s.levelOf(mega)).toBe(0);
    expect(log.filter((l) => l.startsWith('commit')).length).toBe(log.filter((l) => l.startsWith('dispose')).length);
    expect(resident).toBe(0);
  });
});

// ---------- 4. Kampf-Bezirke und Insel-Kommandant ----------

describe('Open-World-Landkämpfe: Bezirke, Kommandant, Beute', () => {
  it('je Insel 2 – 3 Bezirke mit Elite-Trupps und ein Kommandant (Gefahrenstufe 3 – 4) mit Runde über die Bezirke', () => {
    for (const m of MEGA_ISLANDS) {
      expect(m.districts.length, m.id).toBeGreaterThanOrEqual(2);
      expect(m.districts.length, m.id).toBeLessThanOrEqual(3);
      for (const d of m.districts) {
        expect(d.squad.length, d.id).toBeGreaterThanOrEqual(4);
        expect(d.squad.some((k) => k === 'hauptmann' || k === 'schildtraeger'), d.id).toBe(true);
      }
      expect(m.commander.route.every((id) => m.districts.some((d) => d.id === id)), m.id).toBe(true);
      const tier = defOf(m.id).dangerTier!;
      const lv = megaLevel(tier, m.commander.lvl);
      expect(lv, m.id).toBeGreaterThanOrEqual(12);
      expect(lv, m.id).toBeLessThanOrEqual(17);
    }
  });

  it('Bezirke ziehen erst auf, wenn man ihnen nahe kommt; geräumt ruhen sie, danach kehren sie zurück', () => {
    const m = MEGA_BY_ID.kronenklippe;
    const rt = newMegaRuntime('kronenklippe');
    const out: number[] = [];
    const c = districtWorld(m, m.districts[0], { x: 0, z: 0 });
    // weit weg: nichts
    expect(districtsToWake(rt, c.x + 400, c.z, 0, out)).toHaveLength(0);
    // am Rand des Weckabstands: genau dieser Bezirk
    expect(districtsToWake(rt, c.x + m.districts[0].r + MEGA_COMBAT.wakeMargin - 1, c.z, 0, out)).toEqual([0]);
    expect(rt.districts[0].state).toBe('aktiv');
    // läuft schon: kein zweites Mal
    expect(districtsToWake(rt, c.x, c.z, 1, out)).toHaveLength(0);
    clearDistrict(rt, 0, 10);
    expect(districtsToWake(rt, c.x, c.z, 11, out)).toHaveLength(0);
    expect(districtsToWake(rt, c.x, c.z, 10 + MEGA_COMBAT.districtCooldown, out)).toEqual([0]);
  });

  it('der Kommandant erscheint mit dem ersten Bezirk und zieht seine Runde, solange er nicht kämpft', () => {
    const m = MEGA_BY_ID.kuroganeschlund;
    const rt = newMegaRuntime('kuroganeschlund');
    expect(commanderShouldAppear(rt, 0)).toBe(false);
    rt.districts[1].state = 'aktiv';
    expect(commanderShouldAppear(rt, 0)).toBe(true);
    rt.commander.state = 'unterwegs';
    const legs: number[] = [];
    for (let t = 0; t < MEGA_COMBAT.roamEvery * 3 + 1; t++) { const n = commanderRoam(rt, 1, false); if (n >= 0) legs.push(n); }
    expect(legs.map((i) => m.districts[i].id)).toEqual([m.commander.route[1], m.commander.route[2], m.commander.route[0]]);
    // im Kampf bleibt er stehen
    expect(commanderRoam(rt, 100, true)).toBe(-1);
    rt.commander.state = 'besiegt'; rt.commander.until = 50;
    expect(commanderShouldAppear(rt, 10)).toBe(false);
    expect(commanderShouldAppear(rt, 60)).toBe(true);
  });

  it('Beute: Schatztruhe mit Gold und Regionalware; der Kommandant gibt Boss-Siegel seiner Macht (Atoll: Macht des Sektors) und Relikt-Splitter', () => {
    const rnd = () => 0.5;
    const d = rollMegaLoot(MEGA_BY_ID.drachenamboss, 12, false, 'deutschland', rnd);
    expect(d.chest).toBe(true);
    expect(d.seals).toBeNull();
    expect(d.gold).toBeGreaterThan(300);
    expect(d.goods.map((g) => g.good)).toEqual(['kanonenstahl', 'werkzeuge']);
    const c = rollMegaLoot(MEGA_BY_ID.drachenamboss, 13, true, 'deutschland', rnd);
    expect(c.seals).toEqual({ power: 'deutschland', n: 1 });
    expect(c.shards).toBeGreaterThanOrEqual(2);
    expect(c.gold).toBeGreaterThan(d.gold * 2);
    const a = rollMegaLoot(MEGA_BY_ID.sturmkroneruinen, 15, true, 'frankreich', rnd);
    expect(a.seals?.power).toBe('frankreich');
  });

  it('die Seewelt weckt Bezirke über die reine Regel, Gegner patrouillieren (kein sofortiger Angriff) und nach dem Landgang ziehen sie ab', () => {
    const sea = readFileSync(new URL('../src/world/seaWorld.ts', import.meta.url), 'utf8');
    expect(sea).toContain('districtsToWake(rt, f.x, f.z, now, this.megaWake);');
    expect(sea).toContain("{ calm: true");
    expect(sea).toContain('this.leaveMega();');
    const combat = readFileSync(new URL('../src/combat/combat.ts', import.meta.url), 'utf8');
    expect(combat).toContain('if (!opts.calm) e.alert();');
  });
});

// ---------- 5. Weltkarte ----------

describe('Weltkarte: aufgeräumte Mitte, Mega-Inseln als Orientierungspunkte', () => {
  it('die alten Meeresnamen in der Kartenmitte sind fort', () => {
    const draw = readFileSync(new URL('../src/ui/worldMapDraw.ts', import.meta.url), 'utf8');
    expect(draw).not.toContain('r.name.toUpperCase()');
    for (const n of ['NEBELARCHIPEL', 'NORDWACHT', 'GLUTRING', 'STURMGÜRTEL', 'SCHLUNDRIFF']) expect(draw).not.toContain(n);
  });

  it('Mega-Inseln sind schon unter 1,15× beschriftet, Schären erst nah herangezoomt', () => {
    for (const i of MEGAS) { expect(labelRank(i)).toBe(3); expect(labelShown(labelRank(i), 1)).toBe(true); }
    for (const s of SKERRIES) { expect(labelRank(s)).toBe(1); expect(labelShown(labelRank(s), 1)).toBe(false); }
  });

  it('bei 1× und 2,5× überlappt keine Beschriftung; alle sechs Mega-Namen finden bei 1× ihren Platz (Desktop und Handy)', () => {
    for (const [W, H] of [[1440, 900], [390, 844]] as const) for (const zoom of [1, 2.5]) {
      const v: MapView = { cx: 0, cz: 0, scale: 1 };
      centerOn(v, W, H, 0, 0, zoom);
      const p = new LabelPlacer(400);
      const s = { x: 0, y: 0 };
      const sorted = ALL.slice().sort((a, b) => labelRank(b) - labelRank(a) || b.r - a.r);
      const placedMegas = new Set<string>();
      for (const i of sorted) {
        if (!labelShown(labelRank(i), zoom)) continue;
        worldToScreenInto(v, W, H, i.x, i.z, s);
        if (s.x < -80 || s.x > W + 80 || s.y < -60 || s.y > H + 60) continue;
        const w = i.name.length * (i.mega ? 8.2 : 6.6), y = s.y - i.r * v.scale * 1.15 - 8;
        if (p.tryPlace(s.x - w / 2, y - 13, s.x + w / 2, y + 3) && i.mega && !i.kaiser) placedMegas.add(i.id);
      }
      const r: number[] = [], q: number[] = [];
      for (let a = 0; a < p.n; a++) for (let b = a + 1; b < p.n; b++) {
        p.at(a, r); p.at(b, q);
        expect(r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]).toBe(false);
      }
      if (zoom === 1 && W > H) expect(placedMegas.size, `${W}×${H}`).toBe(6);
    }
  });

  it('die Karte zeigt Topografie: Höhenlinien, Spalten mit Brücken und Stege; Sprungziele sind die Mega-Inseln', () => {
    const draw = readFileSync(new URL('../src/ui/worldMapDraw.ts', import.meta.url), 'utf8');
    expect(draw).toContain('function drawTopo(');
    const map = readFileSync(new URL('../src/ui/worldMap.ts', import.meta.url), 'utf8');
    expect(map).toContain("data-a=\"jump\"");
    expect(map).not.toContain("data-a=\"region\"");
  });
});
