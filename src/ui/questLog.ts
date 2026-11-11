import type { ProgressState } from '../core/save/types';
import { QUEST_BY_ID, type QuestDef } from '../data/quests';
import { stepText, type QuestSystem } from '../story/questSystem';
import { esc } from './dom';

export interface QuestLogOptions {
  qs: QuestSystem;
  progress: ProgressState;
  /** Name der Person, die einen Auftrag vergibt */
  giverName: (id: string) => string;
  /** Auftrag verfolgen (Anzeige am Bildschirmrand und Pfeil) */
  onTrack: (id: string) => void;
  onClose: () => void;
}

type Tab = 'laufend' | 'erledigt';

/** Auftragsbuch (Taste L): Haupt- und Nebenaufträge, Schritte mit Haken, Belohnung, Verfolgen. */
export class QuestLog {
  private root: HTMLElement;
  private tab: Tab = 'laufend';
  private sel: string | null = null;
  private keyFn = (e: KeyboardEvent) => this.onKey(e);

  constructor(parent: HTMLElement, private o: QuestLogOptions) {
    this.root = document.createElement('div');
    this.root.className = 'qlog';
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => this.onClick(e));
    addEventListener('keydown', this.keyFn, true);
    this.sel = this.tracked() ?? this.o.progress.quests[0]?.id ?? null;
    this.render();
  }

  private tracked(): string | null {
    const t = this.o.qs.tracked();
    return t?.q.id ?? null;
  }

  private onKey(e: KeyboardEvent) {
    if (e.code === 'Escape' || e.code === 'KeyL') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) this.o.onClose(); }
  }

  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!el) return;
    const v = el.dataset.v ?? '';
    switch (el.dataset.a) {
      case 'close': this.o.onClose(); return;
      case 'tab': this.tab = v as Tab; this.sel = (this.tab === 'laufend' ? this.o.progress.quests.map((p) => p.id) : this.o.progress.done)[0] ?? null; break;
      case 'sel': this.sel = v; break;
      case 'track': this.o.onTrack(v); break;
      default: return;
    }
    this.render();
  }

  private row(q: QuestDef, tracked: boolean) {
    const step = this.o.qs.step(q.id);
    const prog = this.o.progress.quests.find((p) => p.id === q.id);
    return `<button class="ql-row${this.sel === q.id ? ' sel' : ''}${q.main ? ' main' : ''}" data-a="sel" data-v="${q.id}">
      <b>${tracked ? '➤ ' : ''}${esc(q.title)}</b>
      <span>${step && prog ? esc(stepText(step, prog.count)) : 'Erledigt'}</span></button>`;
  }

  private detail(q: QuestDef | undefined, tracked: boolean) {
    if (!q) return '<p class="soft">Kein Auftrag ausgewählt. Sprich mit den Leuten in den Dörfern und Häfen (Taste E) – wer ein „!“ trägt, hat Arbeit für dich.</p>';
    const done = this.o.progress.done.includes(q.id);
    const prog = this.o.progress.quests.find((p) => p.id === q.id);
    const cur = prog?.step ?? q.steps.length;
    const rw = q.reward;
    const intro = this.o.qs.introOf(q);
    return `<div class="ql-head"><h3 class="fell">${esc(q.title)}</h3><span>${q.main ? 'Hauptgeschichte' : 'Nebenauftrag'} · ${esc(this.o.giverName(q.giver))}</span></div>
      <p class="ql-intro">„${esc(intro)}“</p>
      <ul class="ql-steps">${q.steps.map((s, i) => {
        const state = done || i < cur ? 'ok' : i === cur ? 'now' : 'todo';
        return `<li class="${state}"><i>${state === 'ok' ? '✓' : state === 'now' ? '➤' : '○'}</i>${esc(i === cur && prog ? stepText(s, prog.count) : s.text)}</li>`;
      }).join('')}</ul>
      <p class="ql-reward"><b>Belohnung:</b> ${rw.gold} Gold · ${rw.xp} EP${rw.fame ? ` · ${rw.fame} Ruhm` : ''}${rw.sp ? ` · ${rw.sp} Faji-Punkt${rw.sp > 1 ? 'e' : ''}` : ''}</p>
      ${!done && prog ? `<button class="mini ${tracked ? 'brass' : ''}" data-a="track" data-v="${q.id}">${tracked ? 'Wird verfolgt ✓' : 'Verfolgen'}</button>` : ''}`;
  }

  render() {
    const p = this.o.progress;
    const tr = this.tracked();
    const ids = this.tab === 'laufend' ? p.quests.map((x) => x.id) : p.done;
    const list = ids.map((id) => QUEST_BY_ID[id]).filter(Boolean) as QuestDef[];
    const main = list.filter((q) => q.main), side = list.filter((q) => !q.main);
    const group = (title: string, qs: QuestDef[]) => qs.length ? `<h4>${title}</h4>${qs.map((q) => this.row(q, q.id === tr)).join('')}` : '';
    const sel = this.sel ? QUEST_BY_ID[this.sel] : undefined;
    this.root.innerHTML = `<div class="ql-panel card">
      <div class="editor-head"><h2 class="fell">Auftragsbuch</h2><button class="icon-btn" data-a="close" aria-label="Schließen">✕</button></div>
      <div class="tabs"><button data-a="tab" data-v="laufend" aria-pressed="${this.tab === 'laufend'}">Laufend <small>${p.quests.length}</small></button>
        <button data-a="tab" data-v="erledigt" aria-pressed="${this.tab === 'erledigt'}">Erledigt <small>${p.done.length}</small></button></div>
      <div class="ql-body">
        <div class="ql-list">${list.length ? group('Hauptgeschichte', main) + group('Nebenaufträge', side) : `<p class="soft small">${this.tab === 'laufend' ? 'Gerade kein Auftrag. Sprich mit Leuten mit „!“.' : 'Noch nichts erledigt.'}</p>`}</div>
        <div class="ql-detail">${this.detail(sel, !!sel && sel.id === tr)}</div>
      </div>
      <p class="soft small">L oder Esc schließt das Auftragsbuch.</p></div>`;
  }

  dispose() {
    removeEventListener('keydown', this.keyFn, true);
    this.root.remove();
  }
}
