// Phase 4.2C: Werft-Vorschau (Vergleich Vorher → Nachher, Gesamtplan, Wahl-Kennungen) und Ausbaustufen der KI-Flotten nach Art und Gefahrenstufe.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dangerOfLevel } from '../src/data/balanceConfig';
import {
  EVO_BRANCHES, aiEvolution, evoCost, evoMaterial, newShipEvolution, shipEvolutionTier, starterEvolution, type AiShipKind, type EvoBranch, type ShipEvolution,
} from '../src/data/shipEvolution';
import { SHIP_CLASSES } from '../src/data/ships';
import { shipVisual } from '../src/data/shipVisuals';
import { classCompareRows, evoCompareRows, evoPlan, hullPointsOf, parsePick, pickId, samePick, withTier } from '../src/data/yardPreview';

const DANGERS = [1, 2, 3, 4, 5];
const KINDS: AiShipKind[] = ['rookie', 'haendler', 'patrouille', 'jaeger', 'eskorte', 'grenze', 'raid', 'flaggschiff'];
const tiersOf = (e: ShipEvolution) => [e.hullTier, e.sailTier, e.cannonTier];
const BAND: Record<AiShipKind, (d: number) => [number, number]> = {
  rookie: () => [1, 1], haendler: () => [1, 2], patrouille: (d) => (d <= 2 ? [1, 2] : [3, 4]), jaeger: (d) => (d <= 2 ? [1, 2] : [3, 4]),
  eskorte: () => [3, 4], grenze: () => [3, 4], raid: () => [5, 5], flaggschiff: () => [5, 5],
};

describe('KI-Flotten: Ausbaustufen nach Art und Gefahrenstufe', () => {
  it('jede Art bleibt in ihrem Band (Einstieg 1 – 2, Kriegsschiffe 3 – 4, Raid und Flaggschiffe 5), für alle Gefahrenstufen', () => {
    for (const kind of KINDS) for (const d of DANGERS) {
      const [lo, hi] = BAND[kind](d);
      for (const t of tiersOf(aiEvolution(kind, d))) {
        expect(t, `${kind} Gefahr ${d}`).toBeGreaterThanOrEqual(lo);
        expect(t, `${kind} Gefahr ${d}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('deterministisch und nie ungültig; unsinnige Gefahrenwerte werden begrenzt', () => {
    for (const kind of KINDS) for (const d of [-3, 0, 1.4, 2, 5, 9, Number.NaN]) {
      const a = aiEvolution(kind, d), b = aiEvolution(kind, d);
      expect(a).toEqual(b);
      for (const t of tiersOf(a)) { expect(Number.isInteger(t)).toBe(true); expect(t).toBeGreaterThanOrEqual(1); expect(t).toBeLessThanOrEqual(5); }
    }
  });

  it('mit der Gefahr wächst die Stufe nie zurück; Händler fahren schwächer als Sektor-Kriegsschiffe, Raid-Flotten und Legenden voll ausgebaut', () => {
    for (const kind of KINDS) {
      let prev = 0;
      for (const d of DANGERS) { const t = shipEvolutionTier(aiEvolution(kind, d)); expect(t, `${kind} Gefahr ${d}`).toBeGreaterThanOrEqual(prev); prev = t; }
    }
    for (const d of DANGERS) {
      expect(shipEvolutionTier(aiEvolution('haendler', d))).toBeLessThanOrEqual(shipEvolutionTier(aiEvolution('jaeger', Math.max(3, d))));
      expect(aiEvolution('raid', d)).toEqual({ hullTier: 5, sailTier: 5, cannonTier: 5 });
      expect(aiEvolution('flaggschiff', d)).toEqual({ hullTier: 5, sailTier: 5, cannonTier: 5 });
    }
    expect(aiEvolution('rookie', 3)).toEqual(newShipEvolution());
    // Jäger betonen Kanonen, Patrouillen den Rumpf (innerhalb des Bandes)
    const j = aiEvolution('jaeger', 3), p = aiEvolution('patrouille', 3);
    expect(j.cannonTier).toBeGreaterThanOrEqual(j.hullTier);
    expect(p.hullTier).toBeGreaterThanOrEqual(p.cannonTier);
  });

  it('Raid-Flotten und Flaggschiffe tragen sichtbar Rammsporn und Deck-Drehbassen, Einstiegsschiffe weder noch', () => {
    for (const c of SHIP_CLASSES) {
      const grand = shipVisual(c, aiEvolution('raid', dangerOfLevel(20)));
      expect(grand.hull.ram, c.id).not.toBeNull();
      expect(grand.cannon.swivels, c.id).toBeGreaterThanOrEqual(2);
      const coast = shipVisual(c, aiEvolution('patrouille', 1));
      expect(coast.hull.ram).toBeNull();
      expect(coast.cannon.swivels).toBe(0);
      expect(coast.cannon.boarded.length).toBeGreaterThanOrEqual(c.can >= 4 ? 1 : 0);                       // Küstenpatrouillen: Pforten teilweise vernagelt
      expect(shipVisual(c, aiEvolution('haendler', 2)).hull.patches + shipVisual(c, aiEvolution('rookie', 1)).hull.patches).toBeGreaterThan(0); // geflickte Rümpfe
    }
  });

  it('NavalSystem benutzt für jede Schiffsart die Funktion (keine feste Gefahrenstufe mehr)', () => {
    const src = readFileSync(new URL('../src/naval/naval.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/evolutionOfTier\(dangerOfLevel/);
    expect((src.match(/aiEvolution\(/g) ?? []).length).toBeGreaterThanOrEqual(9);
    for (const kind of ['rookie', 'raid', 'grenze', 'flaggschiff', 'eskorte']) expect(src).toContain(`'${kind}'`);
  });
});

describe('Werft-Vorschau: Wahl-Kennungen', () => {
  it('Stufe und Klasse lassen sich hin und zurück lesen, Ungültiges ergibt null', () => {
    for (const br of EVO_BRANCHES) for (let t = 1; t <= 5; t++) {
      const p = { kind: 'evo' as const, branch: br, tier: t };
      expect(parsePick(pickId(p))).toEqual(p);
    }
    for (let i = 0; i < SHIP_CLASSES.length; i++) expect(parsePick(pickId({ kind: 'cls', index: i }))).toEqual({ kind: 'cls', index: i });
    for (const bad of ['', 'evo|hull|0', 'evo|hull|6', 'evo|mast|3', 'evo|hull|x', 'cls|-1', 'cls|7', 'cls|a', 'foo|1', 'evo']) expect(parsePick(bad), bad).toBeNull();
    expect(samePick(null, null)).toBe(true);
    expect(samePick({ kind: 'cls', index: 2 }, { kind: 'cls', index: 2 })).toBe(true);
    expect(samePick({ kind: 'cls', index: 2 }, { kind: 'cls', index: 3 })).toBe(false);
    expect(samePick({ kind: 'cls', index: 2 }, null)).toBe(false);
  });

  it('withTier ändert nur einen Zweig und begrenzt die Stufe', () => {
    const e = starterEvolution();
    expect(withTier(e, 'hull', 4)).toEqual({ hullTier: 4, sailTier: 2, cannonTier: 2 });
    expect(withTier(e, 'sail', 9)).toEqual({ hullTier: 2, sailTier: 5, cannonTier: 2 });
    expect(withTier(e, 'cannon', 0)).toEqual({ hullTier: 2, sailTier: 2, cannonTier: 1 });
    expect(e).toEqual(starterEvolution());
  });
});

describe('Werft-Vorschau: Vorher → Nachher', () => {
  it('Rumpf: Stufe 2 → 4 bringt mehr Rumpf, Panzerung und Rammsporn, der Eigenschaden beim Rammen sinkt', () => {
    for (let ci = 0; ci < SHIP_CLASSES.length; ci++) {
      const from = starterEvolution(), to = withTier(from, 'hull', 4);
      const rows = Object.fromEntries(evoCompareRows(ci, 'hull', from, to).map((r) => [r.label, r]));
      expect(rows['Rumpf-HP'].better, SHIP_CLASSES[ci].n).toBe(1);
      expect(rows['Panzerung'].better).toBe(1);
      expect(rows['Rammsporn']).toMatchObject({ from: 'nein', to: 'ja', better: 1 });
      expect(rows['Rammschaden'].better).toBe(1);
      expect(rows['Eigenschaden beim Rammen'].better).toBe(1);
      expect(hullPointsOf(ci, to)).toBeGreaterThan(hullPointsOf(ci, from));
    }
    expect(evoCompareRows(3, 'hull', starterEvolution(), withTier(starterEvolution(), 'hull', 5)).find((r) => r.label === 'Rammsporn')!.to).toBe('panzerbrechend');
  });

  it('Segel und Kanonen: die Zeilen zeigen die Wirkung der Stufe (Tempo, Wendigkeit; Pforten, Schaden, Drehbassen)', () => {
    const base = newShipEvolution();
    const sail = Object.fromEntries(evoCompareRows(2, 'sail', base, withTier(base, 'sail', 5)).map((r) => [r.label, r]));
    expect(sail['Tempo'].better).toBe(1);
    expect(sail['Wendigkeit'].better).toBe(1);
    expect(sail['Segel-HP'].better).toBe(1);
    const can = Object.fromEntries(evoCompareRows(4, 'cannon', base, withTier(base, 'cannon', 4)).map((r) => [r.label, r]));
    expect(can['Aktive Kanonen'].better).toBe(1);
    expect(can['Kanonenschaden'].better).toBe(1);
    expect(can['Deck-Drehbassen']).toMatchObject({ from: 'nein', to: 'ja', better: 1 });
    expect(can['Aktive Kanonen'].to).toBe(`${SHIP_CLASSES[4].can} von ${SHIP_CLASSES[4].can} je Seite`);
  });

  it('dieselbe Stufe ergibt keine Änderung; jeder Zweig zeigt Zeilen für alle Klassen', () => {
    for (const br of EVO_BRANCHES) for (let ci = 0; ci < SHIP_CLASSES.length; ci++) {
      const e = starterEvolution();
      const rows = evoCompareRows(ci, br as EvoBranch, e, e);
      expect(rows.length).toBeGreaterThanOrEqual(4);
      for (const r of rows) { expect(r.better, `${br} ${r.label}`).toBe(0); expect(r.from).toBe(r.to); }
    }
  });

  it('Klassenwechsel: größere Klasse bringt mehr Rumpf, Kanonen, Crew; Tempo und Rumpf berücksichtigen die Stufen', () => {
    const rows = Object.fromEntries(classCompareRows(0, starterEvolution(), 4, newShipEvolution()).map((r) => [r.label, r]));
    expect(rows['Kanonen je Seite'].better).toBe(1);
    expect(rows['Crew'].better).toBe(1);
    expect(rows['Rumpf-HP'].better).toBe(1);
    expect(classCompareRows(3, starterEvolution(), 3, starterEvolution()).every((r) => r.better === 0)).toBe(true);
  });
});

describe('Werft-Vorschau: Gesamtplan bis zu einer Stufe', () => {
  it('Gold und Material sind die Summe der Einzelstufen, Siegel und Splitter erst für die letzte Stufe', () => {
    for (const br of EVO_BRANCHES) for (let ci = 0; ci < SHIP_CLASSES.length; ci++) {
      const plan = evoPlan(br, ci, 2, 5);
      expect(plan.steps).toEqual([3, 4, 5]);
      expect(plan.gold).toBe(evoCost(ci, 3) + evoCost(ci, 4) + evoCost(ci, 5));
      let matTotal = 0; for (const t of [3, 4, 5]) matTotal += evoMaterial(br, ci, t)!.n;
      expect(plan.materials.reduce((s, m) => s + m.n, 0)).toBe(matTotal);
      expect(plan.seals).toBeGreaterThan(0);
      expect(plan.shards).toBeGreaterThan(0);
      expect(evoPlan(br, ci, 2, 4).seals).toBe(0);
    }
    // Segel: Tuch bis Stufe 4, Seide in Stufe 5
    expect(evoPlan('sail', 1, 2, 5).materials.map((m) => m.good).sort()).toEqual(['seide', 'tuch']);
    expect(evoPlan('hull', 1, 2, 5).materials.map((m) => m.good)).toEqual(['hartholz']);
  });

  it('nicht höher als jetzt: leerer Plan; Stufe 2 kostet kein Material', () => {
    const none = evoPlan('hull', 2, 4, 3);
    expect(none.steps).toEqual([]);
    expect(none.gold).toBe(0);
    expect(none.materials).toEqual([]);
    expect(evoPlan('cannon', 2, 1, 2).materials).toEqual([]);
    expect(evoPlan('cannon', 2, 1, 2).gold).toBe(evoCost(2, 2));
    expect(evoPlan('cannon', 2, 5, 5).steps).toEqual([]);
  });
});
