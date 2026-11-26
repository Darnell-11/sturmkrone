// Phase 4.6J – Ziel-Fenster (Target Frame) oben im HUD: Wappenfarbe der Macht, Name, „Stufe X“, Beziehung, Macht und Kategorie
// (Schiffsklasse/Stufe auf See, Kämpfertyp/Rolle/Titel an Land), Lebensbalken und – bei Elite-Gegnern und Bossen – die Haltungsleiste.
// Die Daten kommen fertig aus `frameView` (combat/targetLock.ts); hier wird nur bei Änderungen ins DOM geschrieben.
import type { TargetFrameView } from '../combat/targetLock';

export class TargetFrame {
  readonly el: HTMLElement;
  private readonly crest: HTMLElement;
  private readonly name: HTMLElement;
  private readonly lvl: HTMLElement;
  private readonly rel: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly hpBar: HTMLElement;
  private readonly post: HTMLElement;
  private readonly postFill: HTMLElement;
  private shown = false;
  private id = '';
  private hp = -1;
  private hpLabel = '';
  private postK = -2;
  private broken = false;
  private tone = '';

  constructor(parent: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'hud-target';
    el.hidden = true;
    el.setAttribute('role', 'status');
    el.innerHTML = '<i class="tf-crest"></i><div class="tf-main"><div class="tf-top"><b class="tf-name"></b><span class="tf-lvl"></span><em class="tf-rel"></em></div>'
      + '<div class="tf-sub"></div><div class="tf-bar"><i class="tf-fill"></i><span class="tf-hp"></span></div>'
      + '<div class="tf-post" hidden><i class="tf-pfill"></i><span>Haltung</span></div></div>';
    parent.appendChild(el);
    this.el = el;
    const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
    this.crest = q('.tf-crest'); this.name = q('.tf-name'); this.lvl = q('.tf-lvl'); this.rel = q('.tf-rel'); this.sub = q('.tf-sub');
    this.hpBar = q('.tf-bar'); this.hpFill = q('.tf-fill'); this.hpText = q('.tf-hp'); this.post = q('.tf-post'); this.postFill = q('.tf-pfill');
  }

  /** Je Bild: nur Änderungen schreiben */
  update(v: TargetFrameView | null) {
    const show = !!v && v.visible;
    if (show !== this.shown) { this.shown = show; this.el.hidden = !show; if (!show) this.id = ''; }
    if (!show || !v) return;
    if (v.id !== this.id) {
      this.id = v.id;
      this.name.textContent = v.name;
      this.lvl.textContent = v.levelText;
      this.lvl.hidden = !v.levelText;
      this.sub.textContent = v.nation && v.category ? `${v.nation} · ${v.category}` : v.nation || v.category;
      this.crest.style.setProperty('--crest', v.crest);
      this.el.dataset.kind = v.kind;
      this.hp = -1; this.hpLabel = ''; this.postK = -2; this.tone = '';
    }
    if (v.tone !== this.tone) {
      this.tone = v.tone;
      this.el.dataset.tone = v.tone;
      this.rel.textContent = v.relationText;
    }
    const hasHp = !!v.hpText;
    this.hpBar.hidden = !hasHp;
    if (hasHp) {
      const k = Math.round(v.hpFrac * 1000) / 1000;
      if (k !== this.hp) { this.hp = k; this.hpFill.style.transform = `scaleX(${k})`; }
      if (v.hpText !== this.hpLabel) { this.hpLabel = v.hpText; this.hpText.textContent = v.hpText; }
    }
    const pk = v.posture < 0 ? -1 : Math.round(v.posture * 100) / 100;
    if (pk !== this.postK || v.broken !== this.broken) {
      this.postK = pk; this.broken = v.broken;
      this.post.hidden = pk < 0;
      if (pk >= 0) {
        this.postFill.style.transform = `scaleX(${v.broken ? 1 : pk})`;
        this.post.classList.toggle('broken', v.broken);
      }
    }
  }
}
