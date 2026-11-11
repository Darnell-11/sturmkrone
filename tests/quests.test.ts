import { describe, expect, it } from 'vitest';
import { defaultProgress } from '../src/core/save/types';
import { CREW_BY_ID } from '../src/data/crew';
import { LEGENDS } from '../src/data/legends';
import { QUESTS, TOWN_NPCS, VILLAGE_NPC_BY_ID } from '../src/data/quests';
import { REGIONS, regionAt } from '../src/data/regions';
import { QuestSystem } from '../src/story/questSystem';

const islands = new Set(REGIONS.flatMap((r) => r.islands.map((i) => i.id)));

describe('Aufträge', () => {
  it('verweisen nur auf vorhandene Inseln und Bewohner', () => {
    const npcs = new Set([...TOWN_NPCS.map((n) => n.id), ...Object.keys(VILLAGE_NPC_BY_ID), ...Object.keys(CREW_BY_ID)]);
    for (const q of QUESTS) {
      expect(npcs.has(q.giver), `${q.id}: Auftraggeber ${q.giver}`).toBe(true);
      for (const s of q.steps) {
        if ('island' in s) expect(islands.has(s.island), `${q.id}: ${s.island}`).toBe(true);
        if (s.type === 'talk') expect(npcs.has(s.npc), `${q.id}: ${s.npc}`).toBe(true);
      }
      if (q.after) expect(QUESTS.some((o) => o.id === q.after), `${q.id}: nach ${q.after}`).toBe(true);
    }
  });

  it('laufen Schritt für Schritt bis zur Belohnung', () => {
    const p = defaultProgress();
    const done: string[] = [];
    const qs = new QuestSystem(p, 'pirat', { completed: (q) => done.push(q.id), advanced: () => {} });
    expect(qs.available('ilse').map((q) => q.id)).toContain('k1');
    expect(qs.available('ilse').map((q) => q.id)).not.toContain('k2');
    qs.accept('k1');
    qs.event({ type: 'enter', island: 'leuchtfeuer' });
    qs.event({ type: 'clear', island: 'kraehenfels' });
    qs.event({ type: 'sink' });
    expect(qs.tracked()?.count).toBe(1);
    qs.event({ type: 'sink' });
    expect(qs.tracked()?.step.type).toBe('talk');
    qs.event({ type: 'talk', npc: 'ilse' });
    expect(done).toEqual(['k1']);
    expect(qs.available('ilse').map((q) => q.id)).toContain('k2');
  });

  it('Hauptgeschichte führt lückenlos bis zur Sturmkrone', () => {
    const main = QUESTS.filter((q) => q.main);
    expect(main.some((q) => q.steps.some((s) => s.type === 'slay'))).toBe(true);
    for (const q of main.filter((m) => m.auto)) expect(main.some((m) => m.id === q.after)).toBe(true);
  });
});

describe('Welt', () => {
  it('jede Legende hat eine vorhandene Heimatinsel', () => {
    for (const l of LEGENDS) expect(islands.has(l.home), `${l.id}: ${l.home}`).toBe(true);
  });

  it('Inseln liegen in ihrer Region und überlappen nicht', () => {
    for (const r of REGIONS) for (const i of r.islands) expect(regionAt(i.x, i.z).id, i.id).toBe(r.id);
    const all = REGIONS.flatMap((r) => r.islands);
    for (const a of all) for (const b of all) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id}/${b.id}`).toBeGreaterThan(a.r + b.r + 40);
  });
});
