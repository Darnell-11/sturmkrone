import { describe, expect, it } from 'vitest';
import { LOOT_WEIGHTS, RARITIES, rollEventLoot, rollLoot } from '../src/data/loot';
import { zoneContains } from '../src/combat/zones';
import { rollTrinket, TRINKETS } from '../src/data/trinkets';

/** Zufall mit festem Anfang, damit die Prüfungen wiederholbar sind */
function lcg(seed: number) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const SRC = { level: 5, gold: [10, 20] as [number, number] };

describe('Beute', () => {
  it('Bosse lassen vier Stücke fallen, das erste mindestens episch', () => {
    const rnd = lcg(1);
    for (let i = 0; i < 200; i++) {
      const d = rollLoot({ ...SRC, boss: true }, rnd);
      expect(d).toHaveLength(4);
      expect(['episch', 'legendaer']).toContain(d[0].rarity);
    }
  });
  it('normale Gegner lassen selten etwas fallen, meist Gewöhnliches', () => {
    const rnd = lcg(2);
    let drops = 0, common = 0;
    for (let i = 0; i < 4000; i++) { const d = rollLoot(SRC, rnd); drops += d.length; common += d.filter((x) => x.rarity === 'gewoehnlich').length; }
    expect(drops / 4000).toBeGreaterThan(0.1);
    expect(drops / 4000).toBeLessThan(0.3);
    expect(common / drops).toBeGreaterThan(0.7);
  });
  it('Elite lassen fast immer etwas fallen und öfter Seltenes', () => {
    const rnd = lcg(3);
    let drops = 0, rare = 0;
    for (let i = 0; i < 2000; i++) { const d = rollLoot({ ...SRC, elite: true }, rnd); drops += d.length; rare += d.filter((x) => x.rarity !== 'gewoehnlich').length; }
    expect(drops / 2000).toBeGreaterThan(0.8);
    expect(rare / drops).toBeGreaterThan(0.45);
  });
  it('Ereignis-Beute ist mindestens selten', () => {
    const rnd = lcg(4);
    for (const d of rollEventLoot(SRC, 200, rnd)) expect(d.rarity).not.toBe('gewoehnlich');
  });
  it('Gewichte ergeben je Tabelle 1', () => {
    for (const w of Object.values(LOOT_WEIGHTS)) expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(RARITIES).toHaveLength(4);
  });
  it('Talisman in genau der Seltenheit (exact) oder nichts', () => {
    for (let i = 0; i < 50; i++) expect(rollTrinket('episch', 0.5, [], true)?.rarity).toBe('episch');
    const all = TRINKETS.filter((t) => t.rarity === 'legendaer').map((t) => t.id);
    expect(rollTrinket('legendaer', 0, all, true)).toBeNull();
  });
});

describe('Warnflächen', () => {
  const at = (shape: 'circle' | 'ring' | 'line' | 'cone', extra: object, yaw = 0) => ({ spec: { shape, size: 10, ...extra }, x: 0, z: 0, yaw });
  it('Kreis und Ring', () => {
    expect(zoneContains(at('circle', {}), 6, 6, 0.3)).toBe(true);
    expect(zoneContains(at('circle', {}), 8, 8, 0.3)).toBe(false);
    const ring = at('ring', { inner: 4 });
    expect(zoneContains(ring, 1, 0, 0.3)).toBe(false);
    expect(zoneContains(ring, 7, 0, 0.3)).toBe(true);
    expect(zoneContains(ring, 11, 0, 0.3)).toBe(false);
  });
  it('Linie läuft in Blickrichtung (yaw 0 = +z)', () => {
    const line = at('line', { width: 2 });
    expect(zoneContains(line, 0, 8, 0.3)).toBe(true);
    expect(zoneContains(line, 0, -3, 0.3)).toBe(false);
    expect(zoneContains(line, 2, 5, 0.3)).toBe(false);
    // um 90° gedreht zeigt sie nach +x
    const turned = at('line', { width: 2 }, Math.PI / 2);
    expect(zoneContains(turned, 8, 0, 0.3)).toBe(true);
    expect(zoneContains(turned, 0, 8, 0.3)).toBe(false);
  });
  it('Kegel öffnet sich um die Blickrichtung', () => {
    const cone = at('cone', { arc: 1.6 });
    expect(zoneContains(cone, 0, 6, 0.3)).toBe(true);
    expect(zoneContains(cone, 4, 4, 0.3)).toBe(true);
    expect(zoneContains(cone, 6, 0, 0.3)).toBe(false);
    expect(zoneContains(cone, 0, -6, 0.3)).toBe(false);
  });
});
