// Phase 4.8A – Rechtsklick-Spielermenü (Kontextmenü am Zeiger) und das Betrachten-Fenster. Die Einträge kommen fertig aus
// `social/playerMenu.ts`; hier wird nur gezeichnet, an den Bildrand geschoben und geschlossen (Klick daneben, Esc, Auswahl).
import type { InspectView, PlayerMenuAction, PlayerMenuItem } from '../social/playerMenu';

export class PlayerMenuUi {
  private readonly el: HTMLElement;
  private onPick: ((id: PlayerMenuAction) => void) | null = null;
  private readonly outside = (e: PointerEvent) => { if (!this.el.hidden && !this.el.contains(e.target as Node)) this.close(); };
  private readonly esc = (e: KeyboardEvent) => { if (!this.el.hidden && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); } };

  constructor(root: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'pmenu';
    el.hidden = true;
    el.setAttribute('role', 'menu');
    root.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
      if (!b || b.disabled) return;
      const cb = this.onPick;
      this.close();
      cb?.(b.dataset.id as PlayerMenuAction);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('pointerdown', this.outside, true);
    addEventListener('keydown', this.esc, true);
  }

  get isOpen(): boolean { return !this.el.hidden; }

  /** Menü bei Bildschirm-Pixel (x, y) öffnen */
  open(title: string, sub: string, items: readonly PlayerMenuItem[], x: number, y: number, onPick: (id: PlayerMenuAction) => void) {
    this.onPick = onPick;
    const el = this.el;
    el.replaceChildren();
    const head = document.createElement('header');
    const b = document.createElement('b');
    b.textContent = title;
    head.appendChild(b);
    if (sub) { const s = document.createElement('small'); s.textContent = sub; head.appendChild(s); }
    el.appendChild(head);
    for (const it of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.id = it.id;
      btn.setAttribute('role', 'menuitem');
      btn.disabled = !it.enabled;
      if (it.danger) btn.classList.add('pm-danger');
      const l = document.createElement('span');
      l.textContent = it.label;
      btn.appendChild(l);
      if (it.hint) { const h = document.createElement('small'); h.textContent = it.hint; btn.appendChild(h); }
      el.appendChild(btn);
    }
    el.hidden = false;
    // an den Bildrand schieben
    const r = el.getBoundingClientRect();
    const px = Math.max(6, Math.min(innerWidth - r.width - 6, x));
    const py = Math.max(6, Math.min(innerHeight - r.height - 6, y));
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    (el.querySelector('button:not([disabled])') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  close() { this.el.hidden = true; this.onPick = null; }

  dispose() { removeEventListener('pointerdown', this.outside, true); removeEventListener('keydown', this.esc, true); this.el.remove(); }
}

/** Betrachten: kleines Fenster mitten im Bild (das Spiel läuft weiter) */
export class InspectPanel {
  private readonly el: HTMLElement;
  private onWhisper: (() => void) | null = null;
  private onInvite: (() => void) | null = null;

  constructor(root: HTMLElement) {
    const el = document.createElement('section');
    el.className = 'inspect panel';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Kapitän betrachten');
    root.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!b || (b as HTMLButtonElement).disabled) return;
      if (b.dataset.a === 'close') this.hide();
      else if (b.dataset.a === 'whisper') { const f = this.onWhisper; this.hide(); f?.(); }
      else if (b.dataset.a === 'invite') { const f = this.onInvite; this.hide(); f?.(); }
    });
    addEventListener('keydown', (e) => { if (!el.hidden && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.hide(); } }, true);
  }

  get isOpen(): boolean { return !this.el.hidden; }

  show(v: InspectView, invite: { enabled: boolean; label: string } | null, onWhisper: () => void, onInvite: () => void) {
    this.onWhisper = onWhisper;
    this.onInvite = onInvite;
    const el = this.el;
    el.replaceChildren();
    el.style.setProperty('--crest', v.teamColor);
    el.dataset.tone = v.stanceTone;
    const add = (tag: string, cls: string, text: string, parent: HTMLElement = el) => { const n = document.createElement(tag); n.className = cls; n.textContent = text; parent.appendChild(n); return n; };
    const head = add('header', 'ins-head', '');
    add('i', 'ins-crest', '', head);
    const t = add('div', 'ins-title', '', head);
    add('b', 'ins-name', v.name, t);
    add('span', 'ins-lvl', v.levelText, t);
    add('div', 'ins-team', v.teamName);
    const grid = add('dl', 'ins-grid', '');
    const row = (k: string, val: string, cls = '') => { add('dt', '', k, grid); add('dd', cls, val, grid); };
    row('Klasse', v.classText);
    row('Rolle', v.roleTag, 'ins-role');
    row('Diplomatie', v.stanceText.replace(/^Diplomatie: /, ''), `ins-stance ${v.stanceTone}`);
    row('Ausrüstung', v.gearText.replace(/^Ausrüstung: /, ''));
    row('Schiff', v.shipText.replace(/^Schiff: /, ''));
    row('Ort', v.whereText);
    const btns = add('div', 'ins-btns', '');
    const mk = (a: string, label: string, enabled = true) => { const b = document.createElement('button'); b.type = 'button'; b.className = a === 'close' ? 'secondary' : 'secondary ins-act'; b.dataset.a = a; b.textContent = label; b.disabled = !enabled; btns.appendChild(b); };
    mk('whisper', 'Flüstern');
    if (invite) mk('invite', invite.label, invite.enabled);
    mk('close', 'Schließen');
    el.hidden = false;
  }

  hide() { this.el.hidden = true; }
}
