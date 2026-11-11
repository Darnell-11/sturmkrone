import { describe, expect, it } from 'vitest';
import { BERNSTEINSEE, ISLAND_REACH, REGIONS, regionAt, seaLevelAt } from '../src/data/regions';
import { SITES } from '../src/data/settlements';
import { IslandGround, shelfOf, WATERLINE } from '../src/world/islandGround';
import { WORLD_RADIUS, WORLD_SCALE } from '../src/data/world';

describe('Stärke der Meere', () => {
  it('ist vor Ankerglück am schwächsten und steigt bis zum Rand der Bernsteinsee', () => {
    const home = BERNSTEINSEE.islands[0];
    expect(seaLevelAt(home.x, home.z)).toBe(1);
    const edge = seaLevelAt(home.x + 900, home.z);
    expect(edge).toBeGreaterThan(1);
    expect(edge).toBeLessThanOrEqual(4);
  });

  it('richtet sich in den äußeren Meeren nach der Region, nicht nach der Spielerstufe', () => {
    for (const r of REGIONS) {
      if (r === BERNSTEINSEE) continue;
      for (const i of r.islands) {
        const lv = seaLevelAt(i.x, i.z);
        expect(lv, `${r.id}/${i.id}`).toBeGreaterThanOrEqual(r.level!);
        expect(lv, `${r.id}/${i.id}`).toBeLessThanOrEqual(r.level! + 2);
      }
    }
  });

  it('wird zum Weltrand hin nie schwächer', () => {
    const r = REGIONS.find((x) => x.id === 'schlund')!;
    const a = (r.arc![0] + r.arc![1]) / 2 * Math.PI / 180;
    let last = 0;
    for (let d = 1150 * WORLD_SCALE; d <= 1900 * WORLD_SCALE; d += 50) {
      const lv = seaLevelAt(Math.sin(a) * d, Math.cos(a) * d);
      expect(lv).toBeGreaterThanOrEqual(last);
      last = lv;
    }
  });

  it('hat größere Inseln, die sich nirgends überschneiden und vor dem Weltrand bleiben', () => {
    const all = REGIONS.flatMap((r) => r.islands);
    expect(all.filter((i) => i.kind !== 'town').every((i) => i.r >= 30)).toBe(true);
    for (let a = 0; a < all.length; a++) {
      expect(Math.hypot(all[a].x, all[a].z) + all[a].r * ISLAND_REACH, all[a].id).toBeLessThan(WORLD_RADIUS - 60);
      for (let b = a + 1; b < all.length; b++) {
        const d = Math.hypot(all[a].x - all[b].x, all[a].z - all[b].z);
        expect(d, `${all[a].id} / ${all[b].id}`).toBeGreaterThan((all[a].r + all[b].r) * 1.25);
      }
    }
  });
});

describe('Große Welt', () => {
  it('hat die vierfache Fläche, Ankerglück bleibt der Heimathafen am alten Platz', () => {
    expect(WORLD_RADIUS).toBe(4000);
    expect(BERNSTEINSEE.islands[0]).toMatchObject({ id: 'ankerglueck', x: 0, z: 160 });
  });

  it('enthält das Festland und drei neue Inseln mit eigenem Biom, alle in der Bernsteinsee', () => {
    const lands = REGIONS.flatMap((r) => r.islands).filter((i) => i.site);
    expect(lands.map((i) => i.id).sort()).toEqual(['faehrholm', 'gruenmark', 'palmenkueste', 'sturmklippe']);
    expect(new Set(lands.map((i) => i.biome))).toEqual(new Set(['festland', 'tropisch', 'klippe']));
    for (const i of lands) {
      expect(SITES[i.site!], i.id).toBeDefined();
      expect(regionAt(i.x, i.z).id, i.id).toBe('bernsteinsee');
    }
    const mainland = lands.find((i) => i.id === 'gruenmark')!;
    expect(mainland.r).toBeGreaterThan(2.5 * Math.max(...REGIONS.flatMap((r) => r.islands).filter((i) => !i.site).map((i) => i.r)) / 1.3);
  });

  it('lässt Schiffe an jeder Inselgröße nah genug zum Anlegen heran', () => {
    for (const r of [30, 60, 90, 120, 270, 400]) {
      const g = new IslandGround();
      const isl = { x: 0, z: 0, r, beachY: 1.3, hillY: 1.2, coast: [], hills: [], shelf: shelfOf(r), blockers: [] };
      g.add(isl);
      // Böschung höchstens 22 m: das Wasser beginnt höchstens gut 9 m hinter der Küste
      expect(r * isl.shelf * WATERLINE, `r ${r}`).toBeLessThanOrEqual(9.6);
      // Schiff (Breite 6–19 m) wird vor dem Strand gehalten – und dort gilt die Insel als erreicht (Spiel: Abstand 30 m + Breite)
      for (const W of [5.8, 19]) {
        const p = g.pushShip(0, r * 0.98, Math.PI, 18, W);
        expect(g.islandAt(p.x, p.z, 30 + W), `r ${r}, W ${W}`).toBe(isl);
        expect(g.height(p.x, p.z), `r ${r}, W ${W}`).toBeLessThan(0.2);
      }
    }
  });

  it('gibt jedem Bauwerk der Siedlungen eine gültige Lage', () => {
    for (const [id, site] of Object.entries(SITES)) {
      expect(site.clusters.length, id).toBeGreaterThan(0);
      for (const c of site.clusters) {
        expect(c.at !== undefined || c.deg !== undefined, `${id}/${c.name}`).toBe(true);
        for (const it of c.items) expect(Number.isFinite(it.x) && Number.isFinite(it.z), `${id}/${c.name}/${it.t}`).toBe(true);
      }
    }
  });
});
