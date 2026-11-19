import type { RaidView } from '../raid/raidDirector';
import { esc } from './dom';
import { gaugeHtml } from './components';

const PHASE_LABEL: Record<RaidView['phase'], string> = { briefing: 'Vorbereitung', sea: 'Phase 1 · Seeschlacht', assault: 'Phase 2 · Sturm auf die Burg', victory: 'Sieg!', retreat: 'Rückzug' };

/**
 * Anzeige der Belagerung links am Bildrand: Titel und Phase, die Ziele der gewählten Route, Lebenspunkte der Mauern (Route A), Viertel (Route B) und
 * ein Hinweis, was jetzt zu tun ist. Zeichnet nur bei Änderung neu und fasst keine Spielzustände an: sie liest die Anzeige-Daten (`RaidView`).
 */
export class RaidPanel {
  readonly el: HTMLElement;
  private last = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('aside');
    this.el.className = 'hud-raid panel';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  update(v: RaidView | null) {
    if (!v) { this.el.hidden = true; this.last = ''; return; }
    const html = `
      <h3 class="fell">${esc(v.title)}</h3>
      <p class="rp-phase">${esc(PHASE_LABEL[v.phase])}${v.route ? ` · Route ${v.route}` : ''}${v.participants > 1 ? ` · ${v.participants} Spieler` : ''}</p>
      <p class="rp-hint">${esc(v.hint)}</p>
      <ul class="rp-obj">${v.objectives.map((o) => `<li class="${o.done ? 'done' : ''}"><span>${o.done ? '✓' : '◇'}</span> ${esc(o.label)}${o.required > 1 ? ` <b>${o.progress}/${o.required}</b>` : ''}</li>`).join('')}</ul>
      ${v.structures.length ? `<div class="rp-struct">${v.structures.map((s) => `<div class="rp-row ${s.state.toLowerCase()}"><span>${esc(s.label)}</span>${gaugeHtml(s.frac)}</div>`).join('')}</div>` : ''}
      ${v.districts.length ? `<ol class="rp-dist">${v.districts.map((d) => `<li class="${d.state}">${esc(d.label)}${d.state === 'aktiv' ? ` <b>${d.fallen}/${d.total}</b>` : d.state === 'erobert' ? ' ✓' : ''}</li>`).join('')}</ol>` : ''}
      ${v.boss ? `<div class="rp-boss"><b>☠ ${esc(v.boss.name)}</b> · Phase ${v.boss.phase}/2${v.boss.threat.length ? `<div class="rp-threat">Bedrohung: ${v.boss.threat.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}</div>` : ''}
      ${v.captains.length ? `<ul class="rp-cap">${v.captains.map((c) => `<li><span>⚔ ${esc(c.name)}</span> <i>${esc(c.aura)}</i>${gaugeHtml(c.frac)}</li>`).join('')}</ul>` : ''}`;
    if (html === this.last) return;
    this.last = html;
    this.el.innerHTML = html;
    this.el.hidden = false;
  }
}
