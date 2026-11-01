import { esc } from './dom';

export class Hud {
  readonly root: HTMLElement;
  private nameEl: HTMLElement;
  private subEl: HTMLElement;
  private fpsEl: HTMLElement;
  private envEl: HTMLElement;
  private hpEl: HTMLElement;
  private xpEl: HTMLElement;
  private goldEl: HTMLElement;
  private ctxEl: HTMLButtonElement;
  private fjEl: HTMLElement;
  private badge: HTMLElement;
  private skillbar: HTMLElement;
  private skillKey = '';
  onFaji: () => void = () => {};
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
        <div class="hud-bars"><div class="hud-bar hp" title="Leben"><i></i></div><div class="hud-bar fj" title="Faji"><i></i></div><div class="hud-bar xp" title="Erfahrung"><i></i></div></div>
        <div class="hud-gold"></div>
        <div class="hud-env"></div>
        <div class="hud-fps" hidden></div>
      </div>
      <div class="hud-btns">
        <button class="icon-btn hud-faji" aria-label="Faji-Baum"><svg viewBox="0 0 24 24"><path d="M12 2l2.2 6.4L21 9l-5.2 4.3L17.6 20 12 16.3 6.4 20l1.8-6.7L3 9l6.8-.6z"/></svg><b class="badge" hidden>0</b></button>
        <button class="icon-btn hud-pause" aria-label="Pause"><svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg></button>
      </div>`;
    parent.appendChild(this.root);
    this.nameEl = this.root.querySelector('.hud-name')!;
    this.subEl = this.root.querySelector('.hud-sub')!;
    this.fpsEl = this.root.querySelector('.hud-fps')!;
    this.envEl = this.root.querySelector('.hud-env')!;
    this.hpEl = this.root.querySelector('.hud-bar.hp i')!;
    this.xpEl = this.root.querySelector('.hud-bar.xp i')!;
    this.goldEl = this.root.querySelector('.hud-gold')!;
    this.root.querySelector('.hud-pause')!.addEventListener('click', () => this.onPause());
    this.root.querySelector('.hud-faji')!.addEventListener('click', () => this.onFaji());
    this.fjEl = this.root.querySelector('.hud-bar.fj i')!;
    this.badge = this.root.querySelector('.badge')!;
    this.skillbar = document.createElement('div');
    this.skillbar.className = 'skillbar';
    this.skillbar.hidden = true;
    parent.appendChild(this.skillbar);

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
    if (!v) { this.hintEl.hidden = true; this.ctxEl.hidden = true; this.ctxText = ''; this.skillbar.hidden = true; }
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

  setFaji(frac: number, sp: number) {
    const w = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    if (this.fjEl.style.width !== w) this.fjEl.style.width = w;
    this.badge.hidden = sp <= 0;
    if (sp > 0) this.badge.textContent = String(sp);
  }

  /** Fähigkeitsleiste unten (nur ohne Touch) */
  setSkillBar(show: boolean, views: { name: string; color: string; cdFrac: number; ready: boolean; id: string | null }[], keys: string[]) {
    this.skillbar.hidden = !show || this.root.hidden;
    if (this.skillbar.hidden) return;
    const key = views.map((v) => v.id + v.name).join('|') + keys.join();
    if (key !== this.skillKey) {
      this.skillKey = key;
      this.skillbar.innerHTML = views.map((v, i) => `<div class="sb${v.id ? '' : ' empty'}" style="--c:${v.color}"><kbd>${esc(keys[i] ?? '')}</kbd><span>${esc(v.name)}</span></div>`).join('');
    }
    views.forEach((v, i) => {
      const el = this.skillbar.children[i] as HTMLElement | undefined;
      if (!el) return;
      el.style.setProperty('--p', v.cdFrac.toFixed(3));
      el.classList.toggle('ready', v.ready);
    });
  }

  setStats(hpFrac: number, xpFrac: number, gold: number) {
    const hp = `${Math.max(0, Math.min(1, hpFrac)) * 100}%`;
    const xp = `${Math.max(0, Math.min(1, xpFrac)) * 100}%`;
    if (this.hpEl.style.width !== hp) this.hpEl.style.width = hp;
    if (this.xpEl.style.width !== xp) this.xpEl.style.width = xp;
    const g = `Gold ${Math.round(gold).toLocaleString('de-DE')}`;
    if (this.goldEl.textContent !== g) this.goldEl.textContent = g;
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
