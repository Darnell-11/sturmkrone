import type { StyleId } from '../data/animations';
import {
  BEARD_STYLES, BODY_TYPES, CLOTH_COLORS, COATS, COSMETIC_HATS, EYE_COLORS, EYE_STYLES, FACE_SHAPES, HAIR_COLORS, HAIR_STYLES, MOUTH_STYLES,
  BROW_STYLES, OUTFITS, SKIN_TONES, defaultLook, randomLook, type CharacterLook,
} from '../data/characterParts';
import type { Faction, FightStyle } from '../core/save/types';
import { CAT_LABEL, EQUIP_BY_ID, GEAR_CATS, catOf, type EquipDef, type GearCat } from '../data/equipment';
import { SETS, describeBonus, type GearSet } from '../data/gear';
import { RARITY, type Rarity } from '../data/trinkets';
import { setBonuses } from '../core/gearBag';
import { esc } from './dom';

export interface EditorResult {
  name: string;
  faction: Faction;
  style: FightStyle;
  blade: string;
  look: CharacterLook;
}

/** Was der Editor vom Spielstand braucht, um Ausrüstung anzulegen und zu färben (nur beim Ändern einer bestehenden Figur) */
export interface EditorGearHost {
  owned(): string[];
  worn(): Partial<Record<GearCat, string | null>>;
  equip(cat: GearCat, id: string | null): void;
  dyes(): Record<string, [string, string]>;
  dye(id: string, colors: [string, string] | null): void;
}

export type CamPreset = 'gesamt' | 'kopf' | 'oberkoerper' | 'beine' | 'ruecken';

export interface EditorOptions {
  /** Neues Spiel: Name und Fraktion wählbar */
  isNew: boolean;
  /** Anime-Figuren (VRoid): nur die Optionen, die dort wirken */
  anime?: boolean;
  initial: EditorResult;
  gear?: EditorGearHost;
  /** tryOn: Stücke, die nur zur Anprobe gezeigt werden (nicht angelegt) */
  onChange: (r: EditorResult, styleId: StyleId, tryOn: string[] | null) => void;
  onPreview: (kind: 'cheer' | 'attack' | 'wave' | 'roll' | 'heavy') => void;
  onRotate: (dx: number) => void;
  onZoom: (d: number) => void;
  onPreset: (p: CamPreset) => void;
  /** Farbiger Schein hinter der Figur (Seltenheit des gezeigten Stücks), null = aus */
  onAura: (color: string | null) => void;
  onSpin: (on: boolean) => void;
  onDone: (r: EditorResult) => void;
  onCancel: () => void;
}

type Tab = 'stil' | 'koerper' | 'gesicht' | 'haare' | 'kleidung' | 'ausruestung' | 'sets';
const BLADES: Record<string, string> = { saebel: 'Säbel', langklinge: 'Langklinge', zweihaender: 'Zweihänder', doppel: 'Doppelklingen' };
const STYLES: Record<FightStyle, string> = { faust: 'Faustkämpfer', schwert: 'Schwertkämpfer', effekt: 'Faji-Wirker' };
const STYLE_INFO: Record<FightStyle, string> = {
  faust: 'Schnelle Kombos, Tritte und Luftangriffe. Stark gegen viele Gegner auf engem Raum.',
  schwert: 'Klingenkunst mit vier Waffenarten – jede mit eigenen Kombos und Reichweite.',
  effekt: 'Formt Faji zu Geschossen und Elementen. Kämpft lieber auf Abstand und lädt starke Angriffe auf.',
};
const BODY_INFO: Record<string, string> = { schmal: 'Schlank und flink', normal: 'Ausgewogen', kraeftig: 'Breit und kräftig' };
const SLOT_ICON: Record<GearCat, string> = { head: '🪖', shoulder: '🛡', chest: '🦺', cloak: '🧣', hands: '🧤', legs: '👖', feet: '🥾', mainhand: '🗡', offhand: '🔪' };
const CAMS: [CamPreset, string][] = [['gesamt', 'Gesamt'], ['kopf', 'Kopf'], ['oberkoerper', 'Rüstung'], ['beine', 'Beine'], ['ruecken', 'Rücken']];
/** Farben für Metall und Stoff, die man beim Färben zusätzlich sucht */
const DYE_COLORS = [...CLOTH_COLORS, '#9AA3AD', '#C9A13B', '#E3B04B', '#B070FF', '#7FD8FF', '#C8302A', '#F2F0EA', '#17121F'];

export function styleIdOf(style: FightStyle, blade: string): StyleId {
  if (style === 'faust') return 'faust';
  if (style === 'effekt') return 'effekt';
  return (['saebel', 'langklinge', 'zweihaender', 'doppel'].includes(blade) ? blade : 'saebel') as StyleId;
}

/**
 * Charakter-Editor 3.0: Studio-Bühne mit Kamera-Voreinstellungen, Reiter für Figur, Gesicht, Haare, Kleidung, Ausrüstung (anlegen
 * und färben) und Rüstkammer (alle Sets anprobieren). Rein darstellend – Änderungen laufen über die Rückrufe in EditorOptions.
 */
export class CharacterEditor {
  private root: HTMLElement;
  private panel: HTMLElement;
  private tab: Tab = 'stil';
  private r: EditorResult;
  private slot: GearCat = 'chest';
  private tryOn: string[] | null = null;
  private tryName = '';
  private spin = true;

  constructor(parent: HTMLElement, private o: EditorOptions) {
    this.r = structuredClone(o.initial);
    this.root = document.createElement('div');
    this.root.className = 'editor ed3';
    this.root.innerHTML = `
      <div class="editor-stage" aria-label="Vorschau – ziehen zum Drehen, Mausrad oder zwei Finger zum Zoomen">
        <div class="ed3-cam" role="group" aria-label="Kamera">${CAMS.map(([id, l]) => `<button class="mini" data-p="cam" data-v="${id}" aria-pressed="${id === 'gesamt'}">${l}</button>`).join('')}</div>
        <div class="ed3-banner" hidden></div>
        <div class="editor-preview">
          <button class="mini" data-p="attack">Angriff</button><button class="mini" data-p="heavy">Schwer</button>
          <button class="mini" data-p="roll">Rolle</button><button class="mini" data-p="cheer">Jubeln</button><button class="mini" data-p="wave">Winken</button>
          <button class="mini" data-p="spin" aria-pressed="true">⟳ Drehen</button>
        </div>
        <div class="editor-zoom"><button class="icon-btn" data-z="-0.12" aria-label="Näher">+</button><button class="icon-btn" data-z="0.12" aria-label="Weiter weg">−</button></div>
      </div>
      <div class="editor-panel card"></div>`;
    parent.appendChild(this.root);
    this.panel = this.root.querySelector('.editor-panel')!;

    const stage = this.root.querySelector<HTMLElement>('.editor-stage')!;
    // Ziehen dreht, zwei Finger zoomen
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    stage.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      stage.setPointerCapture(e.pointerId);
      pinch = 0;
    });
    stage.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this.o.onZoom((pinch - d) * 0.004);
        pinch = d;
        p.x = e.clientX; p.y = e.clientY;
        return;
      }
      this.o.onRotate(e.clientX - p.x);
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); pinch = 0; };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => { this.o.onZoom(Math.sign(e.deltaY) * 0.06); e.preventDefault(); }, { passive: false });
    stage.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-p],[data-z],[data-a]');
      if (!b) return;
      if (b.dataset.z) this.o.onZoom(+b.dataset.z);
      else if (b.dataset.p === 'cam') this.setCam(b.dataset.v as CamPreset);
      else if (b.dataset.p === 'spin') { this.spin = !this.spin; b.setAttribute('aria-pressed', String(this.spin)); this.o.onSpin(this.spin); }
      else if (b.dataset.p) this.o.onPreview(b.dataset.p as 'attack');
      else if (b.dataset.a === 'tryoff') this.endTry();
    });

    this.panel.addEventListener('click', (e) => this.onClick(e));
    this.panel.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.id === 'ed-name') this.r.name = el.value;
      if (el.dataset.k === 'height') { this.r.look.height = +el.value / 100; this.changed(false); el.parentElement?.querySelector('output')!.replaceChildren(`${Math.round(this.r.look.height * 175)} cm`); }
    });
    this.panel.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.a === 'dyepick') this.dyePick(el.dataset.i === '1' ? 1 : 0, el.value);
    });
    this.render();
    this.changed(false);
  }

  // ---------- Zustand ----------

  private tabs(): [Tab, string, string][] {
    const t: [Tab, string, string][] = [['stil', '⚔', 'Stil'], ['koerper', '🧍', 'Körper'], ['gesicht', '🙂', 'Gesicht'], ['haare', '💇', 'Haare'], ['kleidung', '👕', 'Kleidung']];
    if (this.o.gear) t.push(['ausruestung', '🛡', 'Ausrüstung']);
    t.push(['sets', '👑', 'Rüstkammer']);
    return t;
  }

  private setCam(p: CamPreset) {
    this.root.querySelectorAll<HTMLElement>('[data-p="cam"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === p)));
    this.o.onPreset(p);
  }

  private changed(rerender = true) {
    this.o.onChange(this.r, styleIdOf(this.r.style, this.r.blade), this.tryOn);
    const ban = this.root.querySelector<HTMLElement>('.ed3-banner');
    if (ban) {
      ban.hidden = !this.tryOn;
      ban.innerHTML = this.tryOn ? `<span>Anprobe: <b>${esc(this.tryName)}</b> – nicht angelegt</span><button class="mini brass" data-a="tryoff">Beenden</button>` : '';
    }
    if (rerender) {
      const y = this.panel.querySelector('.editor-body')?.scrollTop ?? 0;
      this.render();
      const body = this.panel.querySelector('.editor-body');
      if (body) body.scrollTop = y;
    }
  }

  private startTry(ids: string[], name: string) {
    this.tryOn = ids;
    this.tryName = name;
    const rar = ids.map((i) => EQUIP_BY_ID[i]?.rarity).find(Boolean);
    this.o.onAura(rar ? RARITY[rar].col : null);
    if (ids.length > 2) this.setCam('gesamt'); else if (ids.length === 1) this.setCam(this.camFor(catOf(EQUIP_BY_ID[ids[0]])));
    this.changed();
  }

  private endTry() {
    this.tryOn = null;
    this.o.onAura(null);
    this.changed();
  }

  private camFor(c: GearCat): CamPreset { return c === 'head' ? 'kopf' : c === 'legs' || c === 'feet' ? 'beine' : c === 'cloak' ? 'ruecken' : 'oberkoerper'; }

  private dyePick(i: 0 | 1, value: string) {
    const g = this.o.gear, id = g?.worn()[this.slot];
    if (!g || !id) return;
    const d = EQUIP_BY_ID[id];
    const cur = g.dyes()[id] ?? d.palette ?? ['#8A8F98', '#E3B04B'];
    const next: [string, string] = [cur[0], cur[1]];
    next[i] = value;
    g.dye(id, next);
    this.changed();
  }

  // ---------- Eingaben ----------

  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!el) return;
    const a = el.dataset.a!;
    const k = el.dataset.k as keyof CharacterLook;
    const v = el.dataset.v ?? '';
    const look = this.r.look as unknown as Record<string, unknown>;
    switch (a) {
      case 'tab': this.tab = v as Tab; if (v === 'ausruestung') this.setCam(this.camFor(this.slot)); this.render(); return;
      case 'set': look[k] = v; break;
      case 'toggle': look[k] = !look[k]; break;
      case 'faction': {
        this.r.faction = v as Faction;
        const keepName = this.r.name !== 'Fynn' && this.r.name !== 'Rekrut';
        this.r.look = { ...defaultLook(this.r.faction), gloves: this.r.style === 'faust' };
        if (!keepName) this.r.name = this.r.faction === 'pirat' ? 'Fynn' : 'Rekrut';
        break;
      }
      case 'style': this.r.style = v as FightStyle; this.r.look.gloves = v === 'faust'; break;
      case 'blade': this.r.blade = v; break;
      case 'random': {
        const keep = { gloves: this.r.look.gloves };
        this.r.look = { ...randomLook(Math.random, this.r.faction === 'marine' ? 'marine' : 'pirat'), ...keep };
        break;
      }
      case 'slot': this.slot = v as GearCat; this.setCam(this.camFor(this.slot)); this.o.onAura(null); this.render(); return;
      case 'wear': {
        const id = v === '-' ? null : v;
        this.o.gear?.equip(this.slot, id);
        const d = id ? EQUIP_BY_ID[id] : null;
        this.o.onAura(d?.rarity ? RARITY[d.rarity].col : null);
        break;
      }
      case 'dyeset': {
        const id = this.o.gear?.worn()[this.slot];
        if (!id) return;
        const [i, c] = v.split('|');
        const cur = this.o.gear!.dyes()[id] ?? EQUIP_BY_ID[id].palette ?? ['#8A8F98', '#E3B04B'];
        const next: [string, string] = [cur[0], cur[1]];
        next[+i as 0 | 1] = c;
        this.o.gear!.dye(id, next);
        break;
      }
      case 'dyereset': { const id = this.o.gear?.worn()[this.slot]; if (id) this.o.gear!.dye(id, null); break; }
      case 'try': {
        const set = SETS.find((s) => s.id === v);
        if (!set) return;
        this.startTry((Object.keys(set.pieces) as GearCat[]).map((c) => `${set.id}_${c}`), set.n);
        return;
      }
      case 'trypiece': { const d = EQUIP_BY_ID[v]; if (d) this.startTry([v], d.n); return; }
      case 'tryoff': this.endTry(); return;
      case 'wearset': {
        const set = SETS.find((s) => s.id === v), owned = this.o.gear?.owned() ?? [];
        if (!set) return;
        for (const c of Object.keys(set.pieces) as GearCat[]) { const id = `${set.id}_${c}`; if (owned.includes(id)) this.o.gear!.equip(c, id); }
        this.endTry();
        return;
      }
      case 'done': {
        // leerer oder nur aus Leerzeichen bestehender Name: Standardname statt eines namenlosen Helden
        const name = this.r.name.replace(/\s+/g, ' ').trim().slice(0, 24);
        this.r.name = name || (this.r.faction === 'pirat' ? 'Fynn' : 'Rekrut');
        this.o.onAura(null);
        this.o.onDone(this.r);
        return;
      }
      case 'cancel': this.o.onAura(null); this.o.onCancel(); return;
      default: return;
    }
    this.changed();
  }

  // ---------- Bausteine ----------

  private chips(k: keyof CharacterLook, opts: Record<string, string>) {
    const cur = (this.r.look as unknown as Record<string, unknown>)[k];
    return `<div class="chips">${Object.entries(opts).map(([id, l]) => `<button data-a="set" data-k="${k}" data-v="${id}" aria-pressed="${cur === id}">${l}</button>`).join('')}</div>`;
  }

  private cards(k: keyof CharacterLook, opts: Record<string, string>, info: Record<string, string> = {}) {
    const cur = (this.r.look as unknown as Record<string, unknown>)[k];
    return `<div class="ed3-cards">${Object.entries(opts).map(([id, l]) => `<button class="ed3-pick" data-a="set" data-k="${k}" data-v="${id}" aria-pressed="${cur === id}"><b>${l}</b>${info[id] ? `<small>${info[id]}</small>` : ''}</button>`).join('')}</div>`;
  }

  private swatches(k: keyof CharacterLook, colors: string[]) {
    const cur = String((this.r.look as unknown as Record<string, unknown>)[k]).toUpperCase();
    return `<div class="swatches">${colors.map((c) => `<button class="sw" style="background:${c}" data-a="set" data-k="${k}" data-v="${c}" aria-pressed="${cur === c.toUpperCase()}" aria-label="Farbe ${c}"></button>`).join('')}</div>`;
  }

  private toggle(k: keyof CharacterLook, label: string) {
    return `<button data-a="toggle" data-k="${k}" aria-pressed="${!!(this.r.look as unknown as Record<string, unknown>)[k]}">${label}</button>`;
  }

  private opt(label: string, html: string) { return `<div class="opt"><span class="label">${label}</span>${html}</div>`; }

  private rarityPill(r?: Rarity) { return r ? `<span class="ed3-rar" style="--c:${RARITY[r].col}">${RARITY[r].mark} ${RARITY[r].n}</span>` : ''; }

  private pieceCard(d: EquipDef, active: boolean, action: string, extra = '') {
    const rc = d.rarity ? RARITY[d.rarity].col : '#8a8f98';
    const set = d.set ? SETS.find((s) => s.id === d.set) : null;
    return `<button class="ed3-item" style="--c:${rc}" data-a="${action}" data-v="${d.id}" aria-pressed="${active}">
      <span class="ic">${SLOT_ICON[catOf(d)]}</span>
      <span class="tx"><b>${esc(d.n)}</b><small>${esc(d.d ?? '')}</small><small class="soft">${this.rarityPill(d.rarity)} ${set ? esc(set.n) : ''}${d.level ? ` · ab Stufe ${d.level}` : ''}</small>${extra}</span>
    </button>`;
  }

  // ---------- Reiter ----------

  private gearTab(): string {
    const g = this.o.gear!;
    const owned = g.owned(), worn = g.worn(), dyes = g.dyes();
    const doll = `<div class="ed3-doll">${GEAR_CATS.map((c) => {
      const d = worn[c] ? EQUIP_BY_ID[worn[c]!] : null;
      const rc = d?.rarity ? RARITY[d.rarity].col : '#6a6458';
      return `<button class="ed3-slot" style="--c:${rc}" data-a="slot" data-v="${c}" aria-pressed="${this.slot === c}"><span class="ic">${SLOT_ICON[c]}</span><small>${CAT_LABEL[c]}</small><em>${esc(d?.n ?? 'leer')}</em></button>`;
    }).join('')}</div>`;
    const mine = owned.map((id) => EQUIP_BY_ID[id]).filter((d): d is EquipDef => !!d && catOf(d) === this.slot);
    const list = `<h3>${CAT_LABEL[this.slot]} <small class="soft">(${mine.length} im Beutel)</small></h3>
      <div class="ed3-list">
        <button class="ed3-item none" data-a="wear" data-v="-" aria-pressed="${!worn[this.slot]}"><span class="ic">✕</span><span class="tx"><b>Nichts anlegen</b><small>Dein eigener Look aus „Kleidung“ zeigt sich.</small></span></button>
        ${mine.map((d) => this.pieceCard(d, worn[this.slot] === d.id, 'wear')).join('') || '<p class="soft small">Hier liegt noch nichts. Besiege Gegner, öffne Truhen oder kaufe Sets beim Ausrüster – in der Rüstkammer siehst du, was es gibt.</p>'}
      </div>`;
    const cur = worn[this.slot] ? EQUIP_BY_ID[worn[this.slot]!] : null;
    let dye = '';
    if (cur) {
      const pal = dyes[cur.id] ?? cur.palette ?? ['#8A8F98', '#E3B04B'];
      const row = (i: 0 | 1, label: string) => `<div class="ed3-dye"><span class="label">${label}</span><div class="swatches">${DYE_COLORS.map((c) => `<button class="sw" style="background:${c}" data-a="dyeset" data-v="${i}|${c}" aria-pressed="${pal[i].toUpperCase() === c.toUpperCase()}" aria-label="Farbe ${c}"></button>`).join('')}<label class="sw pick" style="background:${pal[i]}" title="Eigene Farbe"><input type="color" data-a="dyepick" data-i="${i}" value="${pal[i]}" aria-label="Eigene Farbe ${label}"></label></div></div>`;
      dye = `<h3>Farben <small class="soft">${esc(cur.n)}</small></h3>${row(0, 'Hauptfarbe')}${row(1, 'Zierfarbe (Borten, Metall, Leuchten)')}<button class="mini" data-a="dyereset">Werksfarben</button>`;
    }
    const act = [...new Set(GEAR_CATS.map((c) => worn[c]).filter(Boolean).map((id) => EQUIP_BY_ID[id!]).filter((d) => d?.set).map((d) => d!.set!))];
    const sb = setBonuses(GEAR_CATS.map((c) => worn[c]).filter(Boolean).map((id) => EQUIP_BY_ID[id!]));
    const bonus = sb.length ? `<h3>Setbonus</h3><ul class="ed3-bonus">${sb.map((s) => { const set = SETS.find((x) => x.id === s.set)!; return `<li><b>${esc(set.n)}</b> ${s.n}/${s.total} ${s.bonus ? `<i>${esc(describeBonus(s.bonus))}</i>` : `<span class="soft">ab 3 Teilen: ${esc(describeBonus(set.bonus3))}</span>`}</li>`; }).join('')}</ul>` : '';
    void act;
    return doll + list + dye + bonus;
  }

  private setCard(set: GearSet): string {
    const owned = this.o.gear?.owned() ?? [];
    const cats = Object.keys(set.pieces) as GearCat[];
    const have = cats.filter((c) => owned.includes(`${set.id}_${c}`)).length;
    const rc = RARITY[set.rarity].col;
    const trying = this.tryOn?.length && this.tryOn.every((i) => EQUIP_BY_ID[i]?.set === set.id) && this.tryOn.length === cats.length;
    return `<div class="ed3-set" style="--c:${rc}">
      <div class="ed3-sethead"><b>${esc(set.n)}</b>${this.rarityPill(set.rarity)}<span class="soft small">ab Stufe ${set.level}</span></div>
      <p class="small">${esc(set.d)}</p>
      <div class="ed3-pieces">${cats.map((c) => { const id = `${set.id}_${c}`, d = EQUIP_BY_ID[id], own = owned.includes(id); return `<button class="ed3-piece${own ? ' own' : ''}" data-a="trypiece" data-v="${id}" title="${esc(d.n)} – anprobieren">${SLOT_ICON[c]}<i>${own ? '✓' : '🔒'}</i></button>`; }).join('')}</div>
      <p class="small soft">Setbonus: ab 3 Teilen ${esc(describeBonus(set.bonus3))} · komplett ${esc(describeBonus(set.bonusAll))}</p>
      <div class="row"><button class="mini ${trying ? '' : 'brass'}" data-a="${trying ? 'tryoff' : 'try'}" data-v="${set.id}">${trying ? 'Anprobe beenden' : 'Ganzes Set anprobieren'}</button>${have && this.o.gear ? `<button class="mini" data-a="wearset" data-v="${set.id}">Anlegen (${have}/${cats.length})</button>` : ''}</div>
    </div>`;
  }

  private render() {
    const r = this.r;
    let body = '';
    switch (this.tab) {
      case 'stil':
        body = (this.o.isNew ? this.opt('Name', `<input id="ed-name" class="txt" maxlength="24" value="${esc(r.name)}" autocomplete="off">`)
          + this.opt('Fraktion', `<div class="chips"><button data-a="faction" data-v="pirat" aria-pressed="${r.faction === 'pirat'}">Pirat</button><button data-a="faction" data-v="marine" aria-pressed="${r.faction === 'marine'}">Marine</button></div>
            <p class="tier-desc">${r.faction === 'pirat' ? 'Du beginnst als Schiffsjunge – frei, laut und ohne Gesetz.' : 'Du beginnst als Rekrut der Marine – mit Befehlen, Ehre und Pflicht.'}</p>`) : '')
          + this.opt('Kampfstil', `<div class="chips">${Object.entries(STYLES).map(([id, l]) => `<button data-a="style" data-v="${id}" aria-pressed="${r.style === id}">${l}</button>`).join('')}</div><p class="tier-desc">${STYLE_INFO[r.style]}</p>`)
          + (r.style === 'schwert' ? this.opt('Klingenform', `<div class="chips">${Object.entries(BLADES).map(([id, l]) => `<button data-a="blade" data-v="${id}" aria-pressed="${r.blade === id}">${l}</button>`).join('')}</div>`) : '');
        break;
      case 'koerper':
        body = this.opt('Körperbau', this.cards('body', BODY_TYPES, BODY_INFO))
          + this.opt('Größe', `<label class="slider">Größe<input type="range" min="90" max="110" step="1" value="${Math.round(r.look.height * 100)}" data-k="height"><output>${Math.round(r.look.height * 175)} cm</output></label>`)
          + this.opt('Hautton', this.swatches('skin', SKIN_TONES));
        break;
      case 'gesicht':
        body = this.opt('Augenfarbe', this.swatches('eyeColor', EYE_COLORS))
          + (this.o.anime ? '<p class="tier-desc">Die Anime-Figuren haben ein fein gezeichnetes Gesicht mit Mimik: Sie blinzeln, strahlen beim Jubeln und bewegen beim Reden den Mund.</p>'
            : this.opt('Gesichtsform', this.chips('face', FACE_SHAPES)) + this.opt('Augen', this.chips('eyes', EYE_STYLES)) + this.opt('Brauen', this.chips('brows', BROW_STYLES)) + this.opt('Mund', this.chips('mouth', MOUTH_STYLES)))
          + this.opt('Bart', this.chips('beard', BEARD_STYLES))
          + this.opt('Zeichen und Schmuck', `<div class="chips">${this.toggle('scar', 'Narbe')}${this.toggle('eyepatch', 'Augenklappe')}${this.toggle('earring', 'Ohrring')}</div>`);
        break;
      case 'haare': {
        if (this.o.anime) {
          const long = ['lang', 'pferdeschwanz', 'zoepfe', 'zopf', 'dutt'].includes(r.look.hair);
          body = this.opt('Stil', `<div class="ed3-cards"><button class="ed3-pick" data-a="set" data-k="hairModel" data-v="" aria-pressed="${!r.look.hairModel}"><b>Grundfrisur</b><small>Frisur der Anime-Figur</small></button><button class="ed3-pick" data-a="set" data-k="hairModel" data-v="frisur_mehrlagig" aria-pressed="${r.look.hairModel === 'frisur_mehrlagig'}"><b>Mehrlagig</b><small>Nacken-, Seiten- und Ponysträhnen</small></button></div>`)
            + this.opt('Figur', `<div class="ed3-cards"><button class="ed3-pick" data-a="set" data-k="hair" data-v="kurz" aria-pressed="${!long}"><b>Kurzhaar</b><small>Männliche Grundfigur</small></button><button class="ed3-pick" data-a="set" data-k="hair" data-v="lang" aria-pressed="${long}"><b>Langhaar</b><small>Weibliche Grundfigur</small></button></div>`)
            + this.opt('Haarfarbe', this.swatches('hairColor', HAIR_COLORS));
          break;
        }
        body = this.opt('Frisur', this.chips('hair', HAIR_STYLES)) + this.opt('Haarfarbe', this.swatches('hairColor', HAIR_COLORS));
        break;
      }
      case 'kleidung':
        body = '<p class="tier-desc">Dein eigener Look. Ausrüstung aus Beute und Laden legt sich darüber und ersetzt, was am selben Platz sitzt.</p>'
          + this.opt('Mantel', this.chips('coat', COATS) + (r.look.coat !== 'keiner' ? this.swatches('coatColor', CLOTH_COLORS) : ''))
          + this.opt('Oberteil', this.chips('outfit', OUTFITS) + this.swatches('outfitColor', CLOTH_COLORS))
          + this.opt('Schärpe und Akzente', this.swatches('accentColor', CLOTH_COLORS))
          + this.opt('Hose', this.swatches('pantsColor', CLOTH_COLORS))
          + this.opt('Schuhe', `<div class="chips"><button data-a="set" data-k="shoes" data-v="stiefel" aria-pressed="${r.look.shoes === 'stiefel'}">Hohe Stiefel</button><button data-a="set" data-k="shoes" data-v="schuhe" aria-pressed="${r.look.shoes !== 'stiefel'}">Schuhe</button></div>` + this.swatches('shoesColor', ['#5A3A22', '#1E1A20', '#8A5A2B', '#7A1F1A', '#F3E6C8']))
          + this.opt('Kopfbedeckung', this.chips('hat', COSMETIC_HATS as unknown as Record<string, string>) + (r.look.hat !== 'keiner' && r.look.hat !== 'helm' ? this.swatches('hatColor', CLOTH_COLORS) : ''))
          + this.opt('Zubehör', `<div class="chips">${this.toggle('scarf', 'Halstuch')}${this.toggle('gloves', 'Handschuhe')}</div>`);
        break;
      case 'ausruestung':
        body = this.gearTab();
        break;
      case 'sets':
        body = `<p class="tier-desc">${this.o.gear ? 'Alle Rüstungssets des Spiels. Probiere jedes Stück an – auch das, was du noch nicht gefunden hast. Anprobe ändert nichts an deiner Ausrüstung.' : 'So sieht Ausrüstung später aus. Probiere die Sets an, um zu sehen, worauf du hinarbeitest.'}</p>`
          + SETS.map((s) => this.setCard(s)).join('');
        break;
    }
    this.panel.innerHTML = `
      <div class="editor-head"><h2 class="fell">${this.o.isNew ? 'Deine Figur' : 'Aussehen & Ausrüstung'}</h2><button class="mini" data-a="random">🎲 Zufall</button></div>
      <div class="tabs ed3-tabs">${this.tabs().map(([id, ic, l]) => `<button data-a="tab" data-v="${id}" aria-pressed="${id === this.tab}"><span class="ic">${ic}</span>${l}</button>`).join('')}</div>
      <div class="editor-body">${body}</div>
      <div class="row editor-foot">
        <button class="secondary" data-a="cancel">${this.o.isNew ? 'Zurück' : 'Abbrechen'}</button>
        <button class="primary" data-a="done">${this.o.isNew ? 'Ablegen!' : 'Fertig'}</button>
      </div>`;
  }

  dispose() { this.root.remove(); }
}
