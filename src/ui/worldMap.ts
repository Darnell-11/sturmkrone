import { REGIONS, type IslandDef, type IslandKind } from '../data/regions';
import { WORLD_RADIUS } from '../data/world';
import { drawWorldMap, screenToWorld, type WorldMapData, type WorldView } from './minimap';
import { esc } from './dom';

export interface WorldMapHost {
  data(): WorldMapData;
  close(): void;
  /** Logbuch (Aufträge, Taten) öffnen */
  logbook(): void;
}

const KIND_LABEL: Record<IslandKind, string> = {
  town: 'Stadt', harbor: 'Hafen', camp: 'Feindliches Lager', ruin: 'Ruine', quiet: 'Ruhige Insel', treasure: 'Schatzinsel', lighthouse: 'Leuchtturm', boss: 'Boss-Insel',
};

const MIN_SCALE = 0.03;
const MAX_SCALE = 1.2;

/**
 * Weltkarte (Taste M) als Vollbild: den ganzen Archipel überblicken, ziehen, zoomen, Inseln anklicken.
 * Unbekannte Inseln erscheinen als „?“, entdeckte mit ihrer echten Form und ihrem Namen.
 */
export class WorldMapScreen {
  private root: HTMLElement;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private info: HTMLElement;
  private view: WorldView;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private sel: string | null = null;
  private dirty = true;
  private raf = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private moved = 0;
  private pinch = 0;
  private keyFn = (e: KeyboardEvent) => this.onKey(e);
  private resizeFn = () => this.resize();

  constructor(parent: HTMLElement, private h_: WorldMapHost) {
    this.root = document.createElement('div');
    this.root.className = 'wmap';
    this.root.innerHTML = `
      <canvas class="wmap-cv"></canvas>
      <div class="wmap-top">
        <h2 class="fell">Weltkarte</h2>
        <div class="wmap-regions"></div>
        <div class="wmap-tools">
          <button class="icon-btn" data-a="zoomin" aria-label="Hineinzoomen">＋</button>
          <button class="icon-btn" data-a="zoomout" aria-label="Herauszoomen">－</button>
          <button class="mini" data-a="me">Zu mir</button>
          <button class="mini" data-a="all">Alles</button>
          <button class="mini" data-a="log">Logbuch</button>
          <button class="icon-btn" data-a="close" aria-label="Schließen">✕</button>
        </div>
      </div>
      <div class="wmap-legend small"><span><i class="lg me"></i>Du</span><span><i class="lg q">!</i>Auftrag</span><span><i class="lg t">?</i>Abgabe</span><span><i class="lg b">☠</i>Boss</span><span><i class="lg e"></i>Feind</span><span><i class="lg s">★</i>Ziel</span><span><i class="lg x">✕</i>Schatz</span></div>
      <div class="wmap-info" hidden></div>
      <p class="wmap-hint small soft">Ziehen: Karte bewegen · Mausrad oder Zwei-Finger-Geste: zoomen · M oder Esc: schließen</p>`;
    parent.appendChild(this.root);
    this.cv = this.root.querySelector('.wmap-cv')!;
    this.ctx = this.cv.getContext('2d')!;
    this.info = this.root.querySelector('.wmap-info')!;
    const d = this.h_.data();
    this.root.querySelector('.wmap-regions')!.innerHTML = d.regions.map((r) => `<button class="mini" data-a="region" data-v="${r.id}" style="--c:${r.color}">${esc(r.name)}</button>`).join('');
    this.view = { cx: 0, cz: 0, scale: 0.1 };
    this.resize();
    this.fitAll();
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.cv.addEventListener('pointerdown', (e) => this.onDown(e));
    this.cv.addEventListener('pointermove', (e) => this.onMove(e));
    this.cv.addEventListener('pointerup', (e) => this.onUp(e));
    this.cv.addEventListener('pointercancel', (e) => this.onUp(e));
    this.cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    addEventListener('keydown', this.keyFn, true);
    addEventListener('resize', this.resizeFn);
    this.loop();
  }

  private resize() {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.w = this.root.clientWidth || innerWidth;
    this.h = this.root.clientHeight || innerHeight;
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
    this.dirty = true;
  }

  private fitAll() {
    this.view = { cx: 0, cz: 0, scale: Math.min(this.w, this.h) / 2 / (WORLD_RADIUS * 1.08) };
    this.dirty = true;
  }

  private clamp() {
    this.view.scale = Math.max(MIN_SCALE * 0.3, Math.min(MAX_SCALE, this.view.scale));
    const lim = WORLD_RADIUS * 1.1;
    this.view.cx = Math.max(-lim, Math.min(lim, this.view.cx));
    this.view.cz = Math.max(-lim, Math.min(lim, this.view.cz));
  }

  private zoomAt(sx: number, sy: number, f: number) {
    const before = screenToWorld(this.view, this.w, this.h, sx, sy);
    this.view.scale *= f;
    this.clamp();
    // der Punkt unter dem Zeiger bleibt dort
    this.view.cx = before.x + (sx - this.w / 2) / this.view.scale;
    this.view.cz = before.z + (sy - this.h / 2) / this.view.scale;
    this.clamp();
    this.dirty = true;
  }

  private onKey(e: KeyboardEvent) {
    if (e.code === 'Escape' || e.code === 'KeyM') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) this.h_.close(); return; }
    const step = 60 / this.view.scale;
    // x ist gespiegelt: Pfeil nach rechts schiebt die Karte nach −x
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.view.cx += step;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.view.cx -= step;
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.view.cz += step;
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.view.cz -= step;
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') this.zoomAt(this.w / 2, this.h / 2, 1.25);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.zoomAt(this.w / 2, this.h / 2, 0.8);
    else return;
    e.preventDefault();
    this.clamp();
    this.dirty = true;
  }

  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!el) return;
    const d = this.h_.data();
    switch (el.dataset.a) {
      case 'close': this.h_.close(); break;
      case 'zoomin': this.zoomAt(this.w / 2, this.h / 2, 1.4); break;
      case 'zoomout': this.zoomAt(this.w / 2, this.h / 2, 1 / 1.4); break;
      case 'all': this.fitAll(); break;
      case 'me': this.view = { cx: d.markers.player.x, cz: d.markers.player.z, scale: 0.16 }; this.dirty = true; break;
      case 'log': this.h_.logbook(); break;
      case 'region': {
        const r = d.regions.find((x) => x.id === el.dataset.v);
        if (r) { this.view = { cx: r.x, cz: r.z, scale: Math.min(this.w, this.h) / 2 / (r.r * 1.15) }; this.clamp(); this.dirty = true; }
        break;
      }
      case 'closeinfo': this.sel = null; this.showInfo(); this.dirty = true; break;
    }
  }

  private onDown(e: PointerEvent) {
    this.cv.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    this.moved = 0;
    this.pinch = 0;
  }

  private onMove(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
    p.x = e.offsetX; p.y = e.offsetY;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / this.pinch);
      this.pinch = dist;
      this.moved += 10;
      return;
    }
    this.moved += Math.abs(dx) + Math.abs(dy);
    this.view.cx += dx / this.view.scale;
    this.view.cz += dy / this.view.scale;
    this.clamp();
    this.dirty = true;
  }

  private onUp(e: PointerEvent) {
    const had = this.pointers.has(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.pinch = 0;
    if (had && this.moved < 6 && this.pointers.size === 0) this.pick(e.offsetX, e.offsetY);
  }

  /** Insel unter dem Zeiger wählen (großzügiger Treffer, damit auch kleine Inseln gehen) */
  private pick(sx: number, sy: number) {
    const d = this.h_.data();
    const w = screenToWorld(this.view, this.w, this.h, sx, sy);
    let best: IslandDef | null = null, bd = Infinity;
    for (const i of d.islands) {
      const dist = Math.hypot(i.x - w.x, i.z - w.z);
      const reach = Math.max(14 / this.view.scale, i.r * 1.3);
      if (dist < reach && dist < bd) { best = i; bd = dist; }
    }
    this.sel = best?.id ?? null;
    this.showInfo();
    this.dirty = true;
  }

  private showInfo() {
    const d = this.h_.data();
    const i = this.sel ? d.islands.find((x) => x.id === this.sel) : null;
    this.info.hidden = !i;
    if (!i) return;
    const known = d.known(i.id);
    const p = d.markers.player;
    const dist = Math.hypot(i.x - p.x, i.z - p.z);
    const region = REGIONS.find((r) => r.islands.includes(i));
    const mk = d.islandMarks.get(i.id);
    this.info.innerHTML = known
      ? `<button class="icon-btn" data-a="closeinfo" aria-label="Schließen">✕</button><h3 class="fell">${esc(i.name)}</h3>
         <p class="small soft">${KIND_LABEL[i.kind]}${region ? ` · ${esc(region.name)}` : ''}${i.level ? ` · Stufe ${i.level}` : ''} · ${dist >= 1000 ? `${(dist / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(dist / 10) * 10} m`} entfernt</p>
         <p class="small">${esc(i.info)}</p>${i.boss ? `<p class="small">☠ <b>${esc(i.boss)}</b></p>` : ''}${mk ? `<p class="small">${mk === 'quest' ? '<b>!</b> Hier wartet ein Auftrag.' : '<b>?</b> Hier kannst du einen Auftrag abgeben.'}</p>` : ''}`
      : `<button class="icon-btn" data-a="closeinfo" aria-label="Schließen">✕</button><h3 class="fell">Unbekannte Insel</h3><p class="small soft">Noch nicht entdeckt. Segle in ihre Nähe, um sie zu erkunden.</p>${region ? `<p class="small soft">Liegt im Meer „${esc(region.name)}“.</p>` : ''}`;
  }

  private loop() {
    this.raf = requestAnimationFrame(() => {
      if (this.dirty) {
        this.dirty = false;
        const d = this.h_.data();
        drawWorldMap(this.ctx, this.w, this.h, this.dpr, this.view, d, this.sel);
      }
      this.loop();
    });
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.keyFn, true);
    removeEventListener('resize', this.resizeFn);
    this.root.remove();
  }
}
