import { Vector3, type Camera, type Object3D } from 'three';
import { esc } from './dom';
import { fmtPct } from '../core/format';
import { audio } from '../audio/audio';
import { clamp01 } from '../core/mathUtil';

interface FloatText { el: HTMLElement; pos: Vector3; life: number; max: number; vy: number }
/** anchor: Objekt, dem der Balken bei jedem Bild folgt (weich dargestellte Figur/Schiff), sonst die feste Position pos */
interface Bar { el: HTMLElement; fill: HTMLElement; lag: HTMLElement; post: HTMLElement | null; postK: string; last: number; pos: Vector3; anchor: Object3D | null; dy: number; tf: string }

export type NumberStyle = 'hit' | 'crit' | 'hurt' | 'heal' | 'info' | 'gold' | 'xp';

/** Was die Boss-Leiste zeigt: Name, Titel, Leben mit Phasenmarken, Haltebalken und wer das Ziel des Bosses ist */
export interface BossView {
  name: string;
  title?: string;
  /** Leben 0 … 1 */
  frac: number;
  /** Haltebalken 0 … 1 (Break) */
  brk?: number;
  broken?: boolean;
  /** aktuelle Phase 1 … 3 */
  phase?: number;
  /** Lebensanteile, bei denen die nächste Phase beginnt (Marken auf dem Balken) */
  marks?: number[];
  /** Aggro: gerade bedrohtes Ziel; `mine` = die Spielfigur, `share` = ihre Bedrohung im Vergleich zur höchsten (0 … 1,5) */
  aggro?: { target: string; mine: boolean; share: number } | null;
}

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
  /** Haltungsbruch-Finisher: Hinweis über dem taumelnden Ziel (Weltposition, je Bild projiziert) */
  private finEl: HTMLElement;
  private finPos = new Vector3();
  private finOn = false;
  private finTf = '';
  private boss: HTMLElement;
  private bossFill: HTMLElement;
  private bossLag: HTMLElement;
  private bossBrk: HTMLElement;
  private bossBar: HTMLElement;
  private bossKey = '';
  /** Schadenszahlen zeigen (Einstellung); Klänge laufen weiter */
  numbers = true;
  private banner: HTMLElement;
  private cutin: HTMLElement;
  private cutinLayer: HTMLElement;
  private victoryEl: HTMLElement;
  private lootEl: HTMLElement;
  private lootTimer = 0;
  private victoryTimer = 0;

  /** `bossParent`: Zone des HUD, in der die Boss-Leiste steht (Standard: dieselbe Fläche) */
  constructor(parent: HTMLElement, bossParent: HTMLElement = parent) {
    this.root = document.createElement('div');
    this.root.className = 'cbt';
    this.root.innerHTML = `
      <div class="cbt-speed"></div>
      <div class="cbt-impact"></div>
      <div class="cbt-vign"></div>
      <div class="cbt-combo" hidden><em class="fin">Finisher!</em><b>0</b><span>Treffer</span><u><i></i></u></div>
      <div class="cbt-reticle" hidden></div>
      <div class="cbt-finisher" hidden><b>Finisher</b><kbd></kbd></div>
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
    this.finEl = this.root.querySelector('.cbt-finisher')!;
    this.boss = document.createElement('div');
    this.boss.className = 'hud-boss';
    this.boss.hidden = true;
    this.boss.innerHTML = '<div class="boss-name fell"></div><div class="boss-title"></div><div class="boss-bar"><i class="lag"></i><i class="fill"></i></div><div class="boss-foot"><span class="boss-phase"></span><span class="boss-aggro" hidden><i></i><em>Ziel</em><b></b><small></small></span></div><div class="boss-break"><i></i><b>BREAK!</b></div>';
    bossParent.appendChild(this.boss);
    this.bossBar = this.boss.querySelector('.boss-bar')!;
    this.bossFill = this.boss.querySelector('.fill')!;
    this.bossLag = this.boss.querySelector('.lag')!;
    this.bossBrk = this.boss.querySelector('.boss-break i')!;
    this.banner = this.root.querySelector('.cbt-banner')!;
    this.cutin = this.root.querySelector('.cbt-cutin')!;
    // 4.6D: das schräge Ultimate-Banner liegt in einer eigenen Schicht ÜBER dem HUD (vorher verdeckte das Auftragsfenster lange Titel)
    this.cutinLayer = document.createElement('div');
    this.cutinLayer.className = 'cbt-cutin-layer';
    this.cutinLayer.setAttribute('aria-hidden', 'true');
    this.cutinLayer.appendChild(this.cutin);
    parent.appendChild(this.cutinLayer);
    this.victoryEl = this.root.querySelector('.cbt-victory')!;
    this.lootEl = this.root.querySelector('.cbt-loot')!;
  }

  setVisible(v: boolean) { this.root.hidden = !v; this.cutinLayer.hidden = !v; if (!v) this.boss.hidden = true; }

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
    if (!this.numbers && typeof value === 'number') return;
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

  /**
   * 4.6I: still während der Kino-Regie eines Ultimates – dort zeigt der Doppel-Impact-Frame (`ui/animeImpactOverlay.ts`) den Treffer; der
   * weiße Blitz dieser Schicht erreicht das WebGL-Bild nur als milchiger Schleier und würde ihn überdecken. Große Banner („Schiff versenkt!“,
   * Stufenaufstieg) warten bis nach der Sequenz, ein laufendes tritt zurück (setzt das Spiel je Bild).
   */
  private quietOn = false;
  get quiet() { return this.quietOn; }
  set quiet(v: boolean) {
    if (v === this.quietOn) return;
    this.quietOn = v;
    this.banner.classList.toggle('hush', v);
  }

  /** Impact-Frame: kurzes Negativbild bei sehr starken Treffern */
  impactFrame() {
    if (this.quietOn) return;
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

  /** Kombo-Zähler für das Fighter-HUD (4.6A): Treffer, Restzeit (0 … 1), Rang 0 … 3 */
  get comboHits() { return this.comboCount; }
  get comboFrac() { return clamp01(this.comboTimer / COMBO_TIME); }
  get comboRankNow() { return this.comboRank; }
  /** Das Fighter-HUD zeigt den Zähler unten: der alte Zähler am rechten Rand bleibt dann verborgen */
  comboDocked = false;

  /** Hinweis „Finisher“ über einem taumelnden Ziel (null blendet ihn aus); `key` = Tastenkappe */
  setFinisherPrompt(pos: { x: number; y: number; z: number } | null, key = '') {
    this.finOn = !!pos;
    if (pos) this.finPos.set(pos.x, pos.y, pos.z);
    const k = this.finEl.querySelector('kbd')!;
    if (k.textContent !== key) { k.textContent = key; k.hidden = !key; }
    if (!pos && !this.finEl.hidden) { this.finEl.hidden = true; this.finTf = ''; }
  }

  addCombo() {
    this.comboCount++;
    this.comboTimer = COMBO_TIME;
    if (this.comboCount >= 2) {
      this.combo.hidden = this.comboDocked;
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
    this.combo.hidden = this.comboDocked;
    this.combo.classList.remove('fin-on');
    void this.combo.offsetWidth;
    this.combo.classList.add('fin-on');
  }

  /** Großes Banner (Stufenaufstieg, Sieg) */
  private bannerUntil = 0;
  private bannerQ: [string, string][] = [];
  showBanner(title: string, sub = '') {
    const now = performance.now();
    if (this.quietOn || now < this.bannerUntil) { if (this.bannerQ.length < 4) this.bannerQ.push([title, sub]); return; }
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
    // Schriftgröße folgt der Titellänge (clamp in hud.css): auch „7. Form: Blutmond-Finsternis“ passt ganz ins Bild
    this.cutin.style.setProperty('--len', String(Math.max(8, text.length)));
    this.cutin.querySelector('b')!.innerHTML = esc(text);
    this.cutin.classList.remove('show');
    void this.cutin.offsetWidth;
    this.cutin.classList.add('show');
  }

  /** Endboss-Leiste oben in der Mitte: Name und Titel, Leben mit Nachlauf und Phasenmarken, Haltebalken (leer = Break) und Aggro-Anzeige; null blendet sie aus */
  setBoss(v: BossView | null) {
    const el = this.boss;
    if (!v) { if (!el.hidden) el.hidden = true; this.bossKey = ''; return; }
    if (el.hidden) el.hidden = false;
    // feste Teile (Name, Titel, Marken) nur bei Änderung neu schreiben
    const key = `${v.name}|${v.title ?? ''}|${(v.marks ?? []).join(',')}`;
    if (key !== this.bossKey) {
      this.bossKey = key;
      el.querySelector('.boss-name')!.textContent = v.name;
      const t = el.querySelector<HTMLElement>('.boss-title')!;
      t.textContent = v.title ?? ''; t.hidden = !v.title;
      this.bossBar.querySelectorAll('s').forEach((s) => s.remove());
      for (const m of v.marks ?? []) { const s = document.createElement('s'); s.style.setProperty('--at', String(m)); s.dataset.at = String(m); this.bossBar.appendChild(s); }
    }
    const f = `scaleX(${Math.max(0, Math.min(1, v.frac)).toFixed(3)})`;
    if (this.bossFill.style.transform !== f) {
      this.bossFill.style.transform = f; this.bossLag.style.transform = f;
      this.bossBar.querySelectorAll<HTMLElement>('s').forEach((s) => s.classList.toggle('past', v.frac <= +s.dataset.at!));
    }
    const b = `scaleX(${Math.max(0, Math.min(1, v.brk ?? 1)).toFixed(3)})`;
    if (this.bossBrk.style.transform !== b) this.bossBrk.style.transform = b;
    el.classList.toggle('broken', !!v.broken);
    const ph = String(v.phase ?? 1);
    if (el.dataset.phase !== ph) { el.dataset.phase = ph; el.querySelector('.boss-phase')!.textContent = v.marks?.length ? `Phase ${ph} von ${v.marks.length + 1}` : ''; }
    const ag = el.querySelector<HTMLElement>('.boss-aggro')!;
    ag.hidden = !v.aggro;
    if (v.aggro) {
      ag.classList.toggle('me', v.aggro.mine);
      const who = ag.querySelector('b')!, share = ag.querySelector('small')!;
      if (who.textContent !== v.aggro.target) who.textContent = v.aggro.target;
      const sh = `Bedrohung ${fmtPct(v.aggro.share)}`;
      if (share.textContent !== sh) share.textContent = sh;
    }
  }

  /**
   * Lebensbalken über einem Gegner (key = Gegnerobjekt). frac < 0 entfernt ihn. `posture` ≥ 0: Haltungsleiste unter den Lebenspunkten
   * (Elite, Kommandanten, Endbosse); `broken` = Haltung gebrochen (die Leiste blinkt, Finisher möglich).
   */
  setBar(key: object, pos: Vector3 | null, frac: number, elite: boolean, _camera: Camera | null, label = '', anchor: Object3D | null = null, dy = 0, posture = -1, broken = false) {
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
      b = { el, fill: el.querySelector('.fill')!, lag: el.querySelector('.lag')!, post: null, postK: '', last: frac, pos: new Vector3(), anchor: null, dy: 0, tf: '' };
      b.lag.style.transform = `scaleX(${frac.toFixed(3)})`;
      this.bars.set(key, b);
    }
    if (posture >= 0) {
      if (!b.post) { b.post = document.createElement('i'); b.post.className = 'post'; b.el.appendChild(b.post); b.el.classList.add('postured'); }
      const pk = broken ? 'b' : posture.toFixed(2);
      if (pk !== b.postK) {
        b.postK = pk;
        b.post.style.transform = `scaleX(${broken ? 1 : Math.max(0, Math.min(1, posture)).toFixed(3)})`;
        b.el.classList.toggle('broken', broken);
      }
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
    if (!this.quietOn && this.bannerQ.length && performance.now() >= this.bannerUntil) { const [a, b] = this.bannerQ.shift()!; this.showBanner(a, b); }
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
    if (this.finOn) {
      tmp.copy(this.finPos).project(camera);
      const on = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
      const tf = on ? `translate(${(((tmp.x + 1) / 2) * innerWidth).toFixed(1)}px, ${(((1 - tmp.y) / 2) * innerHeight).toFixed(1)}px) translate(-50%, -100%)` : '';
      if (tf !== this.finTf) { this.finTf = tf; this.finEl.hidden = !on; if (on) this.finEl.style.transform = tf; }
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      // Restzeit als schrumpfender Balken (transform, kein Layout)
      this.comboBar.style.transform = `scaleX(${clamp01(this.comboTimer / COMBO_TIME).toFixed(3)})`;
      if (this.comboTimer <= 0) { this.comboCount = 0; this.comboRank = 0; this.combo.hidden = true; this.combo.classList.remove('fin-on'); this.comboLabel.textContent = 'Treffer'; this.combo.dataset.rank = '0'; }
    }
  }
}
