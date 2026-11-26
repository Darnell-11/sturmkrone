import type { ProgressState } from '../core/save/types';
import { QUEST_BY_ID, type QuestDef } from '../data/quests';
import { stepText, type QuestSystem } from '../story/questSystem';
import { esc } from './dom';

/** 4.7E: ein Live-Kriegs-Einsatz im Auftragsbuch (Worte und Zahlen baut das Spiel aus dem Auftrag) */
export interface WarQuestLogEntry {
  id: string;
  title: string;
  /** Art in Worten („Insel-Verteidigung“) */
  kind: string;
  text: string;
  /** Ziel bzw. Ausgang in Worten */
  line: string;
  /** Richtung und Entfernung (nur laufende) */
  where: string;
  status: 'aktiv' | 'erfolg' | 'gescheitert';
  tracked: boolean;
  color: string;
  /** eigener Beitrag und nötiger Beitrag für den Lohn, Zahl der Teilnehmer */
  contrib: number;
  need: number;
  members: number;
  reward: string;
}

/** 4.7E: Kopf der Hauptkampagne (Team, Titel, Bilanz, offener Horizont) */
export interface CampaignLogView {
  team: string;
  color: string;
  title: string;
  stats: string;
  horizon: boolean;
  horizonTitle: string;
  horizonText: string;
}

export interface QuestLogOptions {
  qs: QuestSystem;
  progress: ProgressState;
  /** Name der Person, die einen Auftrag vergibt */
  giverName: (id: string) => string;
  /** Auftrag verfolgen (Anzeige am Bildschirmrand und Pfeil) */
  onTrack: (id: string) => void;
  onClose: () => void;
  /** 4.7E: Reiter beim Öffnen */
  tab?: Tab;
  /** 4.7E: Live-Kriegs-Einsätze des Teams (laufende und gerade beendete) */
  war?: () => WarQuestLogEntry[];
  /** 4.7E: einen Live-Einsatz verfolgen (Kompass, Funkspruch-Zeile) */
  onTrackWar?: (id: string) => void;
  /** 4.7E: Hauptkampagne des Teams (null: noch kein Team gewählt) */
  campaign?: CampaignLogView | null;
}

type Tab = 'laufend' | 'erledigt' | 'krieg';

/** Auftragsbuch (Taste L): Hauptkampagne, Legende der Sturmkrone, Nebenaufträge und (4.7E) Live-Kriegs-Einsätze; Schritte mit Haken, Lohn, Verfolgen. */
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
    this.tab = o.tab ?? 'laufend';
    this.sel = this.tab === 'krieg' ? this.firstWar() : this.tracked() ?? this.o.progress.quests[0]?.id ?? null;
    this.render();
  }

  private tracked(): string | null {
    const t = this.o.qs.tracked();
    return t?.q.id ?? null;
  }

  private wars(): WarQuestLogEntry[] { return this.o.war?.() ?? []; }
  private firstWar(): string | null {
    const w = this.wars();
    return (w.find((x) => x.tracked) ?? w.find((x) => x.status === 'aktiv') ?? w[0])?.id ?? null;
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
      case 'tab':
        this.tab = v as Tab;
        this.sel = this.tab === 'krieg' ? this.firstWar() : (this.tab === 'laufend' ? this.o.progress.quests.map((p) => p.id) : this.o.progress.done)[0] ?? null;
        break;
      case 'sel': this.sel = v; break;
      case 'track': this.o.onTrack(v); break;
      case 'trackwar': this.o.onTrackWar?.(v); break;
      default: return;
    }
    this.render();
  }

  private row(q: QuestDef, tracked: boolean) {
    const step = this.o.qs.step(q.id);
    const prog = this.o.progress.quests.find((p) => p.id === q.id);
    return `<button class="ql-row${this.sel === q.id ? ' sel' : ''}${q.main ? ' main' : ''}${q.campaign ? ' campaign' : ''}" data-a="sel" data-v="${q.id}">
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
    const kind = q.campaign ? `Hauptkampagne · Kapitel ${q.campaign} von 7` : q.main ? 'Hauptgeschichte' : 'Nebenauftrag';
    return `<div class="ql-head"><h3 class="fell">${esc(q.title)}</h3><span>${kind} · ${esc(this.o.giverName(q.giver))}</span></div>
      <p class="ql-intro">„${esc(intro)}“</p>
      <ul class="ql-steps">${q.steps.map((s, i) => {
        const state = done || i < cur ? 'ok' : i === cur ? 'now' : 'todo';
        return `<li class="${state}"><i>${state === 'ok' ? '✓' : state === 'now' ? '➤' : '○'}</i>${esc(i === cur && prog ? stepText(s, prog.count) : s.text)}</li>`;
      }).join('')}</ul>
      <p class="ql-reward"><b>Belohnung:</b> ${rw.gold} Gold · ${rw.xp} EP${rw.fame ? ` · ${rw.fame} Ruhm` : ''}${rw.sp ? ` · ${rw.sp} Talentpunkt${rw.sp > 1 ? 'e' : ''}` : ''}</p>
      ${!done && prog ? `<button class="mini ${tracked ? 'brass' : ''}" data-a="track" data-v="${q.id}">${tracked ? 'Wird verfolgt ✓' : 'Verfolgen'}</button>` : ''}`;
  }

  /** Kopf der Hauptkampagne (Team und Bilanz) bzw. Hinweis auf den Rat der Gesandten */
  private campaignHead(): string {
    const c = this.o.campaign;
    if (!c) return '';
    return `<div class="ql-campaign" style="--c:${esc(c.color)}"><b>Team ${esc(c.team)}</b><span>Hauptkampagne „${esc(c.title)}“</span><small>${esc(c.stats)}</small></div>`;
  }

  /** Offener Horizont: nach Kapitel VII ein bleibender Eintrag (kein Ende – Fortsetzung folgt) */
  private horizonRow(): string {
    const c = this.o.campaign;
    if (!c?.horizon) return '';
    return `<div class="ql-horizon"><b>${esc(c.horizonTitle)}</b><span>${esc(c.horizonText)}</span></div>`;
  }

  private warRow(w: WarQuestLogEntry) {
    return `<button class="ql-row war ${w.status}${this.sel === w.id ? ' sel' : ''}" data-a="sel" data-v="${esc(w.id)}" style="--c:${esc(w.color)}">
      <b>${w.tracked ? '➤ ' : ''}${esc(w.title)}</b><span>${esc(w.status === 'aktiv' ? `${w.line} · ${w.where}` : `${w.status === 'erfolg' ? 'Erfolg' : 'Gescheitert'}: ${w.line}`)}</span></button>`;
  }

  private warDetail(w: WarQuestLogEntry | undefined) {
    if (!w) {
      return this.o.campaign
        ? '<p class="soft">Gerade kein Live-Einsatz. Sobald dein Team angegriffen wird, eine Invasion startet, ein großer Konvoi ausläuft oder ein Hafen blockiert wird, kommt ein Funkspruch – und der Einsatz erscheint hier.</p>'
        : '<p class="soft">Live-Kriegs-Einsätze gibt es, sobald du vor dem Rat der Gesandten in Ankerglück einem Team die Treue geschworen hast.</p>';
    }
    const st = w.status === 'aktiv' ? 'Läuft' : w.status === 'erfolg' ? 'Erfolgreich' : 'Gescheitert';
    return `<div class="ql-head"><h3 class="fell">${esc(w.title)}</h3><span>Live-Kriegs-Einsatz · ${esc(w.kind)} · ${st}</span></div>
      <p class="ql-intro">${esc(w.text)}</p>
      <ul class="ql-steps"><li class="${w.status === 'aktiv' ? 'now' : w.status === 'erfolg' ? 'ok' : 'todo'}"><i>${w.status === 'aktiv' ? '➤' : w.status === 'erfolg' ? '✓' : '✕'}</i>${esc(w.line)}${w.where ? ` · ${esc(w.where)}` : ''}</li>
        <li class="${w.contrib >= w.need ? 'ok' : 'now'}"><i>${w.contrib >= w.need ? '✓' : '○'}</i>Dein Beitrag: ${w.contrib} (Lohn ab ${w.need}) · ${w.members} ${w.members === 1 ? 'Kapitän' : 'Kapitäne'} im Einsatz</li></ul>
      <p class="ql-reward"><b>Belohnung:</b> ${esc(w.reward)}</p>
      ${w.status === 'aktiv' ? `<button class="mini ${w.tracked ? 'brass' : ''}" data-a="trackwar" data-v="${esc(w.id)}">${w.tracked ? 'Wird verfolgt ✓' : 'Verfolgen'}</button>` : ''}`;
  }

  render() {
    const p = this.o.progress;
    const tr = this.tracked();
    const wars = this.wars();
    const activeWars = wars.filter((w) => w.status === 'aktiv').length;
    let list = '', detail = '';
    if (this.tab === 'krieg') {
      list = wars.length ? `<h4>Live-Kriegs-Einsätze</h4>${wars.map((w) => this.warRow(w)).join('')}` : `<p class="soft small">${this.o.campaign ? 'Gerade kein Einsatz – die Welt rechnet weiter.' : 'Noch kein Team gewählt.'}</p>`;
      detail = this.warDetail(wars.find((w) => w.id === this.sel));
    } else {
      const ids = this.tab === 'laufend' ? p.quests.map((x) => x.id) : p.done;
      const qs = ids.map((id) => QUEST_BY_ID[id]).filter(Boolean) as QuestDef[];
      const campaign = qs.filter((q) => q.campaign || q.id === 'rat'), legend = qs.filter((q) => q.main && !q.campaign && q.id !== 'rat'), side = qs.filter((q) => !q.main);
      const group = (title: string, g: QuestDef[]) => g.length ? `<h4>${title}</h4>${g.map((q) => this.row(q, q.id === tr)).join('')}` : '';
      list = qs.length || this.o.campaign?.horizon
        ? this.horizonRow() + group('Hauptkampagne', campaign) + group('Legende der Sturmkrone', legend) + group('Nebenaufträge', side)
        : `<p class="soft small">${this.tab === 'laufend' ? 'Gerade kein Auftrag. Sprich mit Leuten mit „!“.' : 'Noch nichts erledigt.'}</p>`;
      const sel = this.sel ? QUEST_BY_ID[this.sel] : undefined;
      detail = this.detail(sel, !!sel && sel.id === tr);
    }
    this.root.innerHTML = `<div class="ql-panel card">
      <div class="editor-head"><h2 class="fell">Auftragsbuch</h2><button class="icon-btn" data-a="close" aria-label="Schließen">✕</button></div>
      ${this.campaignHead()}
      <div class="tabs"><button data-a="tab" data-v="laufend" aria-pressed="${this.tab === 'laufend'}">Laufend <small>${p.quests.length}</small></button>
        <button data-a="tab" data-v="krieg" aria-pressed="${this.tab === 'krieg'}">Krieg <small>${activeWars}</small></button>
        <button data-a="tab" data-v="erledigt" aria-pressed="${this.tab === 'erledigt'}">Erledigt <small>${p.done.length}</small></button></div>
      <div class="ql-body">
        <div class="ql-list">${list}</div>
        <div class="ql-detail">${detail}</div>
      </div>
      <p class="soft small">L oder Esc schließt das Auftragsbuch.</p></div>`;
  }

  dispose() {
    removeEventListener('keydown', this.keyFn, true);
    this.root.remove();
  }
}
