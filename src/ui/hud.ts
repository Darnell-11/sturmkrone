import { esc } from './dom';

export class Hud {
  readonly root: HTMLElement;
  private nameEl: HTMLElement;
  private subEl: HTMLElement;
  private fpsEl: HTMLElement;
  private envEl: HTMLElement;
  private hpEl: HTMLElement;
  private xpEl: HTMLElement;
  private hpBar: HTMLElement;
  private hpLag: HTMLElement;
  private stBar: HTMLElement;
  private stEl: HTMLElement;
  private stLag: HTMLElement;
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
  onMap: () => void = () => {};
  private mini: HTMLCanvasElement;
  private questEl: HTMLElement;
  private questKey = '';
  // Schiffsanzeige: Elemente einmal suchen statt in jedem Bild
  private seaEl!: HTMLElement;
  private shipEl!: HTMLElement;
  private windEl!: HTMLElement;
  private seaTxt!: HTMLElement;
  private reloadL!: HTMLElement;
  private reloadR!: HTMLElement;
  private arrowEl!: HTMLElement;
  private potionEl!: HTMLElement;
  /** zuletzt geschriebene Werte – nur bei Änderung ins DOM schreiben (kein Layout-Zittern, keine unnötige Arbeit) */
  private last = new Map<HTMLElement, string>();

  /** Balken über die Grafikkarte skalieren (transform) statt die Breite zu ändern (Layout bei jedem Bild) */
  private bar(el: HTMLElement, frac: number) {
    const v = `scaleX(${Math.max(0, Math.min(1, frac)).toFixed(3)})`;
    if (this.last.get(el) !== v) { this.last.set(el, v); el.style.transform = v; }
  }

  private put(el: HTMLElement, prop: string, v: string) {
    const k = this.last.get(el);
    if (k === prop + v) return;
    this.last.set(el, prop + v);
    el.style.setProperty(prop, v);
  }

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="hud-panel">
        <div class="hud-name"></div>
        <div class="hud-sub"></div>
        <div class="hud-bars"><div class="hud-bar hp" title="Leben"><i class="lag"></i><i class="fill"></i></div><div class="hud-bar st" title="Ausdauer" hidden><i class="lag"></i><i class="fill"></i></div><div class="hud-bar fj" title="Faji"><i></i></div><div class="hud-bar xp" title="Erfahrung"><i></i></div></div>
        <div class="hud-gold"></div>
        <div class="hud-weapons" title="Waffe wechseln: Q · Platz 1: Z · Platz 2: X"><span class="w0 on"></span><span class="w1"></span></div>
        <div class="hud-sea" hidden>
          <div class="hud-bar ship" title="Rumpf"><i></i></div>
          <div class="hud-seainfo"><span class="wind" title="Wind">➤</span><span class="seatxt"></span></div>
          <div class="hud-reload"><i class="l"></i><i class="r"></i></div>
        </div>
        <div class="hud-env"></div>
        <div class="hud-fps" hidden></div>
      </div>
      <div class="hud-right">
        <div class="hud-btns">
          <button class="icon-btn hud-faji" aria-label="Faji-Baum"><svg viewBox="0 0 24 24"><path d="M12 2l2.2 6.4L21 9l-5.2 4.3L17.6 20 12 16.3 6.4 20l1.8-6.7L3 9l6.8-.6z"/></svg><b class="badge" hidden>0</b></button>
          <button class="icon-btn hud-pause" aria-label="Pause"><svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg></button>
        </div>
        <button class="hud-mini" aria-label="Karte und Logbuch"><canvas></canvas><span class="hud-potions" title="Proviant"></span></button>
        <div class="hud-quest" hidden><div class="q-arrow">➤</div><div class="q-body"><b class="q-title"></b><span class="q-step"></span><i class="q-bar" hidden><s></s></i><em class="q-hint">L · Auftragsbuch</em></div></div>
      </div>`;
    parent.appendChild(this.root);
    this.nameEl = this.root.querySelector('.hud-name')!;
    this.subEl = this.root.querySelector('.hud-sub')!;
    this.fpsEl = this.root.querySelector('.hud-fps')!;
    this.envEl = this.root.querySelector('.hud-env')!;
    this.hpBar = this.root.querySelector('.hud-bar.hp')!;
    this.hpEl = this.hpBar.querySelector('.fill')!;
    this.hpLag = this.hpBar.querySelector('.lag')!;
    this.stBar = this.root.querySelector('.hud-bar.st')!;
    this.stEl = this.stBar.querySelector('.fill')!;
    this.stLag = this.stBar.querySelector('.lag')!;
    this.xpEl = this.root.querySelector('.hud-bar.xp i')!;
    this.goldEl = this.root.querySelector('.hud-gold')!;
    this.root.querySelector('.hud-pause')!.addEventListener('click', () => this.onPause());
    this.root.querySelector('.hud-faji')!.addEventListener('click', () => this.onFaji());
    this.fjEl = this.root.querySelector('.hud-bar.fj i')!;
    this.seaEl = this.root.querySelector('.hud-sea')!;
    this.shipEl = this.seaEl.querySelector('.ship i')!;
    this.windEl = this.seaEl.querySelector('.wind')!;
    this.seaTxt = this.seaEl.querySelector('.seatxt')!;
    this.reloadL = this.seaEl.querySelector('.l')!;
    this.reloadR = this.seaEl.querySelector('.r')!;
    this.arrowEl = this.root.querySelector('.q-arrow')!;
    this.potionEl = this.root.querySelector('.hud-potions')!;
    this.badge = this.root.querySelector('.badge')!;
    this.mini = this.root.querySelector('.hud-mini canvas')!;
    this.root.querySelector('.hud-mini')!.addEventListener('click', () => this.onMap());
    this.questEl = this.root.querySelector('.hud-quest')!;
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
    this.ctxEl.classList.toggle('low', label === 'An Deck gehen');
  }

  /** Schiffsanzeige; null blendet sie aus */
  setSea(info: { hull: number; sail: number; crew: number; level: string; ammo: string; reloadL: number; reloadR: number; windRel: number; fire: boolean } | null) {
    const el = this.seaEl;
    if (el.hidden !== !info) el.hidden = !info;
    if (!info) return;
    this.bar(this.shipEl, info.hull);
    this.put(this.windEl, 'transform', `rotate(${(-info.windRel - Math.PI / 2).toFixed(2)}rad)`);
    const t = `${info.level} · ${info.ammo}${info.fire ? ' · 🔥' : ''} · Segel ${Math.round(info.sail * 100)} % · Crew ${Math.round(info.crew * 100)} %`;
    if (this.seaTxt.textContent !== t) this.seaTxt.textContent = t;
    this.bar(this.reloadL, 1 - info.reloadL);
    this.bar(this.reloadR, 1 - info.reloadR);
  }

  /** Beide Waffenplätze mit Namen; aktiv hebt hervor */
  setWeapons(a: string, b: string, active: 0 | 1) {
    const el = this.root.querySelector('.hud-weapons');
    if (!el) return;
    const w0 = el.querySelector<HTMLElement>('.w0')!, w1 = el.querySelector<HTMLElement>('.w1')!;
    w0.textContent = `1 ${a}`; w1.textContent = `2 ${b}`;
    w0.classList.toggle('on', active === 0); w1.classList.toggle('on', active === 1);
  }

  setFaji(frac: number, sp: number) {
    this.bar(this.fjEl, frac);
    if (this.badge.hidden !== sp <= 0) this.badge.hidden = sp <= 0;
    if (sp > 0 && this.badge.textContent !== String(sp)) this.badge.textContent = String(sp);
  }

  private itemBar: HTMLElement | null = null;
  private itemKey = '';

  /** Schnellleiste für Güter (Tasten 1–4): Symbol, Menge, Abklingzeit als Kreisausschnitt, laufende Stärkung als Rand */
  setItemBar(show: boolean, views: { id: string | null; icon: string; name: string; color: string; count: number; cdFrac: number; ready: boolean; active: number }[], keys: string[]) {
    if (!this.itemBar) {
      this.itemBar = document.createElement('div');
      this.itemBar.className = 'itembar';
      this.root.appendChild(this.itemBar);
    }
    const bar = this.itemBar;
    bar.hidden = !show || this.root.hidden;
    if (bar.hidden) return;
    const key = views.map((v) => `${v.id}${v.count}`).join('|') + keys.join();
    if (key !== this.itemKey) {
      this.itemKey = key;
      bar.innerHTML = views.map((v, i) => `<div class="ib${v.id ? '' : ' empty'}" style="--c:${v.color}" title="${esc(v.name)}"><kbd>${esc(keys[i] ?? '')}</kbd><span class="ic">${v.icon}</span>${v.id ? `<b class="cnt">${v.count}</b>` : ''}</div>`).join('');
    }
    views.forEach((v, i) => {
      const el = bar.children[i] as HTMLElement | undefined;
      if (!el) return;
      this.put(el, '--p', v.cdFrac.toFixed(3));
      this.put(el, '--a', v.active.toFixed(3));
      el.classList.toggle('ready', v.ready);
      el.classList.toggle('none', !!v.id && v.count <= 0);
      el.classList.toggle('buff', v.active > 0);
    });
  }

  /** Fähigkeitsleiste unten (nur ohne Touch) */
  setSkillBar(show: boolean, views: { name: string; short: string; color: string; cdFrac: number; ready: boolean; id: string | null; sea: boolean }[], keys: string[], atSea = false) {
    this.skillbar.hidden = !show || this.root.hidden;
    if (this.skillbar.hidden) return;
    const key = views.map((v) => v.id + v.name).join('|') + keys.join();
    if (key !== this.skillKey) {
      this.skillKey = key;
      this.skillbar.innerHTML = views.map((v, i) => `<div class="sb${v.id ? '' : ' empty'}" style="--c:${v.color}" title="${esc(v.name)}"><kbd>${esc(keys[i] ?? '')}</kbd><span>${esc(v.short)}</span></div>`).join('');
    }
    views.forEach((v, i) => {
      const el = this.skillbar.children[i] as HTMLElement | undefined;
      if (!el) return;
      this.put(el, '--p', v.cdFrac.toFixed(3));
      el.classList.toggle('ready', v.ready && (!atSea || v.sea));
      el.classList.toggle('dim', atSea && !!v.id && !v.sea);
    });
  }

  /**
   * Ausdauerbalken (zu Fuß; null blendet ihn aus). Der helle Nachlauf folgt verzögert (CSS), bei zu wenig Ausdauer
   * blinkt der Balken rot.
   */
  setStamina(frac: number | null, flash = false) {
    const hide = frac === null;
    if (this.stBar.hidden !== hide) this.stBar.hidden = hide;
    if (hide) return;
    this.bar(this.stEl, frac);
    this.bar(this.stLag, frac);
    this.stBar.classList.toggle('flash', flash);
    this.stBar.classList.toggle('low', frac < 0.25);
  }

  setStats(hpFrac: number, xpFrac: number, gold: number) {
    this.bar(this.hpEl, hpFrac);
    this.bar(this.hpLag, hpFrac);
    this.hpBar.classList.toggle('low', hpFrac < 0.25 && hpFrac > 0);
    this.bar(this.xpEl, xpFrac);
    const g = `Gold ${Math.round(gold).toLocaleString('de-DE')}`;
    if (this.goldEl.textContent !== g) this.goldEl.textContent = g;
  }

  /** Zeichenfläche der Minikarte (in passender Pixeldichte); null, wenn ausgeblendet */
  miniCanvas(): { ctx: CanvasRenderingContext2D; size: number } | null {
    if (this.root.hidden) return null;
    const size = this.mini.clientWidth;
    if (!size) return null;
    const px = Math.round(size * Math.min(2, devicePixelRatio));
    if (this.mini.width !== px) { this.mini.width = px; this.mini.height = px; }
    const ctx = this.mini.getContext('2d');
    return ctx ? { ctx, size } : null;
  }

  setPotions(n: number) {
    const t = `🍖 ${n}`;
    if (this.potionEl.textContent !== t) this.potionEl.textContent = t;
  }

  /** Verfolgter Auftrag mit Richtungspfeil (Winkel relativ zur Kamera, null = keiner) */
  setQuest(q: { title: string; step: string; angle: number | null; dist: number | null; frac?: number | null; main?: boolean } | null) {
    this.questEl.hidden = !q;
    if (!q) { this.questKey = ''; return; }
    const step = q.dist !== null && q.dist > 25 ? `${q.step} · ${q.dist >= 1000 ? `${(q.dist / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(q.dist / 10) * 10} m`}` : q.step;
    const bar = this.questEl.querySelector<HTMLElement>('.q-bar')!;
    const frac = q.frac ?? null;
    if (bar.hidden !== (frac === null)) bar.hidden = frac === null;
    if (frac !== null) (bar.firstElementChild as HTMLElement).style.transform = `scaleX(${frac.toFixed(2)})`;
    this.questEl.classList.toggle('main', !!q.main);
    const key = q.title + step;
    if (key !== this.questKey) {
      this.questKey = key;
      this.questEl.querySelector('.q-title')!.textContent = q.title;
      this.questEl.querySelector('.q-step')!.textContent = step;
    }
    this.put(this.arrowEl, 'visibility', q.angle === null ? 'hidden' : 'visible');
    if (q.angle !== null) this.put(this.arrowEl, 'transform', `rotate(${(q.angle - Math.PI / 2).toFixed(2)}rad)`);
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
