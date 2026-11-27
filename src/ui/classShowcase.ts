// Phase 4.7D.1 – Stufe C: Vollbild-Showcase aller Klassen und Pfade. Links die Auswahl (Faustkämpfer, Schwertkämpfer, Faji-Wirker mit ihren
// Pfaden), in der Mitte das Live-3D-Vorschaufenster (`world/showcaseStage.ts`: Kombo, Formen, Level-60-Ultimate in drei Akten), rechts
// Rolle, „Worin diese Klasse glänzt“, alle zehn Formen und das Ultimate. „Abenteuer starten“ beginnt den 7-Szenen-Prolog.
import { SHOWCASE_GROUPS, showcaseOf } from '../data/classShowcase';
import type { SpecId } from '../data/classes';
import { ACT_LABEL, CINE_ACTS } from '../graphics/ultimateCinematics';
import { roleBadge } from './classScreen';
import { esc } from './dom';
import type { ShowcasePhase } from '../world/showcaseStage';

/** Kurznamen der drei Akte für die Leiste im Vorschaufenster */
const ACT_SHORT = ['Aufladung', 'Aufbau', 'Einschlag'] as const;

export interface ShowcaseOptions {
  initial: SpecId;
  name: string;
  onSelect: (spec: SpecId) => void;
  onPlay: (kind: 'form' | 'ult' | 'combo', slot?: number) => void;
  /** Fenster der 3D-Vorschau (CSS-Pixel), bei jeder Größenänderung */
  onWindow: (r: { x: number; y: number; w: number; h: number }) => void;
  onBack: () => void;
  onStart: (spec: SpecId) => void;
  /** 4.9: Vorschau an Land bzw. auf See */
  onSea?: (sea: boolean) => void;
}

export class ClassShowcase {
  readonly root: HTMLElement;
  private spec: SpecId;
  private readonly ro: ResizeObserver | null;
  private readonly onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); this.o.onBack(); } };
  private readonly onResize = () => this.measure();

  constructor(parent: HTMLElement, private o: ShowcaseOptions) {
    this.spec = o.initial;
    this.root = document.createElement('div');
    this.root.className = 'showcase';
    this.root.innerHTML = `
      <div class="sc-top"><button class="mini" data-a="back">◀ Zurück zum Aussehen</button><span class="sc-step">Schritt 3 von 3 · Klasse, Formen &amp; Ultimate</span></div>
      <nav class="sc-list card" aria-label="Klassen und Pfade">${SHOWCASE_GROUPS.map((g) => `
        <div class="sc-group"><h3><span class="ic">${g.icon}</span>${esc(g.label)}</h3>
          <div class="sc-specs">${g.specs.map((id) => { const e = showcaseOf(id); return `<button class="sc-spec" data-spec="${id}" style="--cc:${e.color};--ca:${e.accent}" aria-pressed="${id === this.spec}"><span class="cr">${esc(e.crest)}</span><span class="tx"><b>${esc(e.label)}</b><small>${esc(e.role)}</small></span></button>`; }).join('')}</div>
        </div>`).join('')}
      </nav>
      <section class="sc-stage" aria-label="Vorschau">
        <div class="sc-window"></div>
        <div class="sc-part" aria-live="polite"><b></b><ol class="sc-acts">${CINE_ACTS.map((a, i) => `<li data-act="${i}" title="${esc(ACT_LABEL[a])}">Akt ${i + 1} · ${ACT_SHORT[i]}</li>`).join('')}</ol></div>
        <div class="sc-play"><button class="mini sc-sea" data-a="sea" aria-pressed="false" title="Formen und Ultimate an Land oder auf See ansehen">Vorschau: An Land</button><button class="mini" data-a="combo">▶ Kombo</button><button class="mini brass" data-a="ult">✪ Ultimate ansehen</button></div>
      </section>
      <aside class="sc-info card"><div class="sc-body"></div>
        <div class="sc-foot"><button class="primary sc-start" data-a="start">Abenteuer starten ▶</button></div>
      </aside>`;
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const sp = t.closest<HTMLElement>('[data-spec]');
      if (sp) { this.select(sp.dataset.spec as SpecId); return; }
      const f = t.closest<HTMLElement>('[data-form]');
      if (f) { this.o.onPlay('form', +f.dataset.form!); return; }
      const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'back') this.o.onBack();
      else if (a === 'start') this.o.onStart(this.spec);
      else if (a === 'ult') this.o.onPlay('ult');
      else if (a === 'combo') this.o.onPlay('combo');
      else if (a === 'sea') this.toggleSea();
    });
    addEventListener('keydown', this.onKey);
    addEventListener('resize', this.onResize);
    this.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.measure()) : null;
    this.ro?.observe(this.root.querySelector('.sc-window')!);
    this.render();
    requestAnimationFrame(() => this.measure());
  }

  get selected(): SpecId { return this.spec; }

  /** 4.9: Vorschau an Land bzw. auf See (Knopf „Vorschau: An Land / Auf See“) */
  sea = false;
  toggleSea(on = !this.sea) {
    this.sea = on;
    const b = this.root.querySelector<HTMLElement>('[data-a="sea"]');
    if (b) { b.textContent = on ? 'Vorschau: Auf See' : 'Vorschau: An Land'; b.setAttribute('aria-pressed', String(on)); }
    this.o.onSea?.(on);
  }

  select(spec: SpecId) {
    if (spec === this.spec) return;
    this.spec = spec;
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-spec]')) b.setAttribute('aria-pressed', String(b.dataset.spec === spec));
    this.render();
    this.o.onSelect(spec);
  }

  /** Anzeige des laufenden Vorschau-Teils (Kombo, Form, Ultimate mit Akt) */
  part(phase: ShowcasePhase, label: string, act: number) {
    const p = this.root.querySelector<HTMLElement>('.sc-part')!;
    p.querySelector('b')!.textContent = label;
    p.classList.toggle('ult', phase === 'ult');
    p.classList.toggle('on', !!label);
    for (const li of p.querySelectorAll<HTMLElement>('[data-act]')) li.classList.toggle('on', phase === 'ult' && +li.dataset.act! === act);
    for (const f of this.root.querySelectorAll<HTMLElement>('[data-form]')) f.classList.toggle('live', phase === 'form' && label.startsWith(`Form ${f.dataset.roman}:`));
    this.root.querySelector('.sc-ult')?.classList.toggle('live', phase === 'ult');
  }

  private measure() {
    const w = this.root.querySelector<HTMLElement>('.sc-window');
    if (!w) return;
    const r = w.getBoundingClientRect();
    if (r.width > 4 && r.height > 4) this.o.onWindow({ x: r.left, y: r.top, w: r.width, h: r.height });
  }

  private render() {
    const e = showcaseOf(this.spec);
    this.root.style.setProperty('--cc', e.color);
    this.root.style.setProperty('--ca', e.accent);
    const body = this.root.querySelector<HTMLElement>('.sc-body')!;
    body.innerHTML = `
      <header class="sc-head"><span class="sc-crest">${esc(e.crest)}</span><div><small>${esc(e.baseLabel)}</small><h2>${esc(e.label)}</h2></div></header>
      <p class="sc-role">${roleBadge(e.role)} <span>${esc(e.roleInfo)}</span></p>
      <p class="sc-desc">${esc(e.desc)}</p>
      <h3>Worin diese Klasse glänzt</h3>
      <ul class="sc-strengths">${e.strengths.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      <h3>Alle 10 Formen <small class="soft">(frei über den Klassenbaum)</small></h3>
      <div class="sc-forms">${e.forms.map((f) => `<button class="sc-form" data-form="${f.nr}" data-roman="${f.roman}" title="Form ${f.roman} ansehen"><span class="rn">Form ${f.roman}</span><span class="ic">${esc(f.icon)}</span><b>${esc(f.label)}</b><small>${esc(f.desc)}</small></button>`).join('')}</div>
      <h3>Level-60-Ultimate</h3>
      <div class="sc-ult" style="--uc:${e.ultimate.color};--ua:${e.ultimate.accent}">
        <b>✪ ${esc(e.ultimate.label)}</b>
        <ol>${e.ultimate.beats.map((b, i) => `<li><em>${esc(ACT_LABEL[CINE_ACTS[i]])}</em> ${esc(b)}</li>`).join('')}</ol>
        <button class="mini brass" data-a="ult">▶ Vorschau abspielen</button>
      </div>
      <p class="sc-choice small soft">${esc(e.choice)} Kein Waffen- oder Stilwechsel: deine Klasse und ihr 60-Punkte-Klassenbaum begleiten dich das ganze Spiel.</p>`;
    body.scrollTop = 0;
    this.root.querySelector<HTMLElement>('.sc-start')!.textContent = `Abenteuer starten als ${e.baseLabel} ▶`;
  }

  dispose() {
    removeEventListener('keydown', this.onKey);
    removeEventListener('resize', this.onResize);
    this.ro?.disconnect();
    this.root.remove();
  }
}
