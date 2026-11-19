import type { SectorLabel } from '../data/regions';
import { esc } from './dom';

/** Wie lange die Einblendung steht (Sekunden) */
const SHOW_FOR = 6;
/** Mindestabstand zwischen zwei reinen Titel-Einblendungen (Sekunden) */
const TRACK_GAP = 45;

/**
 * Dezente nautische Einblendung oben in der Mitte: beim Segeln in einen neuen Sektor erscheinen Fahne, Name und Beiname der Macht,
 * dazu der Titel des laufenden Musikstücks (`audio.currentTrackTitle`). Wechselt nur das Stück, erscheint der Titel allein –
 * höchstens alle 45 Sekunden, damit sie nie nervt. Aus den Einstellungen abschaltbar (`enabled`).
 */
export class SectorBanner {
  readonly el: HTMLElement;
  enabled = true;
  private key = '';
  private trackTitle: string | null = null;
  private hideAt = 0;
  private lastTrackShow = -1e9;
  private now = () => performance.now() / 1000;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud-sector';
    this.el.setAttribute('role', 'status');
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  /** Jedes Bild: der Sektor unter dem Schiff (null: zu Fuß, im Menü oder in einer Belagerung – nichts Neues zeigen) */
  update(sector: SectorLabel | null) {
    const t = this.now();
    if (!sector) { this.key = ''; }
    else if (sector.key !== this.key) {
      const first = this.key === '';
      this.key = sector.key;
      // der erste Sektor nach dem Laden (oder nach einem Landgang) ist keine „neue“ Grenze: ohne Einblendung merken
      if (!first && this.enabled) this.show(sector, t);
      else if (first) this.lastSector = sector;
    }
    if (this.hideAt && t >= this.hideAt) { this.hideAt = 0; this.el.classList.remove('on'); window.setTimeout(() => { if (!this.hideAt) this.el.hidden = true; }, 600); }
  }

  private lastSector: SectorLabel | null = null;

  /** Das laufende Musikstück hat gewechselt (null: keine Dateimusik) */
  setTrack(title: string | null, canShow = true) {
    if (title === this.trackTitle) return;
    this.trackTitle = title;
    const t = this.now();
    if (this.hideAt && this.lastSector) { this.render(this.lastSector); return; }
    if (this.enabled && canShow && title && this.lastSector && t - this.lastTrackShow > TRACK_GAP) this.show(this.lastSector, t, true);
  }

  private show(s: SectorLabel, t: number, trackOnly = false) {
    this.lastSector = s;
    if (trackOnly) this.lastTrackShow = t;
    this.render(s, trackOnly);
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('on'));
    this.hideAt = t + SHOW_FOR;
  }

  private render(s: SectorLabel, trackOnly = false) {
    const track = this.trackTitle ? `<em class="track">♪ ${esc(this.trackTitle)}</em>` : '';
    this.el.style.setProperty('--c', s.color);
    this.el.innerHTML = trackOnly
      ? `<i class="flag"></i><div><span>${esc(s.name)}</span>${track}</div>`
      : `<i class="flag"></i><div><b>${esc(s.name)}</b><span>${esc(s.epithet)}</span>${track}</div>`;
  }

  /** Beim Verlassen der Seekarte (Landgang, Menü, Belagerung): beim nächsten Segeln nicht als Wechsel zählen */
  reset() { this.key = ''; this.hideAt = 0; this.el.classList.remove('on'); this.el.hidden = true; }
}
