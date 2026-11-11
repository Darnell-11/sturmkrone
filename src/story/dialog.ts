import { TALKS } from '../data/dialogs';
import type { QuestDef, ShopKind, TownNpcDef } from '../data/quests';

/** Was das Gespräch vom Spiel braucht (und worüber es zurückmeldet) */
export interface DialogCtx {
  npc: TownNpcDef;
  /** Aufträge, die die Person gerade anbietet */
  offers(): QuestDef[];
  /** Laufende Aufträge dieser Person mit dem aktuellen Schritt */
  running(): { q: QuestDef; step: string }[];
  introOf(q: QuestDef): string;
  rewardText(q: QuestDef): string;
  accept(id: string): void;
  /** Soeben abgeschlossene Aufträge (Abgabe beim Ansprechen) */
  done: QuestDef[];
}

export type ChoiceKind = 'quest' | 'accept' | 'shop' | 'bye' | 'normal';

/** Was der Bildschirm zeigt: Sprecher, Zeilen (nacheinander) und die Antworten danach */
export interface DialogView {
  speaker: string;
  title: string;
  lines: string[];
  choices: { id: string; label: string; kind: ChoiceKind }[];
  /** Hinweis in der Zeile unter dem Text (Belohnung, Auftrag angenommen) */
  note?: string;
}

export type DialogStep = { view: DialogView } | { end: true } | { shop: true };

const SHOP_LABEL: Record<ShopKind, string> = {
  smith: 'Waffen & Rüstung ansehen', market: 'Proviant kaufen', shrine: 'Zum Faji-Schrein', shipyard: 'Zur Werft',
  tavern: 'Zur Theke (Rasten, Crew, Würfeln)', harbor: 'Seekarte & Logbuch',
};

/**
 * Verzweigtes Gespräch. Ablauf: Hauptauswahl → Auftrag (Angebot → annehmen), Thema (Knoten mit Antworten), Laden, Abschied.
 * Rein logisch (ohne Darstellung), damit es sich testen lässt.
 */
export class DialogSession {
  private first = true;

  constructor(private ctx: DialogCtx) {}

  private view(lines: string[], choices: DialogView['choices'], note?: string): DialogView {
    return { speaker: this.ctx.npc.name, title: this.ctx.npc.title, lines, choices, note };
  }

  /** Hauptauswahl: Begrüßung (oder Dank für erledigte Aufträge) und alles, was man tun kann */
  menu(note?: string): DialogView {
    const c = this.ctx;
    const t = TALKS[c.npc.id];
    let lines: string[];
    if (this.first && c.done.length) {
      lines = c.done.map((q) => q.outro);
      note = c.done.map((q) => `Auftrag erfüllt: ${q.title} – ${c.rewardText(q)}`).join(' · ');
    } else if (this.first) {
      lines = [c.npc.greet[Math.floor(Math.random() * c.npc.greet.length)]];
    } else {
      lines = ['Sonst noch etwas?'];
    }
    this.first = false;
    const choices: DialogView['choices'] = [];
    for (const q of c.offers()) choices.push({ id: `q:${q.id}`, label: `${q.main ? 'Hauptauftrag' : 'Auftrag'}: ${q.title}`, kind: 'quest' });
    for (const r of c.running()) choices.push({ id: `r:${r.q.id}`, label: `Wie läuft es mit „${r.q.title}“?`, kind: 'normal' });
    for (const topic of t?.topics ?? []) choices.push({ id: `t:${topic.to}`, label: topic.t, kind: 'normal' });
    if (c.npc.shop) choices.push({ id: 'shop', label: SHOP_LABEL[c.npc.shop], kind: 'shop' });
    choices.push({ id: 'bye', label: 'Auf Wiedersehen.', kind: 'bye' });
    return this.view(lines, choices, note);
  }

  start(): DialogView { return this.menu(); }

  choose(id: string): DialogStep {
    const c = this.ctx;
    if (id === 'bye') return { end: true };
    if (id === 'shop') return { shop: true };
    if (id === 'menu') return { view: this.menu() };
    const [kind, arg] = [id.slice(0, 1), id.slice(2)];
    if (kind === 'q') {
      const q = c.offers().find((x) => x.id === arg);
      if (!q) return { view: this.menu() };
      return { view: this.view([c.introOf(q)], [
        { id: `a:${q.id}`, label: 'Ich übernehme das.', kind: 'accept' },
        { id: 'menu', label: 'Vielleicht später.', kind: 'normal' },
      ], `Belohnung: ${c.rewardText(q)}`) };
    }
    if (kind === 'a') {
      const q = c.offers().find((x) => x.id === arg);
      if (q) c.accept(q.id);
      return { view: this.menu(q ? 'Auftrag angenommen – das Ziel siehst du rechts am Bildschirmrand (L: Auftragsbuch).' : undefined) };
    }
    if (kind === 'r') {
      const r = c.running().find((x) => x.q.id === arg);
      return { view: this.view([r ? `Noch nicht fertig? Denk dran: ${r.step}.` : 'Gut gemacht bisher.'], [{ id: 'menu', label: 'Ich bleibe dran.', kind: 'normal' }]) };
    }
    if (kind === 't') {
      const node = TALKS[c.npc.id]?.nodes[arg];
      if (!node) return { view: this.menu() };
      const next = (node.choices ?? []).map((ch) => ({ id: ch.to === 'menu' || ch.to === 'bye' ? ch.to : `t:${ch.to}`, label: ch.t, kind: ch.to === 'bye' ? 'bye' as const : 'normal' as const }));
      if (!next.length) next.push({ id: 'menu', label: 'Weiter.', kind: 'normal' });
      return { view: this.view(node.text, next) };
    }
    return { view: this.menu() };
  }
}
