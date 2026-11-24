import { esc } from './dom';

/**
 * Nautische Warnung am Weltrand (Phase 4.3A): erscheint oben in der Mitte, sobald das Schiff in die Sturm-Zone fährt
 * („Unerforschte Sturmsee – Rückkehr empfohlen“), und wird dringlicher (rot, pulsierend), wenn die Gegenströmung stark wird.
 * Reine Anzeige: Stufe und Text liefert `SeaWorld.edgeWarning`.
 */
export class EdgeWarning {
  readonly el: HTMLElement;
  private level = 0;
  private text = '';
  private hideTimer = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud-edge';
    this.el.setAttribute('role', 'alert');
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  /** Jedes Bild: Stufe 0 keine Warnung, 1 Hinweis, 2 Gefahr (`null`: zu Fuß, im Menü oder in einer Belagerung) */
  update(w: { level: 0 | 1 | 2; text: string } | null): void {
    const level = w ? w.level : 0;
    if (level === this.level && (!w || w.text === this.text)) return;
    this.level = level;
    if (level === 0) {
      this.el.classList.remove('on', 'danger');
      window.clearTimeout(this.hideTimer);
      this.hideTimer = window.setTimeout(() => { if (this.level === 0) this.el.hidden = true; }, 600);
      return;
    }
    window.clearTimeout(this.hideTimer);
    if (w!.text !== this.text) { this.text = w!.text; this.el.innerHTML = `<span class="ico" aria-hidden="true">⚓</span><b>${esc(w!.text)}</b>`; }
    this.el.hidden = false;
    this.el.classList.toggle('danger', level === 2);
    // Layout erzwingen, damit die Überblendung vom unsichtbaren Zustand aus läuft (ohne auf ein Bild zu warten)
    void this.el.offsetWidth;
    this.el.classList.add('on');
  }
}
