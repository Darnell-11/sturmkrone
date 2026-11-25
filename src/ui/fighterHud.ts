// Kompaktes 3.0-Fighter-HUD (Phase 4.6A): unten in der Mitte der Kombo-Zähler („HIT!“) mit dem Namen des letzten Angriffs und die vier
// Kampfkünste des Stils mit Taste, Symbol und Abklingzeit. Nicht einengend: kein Rahmen über dem Bild, blendet sich ohne Kampf zurück.
// Am Handy liegen die vier Kampfkünste als Knöpfe in der Touch-Gruppe (data/touchLayout.ts); das HUD zeigt dort nur Zähler und Stil.
import { esc } from './dom';
import { ACTION_STYLES, type ActionStyleId } from '../data/actionStyles';

/** Was das HUD je Bild bekommt (SeaWorld.fighterView) */
export interface FighterView {
  style: ActionStyleId;
  /** Abklingzeit der vier Kampfkünste: 0 = bereit … 1 = gerade benutzt */
  cd: readonly number[];
  hits: number;
  label: string;
  air: boolean;
  finisher: boolean;
  perfect: boolean;
  counter: boolean;
}

/** Rang des Zählers (Farbe, Größe): ab 10, 25, 50 Treffern */
const RANKS: readonly [number, string][] = [[50, 'Legendär!'], [25, 'Brutal!'], [10, 'Stark!'], [0, 'HIT!']];

export class FighterHud {
  readonly root: HTMLElement;
  private combo: HTMLElement;
  private num: HTMLElement;
  private word: HTMLElement;
  private moveEl: HTMLElement;
  private bar: HTMLElement;
  private styleEl: HTMLElement;
  private slots: HTMLElement[] = [];
  private keyStr = '';
  private styleKey = '';
  private lastHits = 0;
  private comboT = 0;
  private shownLabel = '';
  private lastFrac = new Array<string>(4).fill('');
  private barK = -1;
  /** Kampfkunst angetippt (Touch-Modus über die Leiste, falls die Touch-Knöpfe fehlen) */
  onArt: (slot: number) => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'fhud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="fh-combo" hidden><span class="fh-move"></span><div class="fh-count"><b>0</b><em>HIT!</em></div><u><i></i></u></div>
      <div class="fh-strip">
        <div class="fh-style"><b></b><small></small></div>
        <div class="fh-arts" role="group" aria-label="Kampfkünste"></div>
      </div>`;
    parent.prepend(this.root);
    this.combo = this.root.querySelector('.fh-combo')!;
    this.num = this.combo.querySelector('b')!;
    this.word = this.combo.querySelector('em')!;
    this.moveEl = this.combo.querySelector('.fh-move')!;
    this.bar = this.combo.querySelector('u i')!;
    this.styleEl = this.root.querySelector('.fh-style')!;
    const arts = this.root.querySelector<HTMLElement>('.fh-arts')!;
    for (let i = 0; i < 4; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fh-art';
      b.innerHTML = '<kbd></kbd><i class="ic"></i><span class="nm"></span><s class="cd"></s>';
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onArt(i + 1); });
      arts.appendChild(b);
      this.slots.push(b);
    }
  }

  /**
   * Je Bild. `v` = null blendet das HUD aus (an Bord, Menü). `keys` = Tastenkappen der Kampfkünste, `touch` = Handy-Modus (nur Zähler und Stil),
   * `comboHits`/`comboFrac` = Trefferzähler und Restzeit aus dem Kampf-Overlay (zählt auch Faji-Treffer).
   */
  update(v: FighterView | null, keys: readonly string[], touch: boolean, comboHits: number, comboFrac: number, dt: number) {
    const hide = !v;
    if (this.root.hidden !== hide) this.root.hidden = hide;
    if (!v) return;
    this.root.classList.toggle('touchmode', touch);
    this.root.classList.toggle('air', v.air);
    this.root.classList.toggle('counter', v.perfect || v.counter);
    const st = ACTION_STYLES[v.style];
    if (this.styleKey !== v.style) {
      this.styleKey = v.style;
      this.root.style.setProperty('--fc', st.color);
      this.root.style.setProperty('--fa', st.accent);
      this.styleEl.querySelector('b')!.textContent = st.label;
      this.styleEl.querySelector('small')!.textContent = st.title;
      st.skills.forEach((k, i) => {
        const el = this.slots[i];
        el.title = `${k.label} – ${k.desc} (Abklingzeit ${k.cd} s)`;
        el.querySelector('.ic')!.textContent = k.icon;
        el.querySelector('.nm')!.textContent = k.short;
      });
      this.lastFrac.fill('');
    }
    const ks = keys.join('|');
    if (ks !== this.keyStr) { this.keyStr = ks; this.slots.forEach((el, i) => { el.querySelector('kbd')!.textContent = keys[i] ?? ''; }); }
    for (let i = 0; i < 4; i++) {
      const f = Math.max(0, Math.min(1, v.cd[i] ?? 0));
      const k = f <= 0 ? 'r' : f.toFixed(2);
      if (k === this.lastFrac[i]) continue;
      const wasCd = this.lastFrac[i] !== 'r' && this.lastFrac[i] !== '';
      this.lastFrac[i] = k;
      const el = this.slots[i];
      el.style.setProperty('--cd', f.toFixed(3));
      el.classList.toggle('cool', f > 0);
      // eben wieder bereit: kurzes Aufleuchten
      if (f <= 0 && wasCd) { el.classList.remove('ready'); void el.offsetWidth; el.classList.add('ready'); }
    }
    // Kombo-Zähler: Treffer aus dem Overlay (alle Quellen), Name des letzten Angriffs aus der Engine
    const hits = Math.max(comboHits, v.hits);
    if (hits >= 2) {
      if (this.combo.hidden) this.combo.hidden = false;
      if (hits !== this.lastHits) {
        this.lastHits = hits;
        this.num.textContent = String(hits);
        const rank = RANKS.findIndex(([n]) => hits >= n);
        const word = RANKS[rank][1];
        if (this.word.textContent !== word) this.word.textContent = word;
        this.combo.dataset.rank = String(3 - rank);
        this.combo.classList.remove('pop');
        void this.combo.offsetWidth;
        this.combo.classList.add('pop');
      }
      this.comboT = 0.6;
    } else if (!this.combo.hidden) {
      this.comboT -= dt;
      if (this.comboT <= 0) { this.combo.hidden = true; this.lastHits = 0; }
    }
    const lbl = v.label ? esc(v.label) : '';
    if (lbl !== this.shownLabel) { this.shownLabel = lbl; this.moveEl.innerHTML = lbl; }
    const bk = hits >= 2 ? Math.round(Math.max(0, Math.min(1, comboFrac)) * 100) : 0;
    if (bk !== this.barK) { this.barK = bk; this.bar.style.transform = `scaleX(${(bk / 100).toFixed(2)})`; }
  }
}
