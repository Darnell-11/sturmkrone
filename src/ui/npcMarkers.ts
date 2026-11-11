import { Vector3, type Camera } from 'three';
import { esc } from './dom';

export interface NpcMark {
  id: string;
  name: string;
  /** Punkt über dem Kopf in Weltkoordinaten */
  pos: Vector3;
  /** '!' Auftrag zu vergeben, '?' Abgabe möglich, '' nichts */
  mark: '!' | '?' | '';
  /** Nah genug zum Sprechen: zeigt die Aufforderung mit Taste */
  near: boolean;
}

const tmp = new Vector3();

/**
 * Schwebende Anzeigen über Sprechenden: Auftragszeichen (!/?) für Bewohner in der Nähe und bei der Person, die man
 * gerade ansprechen kann, die Aufforderung „E · Sprechen“. Die Positionen werden bei jedem Bild in den Bildschirm projiziert.
 */
export class NpcMarkers {
  readonly root: HTMLElement;
  private pool = new Map<string, HTMLElement>();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'npcm';
    parent.appendChild(this.root);
  }

  update(marks: NpcMark[], camera: Camera | null, key: string) {
    const seen = new Set<string>();
    for (const m of marks) {
      let el = this.pool.get(m.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'npcm-item';
        this.root.appendChild(el);
        this.pool.set(m.id, el);
      }
      seen.add(m.id);
      const html = `${m.mark ? `<b class="npcm-mark ${m.mark === '?' ? 'ok' : ''}">${m.mark}</b>` : ''}${m.near ? `<span class="npcm-prompt"><kbd>${esc(key)}</kbd> Sprechen<small>${esc(m.name)}</small></span>` : ''}`;
      if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
      if (!camera) { el.style.display = 'none'; continue; }
      tmp.copy(m.pos).project(camera);
      const on = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      el.style.display = on ? '' : 'none';
      if (on) el.style.transform = `translate(${(((tmp.x + 1) / 2) * innerWidth).toFixed(1)}px, ${(((1 - tmp.y) / 2) * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (const [id, el] of this.pool) if (!seen.has(id)) { el.remove(); this.pool.delete(id); }
  }

  clear() { for (const el of this.pool.values()) el.remove(); this.pool.clear(); }
}
