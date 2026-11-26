// Phase 4.7D – Anzeige der 7-Szenen-Kino-Inszenierung und der Einführung:
//  - Pre-Warm-Ladescreen (animierter Kompass, Meereswellen, Fortschrittsbalken), solange Texturen, Shader, Modelle und Musik vorbereitet werden
//  - 21:9-Kinobalken (Letterbox), die weich ins Bild gleiten und in der Deck-Szene zurückfahren
//  - Kino-Untertitel: Erzählung (mittig, kursiv), Rufe (groß, mit Stoß), Wort für Wort („… dem Tod geweiht!“)
//  - Schwarzblende, Lider und Unschärfe der Ego-Sicht am Strand, Ziel-Hinweis der Deck-Szene, Admirals-/Urteils-Banner
//  - dezente Schaltfläche „Prolog überspringen“ mit Rückfrage und die Lehrtafeln der Einführung
// Eine Wurzel unter `#ui`, die Zeiger durchlässt – nur die Knöpfe fangen sie ab.
import type { PrologueLine } from '../data/prologue';

export interface CoachStep { title: string; text: string }

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Ladestatus je Fortschritt (deutsch, im Sturmkrone-Ton) */
const LOAD_STEPS: readonly [number, string][] = [
  [0, 'Die Segel werden gesetzt …'], [0.12, 'Grünmarkt erwacht im Abendlicht …'], [0.3, 'Die Schwarze Krone läuft aus …'],
  [0.46, 'Die sieben Admirale sammeln ihre Flotte …'], [0.62, 'Shader werden geschmiedet …'], [0.78, 'Das Orchester stimmt sich ein …'],
  [0.92, 'Der Sturm zieht auf …'],
];

export class PrologueOverlay {
  private readonly root: HTMLDivElement;
  private readonly fade: HTMLDivElement;
  private readonly bars: HTMLDivElement;
  private readonly lids: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly subEl: HTMLDivElement;
  private readonly bannerEl: HTMLDivElement;
  private readonly goalEl: HTMLDivElement;
  private readonly skipWrap: HTMLDivElement;
  private readonly coachEl: HTMLDivElement;
  private readonly loadEl: HTMLDivElement;
  private readonly loadBar: HTMLElement;
  private readonly loadText: HTMLElement;
  private readonly canvas: HTMLElement | null;
  private subT = 0;
  private bannerT = 0;
  private titleT = 0;
  private goalT = 0;
  private fadeShown = -1;
  private barsShown = -1;
  private lidsShown = -1;
  private blurShown = -1;
  private loadShown = -1;
  private coachSteps: CoachStep[] = [];
  private coachKicker = 'Schiffstafel';
  private coachI = 0;
  private coachT = 0;
  /** Wort-für-Wort-Zeile: Zeiten und Elemente */
  private words: { el: HTMLElement; at: number }[] = [];
  private wordT = 0;
  /** „Prolog überspringen“: nur den Prolog (weiter am Strand) oder Prolog und Einführung (gleich in die offene Welt) */
  onSkip: (all: boolean) => void = () => {};
  /** Lehrtafel fertig gelesen */
  onCoachDone: () => void = () => {};

  constructor(parent: HTMLElement, canvas: HTMLElement | null = null) {
    this.canvas = canvas;
    const root = document.createElement('div');
    root.className = 'prologue';
    root.hidden = true;
    root.innerHTML = `
      <div class="pro-bars"><i></i><i></i></div>
      <div class="pro-lids"><i></i><i></i></div>
      <div class="pro-fade"></div>
      <div class="pro-title"><p class="pro-kicker">Prolog</p><h1 class="fell">Sturmkrone</h1><p class="pro-tag"></p></div>
      <div class="pro-banner"><b></b><span></span></div>
      <div class="pro-sub"><b></b><span class="pro-text"></span></div>
      <div class="pro-goal"></div>
      <div class="pro-coach" hidden><p class="pro-coach-k">Schiffstafel</p><h3></h3><p class="pro-coach-t"></p><div class="pro-coach-row"><span class="pro-dots"></span><button class="mini brass" data-a="next">Weiter</button></div></div>
      <div class="pro-load" hidden>
        <div class="pro-load-sky"></div>
        <svg class="pro-compass" viewBox="-60 -60 120 120" aria-hidden="true">
          <circle r="54" class="cr"/><circle r="47" class="cr2"/>
          ${Array.from({ length: 32 }, (_, i) => { const a = (i / 32) * Math.PI * 2, r0 = i % 8 === 0 ? 38 : i % 4 === 0 ? 42 : 45; return `<line x1="${(Math.sin(a) * r0).toFixed(1)}" y1="${(-Math.cos(a) * r0).toFixed(1)}" x2="${(Math.sin(a) * 47).toFixed(1)}" y2="${(-Math.cos(a) * 47).toFixed(1)}"/>`; }).join('')}
          <g class="rose"><path d="M0 -36 L6 -6 L0 0 L-6 -6Z" class="n"/><path d="M0 36 L6 6 L0 0 L-6 6Z"/><path d="M-36 0 L-6 -6 L0 0 L-6 6Z"/><path d="M36 0 L6 -6 L0 0 L6 6Z"/></g>
          <g class="needle"><path d="M0 -40 L4 0 L0 6 L-4 0Z" class="nn"/><path d="M0 40 L4 0 L0 -6 L-4 0Z" class="ns"/><circle r="3.4" class="hub"/></g>
          <text y="-50" class="cl">N</text>
        </svg>
        <p class="pro-load-k">Prolog</p>
        <h2 class="fell">Die Schwarze Krone</h2>
        <div class="pro-load-bar"><i></i></div>
        <p class="pro-load-t"></p>
        <svg class="pro-waves" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
          <path class="w1" d="M0 70 Q75 40 150 70 T300 70 T450 70 T600 70 T750 70 T900 70 T1050 70 T1200 70 T1350 70 T1500 70 V120 H0Z"/>
          <path class="w2" d="M0 82 Q100 58 200 82 T400 82 T600 82 T800 82 T1000 82 T1200 82 T1400 82 T1600 82 V120 H0Z"/>
          <path class="w3" d="M0 96 Q60 80 120 96 T240 96 T360 96 T480 96 T600 96 T720 96 T840 96 T960 96 T1080 96 T1200 96 T1320 96 V120 H0Z"/>
        </svg>
      </div>
      <div class="pro-skip" hidden>
        <button class="pro-skip-btn" data-a="skip">Prolog überspringen</button>
        <div class="pro-skip-ask" hidden>
          <p>Überspringen?</p>
          <button class="mini brass" data-a="only">Nur den Prolog</button>
          <button class="mini" data-a="all">Prolog und Einführung</button>
          <button class="mini" data-a="cancel">Weiter ansehen</button>
        </div>
      </div>`;
    parent.appendChild(root);
    this.root = root;
    const q = <T extends Element>(s: string) => root.querySelector(s) as unknown as T;
    this.fade = q('.pro-fade');
    this.bars = q('.pro-bars');
    this.lids = q('.pro-lids');
    this.titleEl = q('.pro-title');
    this.subEl = q('.pro-sub');
    this.bannerEl = q('.pro-banner');
    this.goalEl = q('.pro-goal');
    this.skipWrap = q('.pro-skip');
    this.coachEl = q('.pro-coach');
    this.loadEl = q('.pro-load');
    this.loadBar = q('.pro-load-bar i');
    this.loadText = q('.pro-load-t');
    const ask = q<HTMLDivElement>('.pro-skip-ask');
    const btn = q<HTMLButtonElement>('.pro-skip-btn');
    root.addEventListener('click', (ev) => {
      const a = (ev.target as HTMLElement).closest('button')?.getAttribute('data-a');
      if (!a) return;
      ev.stopPropagation();
      if (a === 'skip') { ask.hidden = false; btn.hidden = true; return; }
      if (a === 'cancel') { ask.hidden = true; btn.hidden = false; return; }
      if (a === 'only' || a === 'all') { ask.hidden = true; btn.hidden = false; this.onSkip(a === 'all'); return; }
      if (a === 'next') this.nextCoach();
    });
    // Klicks und Tipps auf die Knöpfe gehören nicht dem Spiel (kein Angriff, keine Zielwahl darunter)
    root.addEventListener('pointerdown', (ev) => { if ((ev.target as HTMLElement).closest('button')) ev.stopPropagation(); });
  }

  /** Prolog-Ebene an/aus (aus = alles zurückgesetzt) */
  show(on: boolean) {
    this.root.hidden = !on && !this.coachSteps.length;
    if (!on) {
      this.blackout(0); this.letterbox(0); this.eyelids(0); this.blur(0); this.loading(-1);
      this.subT = this.bannerT = this.titleT = this.goalT = 0;
      this.words = [];
      this.subEl.classList.remove('on'); this.bannerEl.classList.remove('on'); this.titleEl.classList.remove('on'); this.goalEl.classList.remove('on');
      this.skip(false);
      this.setPlay(false);
    }
  }

  private playOn = false;
  /** Spielbare Phase (Deck): Untertitel oben statt über den Fähigkeiten- und Befehlsleisten */
  setPlay(on: boolean) {
    if (on === this.playOn) return;
    this.playOn = on;
    this.root.classList.toggle('play', on);
  }

  /** Schaltfläche „Prolog überspringen“ zeigen */
  skip(on: boolean) {
    this.skipWrap.hidden = !on;
    (this.root.querySelector('.pro-skip-ask') as HTMLDivElement).hidden = true;
    (this.root.querySelector('.pro-skip-btn') as HTMLButtonElement).hidden = false;
  }
  get skipShown(): boolean { return !this.skipWrap.hidden; }

  /** Pre-Warm-Ladescreen: Fortschritt 0 … 1; −1 = aus */
  loading(k: number) {
    const v = k < 0 ? -1 : Math.round(Math.max(0, Math.min(1, k)) * 100) / 100;
    if (v === this.loadShown) return;
    this.loadShown = v;
    this.loadEl.hidden = v < 0;
    this.root.classList.toggle('loading', v >= 0);
    if (v < 0) return;
    this.root.hidden = false;
    this.loadBar.style.transform = `scaleX(${Math.max(0.02, v)})`;
    let label = LOAD_STEPS[0][1];
    for (const [at, t] of LOAD_STEPS) if (v >= at) label = t;
    if (this.loadText.textContent !== label) this.loadText.textContent = label;
  }
  get loadingShown(): boolean { return this.loadShown >= 0; }

  /** 21:9-Kinobalken (0 … 1) */
  letterbox(k: number) {
    const v = Math.round(Math.max(0, Math.min(1, k)) * 200) / 200;
    if (v === this.barsShown) return;
    this.barsShown = v;
    this.bars.style.setProperty('--lb', String(v));
    this.bars.classList.toggle('on', v > 0);
  }

  /** Lider der Ego-Sicht: 0 offen … 1 geschlossen */
  eyelids(k: number) {
    const v = Math.round(Math.max(0, Math.min(1, k)) * 100) / 100;
    if (v === this.lidsShown) return;
    this.lidsShown = v;
    this.lids.style.setProperty('--lid', String(v));
    this.lids.classList.toggle('on', v > 0);
  }

  /** Unschärfe des Bildes (px; benommenes Erwachen) – als Filter direkt auf dem Spiel-Canvas */
  blur(px: number) {
    const v = Math.round(Math.max(0, px) * 4) / 4;
    if (v === this.blurShown) return;
    this.blurShown = v;
    if (this.canvas) this.canvas.style.filter = v > 0 ? `blur(${v}px) brightness(${(1 + v * 0.03).toFixed(2)})` : '';
  }

  /** Zeile: Untertitel mit Sprecher; Erzählung, Ruf oder Wort für Wort */
  line(l: PrologueLine) {
    const who = this.subEl.querySelector('b') as HTMLElement;
    const span = this.subEl.querySelector('.pro-text') as HTMLElement;
    who.textContent = l.who;
    this.subEl.classList.toggle('narr', !!l.narr);
    this.subEl.classList.toggle('shout', !!l.shout);
    this.words = [];
    if (l.words?.length) {
      span.innerHTML = l.words.map(([w]) => `<i class="w">${esc(w)}</i>`).join(' ');
      const els = [...span.querySelectorAll('.w')] as HTMLElement[];
      this.words = els.map((el, i) => ({ el, at: l.words![i][1] }));
      this.wordT = 0;
      this.stepWords(0);
    } else span.textContent = l.text;
    this.subEl.classList.remove('on');
    void this.subEl.offsetWidth;
    this.subEl.classList.add('on');
    this.subT = l.hold;
  }

  private stepWords(dt: number) {
    if (!this.words.length) return;
    this.wordT += dt;
    for (const w of this.words) if (this.wordT >= w.at && !w.el.classList.contains('on')) w.el.classList.add('on');
  }

  /** Banner (Vereintes Admirals-Urteil, Ankerglück) */
  banner(title: string, sub: string) {
    (this.bannerEl.querySelector('b') as HTMLElement).textContent = title;
    (this.bannerEl.querySelector('span') as HTMLElement).textContent = sub;
    this.bannerEl.classList.remove('on');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('on');
    this.bannerT = 2.8;
  }

  /** Ziel-Hinweis der Deck-Szene („Lauf zu deiner Kanone …“); leer = aus */
  goal(text: string, hold = 8) {
    this.goalEl.textContent = text;
    this.goalEl.classList.toggle('on', !!text);
    this.goalT = text ? hold : 0;
  }

  /** Titelkarte (kurz, z. B. Ankerglück) */
  title(tag: string) {
    (this.titleEl.querySelector('.pro-tag') as HTMLElement).textContent = tag;
    this.titleEl.classList.add('on');
    this.titleT = 4.2;
  }

  /** Schwarzblende 0 … 1 */
  blackout(k: number) {
    const v = Math.round(Math.max(0, Math.min(1, k)) * 100) / 100;
    if (v === this.fadeShown) return;
    this.fadeShown = v;
    this.fade.style.opacity = String(v);
    this.fade.hidden = v === 0;
  }

  /** Lehrtafel: Schritte nacheinander (Weiter oder nach 10 s von selbst); `kicker` = Überschrift (Schiffstafel, Waffenmeister …) */
  coach(steps: CoachStep[], kicker = 'Schiffstafel') {
    this.coachSteps = steps;
    this.coachKicker = kicker;
    this.coachI = 0;
    this.root.hidden = false;
    this.showCoach();
  }
  get coaching(): boolean { return this.coachSteps.length > 0; }

  private showCoach() {
    const st = this.coachSteps[this.coachI];
    if (!st) { this.coachSteps = []; this.coachEl.hidden = true; this.onCoachDone(); return; }
    this.coachEl.hidden = false;
    (this.coachEl.querySelector('.pro-coach-k') as HTMLElement).textContent = this.coachKicker;
    (this.coachEl.querySelector('h3') as HTMLElement).textContent = st.title;
    (this.coachEl.querySelector('.pro-coach-t') as HTMLElement).textContent = st.text;
    (this.coachEl.querySelector('.pro-dots') as HTMLElement).innerHTML = this.coachSteps.map((_, i) => `<i class="${i === this.coachI ? 'on' : ''}"></i>`).join('');
    (this.coachEl.querySelector('button') as HTMLButtonElement).textContent = this.coachI === this.coachSteps.length - 1 ? 'Verstanden' : 'Weiter';
    this.coachT = 10;
  }

  private nextCoach() {
    if (!this.coachSteps.length) return;
    this.coachI++;
    this.showCoach();
  }

  /** Zeitgeber (Echtzeit je Bild) */
  update(dt: number) {
    if (this.titleT > 0) { this.titleT -= dt; if (this.titleT <= 0) this.titleEl.classList.remove('on'); }
    if (this.subT > 0) { this.subT -= dt; this.stepWords(dt); if (this.subT <= 0) this.subEl.classList.remove('on'); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerEl.classList.remove('on'); }
    if (this.goalT > 0) { this.goalT -= dt; if (this.goalT <= 0) this.goalEl.classList.remove('on'); }
    if (this.coachSteps.length) { this.coachT -= dt; if (this.coachT <= 0) this.nextCoach(); }
  }

  /** Zustand der Anzeige (Prüfungen) */
  get debug() {
    return {
      title: this.titleEl.classList.contains('on') ? esc(this.titleEl.textContent ?? '') : '',
      sub: this.subEl.classList.contains('on') ? (this.subEl.querySelector('.pro-text')?.textContent ?? '') : '',
      who: this.subEl.classList.contains('on') ? (this.subEl.querySelector('b')?.textContent ?? '') : '',
      words: this.words.filter((w) => w.el.classList.contains('on')).map((w) => w.el.textContent ?? ''),
      banner: this.bannerEl.classList.contains('on') ? this.bannerEl.textContent ?? '' : '',
      goal: this.goalEl.classList.contains('on') ? this.goalEl.textContent ?? '' : '',
      fade: this.fadeShown,
      bars: this.barsShown,
      lids: this.lidsShown,
      blur: this.blurShown,
      loading: this.loadShown,
      coach: this.coachSteps[this.coachI]?.title ?? '',
    };
  }
}
