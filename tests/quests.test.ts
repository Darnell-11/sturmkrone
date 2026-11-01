import { describe, expect, it } from 'vitest';
import { defaultProgress } from '../src/core/save/types';
import { QUESTS } from '../src/data/quests';
import { BERNSTEINSEE } from '../src/data/regions';
import { QuestSystem } from '../src/story/questSystem';

describe('Aufträge', () => {
  it('verweisen nur auf vorhandene Inseln und Bewohner', () => {
    const islands = new Set(BERNSTEINSEE.islands.map((i) => i.id));
    for (const q of QUESTS) for (const s of q.steps) if ('island' in s) expect(islands.has(s.island), `${q.id}: ${s.island}`).toBe(true);
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
});
