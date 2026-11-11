import { audio } from '../audio/audio';
import type { DialogView } from '../story/dialog';
import { esc } from './dom';

/** Zeichen pro Sekunde des Schreibmaschinen-Effekts */
const CPS = 48;

const FACE_COLORS = ['#C2573A', '#3A8FA8', '#8A6AC0', '#5A9A5A', '#C79A3A', '#B05A7A'];
const faceColor = (name: string) => FACE_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % FACE_COLORS.length];

/**
 * Anime-Dialogfenster am unteren Bildrand: Namensschild, Porträt, Text mit Schreibmaschinen-Effekt und nummerierte Antworten.
 * Weiter mit Klick, Leertaste, Eingabe oder E (überspringt zuerst das Tippen); Antworten mit Klick oder Ziffern; Esc beendet.
 */
export class DialogOverlay {
  private root: HTMLElement;
  private view: DialogView | null = null;
  private line = 0;
  private shown = 0;
  private timer = 0;
  private onChoose: (id: string) => void = () => {};
  private onClose: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'dlgx';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="dlgx-shade"></div>
      <div class="dlgx-box" role="dialog" aria-live="polite">
        <div class="dlgx-face"></div>
        <div class="dlgx-main">
          <div class="dlgx-name"><b></b><span></span></div>
          <p class="dlgx-text"></p>
          <p class="dlgx-note" hidden></p>
          <div class="dlgx-choices"></div>
          <i class="dlgx-more">▼</i>
        </div>
      </div>`;
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (b) { this.pick(b.dataset.id!); return; }
      this.advance();
    });
    addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get isOpen() { return !this.root.hidden; }

  show(view: DialogView, onChoose: (id: string) => void, onClose: () => void) {
    this.onChoose = onChoose;
    this.onClose = onClose;
    this.set(view);
    this.root.hidden = false;
    this.root.classList.remove('in');
    void this.root.offsetWidth;
    this.root.classList.add('in');
  }

  /** Neue Ansicht im offenen Fenster (nach einer Antwort) */
  set(view: DialogView) {
    this.view = view;
    this.line = 0;
    const q = (s: string) => this.root.querySelector<HTMLElement>(s)!;
    q('.dlgx-name b').textContent = view.speaker;
    q('.dlgx-name span').textContent = view.title;
    const face = q('.dlgx-face');
    face.textContent = view.speaker.trim()[0] ?? '?';
    face.style.setProperty('--fc', faceColor(view.speaker));
    const note = q('.dlgx-note');
    note.hidden = !view.note;
    note.textContent = view.note ?? '';
    q('.dlgx-choices').innerHTML = '';
    this.startLine();
  }

  hide() {
    clearInterval(this.timer);
    this.root.hidden = true;
    this.view = null;
  }

  private text() { return this.view?.lines[this.line] ?? ''; }

  private startLine() {
    clearInterval(this.timer);
    this.shown = 0;
    const el = this.root.querySelector<HTMLElement>('.dlgx-text')!;
    el.textContent = '';
    this.root.classList.remove('done', 'last');
    this.root.querySelector('.dlgx-choices')!.innerHTML = '';
    this.timer = window.setInterval(() => this.tick(), 1000 / CPS);
  }

  private tick() {
    const t = this.text();
    this.shown = Math.min(t.length, this.shown + 1);
    this.root.querySelector('.dlgx-text')!.textContent = t.slice(0, this.shown);
    // leises Tippen bei jedem dritten Buchstaben (nicht bei Leerzeichen)
    if (this.shown % 3 === 0 && t[this.shown - 1] !== ' ') audio.play('ui', 0.25);
    if (this.shown >= t.length) this.lineDone();
  }

  private lineDone() {
    clearInterval(this.timer);
    this.root.classList.add('done');
    const v = this.view!;
    if (this.line < v.lines.length - 1) return;
    this.root.classList.add('last');
    this.root.querySelector('.dlgx-choices')!.innerHTML = v.choices
      .map((c, i) => `<button class="dlgx-c ${c.kind}" data-id="${esc(c.id)}"><kbd>${i + 1}</kbd><span>${esc(c.label)}</span></button>`).join('');
  }

  /** Klick oder Taste: zuerst Text sofort ganz zeigen, dann nächste Zeile */
  private advance() {
    const v = this.view;
    if (!v) return;
    if (this.shown < this.text().length) { this.shown = this.text().length; this.root.querySelector('.dlgx-text')!.textContent = this.text(); this.lineDone(); return; }
    if (this.line < v.lines.length - 1) { this.line++; this.startLine(); }
  }

  private pick(id: string) {
    if (!this.view) return;
    audio.play('ui');
    this.onChoose(id);
  }

  private onKey(e: KeyboardEvent) {
    if (!this.isOpen || !this.view) return;
    if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.onClose(); return; }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
      e.preventDefault(); e.stopPropagation();
      if (e.repeat) return;
      // Einzige Antwort: Enter/Leertaste wählt sie, sonst nur weiterblättern
      this.advance();
      return;
    }
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (m && this.root.classList.contains('last')) {
      const c = this.view.choices[+m[1] - 1];
      if (c) { e.preventDefault(); e.stopPropagation(); this.pick(c.id); }
    }
  }
}
