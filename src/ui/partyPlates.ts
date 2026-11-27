// Phase 4.9 – Namensschilder der Gruppenmitglieder: smaragd-türkise Plakette mit Klassen-Emblem, Name und „Stufe · Rolle“ über dem Kopf bzw.
// über dem Masttopp ihres Schiffs. Vier Plaketten vorab; je Bild nur Lage, Maßstab und Sichtbarkeit (Texte nur bei Änderungen, als textContent).
import { Vector3, type Camera } from 'three';
import { PARTY_MARK, plateScale } from '../data/partyMarks';
import type { PartyMarkView } from '../world/partyMarkers';

interface Plate { el: HTMLElement; em: HTMLElement; name: HTMLElement; line: HTMLElement; shown: boolean; id: string }

const _p = new Vector3();

export class PartyPlates {
  readonly root: HTMLElement;
  private readonly plates: Plate[] = [];
  /** Zahlen für Prüfungen: gerade sichtbare Plaketten */
  shown = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'pplates';
    parent.appendChild(this.root);
    for (let i = 0; i < PARTY_MARK.max; i++) {
      const el = document.createElement('div');
      el.className = 'pplate';
      el.style.display = 'none';
      const em = document.createElement('i');
      em.className = 'pplate-em';
      const tx = document.createElement('span');
      tx.className = 'pplate-tx';
      const name = document.createElement('b');
      const line = document.createElement('small');
      tx.append(name, line);
      el.append(em, tx);
      this.root.appendChild(el);
      this.plates.push({ el, em, name, line, shown: false, id: '' });
    }
  }

  /** Je Bild: Ansichten aus `PartyMarkers` auf den Bildschirm legen (null-Kamera oder count 0 = alle aus) */
  update(views: readonly PartyMarkView[], count: number, camera: Camera | null) {
    let shown = 0;
    for (let i = 0; i < this.plates.length; i++) {
      const pl = this.plates[i];
      const v = i < count ? views[i] : null;
      let on = !!v && !!camera && v.dist < PARTY_MARK.plateFar;
      if (on && v && camera) {
        _p.set(v.x, v.y, v.z).project(camera);
        on = _p.z < 1 && Math.abs(_p.x) < 1.05 && Math.abs(_p.y) < 1.05;
        if (on) {
          if (pl.id !== v.id) pl.id = v.id;
          if (pl.name.textContent !== v.name) pl.name.textContent = v.name;
          if (pl.line.textContent !== v.line) pl.line.textContent = v.line;
          if (pl.em.textContent !== v.emblem) pl.em.textContent = v.emblem;
          const k = plateScale(v.dist);
          pl.el.style.transform = `translate(${(((_p.x + 1) / 2) * innerWidth).toFixed(1)}px, ${(((1 - _p.y) / 2) * innerHeight).toFixed(1)}px) translate(-50%, -100%) scale(${k.toFixed(2)})`;
          pl.el.dataset.dom = v.dom;
          shown++;
        }
      }
      if (on !== pl.shown) { pl.shown = on; pl.el.style.display = on ? '' : 'none'; }
    }
    this.shown = shown;
  }

  clear() { this.update([], 0, null); }
}
