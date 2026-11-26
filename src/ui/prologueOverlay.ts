// Phase 4.7A – Anzeige des Gewitter-Prologs und der Einführung: Titelkarte, Untertitel (Sprecher + Zeile), Banner der sieben Admirale,
// Schwarzblende (Sturz über Bord, Herzschlag), dezente Schaltfläche „Prolog überspringen“ mit Rückfrage und die Lehrtafel der Einführung
// (Schiffs-HUD: Segel, Rumpf, Breitseiten, Crew-Moral). Eine Wurzel unter `#ui`, die Zeiger durchlässt – nur die Knöpfe fangen sie ab.
import { LINE_HOLD } from '../data/prologue';

export interface CoachStep { title: string; text: string }

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class PrologueOverlay {
  private readonly root: HTMLDivElement;
  private readonly fade: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly subEl: HTMLDivElement;
  private readonly bannerEl: HTMLDivElement;
  private readonly skipWrap: HTMLDivElement;
  private readonly coachEl: HTMLDivElement;
  private subT = 0;
  private bannerT = 0;
  private titleT = 0;
  private fadeShown = -1;
  private coachSteps: CoachStep[] = [];
  private coachI = 0;
  private coachT = 0;
  /** „Prolog überspringen“: nur den Prolog (weiter am Strand) oder Prolog und Einführung (gleich in die offene Welt) */
  onSkip: (all: boolean) => void = () => {};
  /** Lehrtafel fertig gelesen */
  onCoachDone: () => void = () => {};

  constructor(parent: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'prologue';
    root.hidden = true;
    root.innerHTML = `
      <div class="pro-fade"></div>
      <div class="pro-title"><p class="pro-kicker">Prolog</p><h1 class="fell">Sturmkrone</h1><p class="pro-tag">Die Nacht der sieben Admirale</p></div>
      <div class="pro-banner"><b></b><span></span></div>
      <div class="pro-sub"><b></b><span></span></div>
      <div class="pro-coach" hidden><p class="pro-coach-k">Schiffstafel</p><h3></h3><p class="pro-coach-t"></p><div class="pro-coach-row"><span class="pro-dots"></span><button class="mini brass" data-a="next">Weiter</button></div></div>
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
    this.fade = root.querySelector('.pro-fade') as HTMLDivElement;
    this.titleEl = root.querySelector('.pro-title') as HTMLDivElement;
    this.subEl = root.querySelector('.pro-sub') as HTMLDivElement;
    this.bannerEl = root.querySelector('.pro-banner') as HTMLDivElement;
    this.skipWrap = root.querySelector('.pro-skip') as HTMLDivElement;
    this.coachEl = root.querySelector('.pro-coach') as HTMLDivElement;
    const ask = root.querySelector('.pro-skip-ask') as HTMLDivElement;
    const btn = root.querySelector('.pro-skip-btn') as HTMLButtonElement;
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
      this.blackout(0);
      this.subT = this.bannerT = this.titleT = 0;
      this.subEl.classList.remove('on'); this.bannerEl.classList.remove('on'); this.titleEl.classList.remove('on');
      this.skip(false);
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

  /** Zeile: Titelkarte (`title`) oder Untertitel mit Sprecher */
  line(who: string, text: string, title = false) {
    if (title) {
      (this.titleEl.querySelector('.pro-tag') as HTMLElement).textContent = text;
      this.titleEl.classList.add('on');
      this.titleT = 4.6;
      return;
    }
    (this.subEl.querySelector('b') as HTMLElement).textContent = who;
    (this.subEl.querySelector('span') as HTMLElement).textContent = text;
    this.subEl.classList.toggle('narr', !who);
    this.subEl.classList.add('on');
    this.subT = LINE_HOLD + Math.min(2.4, text.length * 0.025);
  }

  /** Banner (Admirale, Vereintes Urteil) */
  banner(title: string, sub: string) {
    (this.bannerEl.querySelector('b') as HTMLElement).textContent = title;
    (this.bannerEl.querySelector('span') as HTMLElement).textContent = sub;
    this.bannerEl.classList.remove('on');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('on');
    this.bannerT = 2.6;
  }

  /** Schwarzblende 0 … 1 */
  blackout(k: number) {
    const v = Math.round(Math.max(0, Math.min(1, k)) * 100) / 100;
    if (v === this.fadeShown) return;
    this.fadeShown = v;
    this.fade.style.opacity = String(v);
    this.fade.hidden = v === 0;
  }

  /** Lehrtafel: Schritte nacheinander (Weiter oder nach 9 s von selbst) */
  coach(steps: CoachStep[]) {
    this.coachSteps = steps;
    this.coachI = 0;
    this.root.hidden = false;
    this.showCoach();
  }
  get coaching(): boolean { return this.coachSteps.length > 0; }

  private showCoach() {
    const st = this.coachSteps[this.coachI];
    if (!st) { this.coachSteps = []; this.coachEl.hidden = true; this.onCoachDone(); return; }
    this.coachEl.hidden = false;
    (this.coachEl.querySelector('h3') as HTMLElement).textContent = st.title;
    (this.coachEl.querySelector('.pro-coach-t') as HTMLElement).textContent = st.text;
    (this.coachEl.querySelector('.pro-dots') as HTMLElement).innerHTML = this.coachSteps.map((_, i) => `<i class="${i === this.coachI ? 'on' : ''}"></i>`).join('');
    (this.coachEl.querySelector('button') as HTMLButtonElement).textContent = this.coachI === this.coachSteps.length - 1 ? 'Verstanden' : 'Weiter';
    this.coachT = 9;
  }

  private nextCoach() {
    if (!this.coachSteps.length) return;
    this.coachI++;
    this.showCoach();
  }

  /** Zeitgeber (Echtzeit je Bild) */
  update(dt: number) {
    if (this.titleT > 0) { this.titleT -= dt; if (this.titleT <= 0) this.titleEl.classList.remove('on'); }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.subEl.classList.remove('on'); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerEl.classList.remove('on'); }
    if (this.coachSteps.length) { this.coachT -= dt; if (this.coachT <= 0) this.nextCoach(); }
  }

  /** Text der Titelkarte und des Untertitels (Prüfungen) */
  get debug() {
    return {
      title: this.titleEl.classList.contains('on') ? esc(this.titleEl.textContent ?? '') : '',
      sub: this.subEl.classList.contains('on') ? this.subEl.textContent ?? '' : '',
      banner: this.bannerEl.classList.contains('on') ? this.bannerEl.textContent ?? '' : '',
      fade: this.fadeShown,
      coach: this.coachSteps[this.coachI]?.title ?? '',
    };
  }
}
