import { esc } from './dom';

/** Inhalt des Funkspruch-Banners (4.7E): Absender, Überschrift, Zeile mit Ziel und Richtung, Farbe des Teams */
export interface RadioView {
  kicker: string;
  title: string;
  line: string;
  color: string;
  /** Art des Einsatzes (Kennzeichnung: `data-kind`) */
  kind?: string;
}

/** Funkwellen-Zeichen (kein Emoji: gleiche Form auf jedem Gerät) */
const WAVES = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="17" r="2.2"/><path d="M7.6 12.6a6.2 6.2 0 0 1 8.8 0M4.6 9.6a10.4 10.4 0 0 1 14.8 0M1.8 6.7a14.4 14.4 0 0 1 20.4 0" fill="none" stroke-width="2.2" stroke-linecap="round"/></svg>';

/**
 * Funkspruch-Banner oben in der Mitte (Zone `tc`, 4.7E): meldet neue Live-Kriegs-Quests und ihren Umschlag („Gegenangriff“) für einige Sekunden und
 * zeigt danach den verfolgten Einsatz als ruhige Zeile (Ziel, Fortschritt, Richtung). Neu gezeichnet wird nur, wenn sich der Text ändert.
 */
export class RadioBanner {
  readonly el: HTMLElement;
  private last = '';
  private flashT = 0;
  private flashView: RadioView | null = null;
  private trackView: RadioView | null = null;
  /** Klick auf das Banner (Auftragsbuch öffnen; setzt das Spiel) */
  onOpen: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.el = document.createElement('aside');
    this.el.className = 'hud-radio panel';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => { e.stopPropagation(); this.onOpen(); });
  }

  /** Funkspruch für `seconds` Sekunden (danach wieder die Verfolgungs-Zeile) */
  flash(v: RadioView, seconds = 9) {
    this.flashView = v;
    this.flashT = seconds;
    this.render();
  }

  /** Verfolgter Einsatz (null: nichts zeigen, solange kein Funkspruch läuft) */
  track(v: RadioView | null) {
    this.trackView = v;
    if (this.flashT <= 0) this.render();
  }

  /** Zeit vergeht (Funkspruch ausblenden) */
  update(dt: number) {
    if (this.flashT <= 0) return;
    this.flashT -= dt;
    if (this.flashT <= 0) { this.flashView = null; this.render(); }
  }

  get flashing(): boolean { return this.flashT > 0; }

  private render() {
    const live = this.flashT > 0 && this.flashView;
    const v = live ? this.flashView : this.trackView;
    if (!v) { if (!this.el.hidden) { this.el.hidden = true; this.last = ''; } return; }
    const html = `<div class="rb-head" style="--c:${esc(v.color)}"><i class="rb-waves">${WAVES}</i><span class="rb-kicker">${esc(v.kicker)}</span></div>
      <b class="rb-title">${esc(v.title)}</b><span class="rb-line">${esc(v.line)}</span>`;
    const key = `${live ? 1 : 0}|${html}`;
    if (key === this.last) return;
    this.last = key;
    this.el.innerHTML = html;
    this.el.classList.toggle('flash', !!live);
    if (v.kind) this.el.dataset.kind = v.kind; else delete this.el.dataset.kind;
    this.el.hidden = false;
  }
}
