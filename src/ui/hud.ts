import { esc } from './dom';

export class Hud {
  readonly root: HTMLElement;
  private nameEl: HTMLElement;
  private subEl: HTMLElement;
  private fpsEl: HTMLElement;
  private hintEl: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private hintTimer = 0;
  onPause: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="hud-panel">
        <div class="hud-name"></div>
        <div class="hud-sub"></div>
        <div class="hud-fps" hidden></div>
      </div>
      <button class="icon-btn" aria-label="Pause"><svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg></button>`;
    parent.appendChild(this.root);
    this.nameEl = this.root.querySelector('.hud-name')!;
    this.subEl = this.root.querySelector('.hud-sub')!;
    this.fpsEl = this.root.querySelector('.hud-fps')!;
    this.root.querySelector('button')!.addEventListener('click', () => this.onPause());

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'hint';
    this.hintEl.hidden = true;
    parent.appendChild(this.hintEl);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.toastEl.setAttribute('role', 'status');
    this.toastEl.setAttribute('aria-live', 'polite');
    parent.appendChild(this.toastEl);
  }

  setVisible(v: boolean) {
    this.root.hidden = !v;
    if (!v) this.hintEl.hidden = true;
  }

  setPlayer(name: string, sub: string) {
    this.nameEl.innerHTML = esc(name);
    this.subEl.innerHTML = esc(sub);
  }

  setFps(show: boolean, text: string) {
    this.fpsEl.hidden = !show;
    if (show) this.fpsEl.textContent = text;
  }

  hint(text: string, seconds = 10) {
    this.hintEl.textContent = text;
    this.hintEl.hidden = false;
    this.hintEl.style.opacity = '1';
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => {
      this.hintEl.style.opacity = '0';
      this.hintTimer = window.setTimeout(() => { this.hintEl.hidden = true; }, 700);
    }, seconds * 1000);
  }

  toast(text: string, seconds = 2.4) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), seconds * 1000);
  }
}
