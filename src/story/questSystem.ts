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
  | { type: 'rescue' }
  | { type: 'slay'; target: string }
  /** 4.7A: Handlung der Einführung (data/prologue.ts `TutorialAct`) */
  | { type: 'act'; act: string }
  // ---- 4.7E: Team-Wahl und Hauptkampagne ----
  | { type: 'pledge' }
  /** eine Live-Kriegs-Quest des Teams mit eigenem Beitrag gewonnen (Art aus story/warQuests.ts) */
  | { type: 'war'; kind: string }
  /** Kommandoschiff eines feindlichen Verbands versenkt */
  | { type: 'flagship' }
  /** Insel mit dem Team erobert oder zurückerobert */
  | { type: 'liberate' }
  /** Kaiser im fünften Ring besiegt */
  | { type: 'kaiser'; kaiser: string };

/** 4.7E: Zustand für Schritte, die das Spiel abfragt statt meldet (Stufe, Entfernung vom Weltzentrum) */
export interface QuestPoll { level: number; dist: number }

export interface QuestHooks {
  completed(q: QuestDef): void;
  advanced(q: QuestDef, next: QuestStep): void;
}

/** Aufträge annehmen, verfolgen und abschließen. Arbeitet direkt auf dem Spielstand. */
export class QuestSystem {
  /** @param team 4.7E: Team des Spielers (Kampagnen-Kapitel anderer Teams werden nie angeboten oder gestartet) */
  constructor(private p: ProgressState, private faction: Faction, private hooks: QuestHooks, private team: () => string | null = () => null) {}

  /** 4.7E: gehört der Auftrag zu einem anderen Team? */
  foreign(q: QuestDef): boolean { return !!q.team && q.team !== this.team(); }

  introOf(q: QuestDef) { return typeof q.intro === 'string' ? q.intro : q.intro[this.faction]; }

  isActive(id: string) { return this.p.quests.some((x) => x.id === id); }
  isDone(id: string) { return this.p.done.includes(id); }

  /** Aufträge, die dieser Bewohner gerade anbietet */
  available(npc: string): QuestDef[] {
    return QUESTS.filter((q) => q.giver === npc && !q.noOffer && !q.auto && !this.isActive(q.id) && !this.isDone(q.id)
      && (!q.faction || q.faction === this.faction) && (!q.after || this.isDone(q.after)) && !this.foreign(q));
  }

  accept(id: string) {
    const q = QUEST_BY_ID[id];
    if (!q || this.isActive(id) || this.isDone(id) || this.foreign(q)) return;
    this.p.quests.push({ id, step: 0, count: 0 });
  }

  /** Aktueller Schritt eines laufenden Auftrags */
  step(id: string): QuestStep | null {
    const prog = this.p.quests.find((x) => x.id === id);
    const q = QUEST_BY_ID[id];
    return prog && q ? q.steps[prog.step] ?? null : null;
  }

  /** Auftrag zum Verfolgen wählen (Auftragsbuch) */
  setTracked(id: string | null) { if (id) this.p.flags.tracked = id; else delete this.p.flags.tracked; }

  /** Verfolgter Auftrag: Hauptgeschichte zuerst */
  tracked(): { q: QuestDef; step: QuestStep; count: number } | null {
    // vom Spieler gewählter Auftrag (Auftragsbuch) hat Vorrang, solange er läuft
    const pick = this.p.flags.tracked;
    if (typeof pick === 'string') {
      const prog = this.p.quests.find((x) => x.id === pick);
      const q = QUEST_BY_ID[pick];
      const step = prog && q?.steps[prog.step];
      if (prog && q && step) return { q, step, count: prog.count };
    }
    // Reihenfolge: Hauptkampagne des Teams (4.7E), dann übrige Hauptgeschichte, dann Nebenaufträge
    const rank = (id: string) => { const q = QUEST_BY_ID[id]; return q?.campaign || q?.id === 'rat' ? 2 : q?.main ? 1 : 0; };
    const list = [...this.p.quests].sort((a, b) => rank(b.id) - rank(a.id));
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
        case 'slay': hit = e.type === 'slay' && e.target === s.target; break;
        case 'kill': if (e.type === 'kill' && (!s.kind || s.kind === e.kind)) hit = ++prog.count >= s.count; break;
        case 'sink': if (e.type === 'sink') hit = ++prog.count >= s.count; break;
        case 'board': if (e.type === 'board') hit = ++prog.count >= s.count; break;
        case 'rescue': if (e.type === 'rescue') hit = ++prog.count >= s.count; break;
        case 'act': if (e.type === 'act' && e.act === s.act) hit = ++prog.count >= (s.count ?? 1); break;
        case 'pledge': hit = e.type === 'pledge'; break;
        case 'war': if (e.type === 'war' && (!s.kind || s.kind === e.kind)) hit = ++prog.count >= s.count; break;
        case 'flagship': if (e.type === 'flagship') hit = ++prog.count >= s.count; break;
        case 'liberate': if (e.type === 'liberate') hit = ++prog.count >= s.count; break;
        case 'kaiser': hit = e.type === 'kaiser' && (!s.kaiser || s.kaiser === e.kaiser); break;
        default: break;
      }
      if (!hit && this.matches(s, e)) changed = true;
      if (!hit) continue;
      this.advance(q, prog);
      changed = true;
    }
    return changed;
  }

  /**
   * 4.7E: Schritte, die das Spiel abfragt (Stufe erreicht, weit genug hinaus gesegelt): zählen sofort, wenn die Bedingung schon gilt (auch beim
   * Laden und direkt nach dem Start eines Kapitels). Liefert true, wenn sich etwas bewegt hat.
   */
  poll(st: QuestPoll): boolean {
    let changed = false;
    for (let guard = 0; guard < 8; guard++) {
      let moved = false;
      for (const prog of [...this.p.quests]) {
        const q = QUEST_BY_ID[prog.id];
        const s = q?.steps[prog.step];
        if (!q || !s) continue;
        const hit = (s.type === 'level' && st.level >= s.level) || (s.type === 'horizon' && st.dist >= s.dist);
        if (!hit) continue;
        this.advance(q, prog);
        moved = changed = true;
      }
      if (!moved) break;
    }
    return changed;
  }

  /** Nächster Schritt bzw. Abschluss (gemeinsam für Ereignisse und Abfragen) */
  private advance(q: QuestDef, prog: { id: string; step: number; count: number }) {
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

  private matches(s: QuestStep, e: QuestEvent) {
    return (s.type === 'kill' && e.type === 'kill') || (s.type === 'sink' && e.type === 'sink') || (s.type === 'board' && e.type === 'board') || (s.type === 'rescue' && e.type === 'rescue')
      || (s.type === 'war' && e.type === 'war') || (s.type === 'flagship' && e.type === 'flagship') || (s.type === 'liberate' && e.type === 'liberate');
  }
}

/** Fortschrittstext eines Schritts, z. B. „Versenke 2 feindliche Schiffe (1/2)“ */
export function stepText(step: QuestStep, count: number): string {
  const need = 'count' in step ? step.count ?? 1 : 1;
  if (need > 1) return `${step.text} (${count}/${need})`;
  return step.text;
}
