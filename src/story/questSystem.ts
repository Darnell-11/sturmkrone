import type { Faction, ProgressState } from '../core/save/types';
import type { EnemyKind } from '../data/combat';
import { QUEST_BY_ID, QUESTS, type QuestDef, type QuestStep } from '../data/quests';

export type QuestEvent =
  | { type: 'talk'; npc: string }
  | { type: 'enter'; island: string }
  | { type: 'clear'; island: string }
  | { type: 'kill'; kind: EnemyKind }
  | { type: 'sink' }
  | { type: 'board' }
  | { type: 'treasure'; island: string }
  | { type: 'rescue' };

export interface QuestHooks {
  completed(q: QuestDef): void;
  advanced(q: QuestDef, next: QuestStep): void;
}

/** Aufträge annehmen, verfolgen und abschließen. Arbeitet direkt auf dem Spielstand. */
export class QuestSystem {
  constructor(private p: ProgressState, private faction: Faction, private hooks: QuestHooks) {}

  introOf(q: QuestDef) { return typeof q.intro === 'string' ? q.intro : q.intro[this.faction]; }

  isActive(id: string) { return this.p.quests.some((x) => x.id === id); }
  isDone(id: string) { return this.p.done.includes(id); }

  /** Aufträge, die dieser Bewohner gerade anbietet */
  available(npc: string): QuestDef[] {
    return QUESTS.filter((q) => q.giver === npc && !this.isActive(q.id) && !this.isDone(q.id)
      && (!q.faction || q.faction === this.faction) && (!q.after || this.isDone(q.after)));
  }

  accept(id: string) {
    if (!QUEST_BY_ID[id] || this.isActive(id) || this.isDone(id)) return;
    this.p.quests.push({ id, step: 0, count: 0 });
  }

  /** Aktueller Schritt eines laufenden Auftrags */
  step(id: string): QuestStep | null {
    const prog = this.p.quests.find((x) => x.id === id);
    const q = QUEST_BY_ID[id];
    return prog && q ? q.steps[prog.step] ?? null : null;
  }

  /** Verfolgter Auftrag: Hauptgeschichte zuerst */
  tracked(): { q: QuestDef; step: QuestStep; count: number } | null {
    const list = [...this.p.quests].sort((a, b) => Number(!!QUEST_BY_ID[b.id]?.main) - Number(!!QUEST_BY_ID[a.id]?.main));
    for (const prog of list) {
      const q = QUEST_BY_ID[prog.id];
      const step = q?.steps[prog.step];
      if (q && step) return { q, step, count: prog.count };
    }
    return null;
  }

  /** Alle laufenden Schatz-Schritte (für Grabstellen) */
  treasureIslands(): string[] {
    const out: string[] = [];
    for (const prog of this.p.quests) {
      const s = QUEST_BY_ID[prog.id]?.steps[prog.step];
      if (s?.type === 'treasure') out.push(s.island);
    }
    return out;
  }

  /** Ereignis aus dem Spiel verarbeiten. Liefert true, wenn sich etwas bewegt hat. */
  event(e: QuestEvent): boolean {
    let changed = false;
    for (const prog of [...this.p.quests]) {
      const q = QUEST_BY_ID[prog.id];
      const s = q?.steps[prog.step];
      if (!q || !s) continue;
      let hit = false;
      switch (s.type) {
        case 'talk': hit = e.type === 'talk' && e.npc === s.npc; break;
        case 'goto': hit = e.type === 'enter' && e.island === s.island; break;
        case 'clear': hit = e.type === 'clear' && e.island === s.island; break;
        case 'treasure': hit = e.type === 'treasure' && e.island === s.island; break;
        case 'kill': if (e.type === 'kill' && (!s.kind || s.kind === e.kind)) hit = ++prog.count >= s.count; break;
        case 'sink': if (e.type === 'sink') hit = ++prog.count >= s.count; break;
        case 'board': if (e.type === 'board') hit = ++prog.count >= s.count; break;
        case 'rescue': if (e.type === 'rescue') hit = ++prog.count >= s.count; break;
      }
      if ((s.type === 'kill' || s.type === 'sink' || s.type === 'board' || s.type === 'rescue') && !hit && this.matches(s, e)) changed = true;
      if (!hit) continue;
      changed = true;
      prog.step++;
      prog.count = 0;
      const next = q.steps[prog.step];
      if (next) this.hooks.advanced(q, next);
      else {
        this.p.quests = this.p.quests.filter((x) => x !== prog);
        this.p.done.push(q.id);
        this.hooks.completed(q);
      }
    }
    return changed;
  }

  private matches(s: QuestStep, e: QuestEvent) {
    return (s.type === 'kill' && e.type === 'kill') || (s.type === 'sink' && e.type === 'sink') || (s.type === 'board' && e.type === 'board') || (s.type === 'rescue' && e.type === 'rescue');
  }
}

/** Fortschrittstext eines Schritts, z. B. „Versenke 2 feindliche Schiffe (1/2)“ */
export function stepText(step: QuestStep, count: number): string {
  if ('count' in step && step.count > 1) return `${step.text} (${count}/${step.count})`;
  return step.text;
}
