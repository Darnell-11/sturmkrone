import type { StyleId } from '../data/animations';
import {
  BEARD_STYLES, BODY_TYPES, BROW_STYLES, CLOTH_COLORS, COATS, EYE_COLORS, EYE_STYLES, FACE_SHAPES, HAIR_COLORS, HAIR_STYLES,
  HATS, MOUTH_STYLES, OUTFITS, SHOES, SKIN_TONES, defaultLook, randomLook, type CharacterLook,
} from '../data/characterParts';
import type { Faction, FightStyle } from '../core/save/types';
import { esc } from './dom';

export interface EditorResult {
  name: string;
  faction: Faction;
  style: FightStyle;
  blade: string;
  look: CharacterLook;
}

export interface EditorOptions {
  /** Neues Spiel: Name und Fraktion wählbar */
  isNew: boolean;
  /** Anime-Figuren (VRoid): nur die Optionen, die dort wirken */
  anime?: boolean;
  initial: EditorResult;
  onChange: (r: EditorResult, styleId: StyleId) => void;
  onPreview: (kind: 'cheer' | 'attack' | 'wave' | 'roll' | 'heavy') => void;
  onRotate: (dx: number) => void;
  onZoom: (d: number) => void;
  onDone: (r: EditorResult) => void;
  onCancel: () => void;
}

type Tab = 'stil' | 'koerper' | 'gesicht' | 'haare' | 'kleidung' | 'extras';
const TABS: [Tab, string][] = [['stil', 'Stil'], ['koerper', 'Körper'], ['gesicht', 'Gesicht'], ['haare', 'Haare'], ['kleidung', 'Kleidung'], ['extras', 'Kopf & Extras']];
const BLADES: Record<string, string> = { saebel: 'Säbel', langklinge: 'Langklinge', zweihaender: 'Zweihänder', doppel: 'Doppelklingen' };
const STYLES: Record<FightStyle, string> = { faust: 'Faustkämpfer', schwert: 'Schwertkämpfer', effekt: 'Faji-Wirker' };
const STYLE_INFO: Record<FightStyle, string> = {
  faust: 'Schnelle Kombos, Tritte und Luftangriffe. Stark gegen viele Gegner auf engem Raum.',
  schwert: 'Klingenkunst mit vier Waffenarten – jede mit eigenen Kombos und Reichweite.',
  effekt: 'Formt Faji zu Geschossen und Elementen. Kämpft lieber auf Abstand und lädt starke Angriffe auf.',
};

export function styleIdOf(style: FightStyle, blade: string): StyleId {
  if (style === 'faust') return 'faust';
  if (style === 'effekt') return 'effekt';
  return (['saebel', 'langklinge', 'zweihaender', 'doppel'].includes(blade) ? blade : 'saebel') as StyleId;
}

/** Charakter-Editor 2.0: Menü über der 3D-Vorschau. */
export class CharacterEditor {
  private root: HTMLElement;
  private panel: HTMLElement;
  private tab: Tab = 'stil';
  private r: EditorResult;

  constructor(parent: HTMLElement, private o: EditorOptions) {
    this.r = structuredClone(o.initial);
    this.root = document.createElement('div');
    this.root.className = 'editor';
    this.root.innerHTML = `
      <div class="editor-stage" aria-label="Vorschau – ziehen zum Drehen">
        <div class="editor-preview">
          <button class="mini" data-p="attack">Angriff</button><button class="mini" data-p="heavy">Schwer</button>
          <button class="mini" data-p="roll">Rolle</button><button class="mini" data-p="cheer">Jubeln</button><button class="mini" data-p="wave">Winken</button>
        </div>
        <div class="editor-zoom"><button class="icon-btn" data-z="-0.15" aria-label="Näher">+</button><button class="icon-btn" data-z="0.15" aria-label="Weiter weg">−</button></div>
      </div>
      <div class="editor-panel card"></div>`;
    parent.appendChild(this.root);
    this.panel = this.root.querySelector('.editor-panel')!;

    const stage = this.root.querySelector<HTMLElement>('.editor-stage')!;
    let drag: number | null = null;
    let lastX = 0;
    stage.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      drag = e.pointerId; lastX = e.clientX; stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => { if (e.pointerId === drag) { this.o.onRotate(e.clientX - lastX); lastX = e.clientX; } });
    stage.addEventListener('pointerup', () => { drag = null; });
    stage.addEventListener('wheel', (e) => { this.o.onZoom(Math.sign(e.deltaY) * 0.08); e.preventDefault(); }, { passive: false });
    stage.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-p],[data-z]');
      if (b?.dataset.p) this.o.onPreview(b.dataset.p as any);
      if (b?.dataset.z) this.o.onZoom(+b.dataset.z);
    });

    this.panel.addEventListener('click', (e) => this.onClick(e));
    this.panel.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.id === 'ed-name') this.r.name = el.value;
      if (el.dataset.k === 'height') { this.r.look.height = +el.value / 100; this.changed(false); }
    });
    this.render();
    this.changed(false);
  }

  private changed(rerender = true) {
    this.o.onChange(this.r, styleIdOf(this.r.style, this.r.blade));
    if (rerender) {
      const y = this.panel.querySelector('.editor-body')?.scrollTop ?? 0;
      this.render();
      const body = this.panel.querySelector('.editor-body');
      if (body) body.scrollTop = y;
    }
  }

  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!el) return;
    const a = el.dataset.a!;
    const k = el.dataset.k as keyof CharacterLook;
    const v = el.dataset.v ?? '';
    const look = this.r.look as any;
    switch (a) {
      case 'tab': this.tab = v as Tab; this.render(); return;
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
      case 'done': this.o.onDone(this.r); return;
      case 'cancel': this.o.onCancel(); return;
      default: return;
    }
    this.changed();
  }

  private chips(k: keyof CharacterLook, opts: Record<string, string>) {
    const cur = (this.r.look as any)[k];
    return `<div class="chips">${Object.entries(opts).map(([id, l]) => `<button data-a="set" data-k="${k}" data-v="${id}" aria-pressed="${cur === id}">${l}</button>`).join('')}</div>`;
  }

  private swatches(k: keyof CharacterLook, colors: string[]) {
    const cur = String((this.r.look as any)[k]).toUpperCase();
    return `<div class="swatches">${colors.map((c) => `<button class="sw" style="background:${c}" data-a="set" data-k="${k}" data-v="${c}" aria-pressed="${cur === c.toUpperCase()}" aria-label="Farbe ${c}"></button>`).join('')}</div>`;
  }

  private toggle(k: keyof CharacterLook, label: string) {
    return `<button data-a="toggle" data-k="${k}" aria-pressed="${!!(this.r.look as any)[k]}">${label}</button>`;
  }

  private opt(label: string, html: string) { return `<div class="opt"><span class="label">${label}</span>${html}</div>`; }

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
        body = this.opt('Körperbau', this.chips('body', BODY_TYPES))
          + this.opt('Größe', `<label class="slider">Größe<input type="range" min="90" max="110" step="1" value="${Math.round(r.look.height * 100)}" data-k="height"><output>${Math.round(r.look.height * 175)} cm</output></label>`)
          + this.opt('Hautton', this.swatches('skin', SKIN_TONES));
        break;
      case 'gesicht':
        if (this.o.anime) { body = this.opt('Augenfarbe', this.swatches('eyeColor', EYE_COLORS)) + '<p class="tier-desc">Die Anime-Figuren haben ein fein gezeichnetes Gesicht mit Mimik: Sie blinzeln, strahlen beim Jubeln und bewegen beim Reden den Mund.</p>'; break; }
        body = this.opt('Gesichtsform', this.chips('face', FACE_SHAPES)) + this.opt('Augen', this.chips('eyes', EYE_STYLES))
          + this.opt('Augenfarbe', this.swatches('eyeColor', EYE_COLORS)) + this.opt('Brauen', this.chips('brows', BROW_STYLES))
          + this.opt('Mund', this.chips('mouth', MOUTH_STYLES));
        break;
      case 'haare':
        if (this.o.anime) {
          const long = ['lang', 'pferdeschwanz', 'zoepfe', 'zopf', 'dutt'].includes(r.look.hair);
          body = this.opt('Figur', `<div class="chips"><button data-a="set" data-k="hair" data-v="kurz" aria-pressed="${!long}">Kurzhaar</button><button data-a="set" data-k="hair" data-v="lang" aria-pressed="${long}">Langhaar</button></div>`)
            + this.opt('Haarfarbe', this.swatches('hairColor', HAIR_COLORS));
          break;
        }
        body = this.opt('Frisur', this.chips('hair', HAIR_STYLES)) + this.opt('Haarfarbe', this.swatches('hairColor', HAIR_COLORS))
          + this.opt('Bart', this.chips('beard', BEARD_STYLES));
        break;
      case 'kleidung':
        if (this.o.anime) {
          body = this.opt('Mantel', this.chips('coat', COATS) + (r.look.coat !== 'keiner' ? this.swatches('coatColor', CLOTH_COLORS) : ''))
            + this.opt('Weste und Hemd', this.swatches('outfitColor', CLOTH_COLORS))
            + this.opt('Gürtel', `<div class="chips"><button data-a="set" data-k="outfit" data-v="hemd" aria-pressed="${r.look.outfit !== 'uniform'}">Schärpe</button><button data-a="set" data-k="outfit" data-v="uniform" aria-pressed="${r.look.outfit === 'uniform'}">Koppel</button></div>` + (r.look.outfit !== 'uniform' ? this.swatches('accentColor', CLOTH_COLORS) : ''))
            + this.opt('Hose', this.swatches('pantsColor', CLOTH_COLORS))
            + this.opt('Schuhe', `<div class="chips"><button data-a="set" data-k="shoes" data-v="stiefel" aria-pressed="${r.look.shoes === 'stiefel'}">Hohe Stiefel</button><button data-a="set" data-k="shoes" data-v="schuhe" aria-pressed="${r.look.shoes !== 'stiefel'}">Schuhe</button></div>` + this.swatches('shoesColor', ['#5A3A22', '#1E1A20', '#8A5A2B', '#7A1F1A', '#F3E6C8']));
          break;
        }
        body = this.opt('Oberteil', this.chips('outfit', OUTFITS)) + this.opt('Hauptfarbe', this.swatches('outfitColor', CLOTH_COLORS))
          + this.opt('Akzentfarbe', this.swatches('accentColor', CLOTH_COLORS)) + this.opt('Hose', this.swatches('pantsColor', CLOTH_COLORS))
          + this.opt('Schuhe', this.chips('shoes', SHOES) + this.swatches('shoesColor', ['#5A3A22', '#1E1A20', '#8A5A2B', '#7A1F1A', '#F3E6C8']))
          + this.opt('Mantel', this.chips('coat', COATS) + (r.look.coat !== 'keiner' ? this.swatches('coatColor', CLOTH_COLORS) : ''));
        break;
      case 'extras':
        body = this.opt('Kopfbedeckung', this.chips('hat', HATS) + (r.look.hat !== 'keiner' && r.look.hat !== 'helm' ? this.swatches('hatColor', CLOTH_COLORS) : ''))
          + this.opt('Accessoires', (this.o.anime ? `<div class="chips">${this.toggle('eyepatch', 'Augenklappe')}${this.toggle('earring', 'Ohrring')}</div>` : `<div class="chips">${this.toggle('eyepatch', 'Augenklappe')}${this.toggle('scar', 'Narbe')}${this.toggle('earring', 'Ohrring')}${this.toggle('scarf', 'Halstuch')}${this.toggle('gloves', 'Handschuhe')}</div>`));
        break;
    }
    this.panel.innerHTML = `
      <div class="editor-head"><h2 class="fell">${this.o.isNew ? 'Deine Figur' : 'Aussehen'}</h2><button class="mini" data-a="random">🎲 Zufall</button></div>
      <div class="tabs">${TABS.map(([id, l]) => `<button data-a="tab" data-v="${id}" aria-pressed="${id === this.tab}">${l}</button>`).join('')}</div>
      <div class="editor-body">${body}</div>
      <div class="row editor-foot">
        <button class="secondary" data-a="cancel">${this.o.isNew ? 'Zurück' : 'Abbrechen'}</button>
        <button class="primary" data-a="done">${this.o.isNew ? 'Ablegen!' : 'Fertig'}</button>
      </div>`;
  }

  dispose() { this.root.remove(); }
}
