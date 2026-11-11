import type { StatSheet } from '../core/inventory';
import { SLOT_LABEL, type SlotId } from '../data/items';
import { esc } from './dom';

/** Ein Gegenstand im Raster */
export interface InvItem {
  key: string;
  cat: SlotId | 'cons';
  name: string;
  icon: string;
  color: string;
  desc: string;
  /** Kurze Werte-Zeile (z. B. „+40 Leben“) */
  stat: string;
  equipped: boolean;
  count?: number;
  /** Verbrauchsgut: ID für Leiste und Benutzen */
  cid?: string;
}

export interface InvSlotView { name: string; icon: string; color: string }

/** Was das Inventar vom Spiel braucht */
export interface InventoryHost {
  items(): InvItem[];
  equipped(): Record<SlotId, InvSlotView | null>;
  /** Werte jetzt und – bei gewähltem Ausrüstungsstück – wie sie danach wären */
  stats(previewKey: string | null): { cur: StatSheet; next: StatSheet | null };
  bar(): ({ name: string; icon: string; color: string; count: number } | null)[];
  gold(): number;
  equip(key: string): void;
  unequip(slot: SlotId): void;
  use(cid: string): void;
  setBar(slot: number, cid: string | null): void;
  close(): void;
}

type Filter = 'all' | SlotId | 'cons';
const FILTERS: [Filter, string][] = [['all', 'Alles'], ['head', 'Kopf'], ['armor', 'Rüstung'], ['weapon', 'Waffe'], ['trinket', 'Zubehör'], ['cons', 'Verbrauch']];

const STAT_ROWS: { k: keyof StatSheet; n: string; fmt: (v: number) => string }[] = [
  { k: 'hp', n: 'Leben', fmt: (v) => String(Math.round(v)) },
  { k: 'atk', n: 'Angriff', fmt: (v) => v.toFixed(1).replace('.', ',') },
  { k: 'crit', n: 'Volltreffer', fmt: (v) => `${Math.round(v * 100)} %` },
  { k: 'reduce', n: 'Schadensminderung', fmt: (v) => `${Math.round(v * 100)} %` },
  { k: 'fajiRegen', n: 'Faji-Erholung', fmt: (v) => `+${Math.round(v * 100)} %` },
  { k: 'gold', n: 'Goldbonus', fmt: (v) => `+${Math.round(v * 100)} %` },
];

/**
 * Inventar (Taste I): links die Figur (3D, aktualisiert sich beim Ausrüsten), rechts Ausrüstungsplätze, Werte,
 * Raster mit allen Gegenständen, Schnellleiste. Rein darstellend – alle Änderungen laufen über den InventoryHost.
 */
export class InventoryScreen {
  private root: HTMLElement;
  private filter: Filter = 'all';
  private sel: string | null = null;
  private keyFn = (e: KeyboardEvent) => this.onKey(e);

  constructor(parent: HTMLElement, private h: InventoryHost) {
    this.root = document.createElement('div');
    this.root.className = 'editor inv';
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => this.onClick(e));
    addEventListener('keydown', this.keyFn, true);
    this.render();
  }

  private onKey(e: KeyboardEvent) {
    if (e.code === 'Escape' || e.code === 'KeyI') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) this.h.close(); }
  }

  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!el) return;
    const v = el.dataset.v ?? '';
    switch (el.dataset.a) {
      case 'close': this.h.close(); return;
      case 'filter': this.filter = v as Filter; break;
      case 'sel': this.sel = this.sel === v ? null : v; break;
      case 'slot': { const f = v as SlotId; this.filter = f; this.sel = null; break; }
      case 'equip': this.h.equip(v); break;
      case 'unequip': this.h.unequip(v as SlotId); break;
      case 'use': this.h.use(v); break;
      case 'bar': { const [i, id] = v.split('|'); this.h.setBar(+i, id === '-' ? null : id); break; }
      default: return;
    }
    this.render();
  }

  refresh() { this.render(); }

  private cell(it: InvItem) {
    return `<button class="inv-cell${this.sel === it.key ? ' sel' : ''}${it.equipped ? ' eq' : ''}" style="--c:${it.color}" data-a="sel" data-v="${esc(it.key)}" title="${esc(it.name)}" aria-label="${esc(it.name)}">
      <span class="ic">${it.icon}</span>${it.count !== undefined ? `<b class="cnt">${it.count}</b>` : ''}${it.equipped ? '<i class="ok">✓</i>' : ''}</button>`;
  }

  private detail(it: InvItem | undefined) {
    if (!it) return '<p class="soft small">Wähle einen Gegenstand, um ihn auszurüsten oder zu benutzen. Ausrüstung ändert deine Werte sofort.</p>';
    const bar = this.h.bar();
    let actions = '';
    if (it.cat === 'cons' && it.cid) {
      actions = `<button class="mini brass" data-a="use" data-v="${it.cid}">Benutzen</button>
        <span class="small soft">In die Leiste:</span>${[0, 1, 2, 3].map((i) => `<button class="mini" data-a="bar" data-v="${i}|${it.cid}" aria-label="Platz ${i + 1}">${i + 1}</button>`).join('')}`;
    } else if (it.equipped) {
      actions = it.cat === 'head' || it.cat === 'trinket' ? `<button class="mini" data-a="unequip" data-v="${it.cat}">Ablegen</button>` : '<span class="small soft">Angelegt ✓</span>';
    } else {
      actions = `<button class="mini brass" data-a="equip" data-v="${esc(it.key)}">Ausrüsten</button>`;
    }
    return `<div class="inv-detail" style="--c:${it.color}"><div class="inv-dhead"><span class="ic">${it.icon}</span><div><b>${esc(it.name)}</b><span class="small soft">${it.cat === 'cons' ? 'Verbrauchsgut' : SLOT_LABEL[it.cat]}${it.count !== undefined ? ` · ${it.count} Stück` : ''}</span></div></div>
      <p class="small">${esc(it.desc)}</p>${it.stat ? `<p class="small inv-stat">${esc(it.stat)}</p>` : ''}
      <div class="row inv-actions">${actions}</div>${it.cat === 'cons' && bar.some(Boolean) ? '' : ''}</div>`;
  }

  render() {
    const all = this.h.items();
    const items = all.filter((i) => this.filter === 'all' || i.cat === this.filter);
    const sel = this.sel ? all.find((i) => i.key === this.sel) : undefined;
    const eq = this.h.equipped();
    const { cur, next } = this.h.stats(sel && !sel.equipped && sel.cat !== 'cons' ? sel.key : null);
    const bar = this.h.bar();
    const slot = (s: SlotId) => {
      const v = eq[s];
      return `<button class="inv-slot${this.filter === s ? ' on' : ''}" data-a="slot" data-v="${s}" style="--c:${v?.color ?? '#6a6458'}">
        <span class="ic">${v?.icon ?? '＋'}</span><small>${SLOT_LABEL[s]}</small><em>${esc(v?.name ?? 'leer')}</em></button>`;
    };
    const statRow = (r: (typeof STAT_ROWS)[number]) => {
      const a = cur[r.k], b = next ? next[r.k] : a;
      if (r.k === 'gold' && a === 0 && b === 0) return '';
      const d = b - a;
      const delta = next && Math.abs(d) > 1e-6 ? `<i class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${r.fmt(Math.abs(d)).replace('+', '')}</i>` : '';
      return `<li><span>${r.n}</span><b>${r.fmt(next ? b : a)}</b>${delta}</li>`;
    };
    this.root.innerHTML = `
      <div class="editor-stage"><div class="sk-hint soft small">Deine Figur</div></div>
      <div class="editor-panel card inv-panel">
        <div class="editor-head"><h2 class="fell">Inventar</h2><div class="sk-sp">Gold <b>${this.h.gold().toLocaleString('de-DE')}</b></div><button class="icon-btn" data-a="close" aria-label="Schließen">✕</button></div>
        <div class="editor-body">
          <div class="inv-equip">${(['head', 'armor', 'weapon', 'trinket'] as SlotId[]).map(slot).join('')}</div>
          <ul class="inv-stats">${STAT_ROWS.map(statRow).join('')}</ul>
          <div class="tabs inv-tabs">${FILTERS.map(([f, n]) => `<button data-a="filter" data-v="${f}" aria-pressed="${this.filter === f}">${n}</button>`).join('')}</div>
          <div class="inv-grid">${items.map((i) => this.cell(i)).join('') || '<p class="soft small">Hier liegt noch nichts. Kaufe beim Händler oder besiege Gegner.</p>'}</div>
          ${this.detail(sel)}
          <h3>Schnellleiste <small class="soft">(Tasten 1–4)</small></h3>
          <div class="inv-bar">${bar.map((b, i) => `<div class="inv-bslot" style="--c:${b?.color ?? '#6a6458'}"><kbd>${i + 1}</kbd><span class="ic">${b?.icon ?? ''}</span>${b ? `<b class="cnt">${b.count}</b><button class="x" data-a="bar" data-v="${i}|-" aria-label="Leeren">✕</button>` : ''}</div>`).join('')}</div>
          <p class="soft small">I oder Esc schließt das Inventar.</p>
        </div>
      </div>`;
  }

  dispose() {
    removeEventListener('keydown', this.keyFn, true);
    this.root.remove();
  }
}
