// Kompaktes 3.0-Fighter-HUD (Phase 4.6A): unten in der Mitte der Kombo-Zähler („HIT!“) mit dem Namen des letzten Angriffs und die vier
// Kampfkünste des Stils mit Taste, Symbol und Abklingzeit. Nicht einengend: kein Rahmen über dem Bild, blendet sich ohne Kampf zurück.
// Am Handy liegen die vier Kampfkünste als Knöpfe in der Touch-Gruppe (data/touchLayout.ts); das HUD zeigt dort nur Zähler und Stil.
import { esc } from './dom';
import { ACTION_STYLES, type ActionStyleId } from '../data/actionStyles';
import { FORM_NAMES, WILL_AURAS, type AuraId } from '../data/fajiArts';

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
  /** 4.6B: Willenskraft 0 … 1; Sturm-Erwachen (Rest 0 … 1 und Sekunden, 0 = nicht erwacht); Ultimate jetzt möglich und sein Name */
  will: number;
  awake: number;
  awakeS: number;
  ult: boolean;
  ultName: string;
  /** Willenskraft-Aura */
  aura: AuraId;
  /** Faji-Form 1 … 7 (0 = Waffenstil) und Fortschritt zur nächsten (0 … 1); Kampfkünste, die erst eine höhere Form freischaltet */
  form: number;
  formFrac: number;
  locked: readonly boolean[];
  lockForm: readonly number[];
}

/** 4.6H: Anzeige eines Offiziers-Kombo-Assists (Knopf in der Kampfleiste und Touch-Knopf) */
export interface AssistView {
  id: string;
  icon: string;
  short: string;
  label: string;
  /** Wer ihn ausführt (Kanonier / Schütze …) und welcher Offizier gerade bereitsteht ('' = keiner) */
  who: string;
  officer: string;
  color: string;
  /** Abklingzeit: 0 = bereit … 1 = gerade benutzt */
  cd: number;
  ready: boolean;
  /** Grund, warum nicht (null = bereit) */
  blocked: string | null;
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
  // 4.6B: Willenskraft-Leiste, Aura, Form
  private will: HTMLElement;
  private willBar: HTMLElement;
  private willTxt: HTMLElement;
  private willKey: HTMLElement;
  private auraEl: HTMLElement;
  private formEl: HTMLElement;
  private willK = '';
  private willPct = -1;
  private auraK = -1;
  private formK = '';
  private lockK = '';
  /** Kampfkunst angetippt (Touch-Modus über die Leiste, falls die Touch-Knöpfe fehlen) */
  onArt: (slot: number) => void = () => {};
  /** 4.6H: Offiziers-Assist angeklickt (0 … 2) */
  onAssist: (i: number) => void = () => {};
  private assistBox!: HTMLElement;
  private assistEls: HTMLElement[] = [];
  private assistK: string[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'fhud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="fh-combo" hidden><span class="fh-move"></span><div class="fh-count"><b>0</b><em>HIT!</em></div><u><i></i></u></div>
      <div class="fh-strip">
        <div class="fh-style"><b></b><small></small><em class="fh-form" hidden></em></div>
        <div class="fh-arts" role="group" aria-label="Kampfkünste"></div>
        <div class="fh-assists" role="group" aria-label="Offiziers-Assists" hidden></div>
      </div>
      <div class="fh-will" data-st="fill">
        <span class="fh-aura" title=""></span>
        <span class="fh-wt">Willenskraft</span>
        <u><i></i></u>
        <kbd class="fh-wk" hidden></kbd>
      </div>`;
    parent.prepend(this.root);
    this.combo = this.root.querySelector('.fh-combo')!;
    this.num = this.combo.querySelector('b')!;
    this.word = this.combo.querySelector('em')!;
    this.moveEl = this.combo.querySelector('.fh-move')!;
    this.bar = this.combo.querySelector('u i')!;
    this.styleEl = this.root.querySelector('.fh-style')!;
    this.will = this.root.querySelector('.fh-will')!;
    this.willBar = this.will.querySelector('u i')!;
    this.willTxt = this.will.querySelector('.fh-wt')!;
    this.willKey = this.will.querySelector('.fh-wk')!;
    this.auraEl = this.will.querySelector('.fh-aura')!;
    this.formEl = this.styleEl.querySelector('.fh-form')!;
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
    this.assistBox = this.root.querySelector<HTMLElement>('.fh-assists')!;
  }

  /**
   * 4.6H: Leiste der Offiziers-Kombo-Assists (nur am Desktop; am Handy sind es Touch-Knöpfe). `views` = null blendet sie aus (kein Landtrupp),
   * `keys` = Tastenkappen (8, 9, 0 oder R3+X …). Je Bild; baut nur bei einer Änderung neu.
   */
  setAssists(views: readonly AssistView[] | null, keys: readonly string[]) {
    const show = !!views && views.some((v) => !!v.officer);
    if (this.assistBox.hidden === show) this.assistBox.hidden = !show;
    if (!show || !views) return;
    if (this.assistEls.length !== views.length) {
      this.assistBox.textContent = '';
      this.assistEls = views.map((_v, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'fh-assist';
        b.innerHTML = '<kbd></kbd><i class="ic"></i><span class="nm"></span><small class="of"></small><s class="cd"></s>';
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onAssist(i); });
        this.assistBox.appendChild(b);
        return b;
      });
      this.assistK = views.map(() => '');
    }
    for (let i = 0; i < views.length; i++) {
      const v = views[i], el = this.assistEls[i];
      const cd = Math.max(0, Math.min(1, v.cd));
      const k = `${v.icon}|${v.short}|${v.officer}|${keys[i] ?? ''}|${v.ready ? 1 : 0}|${cd.toFixed(2)}|${v.blocked ?? ''}`;
      if (k === this.assistK[i]) continue;
      const was = this.assistK[i];
      this.assistK[i] = k;
      el.style.setProperty('--ac', v.color);
      el.style.setProperty('--cd', cd.toFixed(3));
      el.querySelector('kbd')!.textContent = keys[i] ?? '';
      el.querySelector('.ic')!.textContent = v.icon;
      el.querySelector('.nm')!.textContent = v.short;
      el.querySelector('.of')!.textContent = v.officer || '–';
      el.title = `${v.label} (${v.who}${v.officer ? `: ${v.officer}` : ''}) – ${v.blocked ?? 'bereit'}`;
      el.classList.toggle('cool', cd > 0);
      el.classList.toggle('off', !v.officer || (!v.ready && cd <= 0));
      // eben wieder bereit: kurzes Aufleuchten
      if (v.ready && was && !was.includes('|1|')) { el.classList.remove('ready'); void el.offsetWidth; el.classList.add('ready'); }
    }
  }

  /**
   * Je Bild. `v` = null blendet das HUD aus (an Bord, Menü). `keys` = Tastenkappen der Kampfkünste, `touch` = Handy-Modus (nur Zähler und Stil),
   * `comboHits`/`comboFrac` = Trefferzähler und Restzeit aus dem Kampf-Overlay (zählt auch Faji-Treffer).
   */
  update(v: FighterView | null, keys: readonly string[], touch: boolean, comboHits: number, comboFrac: number, dt: number, awakenKey = '') {
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
    this.updateWill(v, awakenKey);
  }

  /** Willenskraft-Leiste: füllt sich im Kampf; voll = Sturm-Erwachen bereit, im Erwachen läuft sie als Restzeit ab (mit Ultimate-Hinweis) */
  private updateWill(v: FighterView, key: string) {
    const st = v.awake > 0 ? (v.ult ? 'ult' : 'awake') : v.will >= 1 ? 'full' : 'fill';
    const txt = st === 'ult' ? `Ultimate: ${v.ultName}` : st === 'awake' ? `Sturm-Erwachen · ${Math.ceil(v.awakeS)} s` : st === 'full' ? 'Sturm-Erwachen bereit' : 'Willenskraft';
    const k = st + '|' + txt + '|' + key;
    if (k !== this.willK) {
      this.willK = k;
      this.will.dataset.st = st;
      this.willTxt.textContent = txt;
      const showKey = (st === 'full' || st === 'ult') && !!key;
      this.willKey.hidden = !showKey;
      if (showKey) this.willKey.textContent = key;
    }
    const pct = Math.round(Math.max(0, Math.min(1, v.awake > 0 ? v.awake : v.will)) * 200);
    if (pct !== this.willPct) { this.willPct = pct; this.willBar.style.transform = `scaleX(${(pct / 200).toFixed(3)})`; }
    if (v.aura !== this.auraK) {
      this.auraK = v.aura;
      const a = WILL_AURAS[v.aura] ?? WILL_AURAS[0];
      this.auraEl.textContent = a.icon;
      this.auraEl.title = `${a.label}: ${a.desc}`;
      this.auraEl.style.setProperty('--ac', a.color);
      this.auraEl.classList.toggle('on', v.aura > 0);
    }
    const fk = v.form > 0 ? `${v.form}|${Math.round(v.formFrac * 20)}` : '';
    if (fk !== this.formK) {
      this.formK = fk;
      this.formEl.hidden = !fk;
      if (fk) {
        this.formEl.textContent = FORM_NAMES[v.form - 1] ?? '';
        this.formEl.style.setProperty('--fp', v.form >= 7 ? '1' : v.formFrac.toFixed(2));
      }
    }
    let lk = '';
    for (let i = 0; i < 4; i++) lk += v.locked[i] ? '1' : '0';
    if (lk !== this.lockK) {
      this.lockK = lk;
      for (let i = 0; i < 4; i++) {
        const el = this.slots[i];
        const lockedNow = !!v.locked[i];
        el.classList.toggle('locked', lockedNow);
        el.dataset.form = lockedNow ? String(v.lockForm[i] ?? '') : '';
      }
    }
  }
}
