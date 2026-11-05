import { describe, expect, it } from 'vitest';
import { BERNSTEINSEE, REGIONS, seaLevelAt } from '../src/data/regions';

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
    for (let d = 1150; d <= 1900; d += 50) {
      const lv = seaLevelAt(Math.sin(a) * d, Math.cos(a) * d);
      expect(lv).toBeGreaterThanOrEqual(last);
      last = lv;
    }
  });
});
