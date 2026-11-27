// Phase 4.8A – Gruppenfenster links im HUD (bis zu vier Mitstreiter): Name, Stufe, Klassen- und Rollen-Zeichen, Lebens- und Willenskraft-
// Balken in Echtzeit, Anführer-Krone, Wappenfarbe der Nation, Ort und Entfernung. Ein Klick visiert das Mitglied an (gezielte Heilungen),
// Rechtsklick bzw. langer Druck öffnet das Spielermenü, „⋯“ im Kopf das Gruppenmenü (Gruppe verlassen). Geschrieben wird nur bei Änderung.

export interface PartyFrameView {
  id: string;
  name: string;
  level: number;
  /** Klassen-Zeichen (Wappen der Spezialisierung) und Rolle („Kombo-DPS“, „DPS/Heal“ …) */
  icon: string;
  role: string;
  crest: string;
  leader: boolean;
  hpFrac: number;
  willFrac: number;
  /** „Ankerglück · 40 m“, „auf See · 1,2 km“, „an Bord bei …“ */
  where: string;
  /** in Sichtweite (sonst gedämpft) */
  near: boolean;
  targeted: boolean;
}

const LONG_PRESS = 450;

interface Row { el: HTMLButtonElement; name: HTMLElement; lvl: HTMLElement; icon: HTMLElement; hp: HTMLElement; will: HTMLElement; where: HTMLElement; key: string; hpK: number; wK: number; whereT: string }

export class PartyFrames {
  readonly el: HTMLElement;
  private readonly head: HTMLElement;
  private readonly count: HTMLElement;
  private readonly list: HTMLElement;
  private readonly warnEl: HTMLElement;
  private readonly rows: Row[] = [];
  private shown = false;
  private countT = '';
  private warnT = '';
  onPick: ((id: string) => void) | null = null;
  onMenu: ((id: string, x: number, y: number) => void) | null = null;
  onHeaderMenu: ((x: number, y: number) => void) | null = null;
  private pressId = '';
  private pressAt = 0;

  constructor(parent: HTMLElement) {
    const el = document.createElement('section');
    el.className = 'hud-party panel';
    el.hidden = true;
    el.setAttribute('aria-label', 'Gruppe');
    el.innerHTML = '<header class="pf-head"><b>Gruppe</b><span class="pf-count"></span><button class="pf-more" type="button" aria-label="Gruppenmenü">⋯</button></header>'
      + '<div class="pf-warn" hidden></div><div class="pf-list"></div>';
    parent.appendChild(el);
    this.el = el;
    this.head = el.querySelector('.pf-head')!;
    this.count = el.querySelector('.pf-count')!;
    this.list = el.querySelector('.pf-list')!;
    this.warnEl = el.querySelector('.pf-warn')!;
    el.querySelector('.pf-more')!.addEventListener('click', (e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); this.onHeaderMenu?.(r.left, r.bottom + 4); });
    this.head.addEventListener('contextmenu', (e) => { e.preventDefault(); this.onHeaderMenu?.(e.clientX, e.clientY); });
    this.list.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.pf-row');
      if (!b?.dataset.id || Date.now() < this.pressAt) return;
      this.onPick?.(b.dataset.id);
    });
    this.list.addEventListener('contextmenu', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.pf-row');
      if (!b?.dataset.id) return;
      e.preventDefault();
      this.onMenu?.(b.dataset.id, e.clientX, e.clientY);
    });
    this.list.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      const b = (e.target as HTMLElement).closest<HTMLElement>('.pf-row');
      const id = b?.dataset.id ?? '';
      if (!id) return;
      this.pressId = id;
      const x = e.clientX, y = e.clientY;
      window.setTimeout(() => { if (this.pressId !== id) return; this.pressId = ''; this.pressAt = Date.now() + 600; this.onMenu?.(id, x, y); }, LONG_PRESS);
    });
    const cancel = () => { this.pressId = ''; };
    this.list.addEventListener('pointerup', cancel);
    this.list.addEventListener('pointercancel', cancel);
  }

  private row(i: number): Row {
    let r = this.rows[i];
    if (r) return r;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pf-row';
    el.innerHTML = '<i class="pf-crest"></i><span class="pf-icon"></span><span class="pf-main"><span class="pf-top"><b class="pf-name"></b><em class="pf-lvl"></em></span>'
      + '<span class="pf-bar hp"><s></s></span><span class="pf-bar wl"><s></s></span><small class="pf-where"></small></span>';
    this.list.appendChild(el);
    r = {
      el, name: el.querySelector('.pf-name')!, lvl: el.querySelector('.pf-lvl')!, icon: el.querySelector('.pf-icon')!, hp: el.querySelector('.pf-bar.hp s')!,
      will: el.querySelector('.pf-bar.wl s')!, where: el.querySelector('.pf-where')!, key: '', hpK: -1, wK: -1, whereT: '',
    };
    this.rows[i] = r;
    return r;
  }

  /** Je Anzeige-Takt: Gruppengröße, Mitstreiter (ohne dich selbst) und ein Warnhinweis (Kriegsausbruch) */
  update(size: number, max: number, rows: readonly PartyFrameView[], warn: string) {
    const show = size > 0;
    if (show !== this.shown) { this.shown = show; this.el.hidden = !show; }
    if (!show) return;
    const ct = `${size}/${max}`;
    if (ct !== this.countT) { this.countT = ct; this.count.textContent = ct; }
    if (warn !== this.warnT) { this.warnT = warn; this.warnEl.hidden = !warn; this.warnEl.textContent = warn; }
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i], r = this.row(i);
      r.el.hidden = false;
      const key = `${v.id}|${v.name}|${v.level}|${v.icon}|${v.role}|${v.crest}|${v.leader ? 1 : 0}`;
      if (key !== r.key) {
        r.key = key;
        r.el.dataset.id = v.id;
        r.name.textContent = v.leader ? `♛ ${v.name}` : v.name;
        r.lvl.textContent = `${v.level}`;
        r.icon.textContent = v.icon;
        r.icon.title = v.role;
        r.el.style.setProperty('--crest', v.crest);
        r.el.setAttribute('aria-label', `${v.name}, Stufe ${v.level}, ${v.role}${v.leader ? ', Anführer' : ''} – anvisieren`);
        r.hpK = -1; r.wK = -1;
      }
      const hk = Math.round(v.hpFrac * 200) / 200, wk = Math.round(v.willFrac * 200) / 200;
      if (hk !== r.hpK) { r.hpK = hk; r.hp.style.transform = `scaleX(${hk})`; r.el.classList.toggle('low', hk < 0.35); }
      if (wk !== r.wK) { r.wK = wk; r.will.style.transform = `scaleX(${wk})`; }
      if (v.where !== r.whereT) { r.whereT = v.where; r.where.textContent = v.where; }
      r.el.classList.toggle('far', !v.near);
      r.el.classList.toggle('targeted', v.targeted);
    }
    for (let i = rows.length; i < this.rows.length; i++) { this.rows[i].el.hidden = true; this.rows[i].key = ''; }
  }
}
