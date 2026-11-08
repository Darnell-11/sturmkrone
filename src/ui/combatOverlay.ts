import { Vector3, type Camera } from 'three';
import { esc } from './dom';
import { audio } from '../audio/audio';

interface FloatText { el: HTMLElement; pos: Vector3; life: number; max: number; vy: number }
interface Bar { el: HTMLElement; fill: HTMLElement; lag: HTMLElement; last: number }

export type NumberStyle = 'hit' | 'crit' | 'hurt' | 'heal' | 'info' | 'gold' | 'xp';

const tmp = new Vector3();

/** Schadenszahlen, Speedlines, Impact-Frames, Lebensbalken und Kombo-Zähler. */
export class CombatOverlay {
  readonly root: HTMLElement;
  private texts: FloatText[] = [];
  private bars = new Map<object, Bar>();
  private speed: HTMLElement;
  private impact: HTMLElement;
  private vignette: HTMLElement;
  private combo: HTMLElement;
  private comboCount = 0;
  private comboTimer = 0;
  private reticle: HTMLElement;
  private boss: HTMLElement;
  private bossFill: HTMLElement;
  private bossLag: HTMLElement;
  private bossName: HTMLElement;
  private banner: HTMLElement;
  private cutin: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'cbt';
    this.root.innerHTML = `
      <div class="cbt-speed"></div>
      <div class="cbt-impact"></div>
      <div class="cbt-vign"></div>
      <div class="cbt-combo" hidden><b>0</b><span>Treffer</span></div>
      <div class="cbt-reticle" hidden></div>
      <div class="cbt-boss" hidden><div class="cbt-boss-name fell"></div><div class="cbt-boss-bar"><i class="lag"></i><i class="fill"></i></div></div>
      <div class="cbt-banner"><h2 class="fell"></h2><p></p></div>
      <div class="cbt-cutin"><b></b></div>`;
    parent.appendChild(this.root);
    this.speed = this.root.querySelector('.cbt-speed')!;
    this.impact = this.root.querySelector('.cbt-impact')!;
    this.vignette = this.root.querySelector('.cbt-vign')!;
    this.combo = this.root.querySelector('.cbt-combo')!;
    this.reticle = this.root.querySelector('.cbt-reticle')!;
    this.boss = this.root.querySelector('.cbt-boss')!;
    this.bossFill = this.boss.querySelector('.fill')!;
    this.bossLag = this.boss.querySelector('.lag')!;
    this.bossName = this.boss.querySelector('.cbt-boss-name')!;
    this.banner = this.root.querySelector('.cbt-banner')!;
    this.cutin = this.root.querySelector('.cbt-cutin')!;
  }

  setVisible(v: boolean) { this.root.hidden = !v; }

  /** Schwebende Zahl oder kurzer Text an einer Weltposition */
  number(pos: Vector3, value: number | string, style: NumberStyle = 'hit') {
    if (this.texts.length > 24) { this.texts[0].el.remove(); this.texts.shift(); }
    // Klang passend zur Zahl
    const at = { x: pos.x, y: pos.y, z: pos.z };
    if (style === 'hit') audio.play('hit', 0.9, at);
    else if (style === 'crit') { audio.play('heavy', 1, at); audio.play('crit', 0.8); }
    else if (style === 'hurt') audio.play('hurt');
    else if (style === 'gold') audio.play('coin', 0.8, at);
    else if (value === 'Parade!') audio.play('parry');
    else if (value === 'Geblockt' || value === 'Abgewehrt') audio.play('clang', 1, at);
    else if (value === 'Ausgewichen') audio.play('roll');
    const el = document.createElement('div');
    el.className = `cbt-num n-${style}`;
    el.textContent = typeof value === 'number' ? String(Math.round(value)) : value;
    this.root.appendChild(el);
    const life = style === 'info' ? 1.2 : 0.9;
    this.texts.push({ el, pos: pos.clone().add(new Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)), life, max: life, vy: style === 'crit' ? 2.6 : 2 });
  }

  /** Speedlines (Rolle, schwere Treffer, Ultimates) */
  speedlines(strength = 1) {
    this.speed.style.setProperty('--s', String(strength));
    this.speed.classList.remove('on');
    void this.speed.offsetWidth;
    this.speed.classList.add('on');
  }

  /** Impact-Frame: kurzes Negativbild bei sehr starken Treffern */
  impactFrame() {
    audio.play('heavy', 1.2);
    this.impact.classList.remove('on');
    void this.impact.offsetWidth;
    this.impact.classList.add('on');
  }

  hurt() {
    this.vignette.classList.remove('on');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('on');
  }

  addCombo() {
    this.comboCount++;
    this.comboTimer = 2.2;
    if (this.comboCount >= 3) {
      this.combo.hidden = false;
      this.combo.querySelector('b')!.textContent = String(this.comboCount);
      this.combo.classList.remove('pop');
      void this.combo.offsetWidth;
      this.combo.classList.add('pop');
    }
  }

  /** Großes Banner (Stufenaufstieg, Sieg) */
  private bannerUntil = 0;
  private bannerQ: [string, string][] = [];
  showBanner(title: string, sub = '') {
    const now = performance.now();
    if (now < this.bannerUntil) { if (this.bannerQ.length < 4) this.bannerQ.push([title, sub]); return; }
    this.bannerUntil = now + 2400;
    this.banner.querySelector('h2')!.textContent = title;
    this.banner.querySelector('p')!.textContent = sub;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  /** Cut-in-Banner für Ultimates und Boss-Auftritte */
  showCutin(text: string, color = '#E3B04B') {
    audio.play('cutin');
    this.cutin.style.setProperty('--cc', color);
    this.cutin.querySelector('b')!.innerHTML = esc(text);
    this.cutin.classList.remove('show');
    void this.cutin.offsetWidth;
    this.cutin.classList.add('show');
  }

  setBoss(name: string | null, frac = 1) {
    this.boss.hidden = !name;
    if (!name) return;
    this.bossName.textContent = name;
    this.bossFill.style.width = `${Math.max(0, frac) * 100}%`;
    this.bossLag.style.width = `${Math.max(0, frac) * 100}%`;
  }

  /** Lebensbalken über einem Gegner (key = Gegnerobjekt). frac < 0 entfernt ihn. */
  setBar(key: object, pos: Vector3 | null, frac: number, elite: boolean, camera: Camera, label = '') {
    let b = this.bars.get(key);
    if (frac < 0 || !pos) {
      if (b) { b.el.remove(); this.bars.delete(key); }
      return;
    }
    if (!b) {
      const el = document.createElement('div');
      el.className = `cbt-ebar${elite ? ' elite' : ''}`;
      el.innerHTML = '<i class="lag"></i><i class="fill"></i>';
      this.root.appendChild(el);
      b = { el, fill: el.querySelector('.fill')!, lag: el.querySelector('.lag')!, last: frac };
      this.bars.set(key, b);
    }
    b.fill.style.width = `${frac * 100}%`;
    if (b.el.dataset.label !== label) { b.el.dataset.label = label; b.el.classList.toggle('board', !!label); }
    if (frac < b.last) setTimeout(() => { if (b) b.lag.style.width = `${frac * 100}%`; }, 300);
    b.last = frac;
    tmp.copy(pos).project(camera);
    const on = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
    b.el.style.display = on ? '' : 'none';
    if (on) b.el.style.transform = `translate(${((tmp.x + 1) / 2) * innerWidth}px, ${((1 - tmp.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
  }

  clearBars() { for (const b of this.bars.values()) b.el.remove(); this.bars.clear(); }

  setReticle(pos: Vector3 | null, camera: Camera) {
    if (!pos) { this.reticle.hidden = true; return; }
    tmp.copy(pos).project(camera);
    this.reticle.hidden = tmp.z > 1;
    this.reticle.style.transform = `translate(${((tmp.x + 1) / 2) * innerWidth}px, ${((1 - tmp.y) / 2) * innerHeight}px) translate(-50%, -50%)`;
  }

  update(dt: number, camera: Camera) {
    if (this.bannerQ.length && performance.now() >= this.bannerUntil) { const [a, b] = this.bannerQ.shift()!; this.showBanner(a, b); }
    for (const t of this.texts) {
      t.life -= dt;
      t.pos.y += t.vy * dt;
      t.vy *= 0.94;
      tmp.copy(t.pos).project(camera);
      if (tmp.z > 1) { t.el.style.display = 'none'; continue; }
      const k = t.life / t.max;
      const pop = k > 0.85 ? 1 + (k - 0.85) * 4 : 1;
      t.el.style.display = '';
      t.el.style.transform = `translate(${((tmp.x + 1) / 2) * innerWidth}px, ${((1 - tmp.y) / 2) * innerHeight}px) translate(-50%, -50%) scale(${pop})`;
      t.el.style.opacity = String(Math.min(1, k * 2.5));
    }
    this.texts = this.texts.filter((t) => { if (t.life <= 0) { t.el.remove(); return false; } return true; });
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) { this.comboCount = 0; this.combo.hidden = true; }
    }
  }
}
