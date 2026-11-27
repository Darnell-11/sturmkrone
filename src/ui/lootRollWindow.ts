// Phase 4.8B – Beutewürfel-Fenster („Bedarf / Gier / Passen“). Drei vorab angelegte Karten (`MMO.rollCards`), weitere warten in der
// Reihe („+2 weitere“). Jede Karte zeigt Zeichen, Seltenheits-Rahmen, Name, Platz, den Werte-Vergleich zum angelegten Stück und den
// 30-s-Balken; „Bedarf“ ist gesperrt, wenn das Stück nicht zur eigenen Klasse bzw. Schiffsstufe passt (Hinweis im Knopf und im Tooltip).
// Am Handy lässt sich das Fenster über den Kopf einklappen (dann bleibt eine Leiste mit Zahl und kürzester Frist).
// Platz: rechts unter Karte und Auftrags-Tracker (Zone `tr`); die Höhe endet immer über den Leisten am unteren Rand (`fit`, misst nur bei
// Änderungen und Größenwechsel), weitere Karten rollen in der Liste. Nur die vorderste Karte zeigt den Werte-Vergleich, die übrigen sind kompakt.
// Je Bild ändert sich nur der Balken (transform) und die Sekunden-Zahl, wenn sie springt; Texte aus dem Netz nur als `textContent`.
import { MMO, type LootItemNet, type RollChoice, type RollView } from '../net/mmoProtocol';
import { CHOICE_LABEL, GRADE_LABEL } from '../net/groupLoot';

/** Karte, wie der Client sie führt (Uhr des Clients) */
export type ClientRoll = RollView & { until: number; choice: RollChoice | '' };

/** Was das Spiel zu einem Stück sagt: Zeichen (SVG aus `itemArt`), Platz, Vergleich zum angelegten Stück */
export interface RollCardInfo {
  glyph: string;
  cat: string;
  /** Vergleichszeilen: Wert, jetzt, neu, besser (true) / schlechter (false) / gleich (null) */
  lines: { label: string; cur: string; next: string; better: boolean | null }[];
  /** schon im Besitz (es gäbe den Goldwert) */
  owned: boolean;
}

interface Card {
  el: HTMLElement;
  icon: HTMLElement;
  name: HTMLElement;
  meta: HTMLElement;
  cmp: HTMLElement;
  bar: HTMLElement;
  secs: HTMLElement;
  need: HTMLButtonElement;
  greed: HTMLButtonElement;
  pass: HTMLButtonElement;
  state: HTMLElement;
  id: string;
  shownSecs: number;
  choice: RollChoice | '';
}

export class LootRollWindow {
  readonly el: HTMLElement;
  private readonly head: HTMLButtonElement;
  private readonly countEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly more: HTMLElement;
  private readonly cards: Card[] = [];
  private list: readonly ClientRoll[] = [];
  private collapsed = false;
  private headSecs = -1;

  constructor(parent: HTMLElement, private readonly onChoose: (id: string, choice: RollChoice) => void, private readonly describe: (item: LootItemNet) => RollCardInfo, private readonly avoid: () => readonly HTMLElement[] = () => []) {
    const el = document.createElement('section');
    el.className = 'loot-rolls';
    el.hidden = true;
    el.setAttribute('aria-label', 'Beutewürfel');
    el.innerHTML = `<button class="lr-head" type="button" aria-expanded="true"><span class="lr-title">🎲 Beute würfeln</span><b class="lr-count">0</b><span class="lr-time"></span><span class="lr-fold" aria-hidden="true">▾</span></button>
      <div class="lr-list"></div><p class="lr-more" hidden></p>`;
    this.el = el;
    this.head = el.querySelector('.lr-head')!;
    this.countEl = el.querySelector('.lr-count')!;
    this.timeEl = el.querySelector('.lr-time')!;
    this.more = el.querySelector('.lr-more')!;
    const listEl = el.querySelector('.lr-list')!;
    for (let i = 0; i < MMO.rollCards; i++) {
      const c = document.createElement('article');
      c.className = 'lr-card panel';
      c.hidden = true;
      c.innerHTML = `<div class="lr-top"><span class="lr-icon" aria-hidden="true"></span><div class="lr-info"><b class="lr-name"></b><span class="lr-meta"></span></div><span class="lr-secs"></span></div>
        <ul class="lr-cmp"></ul>
        <div class="lr-timer"><i></i></div>
        <div class="lr-btns"><button type="button" class="lr-need" data-c="bedarf">Bedarf</button><button type="button" class="lr-greed" data-c="gier">Gier</button><button type="button" class="lr-pass" data-c="passen">Passen</button></div>
        <p class="lr-state" hidden></p>`;
      listEl.appendChild(c);
      const card: Card = {
        el: c, icon: c.querySelector('.lr-icon')!, name: c.querySelector('.lr-name')!, meta: c.querySelector('.lr-meta')!, cmp: c.querySelector('.lr-cmp')!,
        bar: c.querySelector('.lr-timer i')!, secs: c.querySelector('.lr-secs')!, need: c.querySelector('.lr-need')!, greed: c.querySelector('.lr-greed')!,
        pass: c.querySelector('.lr-pass')!, state: c.querySelector('.lr-state')!, id: '', shownSecs: -1, choice: '',
      };
      c.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-c]');
        if (!b || b.disabled || !card.id) return;
        e.stopPropagation();
        this.onChoose(card.id, b.dataset.c as RollChoice);
      });
      this.cards.push(card);
    }
    this.head.addEventListener('click', () => this.setCollapsed(!this.collapsed));
    addEventListener('resize', () => this.fit());
    // Klicks im Fenster sollen nicht als Angriff/Kamera in der Welt landen
    for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'contextmenu'] as const) el.addEventListener(ev, (e) => e.stopPropagation());
    parent.appendChild(el);
  }

  /** In eine HUD-Zone hängen (Desktop unten rechts, am Handy über den Touch-Knöpfen) */
  dock(parent: HTMLElement) { if (this.el.parentElement !== parent) parent.appendChild(this.el); }

  setCollapsed(on: boolean) {
    this.collapsed = on;
    this.el.classList.toggle('collapsed', on);
    this.head.setAttribute('aria-expanded', on ? 'false' : 'true');
    this.fit();
  }

  get open(): boolean { return !this.el.hidden; }

  /** Karten neu belegen (neue Sitzung, Ende, eigene Wahl) */
  sync(list: readonly ClientRoll[]) {
    this.list = list;
    this.el.hidden = list.length === 0;
    this.countEl.textContent = String(list.length);
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i], r = list[i];
      if (!r) { c.el.hidden = true; c.id = ''; continue; }
      c.el.hidden = false;
      if (c.id !== r.id) this.fill(c, r);
      if (c.choice !== r.choice) this.mark(c, r.choice);
    }
    const extra = list.length - this.cards.length;
    this.more.hidden = extra <= 0;
    if (extra > 0) this.more.textContent = `+${extra} weitere ${extra === 1 ? 'Würfel-Runde wartet' : 'Würfel-Runden warten'}`;
    this.headSecs = -1;
    this.fit();
  }

  /**
   * Höhe begrenzen: das Fenster endet über allem Sichtbaren, das in den unteren Zonen unter ihm liegt (Kampfleiste samt Beschriftung, Assists,
   * Schiffstafel, Touch-Knöpfe). Die vorderste Karte bleibt immer ganz sichtbar (Knöpfe erreichbar), die übrigen rollen. Messung nur bei
   * Änderungen, nie je Bild.
   */
  fit() {
    if (this.el.hidden) return;
    this.el.style.maxHeight = '';
    const me = this.el.getBoundingClientRect();
    let limit = innerHeight - 6;
    for (const zone of this.avoid()) {
      for (const k of Array.from(zone.querySelectorAll<HTMLElement>('*'))) {
        // nur Blätter und Bedienelemente: große, leere Hüllen der Leisten würden sonst alles sperren
        if (this.el.contains(k) || (k.childElementCount > 0 && !k.matches('button, canvas, .gauge'))) continue;
        const q = k.getBoundingClientRect();
        if (q.width <= 0 || q.height <= 0 || q.right <= me.left || q.left >= me.right || q.bottom <= me.top) continue;
        // unsichtbare Elemente (verborgen, Deckkraft 0) zählen nicht
        if (k.checkVisibility && !k.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        limit = Math.min(limit, q.top - 8);
      }
    }
    const first = this.cards.find((c) => !c.el.hidden);
    const need = this.head.offsetHeight + (first ? first.el.offsetHeight : 0) + 12;
    this.el.style.maxHeight = `${Math.max(need, Math.round(limit - me.top))}px`;
  }

  private fill(c: Card, r: ClientRoll) {
    c.id = r.id;
    c.shownSecs = -1;
    const it = r.item, info = this.describe(it);
    c.el.dataset.grade = it.grade;
    c.icon.innerHTML = info.glyph;
    c.name.textContent = `[${it.name}]`;
    c.meta.textContent = `${GRADE_LABEL[it.grade]} · ${info.cat || it.cat}${it.tier ? ` · Stufe ${it.tier}` : ''} · gefunden von ${r.from}`;
    c.cmp.textContent = '';
    for (const l of info.lines.slice(0, 4)) {
      const li = document.createElement('li');
      li.className = l.better === true ? 'up' : l.better === false ? 'down' : '';
      const a = document.createElement('span'); a.textContent = l.label;
      const b = document.createElement('span'); b.textContent = l.cur;
      const d = document.createElement('b'); d.textContent = l.next;
      li.append(a, b, d);
      c.cmp.appendChild(li);
    }
    if (info.owned) { const li = document.createElement('li'); li.className = 'owned'; li.textContent = `Schon im Besitz – Gewinn bringt ${it.value} Gold`; c.cmp.appendChild(li); }
    c.need.disabled = !r.needOk;
    c.need.title = r.needOk ? 'Bedarf gewinnt immer vor Gier' : r.needWhy;
    c.need.textContent = r.needOk ? 'Bedarf' : 'Bedarf ✕';
    c.need.setAttribute('aria-label', r.needOk ? 'Bedarf' : `Bedarf gesperrt: ${r.needWhy}`);
    c.greed.title = 'Gier: würfelt mit, wenn niemand Bedarf hat';
    c.pass.title = 'Passen: verzichtet sofort';
    c.el.querySelector('.lr-need-why')?.remove();
    if (!r.needOk) { const p = document.createElement('p'); p.className = 'lr-need-why'; p.textContent = r.needWhy; c.need.parentElement!.after(p); }
    c.choice = '';
    this.mark(c, r.choice);
  }

  private mark(c: Card, choice: RollChoice | '') {
    c.choice = choice;
    c.el.classList.toggle('chosen', !!choice);
    c.state.hidden = !choice;
    if (choice) c.state.textContent = choice === 'passen' ? 'Du passt – warte auf die anderen …' : `Du hast ${CHOICE_LABEL[choice]} gewählt – warte auf die anderen …`;
    const lock = !!choice;
    c.greed.disabled = lock;
    c.pass.disabled = lock;
    if (lock) c.need.disabled = true;
  }

  /** Je Bild: Balken und Sekunden (nur bei Sprung ins DOM) */
  tick(now: number) {
    if (this.el.hidden) return;
    let min = Infinity;
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i], r = this.list[i];
      if (!r || c.el.hidden) continue;
      const left = Math.max(0, r.until - now);
      min = Math.min(min, left);
      c.bar.style.transform = `scaleX(${(left / Math.max(1, r.total)).toFixed(3)})`;
      const s = Math.ceil(left);
      if (s !== c.shownSecs) { c.shownSecs = s; c.secs.textContent = `${s} s`; c.el.classList.toggle('urgent', s <= 5); }
    }
    const hs = Number.isFinite(min) ? Math.ceil(min) : 0;
    if (hs !== this.headSecs) { this.headSecs = hs; this.timeEl.textContent = `${hs} s`; }
  }
}
