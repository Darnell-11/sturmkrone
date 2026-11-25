import type { StyleId } from '../data/animations';
import {
  BEARD_STYLES, BODY_TYPES, CLOTH_COLORS, COATS, COSMETIC_HATS, EYE_COLORS, EYE_STYLES, FACE_SHAPES, GENDERS, GLASSES, HAIR_COLORS, HAIR_STYLES, MOUTH_STYLES,
  BROW_STYLES, LOOK_PRESETS, OUTFITS, SKIN_TONES, defaultLook, genderOf, randomLook, type CharacterLook, type Gender, type PresetTab,
} from '../data/characterParts';
import type { ExpressionId } from '../data/characterRig';
import type { Faction, FightStyle } from '../core/save/types';
import { CAT_LABEL, EQUIP_BY_ID, GEAR_CATS, catOf, type EquipDef, type GearCat } from '../data/equipment';
import { SETS, describeBonus, type GearSet } from '../data/gear';
import { RARITY, type Rarity } from '../data/rarity';
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

/** Kamera-Fokus (4.6G): Gesicht, Oberkörper samt Mantel, ganze Figur – Beine und Rücken nur für die Anprobe */
export type CamPreset = 'gesicht' | 'kopf' | 'oberkoerper' | 'ganz' | 'beine' | 'ruecken';
export type StagePoseId = 'hafen' | 'kampf' | 'erwachen';
export type StageLightId = 'sonne' | 'laterne';

/** Reiter des Editors (4.6G) */
export type Tab = 'koerper' | 'gesicht' | 'haare' | 'kleidung' | 'accessoires' | 'ruestung';
export const EDITOR_TABS: readonly { id: Tab; icon: string; label: string }[] = [
  { id: 'koerper', icon: '🧍', label: 'Körper & Statur' },
  { id: 'gesicht', icon: '🙂', label: 'Gesicht & Augen' },
  { id: 'haare', icon: '💇', label: 'Haare & Bärte' },
  { id: 'kleidung', icon: '🧥', label: 'Kleidung & Mäntel' },
  { id: 'accessoires', icon: '🎩', label: 'Hüte & Accessoires' },
  { id: 'ruestung', icon: '🛡', label: 'Rüstung & Waffen-Optik' },
];
/** Kamera-Knöpfe auf der Bühne */
export const CAM_FOCUS: readonly { id: CamPreset; label: string }[] = [
  { id: 'gesicht', label: 'Gesicht (Nahaufnahme)' },
  { id: 'oberkoerper', label: 'Oberkörper & Mantel' },
  { id: 'ganz', label: 'Ganzkörper' },
];
/** Haltungen auf dem Drehteller */
export const STAGE_POSES: readonly { id: StagePoseId; label: string }[] = [
  { id: 'hafen', label: 'Entspannte Hafen-Haltung' },
  { id: 'kampf', label: 'Kampfbereitschaft' },
  { id: 'erwachen', label: 'Sturm-Erwachen' },
];
/** Licht im Studio */
export const STAGE_LIGHTS: readonly { id: StageLightId; label: string }[] = [
  { id: 'sonne', label: 'Hafen-Sonne' },
  { id: 'laterne', label: 'Nacht-Laterne' },
];
/** Mimik zur Vorschau (nicht gespeichert: die Figur wechselt im Spiel selbst je nach Lage) */
export const MOOD_PREVIEW: readonly { id: ExpressionId; label: string }[] = [
  { id: 'hafen', label: 'Gelassen' }, { id: 'jubel', label: 'Freudig' }, { id: 'entschlossen', label: 'Entschlossen' },
  { id: 'grimmig', label: 'Grimmig' }, { id: 'erstaunt', label: 'Erstaunt' },
];
/** Unterbereiche des Reiters „Rüstung & Waffen-Optik“ */
type Sub = 'waffe' | 'angelegt' | 'kammer';
export const ARMOR_SUBS: readonly { id: Sub; label: string }[] = [
  { id: 'waffe', label: 'Waffen-Optik' }, { id: 'angelegt', label: 'Angelegt' }, { id: 'kammer', label: 'Rüstkammer' },
];
/** Längste Beschriftung eines Knopfes, die ohne Kürzen in eine Zeile passt (Tests) */
export const EDITOR_LABEL_MAX = 26;

export const BLADES: Record<string, string> = { saebel: 'Säbel', langklinge: 'Langklinge', zweihaender: 'Zweihänder', doppel: 'Doppelklingen' };
export const STYLES: Record<FightStyle, string> = { faust: 'Faustkämpfer', schwert: 'Schwertkämpfer', effekt: 'Faji-Wirker' };
const STYLE_INFO: Record<FightStyle, string> = {
  faust: 'Schnelle Kombos, Tritte und Luftangriffe. Stark gegen viele Gegner auf engem Raum.',
  schwert: 'Klingenkunst mit vier Waffenarten – jede mit eigenen Kombos und Reichweite.',
  effekt: 'Formt Faji zu Geschossen und Elementen. Kämpft lieber auf Abstand und lädt starke Angriffe auf.',
};
/** Kurzbeschreibung der Staturen (Schlüssel = Körperbau im Spielstand) */
export const BODY_INFO: Record<string, string> = { schmal: 'Schlank und flink', normal: 'Ausgewogen und sportlich', kraeftig: 'Breit und kräftig' };
const SLOT_ICON: Record<GearCat, string> = { head: '🪖', shoulder: '🛡', chest: '🦺', cloak: '🧣', hands: '🧤', legs: '👖', feet: '🥾', mainhand: '🗡', offhand: '🔪' };
/** Farben für Metall und Stoff, die man beim Färben zusätzlich sucht */
const DYE_COLORS = [...CLOTH_COLORS, '#9AA3AD', '#C9A13B', '#E3B04B', '#B070FF', '#7FD8FF', '#C8302A', '#F2F0EA', '#17121F'];
/** Kopfbedeckungen ohne eigene Farbe (Stahlhelm) */
const HAT_NO_COLOR = new Set(['keiner', 'helm']);
/** 4.6G.2: Größe der Grundfiguren in cm (Regler „Größe“ zeigt Grundgröße × Faktor) */
export const BASE_CM: Record<Gender, number> = { male: 175, female: 164 };

/** 4.6G.2: Kurzbeschreibung der Geschlechter (Karten oben im Reiter „Körper & Statur“) */
export const GENDER_INFO: Record<Gender, string> = { male: 'Breite Schultern, kantiges Kinn', female: 'Schmale Taille, eigene Haltung' };

/**
 * 4.6G.2: Aussehen auf ein anderes Geschlecht umstellen – Grundfrisur des Geschlechts, kein Bart bei Frauen, alles andere (Farben, Kleidung,
 * Hüte) bleibt. Rein (Tests).
 */
export function lookForGender(look: CharacterLook, g: Gender): CharacterLook {
  const out: CharacterLook = { ...look, gender: g };
  if (g === 'female') { out.beard = 'keiner'; out.hair = 'lang'; out.height = Math.min(out.height, 1.02); }
  else if (genderOf(look) === 'female') out.hair = 'kurz';
  return out;
}

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
  /** Ziehen: dx dreht um die Figur, dy wandert auf dem Bogen nach oben/unten */
  onRotate: (dx: number, dy: number) => void;
  onZoom: (d: number) => void;
  onPreset: (p: CamPreset) => void;
  /** Farbiger Schein hinter der Figur (Seltenheit des gezeigten Stücks), null = aus */
  onAura: (color: string | null) => void;
  onSpin: (on: boolean) => void;
  /** 4.6G: Haltung, Licht, Mimik-Vorschau, Regler „Ausrüstungs-Aura“ (0 … 1) */
  onPose?: (p: StagePoseId) => void;
  onLight?: (l: StageLightId) => void;
  onMood?: (id: ExpressionId) => void;
  auraLevel?: number;
  onAuraLevel?: (v: number) => void;
  onDone: (r: EditorResult) => void;
  onCancel: () => void;
}

export function styleIdOf(style: FightStyle, blade: string): StyleId {
  if (style === 'faust') return 'faust';
  if (style === 'effekt') return 'effekt';
  return (['saebel', 'langklinge', 'zweihaender', 'doppel'].includes(blade) ? blade : 'saebel') as StyleId;
}

/** Sichtbare Sets der Rüstkammer: verborgene erst, wenn ein Stück im Besitz ist */
export function armorySets(owned: readonly string[]): GearSet[] {
  return SETS.filter((s) => !s.secret || Object.keys(s.pieces).some((c) => owned.includes(`${s.id}_${c}`)));
}

/**
 * Charakter-Editor 4.6G: Studio-Bühne mit Kamera-Fokus (Gesicht, Oberkörper & Mantel, Ganzkörper; frei drehbar), Haltungen (Hafen,
 * Kampfbereitschaft, Sturm-Erwachen) und Licht (Hafen-Sonne, Nacht-Laterne); sechs Reiter für Körper, Gesicht, Haare und Bärte,
 * Kleidung, Hüte und Zubehör, Rüstung und Waffen. Rein darstellend – Änderungen laufen über die Rückrufe in EditorOptions.
 */
export class CharacterEditor {
  private root: HTMLElement;
  private panel: HTMLElement;
  private tab: Tab = 'koerper';
  private sub: Sub = 'waffe';
  private r: EditorResult;
  private slot: GearCat = 'chest';
  private tryOn: string[] | null = null;
  private tryName = '';
  private spin = true;
  private pose: StagePoseId = 'hafen';
  private light: StageLightId = 'sonne';
  private mood: ExpressionId | null = null;
  private auraLevel: number;

  constructor(parent: HTMLElement, private o: EditorOptions) {
    this.r = structuredClone(o.initial);
    this.auraLevel = o.auraLevel ?? 0.7;
    this.root = document.createElement('div');
    this.root.className = 'editor ed3';
    const grp = (cap: string, p: string, items: readonly { id: string; label: string }[], cur: string) =>
      `<div class="ed3-grp" role="group" aria-label="${cap}"><span class="ed3-cap">${cap}</span>${items.map((b) => `<button class="mini" data-p="${p}" data-v="${b.id}" aria-pressed="${b.id === cur}">${b.label}</button>`).join('')}</div>`;
    this.root.innerHTML = `
      <div class="editor-stage" aria-label="Vorschau – ziehen zum Drehen (auch nach oben und unten), Mausrad oder zwei Finger zum Zoomen">
        <div class="ed3-left">
          ${grp('Kamera', 'cam', CAM_FOCUS, 'ganz')}
          ${grp('Haltung', 'pose', STAGE_POSES, this.pose)}
          ${grp('Licht', 'light', STAGE_LIGHTS, this.light)}
        </div>
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
    // Ziehen dreht (waagrecht rundum, senkrecht ein Stück über und unter die Figur), zwei Finger zoomen
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
      this.o.onRotate(e.clientX - p.x, e.clientY - p.y);
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
      else if (b.dataset.p === 'pose') this.setPose(b.dataset.v as StagePoseId);
      else if (b.dataset.p === 'light') this.setLight(b.dataset.v as StageLightId);
      else if (b.dataset.p === 'spin') { this.spin = !this.spin; b.setAttribute('aria-pressed', String(this.spin)); this.o.onSpin(this.spin); }
      else if (b.dataset.p) this.o.onPreview(b.dataset.p as 'attack');
      else if (b.dataset.a === 'tryoff') this.endTry();
    });

    this.panel.addEventListener('click', (e) => this.onClick(e));
    this.panel.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.id === 'ed-name') this.r.name = el.value;
      if (el.dataset.k === 'height') { this.r.look.height = +el.value / 100; this.changed(false); el.parentElement?.querySelector('output')!.replaceChildren(`${Math.round(this.r.look.height * BASE_CM[genderOf(this.r.look)])} cm`); }
      if (el.dataset.k === 'gearaura') { this.auraLevel = +el.value / 100; this.o.onAuraLevel?.(this.auraLevel); el.parentElement?.querySelector('output')!.replaceChildren(`${Math.round(this.auraLevel * 100)} %`); }
    });
    this.panel.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.a === 'dyepick') this.dyePick(el.dataset.i === '1' ? 1 : 0, el.value);
    });
    this.render();
    this.changed(false);
  }

  // ---------- Zustand ----------

  private setCam(p: CamPreset) {
    this.root.querySelectorAll<HTMLElement>('[data-p="cam"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === p)));
    this.o.onPreset(p);
  }

  private setPose(p: StagePoseId) {
    this.pose = p;
    this.mood = null;
    this.root.querySelectorAll<HTMLElement>('[data-p="pose"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === p)));
    this.o.onPose?.(p);
    if (this.tab === 'gesicht') this.render();
  }

  private setLight(l: StageLightId) {
    this.light = l;
    this.root.querySelectorAll<HTMLElement>('[data-p="light"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === l)));
    this.o.onLight?.(l);
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
    if (ids.length > 2) this.setCam('ganz'); else if (ids.length === 1) this.setCam(this.camFor(catOf(EQUIP_BY_ID[ids[0]])));
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
      case 'tab': {
        this.tab = v as Tab;
        // passender Blick je Reiter; Rüstung und Waffen zeigt die Figur kampfbereit mit der Waffe in der Hand
        if (v === 'gesicht') this.setCam('gesicht');
        else if (v === 'haare' || v === 'accessoires') this.setCam('kopf');
        else if (v === 'kleidung') this.setCam('oberkoerper');
        else if (v === 'ruestung') { this.setCam(this.sub === 'angelegt' ? this.camFor(this.slot) : 'ganz'); if (this.pose === 'hafen') this.setPose('kampf'); }
        else this.setCam('ganz');
        this.render();
        return;
      }
      case 'sub': this.sub = v as Sub; if (v === 'angelegt') this.setCam(this.camFor(this.slot)); this.render(); return;
      case 'set': look[k] = v; break;
      case 'toggle': look[k] = !look[k]; break;
      case 'mood': this.mood = v as ExpressionId; this.o.onMood?.(this.mood); this.render(); return;
      case 'gender': {
        // 4.6G.2: Geschlecht wechseln – Grundfigur, Haltung und Schnitte folgen, die übrigen Werte bleiben
        this.r.look = lookForGender(this.r.look, v === 'female' ? 'female' : 'male');
        break;
      }
      case 'preset': {
        const p = LOOK_PRESETS[genderOf(this.r.look)][this.tab as PresetTab]?.find((x) => x.id === v);
        if (!p) return;
        this.r.look = { ...this.r.look, ...p.look };
        if (genderOf(this.r.look) === 'female') this.r.look.beard = 'keiner';
        break;
      }
      case 'faction': {
        this.r.faction = v as Faction;
        const keepName = this.r.name !== 'Fynn' && this.r.name !== 'Rekrut';
        this.r.look = { ...defaultLook(this.r.faction, genderOf(this.r.look)), gloves: this.r.style === 'faust' };
        if (!keepName) this.r.name = this.r.faction === 'pirat' ? 'Fynn' : 'Rekrut';
        break;
      }
      case 'style': this.r.style = v as FightStyle; this.r.look.gloves = v === 'faust'; break;
      case 'blade': this.r.blade = v; break;
      case 'random': {
        // 4.6G.2: Zufall behält das gewählte Geschlecht (Frisur und Bart passend dazu)
        const keep = { gloves: this.r.look.gloves };
        const g = genderOf(this.r.look);
        this.r.look = lookForGender({ ...randomLook(Math.random, this.r.faction === 'marine' ? 'marine' : 'pirat'), ...keep }, g);
        if (g === 'male' && genderOf({ hair: this.r.look.hair }) === 'female') this.r.look.hair = 'stachel';
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

  private chips(k: keyof CharacterLook, opts: Record<string, string>, fallback?: string) {
    const raw = (this.r.look as unknown as Record<string, unknown>)[k];
    const cur = raw ?? fallback;
    return `<div class="chips">${Object.entries(opts).map(([id, l]) => `<button data-a="set" data-k="${k}" data-v="${id}" aria-pressed="${cur === id}">${l}</button>`).join('')}</div>`;
  }

  private cards(k: keyof CharacterLook, opts: Record<string, string>, info: Record<string, string> = {}) {
    const cur = (this.r.look as unknown as Record<string, unknown>)[k];
    return `<div class="ed3-cards">${Object.entries(opts).map(([id, l]) => `<button class="ed3-pick" data-a="set" data-k="${k}" data-v="${id}" aria-pressed="${cur === id}"><b>${l}</b>${info[id] ? `<small>${info[id]}</small>` : ''}</button>`).join('')}</div>`;
  }

  private swatches(k: keyof CharacterLook, colors: string[], label: string) {
    const cur = String((this.r.look as unknown as Record<string, unknown>)[k]).toUpperCase();
    return `<div class="swatches">${colors.map((c) => `<button class="sw" style="background:${c}" data-a="set" data-k="${k}" data-v="${c}" aria-pressed="${cur === c.toUpperCase()}" aria-label="${label}: ${c}" title="${label}"></button>`).join('')}</div>`;
  }

  private toggle(k: keyof CharacterLook, label: string) {
    return `<button data-a="toggle" data-k="${k}" aria-pressed="${!!(this.r.look as unknown as Record<string, unknown>)[k]}">${label}</button>`;
  }

  private opt(label: string, html: string) { return `<div class="opt"><span class="label">${label}</span>${html}</div>`; }

  /** 4.6G.2: Vorlagen des Reiters für das gewählte Geschlecht (setzen mehrere Werte auf einmal) */
  private presets(tab: PresetTab) {
    const list = LOOK_PRESETS[genderOf(this.r.look)][tab];
    if (!list?.length) return '';
    return this.opt('Vorlagen', `<div class="chips ed3-presets">${list.map((p) => `<button data-a="preset" data-v="${p.id}">${esc(p.label)}</button>`).join('')}</div>`);
  }

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
      return `<button class="ed3-slot" style="--c:${rc}" data-a="slot" data-v="${c}" aria-pressed="${this.slot === c}" title="${CAT_LABEL[c]}"><span class="ic">${SLOT_ICON[c]}</span><small>${CAT_LABEL[c]}</small><em>${esc(d?.n ?? 'leer')}</em></button>`;
    }).join('')}</div>`;
    const mine = owned.map((id) => EQUIP_BY_ID[id]).filter((d): d is EquipDef => !!d && catOf(d) === this.slot);
    const list = `<h3>${CAT_LABEL[this.slot]} <small class="soft">(${mine.length} im Beutel)</small></h3>
      <div class="ed3-list">
        <button class="ed3-item none" data-a="wear" data-v="-" aria-pressed="${!worn[this.slot]}"><span class="ic">✕</span><span class="tx"><b>Nichts anlegen</b><small>Dein eigener Look aus „Kleidung & Mäntel“ zeigt sich.</small></span></button>
        ${mine.map((d) => this.pieceCard(d, worn[this.slot] === d.id, 'wear')).join('') || '<p class="soft small">Hier liegt noch nichts. Besiege Gegner, öffne Truhen oder kaufe Sets beim Ausrüster – in der Rüstkammer siehst du, was es gibt.</p>'}
      </div>`;
    const cur = worn[this.slot] ? EQUIP_BY_ID[worn[this.slot]!] : null;
    let dye = '';
    if (cur) {
      const pal = dyes[cur.id] ?? cur.palette ?? ['#8A8F98', '#E3B04B'];
      const row = (i: 0 | 1, label: string) => `<div class="ed3-dye"><span class="label">${label}</span><div class="swatches">${DYE_COLORS.map((c) => `<button class="sw" style="background:${c}" data-a="dyeset" data-v="${i}|${c}" aria-pressed="${pal[i].toUpperCase() === c.toUpperCase()}" aria-label="${label}: ${c}"></button>`).join('')}<label class="sw pick" style="background:${pal[i]}" title="Eigene Farbe"><input type="color" data-a="dyepick" data-i="${i}" value="${pal[i]}" aria-label="Eigene Farbe ${label}"></label></div></div>`;
      dye = `<h3>Farben <small class="soft">${esc(cur.n)}</small></h3>${row(0, 'Hauptfarbe')}${row(1, 'Zierfarbe (Borten, Metall, Leuchten)')}<button class="mini" data-a="dyereset">Werksfarben</button>`;
    }
    const sb = setBonuses(GEAR_CATS.map((c) => worn[c]).filter(Boolean).map((id) => EQUIP_BY_ID[id!]));
    const bonus = sb.length ? `<h3>Setbonus</h3><ul class="ed3-bonus">${sb.map((s) => { const set = SETS.find((x) => x.id === s.set)!; return `<li><b>${esc(set.n)}</b> ${s.n}/${s.total} ${s.bonus ? `<i>${esc(describeBonus(s.bonus))}</i>` : `<span class="soft">ab 3 Teilen: ${esc(describeBonus(set.bonus3))}</span>`}</li>`; }).join('')}</ul>` : '';
    return doll + list + dye + bonus;
  }

  private setCard(set: GearSet): string {
    const owned = this.o.gear?.owned() ?? [];
    const cats = Object.keys(set.pieces) as GearCat[];
    const have = cats.filter((c) => owned.includes(`${set.id}_${c}`)).length;
    const rc = RARITY[set.rarity].col;
    const trying = this.tryOn?.length && this.tryOn.every((i) => EQUIP_BY_ID[i]?.set === set.id) && this.tryOn.length === cats.length;
    return `<div class="ed3-set${set.endgame ? ' endgame' : ''}" style="--c:${rc}">
      <div class="ed3-sethead"><b>${esc(set.n)}</b>${this.rarityPill(set.rarity)}<span class="soft small">ab Stufe ${set.level}</span></div>
      <p class="small">${esc(set.d)}</p>
      ${set.source ? `<p class="small soft">${esc(set.source)}</p>` : ''}
      <div class="ed3-pieces">${cats.map((c) => { const id = `${set.id}_${c}`, d = EQUIP_BY_ID[id], own = owned.includes(id); return `<button class="ed3-piece${own ? ' own' : ''}" data-a="trypiece" data-v="${id}" title="${esc(d.n)} – anprobieren" aria-label="${esc(d.n)} anprobieren">${SLOT_ICON[c]}<i>${own ? '✓' : '🔒'}</i></button>`; }).join('')}</div>
      <p class="small soft">Setbonus: ab 3 Teilen ${esc(describeBonus(set.bonus3))} · komplett ${esc(describeBonus(set.bonusAll))}</p>
      <div class="row"><button class="mini ${trying ? '' : 'brass'}" data-a="${trying ? 'tryoff' : 'try'}" data-v="${set.id}">${trying ? 'Anprobe beenden' : 'Ganzes Set anprobieren'}</button>${have && this.o.gear ? `<button class="mini" data-a="wearset" data-v="${set.id}">Anlegen (${have}/${cats.length})</button>` : ''}</div>
    </div>`;
  }

  /** „Rüstung & Waffen-Optik“: Kampfstil und Klinge, angelegte Ausrüstung, Rüstkammer; dazu der Regler der Ausrüstungs-Aura */
  private armorTab(): string {
    const r = this.r;
    const subs = ARMOR_SUBS.filter((s) => s.id !== 'angelegt' || this.o.gear);
    if (!subs.some((s) => s.id === this.sub)) this.sub = 'waffe';
    const head = `<div class="chips ed3-sub" role="tablist">${subs.map((s) => `<button data-a="sub" data-v="${s.id}" aria-pressed="${this.sub === s.id}">${s.label}</button>`).join('')}</div>`;
    if (this.sub === 'angelegt') return head + this.gearTab();
    if (this.sub === 'kammer') {
      const owned = this.o.gear?.owned() ?? [];
      return head + `<p class="tier-desc">${this.o.gear ? 'Alle Rüstungssets des Spiels. Probiere jedes Stück an – auch das, was du noch nicht gefunden hast. Anprobe ändert nichts an deiner Ausrüstung.' : 'So sieht Ausrüstung später aus. Probiere die Sets an, um zu sehen, worauf du hinarbeitest.'}</p>`
        + armorySets(owned).map((s) => this.setCard(s)).join('');
    }
    return head
      + this.opt('Kampfstil', `<div class="chips">${Object.entries(STYLES).map(([id, l]) => `<button data-a="style" data-v="${id}" aria-pressed="${r.style === id}">${l}</button>`).join('')}</div><p class="tier-desc">${STYLE_INFO[r.style]}</p>`)
      + (r.style === 'schwert' ? this.opt('Klingenform', `<div class="chips">${Object.entries(BLADES).map(([id, l]) => `<button data-a="blade" data-v="${id}" aria-pressed="${r.blade === id}">${l}</button>`).join('')}</div><p class="tier-desc">Außerhalb des Kampfs steckt die Klinge auf dem Rücken – unter einem Umhang verdeckt.</p>`) : '')
      + this.opt('Ausrüstungs-Aura', `<label class="slider">Stärke<input type="range" min="0" max="100" step="5" value="${Math.round(this.auraLevel * 100)}" data-k="gearaura"><output>${Math.round(this.auraLevel * 100)} %</output></label><p class="tier-desc">Funken, Glut und Sternenstaub der Kaiser- und Endgame-Sets samt leuchtender Säume. Im Kampf werden sie stärker.</p>`);
  }

  private render() {
    const r = this.r;
    const anime = !!this.o.anime;
    let body = '';
    switch (this.tab) {
      case 'koerper':
        body = (this.o.isNew ? this.opt('Name', `<input id="ed-name" class="txt" maxlength="24" value="${esc(r.name)}" autocomplete="off" aria-label="Name">`)
          + this.opt('Fraktion', `<div class="chips"><button data-a="faction" data-v="pirat" aria-pressed="${r.faction === 'pirat'}">Pirat</button><button data-a="faction" data-v="marine" aria-pressed="${r.faction === 'marine'}">Marine</button></div>
            <p class="tier-desc">${r.faction === 'pirat' ? 'Du beginnst als Schiffsjunge – frei, laut und ohne Gesetz.' : 'Du beginnst als Rekrut der Marine – mit Befehlen, Ehre und Pflicht.'}</p>`) : '')
          + this.opt('Geschlecht', `<div class="ed3-cards">${(Object.keys(GENDERS) as Gender[]).map((g) => `<button class="ed3-pick" data-a="gender" data-v="${g}" aria-pressed="${genderOf(r.look) === g}"><b>${GENDERS[g]}</b><small>${GENDER_INFO[g]}</small></button>`).join('')}</div>`)
          + this.presets('koerper')
          + this.opt('Statur', this.cards('body', BODY_TYPES, BODY_INFO))
          + this.opt('Größe', `<label class="slider">Größe<input type="range" min="90" max="110" step="1" value="${Math.round(r.look.height * 100)}" data-k="height"><output>${Math.round(r.look.height * BASE_CM[genderOf(r.look)])} cm</output></label>`)
          + this.opt('Hautton', this.swatches('skin', SKIN_TONES, 'Hautton'));
        break;
      case 'gesicht':
        body = this.presets('gesicht') + this.opt('Augenfarbe', this.swatches('eyeColor', EYE_COLORS, 'Augenfarbe'))
          + (anime ? '<p class="tier-desc">Die Anime-Figuren haben ein fein gezeichnetes Gesicht mit Mimik: Sie blinzeln, strahlen beim Jubeln und bewegen beim Reden den Mund.</p>'
            : this.opt('Gesichtsform', this.chips('face', FACE_SHAPES)) + this.opt('Augen', this.chips('eyes', EYE_STYLES)) + this.opt('Brauen', this.chips('brows', BROW_STYLES)) + this.opt('Mund', this.chips('mouth', MOUTH_STYLES)))
          + this.opt('Mimik ansehen', `<div class="chips">${MOOD_PREVIEW.map((m) => `<button data-a="mood" data-v="${m.id}" aria-pressed="${this.mood === m.id}">${m.label}</button>`).join('')}</div><p class="tier-desc">Nur zur Vorschau – im Spiel wechselt die Miene von selbst.</p>`)
          + this.opt('Zeichen', `<div class="chips">${this.toggle('scar', 'Narbe')}</div>`);
        break;
      case 'haare': {
        if (anime) {
          // 4.6G.2: die Grundfrisur gehört zum Geschlecht (oben in „Körper & Statur“); Bärte nur bei männlichen Figuren
          const female = genderOf(r.look) === 'female';
          body = this.presets('haare')
            + this.opt('Frisur', `<div class="ed3-cards"><button class="ed3-pick" data-a="set" data-k="hairModel" data-v="" aria-pressed="${!r.look.hairModel}"><b>Grundfrisur</b><small>${female ? 'Lange Zöpfe der Heldin' : 'Wilde Stachelfrisur'}</small></button><button class="ed3-pick" data-a="set" data-k="hairModel" data-v="frisur_mehrlagig" aria-pressed="${r.look.hairModel === 'frisur_mehrlagig'}"><b>Mehrlagig</b><small>Nacken-, Seiten- und Ponysträhnen</small></button></div>`)
            + this.opt('Haarfarbe', this.swatches('hairColor', HAIR_COLORS, 'Haarfarbe'))
            + (female ? '' : this.opt('Bart', this.chips('beard', BEARD_STYLES) + '<p class="tier-desc">Weich geformte Strähnen in der Haarfarbe, die der Kiefer- und Lippenlinie folgen.</p>'));
          break;
        }
        body = this.opt('Frisur', this.chips('hair', HAIR_STYLES)) + this.opt('Haarfarbe', this.swatches('hairColor', HAIR_COLORS, 'Haarfarbe')) + this.opt('Bart', this.chips('beard', BEARD_STYLES));
        break;
      }
      case 'kleidung':
        body = '<p class="tier-desc">Dein eigener Look. Ausrüstung aus Beute und Laden legt sich darüber und ersetzt, was am selben Platz sitzt. Alle Schnitte passen sich der Figur an.</p>'
          + this.presets('kleidung')
          + this.opt('Mantel', this.chips('coat', COATS) + (r.look.coat !== 'keiner' ? this.swatches('coatColor', CLOTH_COLORS, 'Mantelfarbe') : '') + (r.look.coat === 'schulter' ? '<p class="tier-desc">Lässig über die Schultern gelegt – die leeren Ärmel schwingen frei.</p>' : ''))
          + this.opt('Oberteil', this.chips('outfit', OUTFITS) + this.swatches('outfitColor', CLOTH_COLORS, 'Farbe des Oberteils'))
          + this.opt('Schärpe und Borten', this.swatches('accentColor', CLOTH_COLORS, 'Zierfarbe'))
          + this.opt('Hose', this.swatches('pantsColor', CLOTH_COLORS, 'Hosenfarbe'))
          + this.opt('Schuhe', `<div class="chips"><button data-a="set" data-k="shoes" data-v="stiefel" aria-pressed="${r.look.shoes === 'stiefel'}">Hohe Stiefel</button><button data-a="set" data-k="shoes" data-v="schuhe" aria-pressed="${r.look.shoes !== 'stiefel'}">Schuhe</button></div>` + this.swatches('shoesColor', ['#5A3A22', '#1E1A20', '#8A5A2B', '#7A1F1A', '#F3E6C8'], 'Schuhfarbe'))
          + this.opt('Halstuch', `<div class="chips">${this.toggle('scarf', 'Halstuch tragen')}</div>`);
        break;
      case 'accessoires':
        body = this.presets('accessoires') + this.opt('Kopfbedeckung', this.chips('hat', COSMETIC_HATS as unknown as Record<string, string>) + (!HAT_NO_COLOR.has(r.look.hat) ? this.swatches('hatColor', CLOTH_COLORS, 'Hutfarbe') : ''))
          + this.opt('Brille', this.chips('glasses', GLASSES as unknown as Record<string, string>, 'keine') + '<p class="tier-desc">Brillen sitzen vor den Augen und lassen sich mit jedem Hut kombinieren.</p>')
          + this.opt('Schmuck und Zubehör', `<div class="chips">${this.toggle('eyepatch', 'Augenklappe')}${this.toggle('earring', 'Ohrring')}${this.toggle('gloves', 'Handschuhe')}</div>`);
        break;
      case 'ruestung':
        body = this.armorTab();
        break;
    }
    this.panel.innerHTML = `
      <div class="editor-head"><h2 class="fell">${this.o.isNew ? 'Deine Figur' : 'Aussehen & Ausrüstung'}</h2><button class="mini" data-a="random">🎲 Zufall</button></div>
      <div class="tabs ed3-tabs">${EDITOR_TABS.map((t) => `<button data-a="tab" data-v="${t.id}" aria-pressed="${t.id === this.tab}"><span class="ic">${t.icon}</span><span class="tl">${t.label}</span></button>`).join('')}</div>
      <div class="editor-body">${body}</div>
      <div class="row editor-foot">
        <button class="secondary" data-a="cancel">${this.o.isNew ? 'Zurück' : 'Abbrechen'}</button>
        <button class="primary" data-a="done">${this.o.isNew ? 'Ablegen!' : 'Fertig'}</button>
      </div>`;
  }

  dispose() { this.root.remove(); }
}
