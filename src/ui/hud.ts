import { esc } from './dom';

export class Hud {
  readonly root: HTMLElement;
  private nameEl: HTMLElement;
  private subEl: HTMLElement;
  private fpsEl: HTMLElement;
  private envEl: HTMLElement;
  private ctxEl: HTMLButtonElement;
  private ctxText = '';
  onContext: (down: boolean) => void = () => {};
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
        <div class="hud-env"></div>
        <div class="hud-fps" hidden></div>
      </div>
      <button class="icon-btn" aria-label="Pause"><svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg></button>`;
    parent.appendChild(this.root);
    this.nameEl = this.root.querySelector('.hud-name')!;
    this.subEl = this.root.querySelector('.hud-sub')!;
    this.fpsEl = this.root.querySelector('.hud-fps')!;
    this.envEl = this.root.querySelector('.hud-env')!;
    this.root.querySelector('button')!.addEventListener('click', () => this.onPause());

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'hint';
    this.hintEl.hidden = true;
    parent.appendChild(this.hintEl);

    this.ctxEl = document.createElement('button');
    this.ctxEl.className = 'ctx';
    this.ctxEl.hidden = true;
    this.ctxEl.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onContext(true); });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) this.ctxEl.addEventListener(t, () => this.onContext(false));
    parent.appendChild(this.ctxEl);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.toastEl.setAttribute('role', 'status');
    this.toastEl.setAttribute('aria-live', 'polite');
    parent.appendChild(this.toastEl);
  }

  setVisible(v: boolean) {
    this.root.hidden = !v;
    if (!v) { this.hintEl.hidden = true; this.ctxEl.hidden = true; this.ctxText = ''; }
  }

  setPlayer(name: string, sub: string) {
    this.nameEl.innerHTML = esc(name);
    this.subEl.innerHTML = esc(sub);
  }

  /** Kontextknopf (z. B. „An Land gehen“). key = Tastenname für den Hinweis */
  setContext(label: string | null, key: string | null) {
    const text = label ? `${label}${key ? ` <kbd>${esc(key)}</kbd>` : ''}` : '';
    if (this.ctxText === text) return;
    this.ctxText = text;
    this.ctxEl.hidden = !label || this.root.hidden;
    this.ctxEl.innerHTML = text;
  }

  setEnv(text: string) {
    if (this.envEl.textContent !== text) this.envEl.textContent = text;
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
