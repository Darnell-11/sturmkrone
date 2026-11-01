// Alle Bausteine für Spielfigur und NPCs. Neue Frisuren, Hüte usw.: hier eintragen und im Builder eine Form ergänzen.
import type { Faction } from '../core/save/types';

export const BODY_TYPES = { schmal: 'Schmal', normal: 'Normal', kraeftig: 'Kräftig' } as const;
export const FACE_SHAPES = { rund: 'Rund', schmal: 'Schmal', kantig: 'Kantig' } as const;
export const EYE_STYLES = { gross: 'Groß', scharf: 'Scharf', sanft: 'Sanft', muede: 'Verschlafen' } as const;
export const BROW_STYLES = { normal: 'Normal', dick: 'Buschig', schraeg: 'Entschlossen', hoch: 'Freundlich' } as const;
export const MOUTH_STYLES = { laecheln: 'Lächeln', grinsen: 'Grinsen', ernst: 'Ernst', offen: 'Staunen' } as const;
export const HAIR_STYLES = {
  kurz: 'Kurz', stachel: 'Stachelig', igel: 'Igel', seitenscheitel: 'Seitenscheitel', wuschel: 'Wuschelig',
  lang: 'Lang', pferdeschwanz: 'Pferdeschwanz', zoepfe: 'Zwei Zöpfe', zopf: 'Zopf', dutt: 'Dutt', glatze: 'Glatze',
} as const;
export const BEARD_STYLES = { keiner: 'Keiner', kinnbart: 'Kinnbart', schnurrbart: 'Schnurrbart', vollbart: 'Vollbart', koteletten: 'Koteletten' } as const;
export const OUTFITS = { hemd: 'Hemd', weste: 'Weste', jacke: 'Jacke', matrose: 'Ringelhemd', uniform: 'Uniform', tunika: 'Tunika' } as const;
export const COATS = { keiner: 'Keiner', kurz: 'Kurzer Mantel', lang: 'Langer Mantel', kapitaen: 'Kapitänsmantel' } as const;
export const SHOES = { stiefel: 'Stiefel', schuhe: 'Schuhe', sandalen: 'Sandalen' } as const;
export const HATS = {
  keiner: 'Keiner', dreispitz: 'Dreispitz', zweispitz: 'Zweispitz', bandana: 'Kopftuch', muetze: 'Wollmütze',
  marine: 'Marinemütze', kochmuetze: 'Kochmütze', suedwester: 'Südwester', helm: 'Helm', brille: 'Fliegerbrille',
} as const;

export type BodyType = keyof typeof BODY_TYPES;
export type FaceShape = keyof typeof FACE_SHAPES;
export type EyeStyle = keyof typeof EYE_STYLES;
export type BrowStyle = keyof typeof BROW_STYLES;
export type MouthStyle = keyof typeof MOUTH_STYLES;
export type HairStyle = keyof typeof HAIR_STYLES;
export type BeardStyle = keyof typeof BEARD_STYLES;
export type Outfit = keyof typeof OUTFITS;
export type Coat = keyof typeof COATS;
export type Shoes = keyof typeof SHOES;
export type Hat = keyof typeof HATS;

export interface CharacterLook {
  body: BodyType;
  /** 0.9 … 1.1 */
  height: number;
  skin: string;
  face: FaceShape;
  eyes: EyeStyle;
  eyeColor: string;
  brows: BrowStyle;
  mouth: MouthStyle;
  hair: HairStyle;
  hairColor: string;
  beard: BeardStyle;
  outfit: Outfit;
  outfitColor: string;
  accentColor: string;
  pantsColor: string;
  shoes: Shoes;
  shoesColor: string;
  coat: Coat;
  coatColor: string;
  hat: Hat;
  hatColor: string;
  scar: boolean;
  earring: boolean;
  eyepatch: boolean;
  scarf: boolean;
  /** Fäustlinge (automatisch bei Faustkämpfern) */
  gloves: boolean;
}

export const SKIN_TONES = ['#F7DCC6', '#F0C8A8', '#E8BE96', '#DDA77F', '#C68A5E', '#A9714A', '#8D5A3B', '#6B4229'];
export const HAIR_COLORS = ['#1E1A18', '#3A2618', '#5A3A22', '#8A5A2E', '#A8442A', '#D9B25A', '#F0E6C8', '#C8CCD8', '#2E4F8C', '#3F7A6A', '#C76BA8', '#7A3FA8'];
export const EYE_COLORS = ['#5A3A22', '#2F6FB5', '#3F8F4A', '#C88A2A', '#7A4FB8', '#B8343A', '#5A6A78', '#1FA8A8'];
export const CLOTH_COLORS = [
  '#F3E6C8', '#FFFFFF', '#1E1A20', '#3A3A44', '#7A1F1A', '#A8322A', '#D96C3A', '#E8B33A', '#6E8B3D', '#2F6E4F',
  '#1F7A8C', '#2F8FD9', '#1F4E79', '#14284A', '#4A2E6E', '#8A5A2B', '#5A3A22', '#C8A27A',
];

export const LOOK_OPTIONS = {
  body: BODY_TYPES, face: FACE_SHAPES, eyes: EYE_STYLES, brows: BROW_STYLES, mouth: MOUTH_STYLES,
  hair: HAIR_STYLES, beard: BEARD_STYLES, outfit: OUTFITS, coat: COATS, shoes: SHOES, hat: HATS,
} as const;

export function defaultLook(faction: Faction): CharacterLook {
  return faction === 'pirat'
    ? {
      body: 'normal', height: 1, skin: '#E8BE96', face: 'rund', eyes: 'gross', eyeColor: '#2F6FB5', brows: 'schraeg', mouth: 'grinsen',
      hair: 'stachel', hairColor: '#3A2618', beard: 'keiner', outfit: 'weste', outfitColor: '#A8322A', accentColor: '#F3E6C8',
      pantsColor: '#3A3A44', shoes: 'stiefel', shoesColor: '#5A3A22', coat: 'keiner', coatColor: '#1E1A20', hat: 'bandana', hatColor: '#A8322A',
      scar: false, earring: true, eyepatch: false, scarf: false, gloves: false,
    }
    : {
      body: 'normal', height: 1, skin: '#F0C8A8', face: 'schmal', eyes: 'scharf', eyeColor: '#5A6A78', brows: 'normal', mouth: 'ernst',
      hair: 'seitenscheitel', hairColor: '#D9B25A', beard: 'keiner', outfit: 'uniform', outfitColor: '#FFFFFF', accentColor: '#1F4E79',
      pantsColor: '#14284A', shoes: 'stiefel', shoesColor: '#1E1A20', coat: 'keiner', coatColor: '#14284A', hat: 'marine', hatColor: '#FFFFFF',
      scar: false, earring: false, eyepatch: false, scarf: false, gloves: false,
    };
}

/** Prüft und ergänzt einen gespeicherten Look (unbekannte Werte → Standard). */
export function sanitizeLook(raw: unknown, faction: Faction): CharacterLook {
  const d = defaultLook(faction);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const out: any = { ...d };
  for (const [k, opts] of Object.entries(LOOK_OPTIONS)) if (typeof r[k] === 'string' && r[k] as string in opts) out[k] = r[k];
  for (const k of ['skin', 'eyeColor', 'hairColor', 'outfitColor', 'accentColor', 'pantsColor', 'shoesColor', 'coatColor', 'hatColor']) {
    if (typeof r[k] === 'string' && /^#[0-9a-f]{6}$/i.test(r[k] as string)) out[k] = r[k];
  }
  for (const k of ['scar', 'earring', 'eyepatch', 'scarf', 'gloves']) if (typeof r[k] === 'boolean') out[k] = r[k];
  if (typeof r.height === 'number' && isFinite(r.height)) out.height = Math.min(1.1, Math.max(0.9, r.height));
  return out as CharacterLook;
}

type Rng = () => number;
const pickOf = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const keyOf = <T extends object>(rng: Rng, o: T): keyof T => pickOf(rng, Object.keys(o)) as keyof T;

export type NpcRole = 'buerger' | 'fischer' | 'haendler' | 'pirat' | 'marine' | 'offizier' | 'koch' | 'schmied' | 'wirt';

/** NPC-Baukasten: zufälliger, aber zur Rolle passender Look. */
export function randomLook(rng: Rng, role: NpcRole = 'buerger'): CharacterLook {
  const faction: Faction = role === 'marine' || role === 'offizier' ? 'marine' : 'pirat';
  const l = defaultLook(faction);
  l.body = keyOf(rng, BODY_TYPES);
  l.height = 0.92 + rng() * 0.16;
  l.skin = pickOf(rng, SKIN_TONES);
  l.face = keyOf(rng, FACE_SHAPES);
  l.eyes = keyOf(rng, EYE_STYLES);
  l.eyeColor = pickOf(rng, EYE_COLORS);
  l.brows = keyOf(rng, BROW_STYLES);
  l.mouth = keyOf(rng, MOUTH_STYLES);
  l.hair = keyOf(rng, HAIR_STYLES);
  l.hairColor = pickOf(rng, HAIR_COLORS.slice(0, 8));
  l.beard = rng() < 0.35 ? keyOf(rng, BEARD_STYLES) : 'keiner';
  l.outfit = pickOf(rng, ['hemd', 'weste', 'jacke', 'matrose', 'tunika'] as Outfit[]);
  l.outfitColor = pickOf(rng, CLOTH_COLORS);
  l.accentColor = pickOf(rng, CLOTH_COLORS);
  l.pantsColor = pickOf(rng, ['#3A3A44', '#5A3A22', '#8A5A2B', '#1F4E79', '#C8A27A', '#1E1A20']);
  l.shoes = keyOf(rng, SHOES);
  l.shoesColor = pickOf(rng, ['#5A3A22', '#1E1A20', '#8A5A2B']);
  l.coat = rng() < 0.15 ? 'kurz' : 'keiner';
  l.coatColor = pickOf(rng, CLOTH_COLORS);
  l.hat = rng() < 0.45 ? pickOf(rng, ['dreispitz', 'bandana', 'muetze', 'suedwester', 'keiner'] as Hat[]) : 'keiner';
  l.hatColor = pickOf(rng, CLOTH_COLORS);
  l.scar = rng() < 0.1;
  l.earring = rng() < 0.25;
  l.eyepatch = rng() < 0.05;
  l.scarf = rng() < 0.15;
  switch (role) {
    case 'fischer': l.hat = 'suedwester'; l.hatColor = '#E8C22B'; l.outfit = 'jacke'; l.outfitColor = '#E8C22B'; l.shoes = 'stiefel'; break;
    case 'haendler': l.outfit = 'weste'; l.coat = 'kurz'; l.hat = rng() < 0.5 ? 'keiner' : 'dreispitz'; break;
    case 'koch': l.hat = 'kochmuetze'; l.hatColor = '#FFFFFF'; l.outfit = 'hemd'; l.outfitColor = '#FFFFFF'; break;
    case 'schmied': l.body = 'kraeftig'; l.outfit = 'hemd'; l.outfitColor = '#5A4A3A'; l.hat = 'brille'; l.gloves = true; break;
    case 'wirt': l.body = 'kraeftig'; l.outfit = 'weste'; l.beard = 'vollbart'; break;
    case 'pirat': l.outfit = pickOf(rng, ['matrose', 'weste', 'hemd'] as Outfit[]); l.hat = pickOf(rng, ['bandana', 'dreispitz', 'keiner'] as Hat[]); l.hatColor = pickOf(rng, ['#A8322A', '#1E1A20', '#7A1F1A']); l.eyepatch = rng() < 0.12; l.earring = rng() < 0.5; break;
    case 'marine': l.outfit = 'uniform'; l.outfitColor = '#FFFFFF'; l.accentColor = '#1F4E79'; l.pantsColor = '#14284A'; l.hat = 'marine'; l.hatColor = '#FFFFFF'; l.beard = rng() < 0.2 ? 'schnurrbart' : 'keiner'; l.eyepatch = false; l.scar = false; break;
    case 'offizier': l.outfit = 'uniform'; l.outfitColor = '#FFFFFF'; l.accentColor = '#14284A'; l.coat = 'kapitaen'; l.coatColor = '#14284A'; l.pantsColor = '#FFFFFF'; l.hat = 'zweispitz'; l.hatColor = '#14284A'; break;
    default: break;
  }
  return l;
}
