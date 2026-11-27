// Phase 4.8A – Mehrkanal-Chat unten links (am Fuß der linken Mittelzone, über Steuerkompass und Kampfleiste): kompakt und halbtransparent, Farbe je Kanal (Sagen weiß, Gruppe hellblau, Flüstern magenta, Welt
// gold), klickbare Namen (Linksklick: Flüstern, Rechtsklick oder langer Druck: Spielermenü). Eingabe öffnet sich mit Eingabe-Taste (wenn
// keine Handlung ansteht), „/“ (mit Befehl) oder Taste R (Antwort auf ein frisches Flüstern); Esc schließt. Am Handy eingeklappt als kleiner
// Knopf mit Zähler für ungelesene Zeilen – ausgeklappt liegt das Fenster über dem Steuerkompass, nie über den Touch-Knöpfen.
// Texte der Mitspieler landen nur als `textContent` im DOM (kein HTML aus dem Netz).
import { CHAT_DEF, linePrefix, type ChatLine } from '../social/chat';

export interface ChatWindowOpts {
  onSubmit(line: string): void;
  /** Name angeklickt: `menu` = Rechtsklick/langer Druck (Spielermenü), sonst Flüstern */
  onName(id: string, name: string, x: number, y: number, menu: boolean): void;
  /** darf die Tastatur den Chat jetzt öffnen? (Spiel läuft, kein Menü offen) */
  canOpen(): boolean;
  /** steht eine Handlung an (Kontextplakette)? Dann gehört die Eingabe-Taste der Handlung */
  busyKey(): boolean;
  /** Taste R: Name des frischen Flüsterers oder '' */
  quickReply(): string;
  /** Kanal vor der Eingabe („Sagen:“, „An Ragna Sturmhut:“) */
  channel(): { text: string; color: string };
  onOpenChange?(open: boolean): void;
}

/** so viele Zeilen bleiben im DOM */
const MAX_LINES = 80;
/** langer Druck (ms) öffnet am Handy das Spielermenü */
const LONG_PRESS = 450;

export class ChatWindow {
  readonly el: HTMLElement;
  private readonly box: HTMLElement;
  private readonly log: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly chan: HTMLElement;
  private readonly pill: HTMLButtonElement;
  private readonly unreadEl: HTMLElement;
  private opened = false;
  private expanded = false;
  private unread = 0;
  private pressT = 0;
  private pressHit: HTMLElement | null = null;
  private readonly onKey = (e: KeyboardEvent) => this.key(e);

  constructor(parent: HTMLElement, private readonly opts: ChatWindowOpts) {
    const el = document.createElement('section');
    el.className = 'hud-chat';
    el.setAttribute('aria-label', 'Chat');
    el.innerHTML = '<button class="chat-pill" type="button" aria-label="Chat öffnen"><span class="chat-ico" aria-hidden="true">✉</span><b>Chat</b><span class="chat-unread" hidden></span></button>'
      + '<div class="chat-box"><div class="chat-head"><span>Chat</span><button class="chat-close" type="button" aria-label="Chat einklappen">▾</button></div>'
      + '<div class="chat-log" role="log" aria-live="polite"></div>'
      + '<form class="chat-form" autocomplete="off"><span class="chat-chan"></span><input class="chat-in" type="text" maxlength="200" enterkeyhint="send" spellcheck="false" aria-label="Chat-Nachricht" placeholder="Nachricht … (/hilfe)"><button class="chat-send" type="submit" aria-label="Senden">➤</button></form></div>';
    parent.appendChild(el);
    this.el = el;
    const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
    this.box = q('.chat-box'); this.log = q('.chat-log'); this.form = q<HTMLFormElement>('.chat-form'); this.input = q<HTMLInputElement>('.chat-in');
    this.chan = q('.chat-chan'); this.pill = q<HTMLButtonElement>('.chat-pill'); this.unreadEl = q('.chat-unread');
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = this.input.value;
      this.input.value = '';
      if (v.trim()) this.opts.onSubmit(v);
      this.refreshChannel();
      // am Handy bleibt die Eingabe offen (Tastatur nicht ständig neu), am PC schließt sie wie in klassischen MMOs
      if (!document.documentElement.classList.contains('touch')) this.close();
    });
    this.input.addEventListener('input', () => this.refreshChannel());
    this.input.addEventListener('blur', () => { if (this.opened && !document.documentElement.classList.contains('touch')) this.close(); });
    this.pill.addEventListener('click', () => this.setExpanded(true));
    q('.chat-close').addEventListener('click', () => { this.close(); this.setExpanded(false); });
    // Namen: Linksklick = Flüstern, Rechtsklick = Menü, langer Druck = Menü (Handy)
    this.log.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('.cn');
      if (!a || !a.dataset.id) return;
      if (Date.now() - this.pressT < 30) return;
      this.opts.onName(a.dataset.id, a.dataset.name ?? '', e.clientX, e.clientY, false);
    });
    this.log.addEventListener('contextmenu', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('.cn');
      if (!a || !a.dataset.id) return;
      e.preventDefault();
      this.opts.onName(a.dataset.id, a.dataset.name ?? '', e.clientX, e.clientY, true);
    });
    this.log.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      const a = (e.target as HTMLElement).closest<HTMLElement>('.cn');
      if (!a) return;
      this.pressHit = a;
      const x = e.clientX, y = e.clientY;
      window.setTimeout(() => {
        if (this.pressHit !== a || !a.dataset.id) return;
        this.pressHit = null;
        this.pressT = Date.now() + 500;
        this.opts.onName(a.dataset.id, a.dataset.name ?? '', x, y, true);
      }, LONG_PRESS);
    });
    const cancel = () => { this.pressHit = null; };
    this.log.addEventListener('pointerup', cancel);
    this.log.addEventListener('pointercancel', cancel);
    this.log.addEventListener('pointermove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) cancel(); });
    addEventListener('keydown', this.onKey, true);
    addEventListener('resize', this.onResize);
    this.refreshChannel();
  }

  private readonly onResize = () => { if (this.expanded) this.fitAboveTouch(); };

  get isOpen(): boolean { return this.opened; }
  get isExpanded(): boolean { return this.expanded; }

  /** Neue Zeile anhängen */
  add(l: ChatLine) {
    const p = document.createElement('p');
    p.className = `cl ch-${l.ch}${l.mine ? ' mine' : ''}`;
    p.style.setProperty('--c', CHAT_DEF[l.ch].color);
    if (l.ch === 'system') p.textContent = l.text;
    else {
      const pre = linePrefix(l);
      // Name im Präfix klickbar machen (bei eigenem Flüstern der Empfänger)
      const nameId = l.ch === 'fluestern' && l.mine ? l.to : l.from;
      const name = l.ch === 'fluestern' && l.mine ? l.toName : l.name;
      const at = name ? pre.indexOf(name) : -1;
      if (at >= 0 && nameId) {
        p.append(pre.slice(0, at));
        const a = document.createElement('a');
        a.className = 'cn';
        a.dataset.id = nameId;
        a.dataset.name = name;
        a.textContent = name;
        p.append(a, pre.slice(at + name.length));
      } else p.append(pre);
      p.append(l.text);
    }
    const stick = this.log.scrollTop + this.log.clientHeight >= this.log.scrollHeight - 8;
    this.log.appendChild(p);
    while (this.log.childElementCount > MAX_LINES) this.log.firstElementChild?.remove();
    if (stick) this.log.scrollTop = this.log.scrollHeight;
    this.el.classList.add('fresh');
    window.clearTimeout(this.freshT);
    this.freshT = window.setTimeout(() => this.el.classList.remove('fresh'), 30000);
    if (!this.expanded && document.documentElement.classList.contains('touch') && l.ch !== 'system') { this.unread = Math.min(99, this.unread + 1); this.unreadEl.hidden = false; this.unreadEl.textContent = String(this.unread); }
  }
  private freshT = 0;

  /** Eingabe öffnen (optional mit Vorgabe, z. B. „/w Name “) */
  open(prefill = '') {
    this.setExpanded(true);
    this.opened = true;
    this.el.dataset.open = '1';
    if (prefill) this.input.value = prefill;
    this.refreshChannel();
    this.opts.onOpenChange?.(true);
    // erst nach dem Tastendruck fokussieren (sonst landet „/“ oder „R“ doppelt im Feld)
    requestAnimationFrame(() => { this.input.focus(); const n = this.input.value.length; this.input.setSelectionRange(n, n); });
  }

  close() {
    if (!this.opened) return;
    this.opened = false;
    this.el.dataset.open = '0';
    if (document.activeElement === this.input) this.input.blur();
    this.opts.onOpenChange?.(false);
  }

  /** Handy: ausgeklappt (Fenster) oder eingeklappt (Knopf) */
  setExpanded(on: boolean) {
    this.expanded = on;
    this.el.dataset.expanded = on ? '1' : '0';
    if (on) { this.unread = 0; this.unreadEl.hidden = true; this.fitAboveTouch(); this.log.scrollTop = this.log.scrollHeight; }
    else { this.box.style.bottom = ''; this.log.style.maxHeight = ''; }
  }

  /**
   * Handy: das ausgeklappte Fenster endet über dem höchsten Touch-Knopf, der unter ihm liegt (die Fuß-Belegung reicht bis zur Bildmitte), und
   * bleibt unter dem oberen Rand – der Verlauf wird dafür kürzer. Am PC ohne Wirkung.
   */
  refit() { if (this.expanded) this.fitAboveTouch(); }

  private fitAboveTouch() {
    const box = this.box, log = this.log;
    box.style.bottom = ''; log.style.maxHeight = '';
    if (!document.documentElement.classList.contains('touch')) return;
    const host = this.el.getBoundingClientRect();
    const r0 = box.getBoundingClientRect();
    let top = innerHeight;
    for (const b of document.querySelectorAll<HTMLElement>('.touch-btn')) {
      if (!b.offsetParent) continue;
      const r = b.getBoundingClientRect();
      if (r.right <= r0.left || r.left >= r0.right || r.bottom <= 0) continue;
      top = Math.min(top, r.top);
    }
    const lift = Math.max(0, host.bottom - (top - 8));
    if (lift > 0) box.style.bottom = `${Math.round(lift)}px`;
    // oben mindestens 8 px Rand: der Verlauf schrumpft (der Kopf und die Eingabe bleiben)
    const chrome = r0.height - log.getBoundingClientRect().height;
    const avail = (host.bottom - lift) - 8 - chrome;
    log.style.maxHeight = `${Math.max(48, Math.min(avail, innerHeight * 0.3))}px`;
  }

  setVisible(on: boolean) { this.el.hidden = !on; if (!on) this.close(); }

  /** In eine andere HUD-Zone umhängen (zu Fuß: Fuß der linken Mitte; auf See neben dem Steuerkompass) */
  dock(zone: HTMLElement) {
    if (this.el.parentElement === zone) return;
    this.el.parentElement?.classList.remove('with-chat');
    zone.appendChild(this.el);
    zone.classList.add('with-chat');
    // das Umhängen setzt die Rollposition zurück: wieder ans Ende (neueste Zeilen)
    this.log.scrollTop = this.log.scrollHeight;
  }

  /** Kanal-Hinweis vor der Eingabe (bei Slash-Befehlen in der Eingabe: deren Kanal) */
  refreshChannel() {
    const v = this.input.value.trimStart();
    let text: string, color: string;
    const m = /^\/(\S+)\s?/.exec(v);
    const cmd = m?.[1]?.toLocaleLowerCase('de-DE') ?? '';
    if (cmd === 's' || cmd === 'sagen') { text = 'Sagen:'; color = CHAT_DEF.sagen.color; }
    else if (cmd === 'p' || cmd === 'gruppe') { text = 'Gruppe:'; color = CHAT_DEF.gruppe.color; }
    else if (cmd === '1' || cmd === 'welt') { text = 'Welt:'; color = CHAT_DEF.welt.color; }
    else if (cmd === 'w' || cmd === 'flüstern' || cmd === 'r') { text = 'Flüstern:'; color = CHAT_DEF.fluestern.color; }
    else if (cmd) { text = 'Befehl:'; color = CHAT_DEF.system.color; }
    else ({ text, color } = this.opts.channel());
    this.chan.textContent = text;
    this.chan.style.color = color;
  }

  private key(e: KeyboardEvent) {
    if (this.el.hidden) return;
    if (document.activeElement === this.input) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.input.value = ''; this.close(); }
      return;
    }
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || !this.opts.canOpen()) return;
    if (e.key === 'Enter' && !this.opts.busyKey()) { e.preventDefault(); e.stopImmediatePropagation(); this.open(''); return; }
    if (e.key === '/') { e.preventDefault(); e.stopImmediatePropagation(); this.open('/'); return; }
    if (e.code === 'KeyR' && !e.shiftKey && !this.opts.busyKey()) {
      const name = this.opts.quickReply();
      if (!name) return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.open(`/w ${name} `);
    }
  }

  dispose() { removeEventListener('keydown', this.onKey, true); removeEventListener('resize', this.onResize); this.el.remove(); }
}
