import { REGIONS, type IslandDef, type IslandKind } from '../data/regions';
import { FACTIONS, STANCE_LABEL, marineStance } from '../data/factions';
import { GOOD_BY_ID, profileOf } from '../data/economy';
import type { WorldMapData, WorldView } from './minimap';
import { esc } from './dom';
import { fmtDist } from '../core/format';
import { clampView, centerOn, dragEnd, dragMove, dragStart, fitAll, newDrag, panByPixels, screenToWorldInto, zoomAtPoint, zoomOf, LABEL_ZOOM } from './mapView';
import { MAP_LAYERS, defaultLayers, drawWorldMap, type MapDrawState, type MapLayers } from './worldMapDraw';
import { isTravelPort, type TravelQuote } from '../world/fastTravel';
import { MEGA_BY_ID, isMegaId } from '../data/megaIslands';

export interface WorldMapHost {
  data(): WorldMapData;
  close(): void;
  /** Logbuch (Aufträge, Taten) öffnen */
  logbook(): void;
  /** Schnellreise zu einem Hafen: Bedingungen und Kosten (null = keine Reise möglich, zum Beispiel kein Hafen) */
  travelQuote?(id: string): TravelQuote | null;
  /** Reise antreten; liefert eine Meldung, wenn sie scheitert, sonst null (die Karte schließt sich dann) */
  travel?(id: string): string | null;
}

const KIND_LABEL: Record<IslandKind, string> = {
  town: 'Stadt', harbor: 'Hafen', camp: 'Feindliches Lager', ruin: 'Ruine', quiet: 'Ruhige Insel', treasure: 'Schatzinsel', lighthouse: 'Leuchtturm', boss: 'Boss-Insel',
  marinefort: 'Marine-Festung', citadel: 'Festungsinsel (Endgame)',
};

/** Die Ebenen bleiben beim nächsten Öffnen der Karte erhalten */
let savedLayers: MapLayers = defaultLayers();

/**
 * Weltkarte (Taste M) als Vollbild: den ganzen Archipel überblicken, mit dem Mausrad (um den Zeiger), per Zwei-Finger-Geste oder Knöpfen stufenlos zoomen
 * (0,65× bis 4,5×), ziehen und Inseln antippen. Ein Fingerdruck, der sich weniger als 5 Pixel bewegt, wählt eine Insel; alles darüber verschiebt die Karte.
 * Nicht entdeckte Inseln erscheinen als schemenhafte Umrisse, die Geheim-Inseln gar nicht; entdeckte Häfen bieten die Seekarten-Schnellreise an.
 */
export class WorldMapScreen {
  private root: HTMLElement;
  private cv: HTMLCanvasElement;
  private fog: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private info: HTMLElement;
  private occEl: HTMLElement;
  private zoomEl: HTMLElement;
  private occHtml = '';
  private view: WorldView = { cx: 0, cz: 0, scale: 0.1 };
  private w = 0;
  private h = 0;
  private dpr = 1;
  private sel: string | null = null;
  private dirty = true;
  private raf = 0;
  private note = '';
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly drag = newDrag();
  private readonly step = { dx: 0, dy: 0 };
  private readonly pt = { x: 0, z: 0 };
  private pinch = 0;
  private layers: MapLayers = savedLayers;
  private readonly st: MapDrawState;
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
          <span class="wmap-zoom small" aria-live="off">1,0×</span>
          <button class="mini brass" data-a="me" aria-label="Auf Schiff zentrieren" title="Auf Schiff zentrieren">⌖ <span class="wmap-long">Auf Schiff zentrieren</span><span class="wmap-short">Schiff</span></button>
          <button class="mini" data-a="all">Alles</button>
          <button class="mini" data-a="log">Logbuch</button>
        </div>
        <button class="icon-btn wmap-close" data-a="close" aria-label="Schließen">✕</button>
      </div>
      <div class="wmap-layers" role="group" aria-label="Ebenen">${MAP_LAYERS.map((l) => `<button class="mini wmap-layer" data-a="layer" data-v="${l.id}" aria-pressed="${this.layers[l.id]}" title="${esc(l.hint)}">${esc(l.label)}</button>`).join('')}</div>
      <div class="wmap-legend small wmap-powers">${(['england', 'deutschland', 'kurogane', 'niederlande', 'frankreich'] as const).map((id) => `<span><i class="lg" style="background:${FACTIONS[id].color}"></i>${FACTIONS[id].name}</span>`).join('')}<span><i class="lg" style="background:#F4F7FC;border:2px solid #16306A"></i>Marine (Grenzen)</span><span>◌ gestrichelt: Kolonie</span></div>
      <div class="wmap-legend small"><span><i class="lg me"></i>Du</span><span><i class="lg q">!</i>Auftrag</span><span><i class="lg t">?</i>Abgabe</span><span><i class="lg b">☠</i>Boss</span><span><i class="lg e"></i>Feind</span><span><i class="lg s">★</i>Ziel</span><span><i class="lg x">✕</i>Schatz</span><span><i class="lg w">⚔</i>Seeschlacht</span><span><i class="lg w">⚑</i>Belagerung</span></div>
      <div class="wmap-occ" aria-live="polite" hidden></div>
      <div class="wmap-info panel" hidden></div>
      <p class="wmap-hint small soft">Ziehen: Karte bewegen · Mausrad oder Zwei-Finger-Geste: zoomen · Hafen anklicken: Seekarten-Reise · M oder Esc: schließen</p>`;
    parent.appendChild(this.root);
    this.cv = this.root.querySelector('.wmap-cv')!;
    this.ctx = this.cv.getContext('2d')!;
    this.fog = document.createElement('canvas');
    this.info = this.root.querySelector('.wmap-info')!;
    this.occEl = this.root.querySelector('.wmap-occ')!;
    this.zoomEl = this.root.querySelector('.wmap-zoom')!;
    this.st = { selected: null, layers: this.layers, fog: this.fog, zoom: 1 };
    const d = this.h_.data();
    // Sprungziele: Ankerglück und die sechs Mega-Inseln (die Haupt-Orientierungspunkte der Karte, 4.3.6)
    const jumps = d.islands.filter((i) => i.id === 'ankerglueck' || i.mega);
    this.root.querySelector('.wmap-regions')!.innerHTML = jumps.map((i) => `<button class="mini" data-a="jump" data-v="${i.id}" style="--c:${i.factionId ? FACTIONS[i.factionId].color : '#E3B04B'}">${esc(i.name)}</button>`).join('');
    this.resize();
    this.fitAll();
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.cv.addEventListener('pointerdown', (e) => this.onDown(e));
    this.cv.addEventListener('pointermove', (e) => this.onMove(e));
    this.cv.addEventListener('pointerup', (e) => this.onUp(e));
    this.cv.addEventListener('pointercancel', (e) => this.onCancel(e));
    this.cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    addEventListener('keydown', this.keyFn, true);
    addEventListener('resize', this.resizeFn);
    this.loop();
  }

  private resize() {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.w = this.root.clientWidth || innerWidth;
    this.h = this.root.clientHeight || innerHeight;
    this.cv.width = this.fog.width = Math.round(this.w * this.dpr);
    this.cv.height = this.fog.height = Math.round(this.h * this.dpr);
    clampView(this.view, this.w, this.h);
    this.measureChrome();
    this.dirty = true;
  }

  /** Flächen der Bedienelemente über der Karte merken (die Karte setzt dort keine Namen); nur bei Größenänderung, nie je Bild */
  private measureChrome() {
    const base = this.root.getBoundingClientRect();
    const out: number[] = [];
    this.root.querySelectorAll<HTMLElement>('.wmap-top h2, .wmap-top button, .wmap-layers button, .wmap-legend, .wmap-hint').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      out.push(r.left - base.left, r.top - base.top, r.right - base.left, r.bottom - base.top);
    });
    this.st.chrome = out;
  }

  private fitAll() { fitAll(this.view, this.w, this.h); this.dirty = true; }
  private zoomAt(sx: number, sy: number, f: number) { zoomAtPoint(this.view, this.w, this.h, sx, sy, f); this.dirty = true; }

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
    clampView(this.view, this.w, this.h);
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
      // auf das Schiff zentrieren; ist die Ansicht weit draußen, geht es dabei auf 2× heran
      case 'me': centerOn(this.view, this.w, this.h, d.markers.player.x, d.markers.player.z, Math.max(2, zoomOf(this.view, this.w, this.h))); this.dirty = true; break;
      case 'log': this.h_.logbook(); break;
      case 'layer': {
        const id = el.dataset.v as keyof MapLayers;
        this.layers[id] = !this.layers[id];
        el.setAttribute('aria-pressed', String(this.layers[id]));
        this.dirty = true;
        break;
      }
      case 'jump': {
        const i = d.islands.find((x) => x.id === el.dataset.v);
        if (i) { centerOn(this.view, this.w, this.h, i.x, i.z, i.mega ? 2.6 : 3.2); this.sel = i.id; this.note = ''; this.showInfo(); this.dirty = true; }
        break;
      }
      case 'closeinfo': this.sel = null; this.note = ''; this.showInfo(); this.dirty = true; break;
      case 'travel': this.travel(el.dataset.id ?? ''); break;
    }
  }

  private travel(id: string) {
    const q = this.h_.travelQuote?.(id);
    if (!q || !q.ok) { this.note = q?.reasons[0] ?? 'Keine Reise möglich.'; this.showInfo(); return; }
    const msg = this.h_.travel?.(id);
    if (msg) { this.note = msg; this.showInfo(); }
  }

  private onDown(e: PointerEvent) {
    this.cv.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (this.pointers.size === 1) dragStart(this.drag, e.offsetX, e.offsetY);
    else { this.drag.active = false; this.pinch = 0; }
  }

  private onMove(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.offsetX; p.y = e.offsetY;
    if (this.pointers.size === 2) {
      let ax = 0, ay = 0, bx = 0, by = 0, n = 0;
      for (const q of this.pointers.values()) { if (n === 0) { ax = q.x; ay = q.y; } else { bx = q.x; by = q.y; } n++; }
      const dist = Math.hypot(ax - bx, ay - by);
      if (this.pinch > 0 && dist > 0) this.zoomAt((ax + bx) / 2, (ay + by) / 2, dist / this.pinch);
      this.pinch = dist;
      return;
    }
    if (!dragMove(this.drag, e.offsetX, e.offsetY, this.step)) return;
    panByPixels(this.view, this.w, this.h, this.step.dx, this.step.dy);
    this.dirty = true;
  }

  private onUp(e: PointerEvent) {
    const had = this.pointers.delete(e.pointerId);
    this.pinch = 0;
    if (had && this.pointers.size === 0 && dragEnd(this.drag)) this.pick(e.offsetX, e.offsetY);
  }

  private onCancel(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    this.pinch = 0;
    this.drag.active = false;
  }

  /** Insel unter dem Zeiger wählen (großzügiger Treffer, damit auch kleine Inseln gehen); Geheim-Inseln stehen gar nicht in der Liste */
  private pick(sx: number, sy: number) {
    const d = this.h_.data();
    const w = screenToWorldInto(this.view, this.w, this.h, sx, sy, this.pt);
    let best: IslandDef | null = null, bd = Infinity;
    for (const i of d.islands) {
      const dist = Math.hypot(i.x - w.x, i.z - w.z);
      const reach = Math.max(14 / this.view.scale, i.r * 1.3);
      if (dist < reach && dist < bd) { best = i; bd = dist; }
    }
    this.sel = best?.id ?? null;
    this.note = '';
    this.showInfo();
    this.dirty = true;
  }

  private goodsLine(i: IslandDef): string {
    const p = profileOf(i);
    const names = (ids: readonly string[]) => ids.map((g) => `${GOOD_BY_ID[g]?.icon ?? ''} ${esc(GOOD_BY_ID[g]?.n ?? g)}`).join(', ') || '–';
    return `<p class="small"><b style="color:#9fdc8a">▲ Überschuss</b> ${names(p.produce)}<br><b style="color:#f0b27a">▼ Bedarf</b> ${names(p.demand)}${p.blackMarket ? '<br><b style="color:#e7b0ff">Schwarzmarkt: keine Kontrolle, kein Tarif.</b>' : ''}</p>`;
  }

  private travelHtml(i: IslandDef): string {
    const q = this.h_.travelQuote?.(i.id);
    if (!q) return '';
    const cost = `${q.gold} Gold · ${q.provisions} Proviant`;
    const why = q.reasons.length ? `<ul class="wmap-why small">${q.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '';
    return `<div class="wmap-travel"><button class="mini brass${q.ok ? '' : ' off'}" data-a="travel" data-id="${i.id}" aria-disabled="${!q.ok}" title="${esc(q.ok ? `Seekarten-Reise nach ${i.name}: ${cost}, ${fmtDist(q.dist)}` : q.reasons.join(' '))}">⚓ Seekarten-Reise · ${cost}</button>${why}</div>`;
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
    // Besitzer: Macht, Kolonie-Hinweis und bei der Marine die Haltung zum Spieler (Ansehen)
    const owner = i.factionId ? FACTIONS[i.factionId] : null;
    const occ = d.occupations?.find((o) => o.id === i.id);
    const times = d.conquests?.[i.id] ?? 0;
    const occLine = occ ? `<p class="small" style="color:#E3B04B">⚑ <b>In deiner Hand</b> · noch ${esc(occ.text)}${occ.endgame ? ' · <b style="color:#FF8A6A">Rückeroberungs-Flotte unterwegs!</b>' : ''}</p>` : times > 0 ? `<p class="small soft">⚑ ${times}× erobert – die ${esc(owner?.name ?? 'Macht')} hat sie zurückgeholt; ein neuer Sturm ist möglich.</p>` : '';
    const stand = d.standing?.marine ?? 0;
    const ownerLine = owner
      ? `<p class="small" style="color:${owner.color}">⚑ <b>${esc(owner.name)}</b>${i.exclave ? ' · Kolonie in fremdem Gewässer' : ''}${i.marine ? ` · Haltung zu dir: <b>${STANCE_LABEL[marineStance(stand)]}</b>${marineStance(stand) === 'verbuendet' ? ' (nicht angreifbar)' : marineStance(stand) === 'feindlich' ? ' (Garnison greift an)' : ''}` : ''}</p>`
      : '<p class="small soft">⚑ Unabhängig und neutral.</p>';
    // Mega-Inseln: Beiname, umkämpfte Bezirke und Insel-Kommandant
    const mm = isMegaId(i.id) ? MEGA_BY_ID[i.id] : null;
    const megaLine = mm ? `<p class="small" style="color:#E3B04B">★ <b>${esc(mm.title)}</b> · Kampf-Bezirke: ${mm.districts.map((x) => esc(x.name)).join(', ')} · Kommandant: <b>${esc(mm.commander.name)}</b></p>` : '';
    const block = d.blockaded?.(i.id) ? '<p class="small" style="color:#FF8A6A">⚓ <b>Blockade</b> vor dem Hafen: alle Preise doppelt, keine Schnellreise.</p>' : '';
    // Belagerung (4.5B): voller Text auch bei niedrigem Zoom, wenn man die Insel anklickt
    const sg = d.wars?.sieges.find((s) => s.id === i.id);
    const siegeLine = sg ? `<p class="small" style="color:#FFC090">⚑ <b>${esc(sg.name)}</b> · ${Math.round(sg.progress * 100)} %${sg.points ? ` · ${esc(sg.points)}` : ''}</p>` : '';
    const note = this.note ? `<p class="small" style="color:#FFB070" role="status">${esc(this.note)}</p>` : '';
    this.info.innerHTML = known
      ? `<button class="icon-btn" data-a="closeinfo" aria-label="Schließen">✕</button><h3 class="fell">${esc(i.name)}</h3>
         <p class="small soft">${KIND_LABEL[i.kind]}${region ? ` · ${esc(region.name)}` : ''}${i.level ? ` · Stufe ${i.level}` : ''} · ${fmtDist(dist)} entfernt</p>
         ${megaLine}${ownerLine}${occLine}${siegeLine}${block}<p class="small">${esc(i.info)}</p>${i.boss ? `<p class="small">☠ <b>${esc(i.boss)}</b></p>` : ''}${mk ? `<p class="small">${mk === 'quest' ? '<b>!</b> Hier wartet ein Auftrag.' : '<b>?</b> Hier kannst du einen Auftrag abgeben.'}</p>` : ''}${isTravelPort(i.kind) ? this.goodsLine(i) + this.travelHtml(i) : ''}${note}`
      : `<button class="icon-btn" data-a="closeinfo" aria-label="Schließen">✕</button><h3 class="fell">${i.mega ? esc(i.name) : 'Unentdeckte Insel'}</h3><p class="small soft">Nur ein schemenhafter Umriss. Segle bis auf wenige Kilometer heran – oder lege in einem Hafen in der Nähe an –, um sie zu kartieren.</p>${region ? `<p class="small soft">Liegt im Meer „${esc(region.name)}“ · ${fmtDist(dist)} entfernt.</p>` : `<p class="small soft">${fmtDist(dist)} entfernt.</p>`}`;
  }

  /** Besetzte Inseln mit Countdown und Rückeroberungs-Warnung: immer sichtbar, nicht nur beim Antippen einer Insel */
  private paintOcc(d: WorldMapData) {
    const html = (d.occupations ?? []).map((o) => `<div class="occ-item${o.endgame ? ' warn' : ''}"><b>${o.endgame ? '⚠' : '⚑'} ${esc(o.name)}</b><span>${o.endgame ? 'Rückeroberungs-Flotte unterwegs · ' : 'in deiner Hand · '}noch <b>${esc(o.text)}</b></span></div>`).join('');
    if (html === this.occHtml) return;
    this.occHtml = html;
    this.occEl.innerHTML = html;
    this.occEl.hidden = !html;
  }

  private zoomText = '';
  private loop() {
    this.raf = requestAnimationFrame(() => {
      const dd = this.h_.data();
      this.paintOcc(dd);
      if (this.dirty || dd.occupations?.some((o) => o.endgame)) {
        this.dirty = false;
        const z = zoomOf(this.view, this.w, this.h);
        this.st.selected = this.sel;
        this.st.zoom = z;
        drawWorldMap(this.ctx, this.w, this.h, this.dpr, this.view, dd, this.st);
        const zt = `${z.toFixed(2).replace('.', ',')}×`;
        if (zt !== this.zoomText) { this.zoomText = zt; this.zoomEl.textContent = zt; }
      }
      this.loop();
    });
  }

  /** Für Prüfskripte: Zoom, Ansicht und Fenstergröße */
  debug() { return { zoom: zoomOf(this.view, this.w, this.h), view: { ...this.view }, w: this.w, h: this.h, sel: this.sel, layers: { ...this.layers }, labelZoom: LABEL_ZOOM }; }
  /** Für Prüfskripte: Ansicht setzen und neu zeichnen */
  setView(cx: number, cz: number, zoom: number) { centerOn(this.view, this.w, this.h, cx, cz, zoom); this.dirty = true; }
  select(id: string | null) { this.sel = id; this.note = ''; this.showInfo(); this.dirty = true; }

  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.keyFn, true);
    removeEventListener('resize', this.resizeFn);
    savedLayers = this.layers;
    this.fog.width = this.fog.height = 0;
    this.root.remove();
  }
}
