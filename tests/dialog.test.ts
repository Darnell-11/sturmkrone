import { describe, expect, it } from 'vitest';
import { DialogSession, type DialogCtx } from '../src/story/dialog';
import { QUEST_BY_ID, TOWN_NPCS, VILLAGE_NPCS } from '../src/data/quests';
import { TALKS } from '../src/data/dialogs';

function ctx(npcId: string, over: Partial<DialogCtx> = {}): DialogCtx & { accepted: string[] } {
  const npc = [...TOWN_NPCS, ...Object.values(VILLAGE_NPCS).flat()].find((n) => n.id === npcId)!;
  const accepted: string[] = [];
  return {
    npc, accepted, done: [],
    offers: () => [],
    running: () => [],
    introOf: (q) => (typeof q.intro === 'string' ? q.intro : q.intro.pirat),
    rewardText: (q) => `${q.reward.gold} Gold`,
    accept: (id) => { accepted.push(id); },
    ...over,
  };
}

describe('Gespräche', () => {
  it('jede Person mit Themen hat alle Knoten, und jede Antwort führt irgendwohin', () => {
    for (const [id, t] of Object.entries(TALKS)) {
      for (const topic of t.topics) expect(t.nodes[topic.to], `${id}: ${topic.to}`).toBeDefined();
      for (const node of Object.values(t.nodes)) for (const ch of node.choices ?? []) {
        expect(ch.to === 'menu' || ch.to === 'bye' || t.nodes[ch.to], `${id}: ${ch.to}`).toBeTruthy();
      }
    }
  });

  it('Hauptauswahl: Begrüßung, Themen und Abschied', () => {
    const s = new DialogSession(ctx('ole'));
    const v = s.start();
    expect(v.lines.length).toBe(1);
    expect(v.choices.some((c) => c.id === 't:fisch')).toBe(true);
    expect(v.choices.at(-1)!.kind).toBe('bye');
  });

  it('Thema verzweigt und führt zurück zur Auswahl', () => {
    const s = new DialogSession(ctx('ole'));
    s.start();
    const a = s.choose('t:fisch') as { view: ReturnType<DialogSession['start']> };
    expect(a.view.choices.map((c) => c.id)).toEqual(['t:fisch2', 'menu']);
    const b = s.choose('t:fisch2') as { view: ReturnType<DialogSession['start']> };
    expect(b.view.choices[0].id).toBe('menu');
    const m = s.choose('menu') as { view: ReturnType<DialogSession['start']> };
    expect(m.view.lines[0]).toBe('Sonst noch etwas?');
  });

  it('Auftrag: Angebot ansehen, annehmen, Hinweis erscheint', () => {
    const q = QUEST_BY_ID['pluenderer'];
    const c = ctx('toni', { offers: () => [q] });
    const s = new DialogSession(c);
    expect(s.start().choices[0].id).toBe('q:pluenderer');
    const offer = s.choose('q:pluenderer') as { view: ReturnType<DialogSession['start']> };
    expect(offer.view.choices[0].kind).toBe('accept');
    const done = s.choose('a:pluenderer') as { view: ReturnType<DialogSession['start']> };
    expect(c.accepted).toEqual(['pluenderer']);
    expect(done.view.note).toContain('Auftrag angenommen');
  });

  it('Abgabe: erledigte Aufträge werden beim Ansprechen belohnt', () => {
    const q = QUEST_BY_ID['pluenderer'];
    const s = new DialogSession(ctx('toni', { done: [q] }));
    const v = s.start();
    expect(v.lines).toEqual([q.outro]);
    expect(v.note).toContain('Auftrag erfüllt');
  });

  it('Laden und Ende', () => {
    const s = new DialogSession(ctx('grete'));
    expect(s.start().choices.some((c) => c.id === 'shop')).toBe(true);
    expect(s.choose('shop')).toEqual({ shop: true });
    expect(s.choose('bye')).toEqual({ end: true });
  });
});
