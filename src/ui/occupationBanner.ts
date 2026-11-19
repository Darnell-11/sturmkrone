import type { OccupationView } from '../raid/occupation';
import { FACTIONS } from '../data/factions';
import { clockText, ingameDays } from '../raid/occupation';
import { esc } from './dom';

/**
 * Insel-Banner der Besatzung: erscheint oben in der Mitte, solange der Spieler nahe an einer besetzten Insel segelt oder eine
 * Rückeroberungs-Flotte anrückt. Zeigt den Countdown der Besatzung (aktive Spielzeit), im Endspurt die Warnung samt Flottenstärke.
 */
export class OccupationBanner {
  readonly el: HTMLElement;
  private last = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('aside');
    this.el.className = 'hud-occ panel';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  /** `near`: Entfernung zur Insel in Metern (für die Anzeige „in Sicht“) */
  update(v: OccupationView | null) {
    if (!v) { if (!this.el.hidden) { this.el.hidden = true; this.last = ''; } return; }
    const warn = v.phase === 'endgame' && v.counter === 'inbound';
    const f = FACTIONS[v.factionId];
    const html = warn
      ? `<div class="occ warn"><b>⚠ Rückeroberung! ${esc(f.name)} greift ${esc(v.name)} an</b><span>${v.fleetLeft > 0 ? `${v.fleetLeft} Kriegsschiffe` : 'Flotte'} · Besatzung endet in <b>${clockText(v.remaining)}</b></span><i>Versenke die Flotte, dann verlängert sich die Besatzung.</i></div>`
      : `<div class="occ"><b>⚑ ${esc(v.name)} – in deiner Hand</b><span>Noch <b>${clockText(v.remaining)}</b> · ≈ ${String(ingameDays(v.remaining)).replace('.', ',')} Ingame-Tage${v.conquestCount > 1 ? ` · ${v.conquestCount}. Eroberung` : ''}</span></div>`;
    if (html === this.last) return;
    this.last = html;
    this.el.innerHTML = html;
    this.el.hidden = false;
    this.el.classList.toggle('warn', warn);
  }
}
