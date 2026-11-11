import { Vector3, type Camera, type Object3D } from 'three';
import { esc } from './dom';
import { audio } from '../audio/audio';

interface FloatText { el: HTMLElement; pos: Vector3; life: number; max: number; vy: number }
/** anchor: Objekt, dem der Balken bei jedem Bild folgt (weich dargestellte Figur/Schiff), sonst die feste Position pos */
interface Bar { el: HTMLElement; fill: HTMLElement; lag: HTMLElement; last: number; pos: Vector3; anchor: Object3D | null; dy: number; tf: string }

export type NumberStyle = 'hit' | 'crit' | 'hurt' | 'heal' | 'info' | 'gold' | 'xp';

const tmp = new Vector3();
/** Sekunden, die eine Kombo nach dem letzten Treffer offen bleibt */
const COMBO_TIME = 2.2;

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
  private comboRank = 0;
  private comboNum: HTMLElement;
  private comboLabel: HTMLElement;
  private comboBar: HTMLElement;
  private reticle: HTMLElement;
  private boss: HTMLElement;
  private bossFill: HTMLElement;
  private bossLag: HTMLElement;
  private bossName: HTMLElement;
  private bossBrk: HTMLElement;
  private banner: HTMLElement;
  private cutin: HTMLElement;
  private victoryEl: HTMLElement;
  private lootEl: HTMLElement;
  private lootTimer = 0;
  private victoryTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'cbt';
    this.root.innerHTML = `
      <div class="cbt-speed"></div>
      <div class="cbt-impact"></div>
      <div class="cbt-vign"></div>
      <div class="cbt-combo" hidden><em class="fin">Finisher!</em><b>0</b><span>Treffer</span><u><i></i></u></div>
      <div class="cbt-reticle" hidden></div>
      <div class="cbt-boss" hidden><div class="cbt-boss-name fell"></div><div class="cbt-boss-bar"><i class="lag"></i><i class="fill"></i><s class="p1"></s><s class="p2"></s></div><div class="cbt-boss-break"><i></i><b>BREAK!</b></div></div>
      <div class="cbt-banner"><h2 class="fell"></h2><p></p></div>
      <div class="cbt-cutin"><b></b></div>
      <div class="cbt-victory" hidden><div class="rays"></div><div class="vbox"><small>Sieg</small><h2 class="fell"></h2><p></p><div class="vstats"></div></div></div>
      <div class="cbt-loot" hidden></div>`;
    parent.appendChild(this.root);
    this.speed = this.root.querySelector('.cbt-speed')!;
    this.impact = this.root.querySelector('.cbt-impact')!;
    this.vignette = this.root.querySelector('.cbt-vign')!;
    this.combo = this.root.querySelector('.cbt-combo')!;
    this.comboNum = this.combo.querySelector('b')!;
    this.comboLabel = this.combo.querySelector('span')!;
    this.comboBar = this.combo.querySelector('u i')!;
    this.reticle = this.root.querySelector('.cbt-reticle')!;
    this.boss = this.root.querySelector('.cbt-boss')!;
    this.bossFill = this.boss.querySelector('.fill')!;
    this.bossLag = this.boss.querySelector('.lag')!;
    this.bossName = this.boss.querySelector('.cbt-boss-name')!;
    this.bossBrk = this.boss.querySelector('.cbt-boss-break i')!;
    this.banner = this.root.querySelector('.cbt-banner')!;
    this.cutin = this.root.querySelector('.cbt-cutin')!;
    this.victoryEl = this.root.querySelector('.cbt-victory')!;
    this.lootEl = this.root.querySelector('.cbt-loot')!;
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
    this.comboTimer = COMBO_TIME;
    if (this.comboCount >= 2) {
      this.combo.hidden = false;
      this.comboNum.textContent = String(this.comboCount);
      const rank = this.comboCount >= 15 ? 3 : this.comboCount >= 10 ? 2 : this.comboCount >= 6 ? 1 : 0;
      if (rank !== this.comboRank) {
        this.comboRank = rank;
        this.comboLabel.textContent = ['Treffer', 'Stark!', 'Brutal!', 'Legendär!'][rank];
        this.combo.dataset.rank = String(rank);
      }
      this.combo.classList.remove('pop');
      void this.combo.offsetWidth;
      this.combo.classList.add('pop');
    }
  }

  /** Kombo-Finisher (Leicht → Leicht → Schwer): Schriftzug am Zähler, hält die Kombo länger offen */
  finisher() {
    this.comboTimer = Math.max(this.comboTimer, COMBO_TIME + 0.6);
    this.combo.hidden = false;
    this.combo.classList.remove('fin-on');
    void this.combo.offsetWidth;
    this.combo.classList.add('fin-on');
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

  /**
   * Siegesbild für besiegte Legenden: goldene Strahlen, großer Schriftzug, Fanfare. Dauert etwa 4 Sekunden.
   * stats: kurze Zeilen darunter (z. B. Gold, Beute)
   */
  victory(title: string, sub = '', stats: string[] = []) {
    audio.play('victory');
    const el = this.victoryEl;
    el.hidden = false;
    el.querySelector('h2')!.textContent = title;
    el.querySelector('p')!.textContent = sub;
    el.querySelector('.vstats')!.innerHTML = stats.map((t) => `<span>${esc(t)}</span>`).join('');
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.victoryTimer = 4.4;
    this.impactFrame();
  }

  /** Beute-Karte für seltene Funde: je Seltenheit Farbe, Glühen und Fanfare (selten = 1, episch = 2, legendär = 3) */
  lootCard(title: string, sub: string, color: string, tier: number) {
    audio.play(tier >= 3 ? 'fanfareLegend' : tier === 2 ? 'fanfareEpic' : 'fanfareRare');
    const el = this.lootEl;
    el.hidden = false;
    el.style.setProperty('--lc', color);
    el.dataset.tier = String(tier);
    el.innerHTML = `<i></i><b>${esc(title)}</b><span>${esc(sub)}</span>`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.lootTimer = tier >= 2 ? 4.2 : 3;
    if (tier >= 2) this.impactFrame();
    if (tier >= 3) this.speedlines(0.8);
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

  /** Boss-Leiste: Leben (mit Nachlauf und Phasenmarken), darunter der Haltebalken (Break-Bar). Extra: Haltebalken 0 … 1, Break aktiv, Phase 1 … 3 */
  setBoss(name: string | null, frac = 1, extra?: { brk: number; broken: boolean; phase: number }) {
    this.boss.hidden = !name;
    if (!name) return;
    if (this.bossName.textContent !== name) this.bossName.textContent = name;
    const s = `scaleX(${Math.max(0, Math.min(1, frac)).toFixed(3)})`;
    if (this.bossFill.style.transform !== s) { this.bossFill.style.transform = s; this.bossLag.style.transform = s; }
    if (!extra) return;
    const b = `scaleX(${Math.max(0, Math.min(1, extra.brk)).toFixed(3)})`;
    if (this.bossBrk.style.transform !== b) this.bossBrk.style.transform = b;
    this.boss.classList.toggle('broken', extra.broken);
    if (this.boss.dataset.phase !== String(extra.phase)) this.boss.dataset.phase = String(extra.phase);
  }

  /** Lebensbalken über einem Gegner (key = Gegnerobjekt). frac < 0 entfernt ihn. */
  setBar(key: object, pos: Vector3 | null, frac: number, elite: boolean, _camera: Camera | null, label = '', anchor: Object3D | null = null, dy = 0) {
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
      b = { el, fill: el.querySelector('.fill')!, lag: el.querySelector('.lag')!, last: frac, pos: new Vector3(), anchor: null, dy: 0, tf: '' };
      b.lag.style.transform = `scaleX(${frac.toFixed(3)})`;
      this.bars.set(key, b);
    }
    // Füllstand über transform (kein Layout); der gelbe Nachlauf folgt verzögert
    if (frac !== b.last || !b.fill.style.transform) b.fill.style.transform = `scaleX(${Math.max(0, frac).toFixed(3)})`;
    if (b.el.dataset.label !== label) { b.el.dataset.label = label; b.el.classList.toggle('board', !!label); }
    if (frac < b.last) { const bb = b; setTimeout(() => { if (bb.el.isConnected) bb.lag.style.transform = `scaleX(${Math.max(0, frac).toFixed(3)})`; }, 300); }
    b.last = frac;
    b.pos.copy(pos);
    b.anchor = anchor;
    b.dy = dy;
  }

  /** Balken bei jedem Bild an die (weich dargestellte) Figur heften – ruckelt nicht auf schnellen Bildschirmen */
  private placeBars(camera: Camera) {
    for (const b of this.bars.values()) {
      if (b.anchor) tmp.copy(b.anchor.position).setY(b.anchor.position.y + b.dy);
      else tmp.copy(b.pos);
      tmp.project(camera);
      const on = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      const tf = on ? `translate(${(((tmp.x + 1) / 2) * innerWidth).toFixed(1)}px, ${(((1 - tmp.y) / 2) * innerHeight).toFixed(1)}px) translate(-50%, -100%)` : 'none';
      if (tf === b.tf) continue;
      b.tf = tf;
      b.el.style.display = on ? '' : 'none';
      if (on) b.el.style.transform = tf;
    }
  }

  clearBars() { for (const b of this.bars.values()) b.el.remove(); this.bars.clear(); }

  setReticle(pos: Vector3 | null, camera: Camera) {
    if (!pos) { this.reticle.hidden = true; return; }
    tmp.copy(pos).project(camera);
    this.reticle.hidden = tmp.z > 1;
    this.reticle.style.transform = `translate(${((tmp.x + 1) / 2) * innerWidth}px, ${((1 - tmp.y) / 2) * innerHeight}px) translate(-50%, -50%)`;
  }

  update(dt: number, camera: Camera) {
    if (this.victoryTimer > 0 && (this.victoryTimer -= dt) <= 0) this.victoryEl.hidden = true;
    if (this.lootTimer > 0 && (this.lootTimer -= dt) <= 0) this.lootEl.hidden = true;
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
    // abgelaufene Zahlen an Ort und Stelle entfernen (kein neues Array pro Bild)
    let n = 0;
    for (const t of this.texts) { if (t.life <= 0) t.el.remove(); else this.texts[n++] = t; }
    this.texts.length = n;
    this.placeBars(camera);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      // Restzeit als schrumpfender Balken (transform, kein Layout)
      this.comboBar.style.transform = `scaleX(${Math.max(0, Math.min(1, this.comboTimer / COMBO_TIME)).toFixed(3)})`;
      if (this.comboTimer <= 0) { this.comboCount = 0; this.comboRank = 0; this.combo.hidden = true; this.combo.classList.remove('fin-on'); this.comboLabel.textContent = 'Treffer'; this.combo.dataset.rank = '0'; }
    }
  }
}
