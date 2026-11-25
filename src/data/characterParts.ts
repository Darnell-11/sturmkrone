// Alle Bausteine für Spielfigur und NPCs. Neue Frisuren, Hüte usw.: hier eintragen und im Builder eine Form ergänzen.
import type { Faction } from '../core/save/types';

// 4.6G: Namen der Staturen wie im Figuren-Rig (data/characterRig.ts BUILDS); die Schlüssel bleiben (Spielstände)
export const BODY_TYPES = { schmal: 'Schlank', normal: 'Athletisch', kraeftig: 'Wuchtig' } as const;
export const FACE_SHAPES = { rund: 'Rund', schmal: 'Schmal', kantig: 'Kantig' } as const;
export const EYE_STYLES = { gross: 'Groß', scharf: 'Scharf', sanft: 'Sanft', muede: 'Verschlafen' } as const;
export const BROW_STYLES = { normal: 'Normal', dick: 'Buschig', schraeg: 'Entschlossen', hoch: 'Freundlich' } as const;
export const MOUTH_STYLES = { laecheln: 'Lächeln', grinsen: 'Grinsen', ernst: 'Ernst', offen: 'Staunen' } as const;
export const HAIR_STYLES = {
  kurz: 'Kurz', stachel: 'Stachelig', igel: 'Igel', seitenscheitel: 'Seitenscheitel', wuschel: 'Wuschelig',
  lang: 'Lang', pferdeschwanz: 'Pferdeschwanz', zoepfe: 'Zwei Zöpfe', zopf: 'Zopf', dutt: 'Dutt', glatze: 'Glatze',
} as const;
// 4.6G.2: Drei-Tage-Bart (Stoppeln) neu; Bärte bestehen aus geformten Strähnen (vroid.ts `beard`)
export const BEARD_STYLES = { keiner: 'Keiner', stoppeln: 'Drei-Tage-Bart', kinnbart: 'Kinnbart', schnurrbart: 'Schnurrbart', vollbart: 'Vollbart', koteletten: 'Koteletten' } as const;
export const OUTFITS = { hemd: 'Hemd', weste: 'Weste', jacke: 'Jacke', matrose: 'Ringelhemd', uniform: 'Uniform', tunika: 'Tunika' } as const;
export const COATS = { keiner: 'Keiner', kurz: 'Kurzer Mantel', lang: 'Langer Mantel', kapitaen: 'Kapitänsmantel', schulter: 'Schultermantel' } as const;
export const SHOES = { stiefel: 'Stiefel', schuhe: 'Schuhe', sandalen: 'Sandalen' } as const;
/** Kopfbedeckungen, die jeder frei wählen kann (Editor). Die Fliegerbrille ist seit 4.6G eine Brille (GLASSES), kein Hut mehr. */
export const COSMETIC_HATS = {
  keiner: 'Keiner', dreispitz: 'Dreispitz', zweispitz: 'Zweispitz', bandana: 'Kopftuch', muetze: 'Wollmütze',
  marine: 'Marinemütze', kochmuetze: 'Kochmütze', suedwester: 'Südwester', helm: 'Helm',
} as const;
/** Brillen (4.6G): eigene Kategorie – Hut und Brille lassen sich zusammen tragen */
export const GLASSES = { keine: 'Keine', flieger: 'Fliegerbrille', rund: 'Runde Brille', monokel: 'Monokel' } as const;
export type Glasses = keyof typeof GLASSES;
/** Helme der Ausrüstung (gear/rigid.ts): kommen nur als Beute und aus dem Laden, nicht aus dem Editor */
export const GEAR_HATS = {
  helm_kappe: 'Eisenkappe', helm_ritter: 'Ritterhelm', helm_hoerner: 'Hörnerhelm', helm_fluegel: 'Flügelhelm', helm_krone: 'Krone',
  helm_kapuze: 'Kapuze', helm_samurai: 'Kabuto', helm_drache: 'Drachenhelm', helm_sturmkrone: 'Sturmkrone',
} as const;
export const HATS = { ...COSMETIC_HATS, ...GEAR_HATS } as const;

/** 4.6G.2: Geschlecht der Figur – wählt die Grundfigur (Körper, Gesicht, Grundfrisur), Haltung und Bewegung; Kleidung passt sich an */
export const GENDERS = { male: 'Männlich', female: 'Weiblich' } as const;
export type Gender = keyof typeof GENDERS;
/** Frisuren, die bis 4.6G die weibliche Grundfigur wählten (alte Spielstände ohne `gender` behalten so ihre Figur) */
export const LEGACY_FEMALE_HAIR: readonly string[] = ['lang', 'pferdeschwanz', 'zoepfe', 'zopf', 'dutt'];
/** Kurze und lange Frisuren (Zufallsfiguren, Wechsel des Geschlechts im Editor) */
export const MALE_HAIR = ['kurz', 'stachel', 'igel', 'seitenscheitel', 'wuschel', 'glatze'] as const;
export const FEMALE_HAIR = ['lang', 'pferdeschwanz', 'zoepfe', 'zopf', 'dutt'] as const;

/**
 * Geschlecht eines Aussehens. Fehlt es (Spielstände bis Version 23 und Daten ohne Angabe), gilt `male` – außer die Figur trug eine der langen
 * Frisuren, mit denen bis 4.6G die weibliche Grundfigur gewählt wurde: dann bleibt sie weiblich und sieht nach dem Laden aus wie vorher.
 */
export function genderOf(l: Partial<Pick<CharacterLook, 'gender' | 'hair'>> | null | undefined): Gender {
  if (l?.gender === 'female' || l?.gender === 'male') return l.gender;
  return typeof l?.hair === 'string' && LEGACY_FEMALE_HAIR.includes(l.hair) ? 'female' : 'male';
}

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
  /** 4.6G.2: Männlich oder Weiblich; fehlt es, gilt `genderOf` (Standard männlich) */
  gender?: Gender;
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
  /** Frisur aus einem Modell (data/equipment.ts, Teil „frisur_…“); leer = Haare der Grundfigur */
  hairModel?: string;
  /** Zierfarbe des Helms (Gold, Federn, Edelsteine), nur für Ausrüstung */
  hatAccent?: string;
  /** Brille (4.6G); fehlt in älteren Ständen = keine */
  glasses?: Glasses;
  scar: boolean;
  earring: boolean;
  eyepatch: boolean;
  scarf: boolean;
  /** Fäustlinge (automatisch bei Faustkämpfern) */
  gloves: boolean;
  /**
   * Zusätzliche Ausrüstung aus dem Inventar (IDs aus data/equipment.ts). Wird nur für die Anzeige gesetzt und nie
   * gespeichert – im Spielstand steht sie unter gear.
   */
  extra?: string[];
  /** Eigene Farben für Ausrüstung (Stück-ID → Hauptfarbe, Zierfarbe); nur zur Anzeige */
  dye?: Record<string, [string, string]>;
}

export const SKIN_TONES = ['#F7DCC6', '#F0C8A8', '#E8BE96', '#DDA77F', '#C68A5E', '#A9714A', '#8D5A3B', '#6B4229'];
export const HAIR_COLORS = ['#1E1A18', '#3A2618', '#5A3A22', '#8A5A2E', '#A8442A', '#D9B25A', '#F0E6C8', '#C8CCD8', '#2E4F8C', '#3F7A6A', '#C76BA8', '#7A3FA8'];
export const EYE_COLORS = ['#5A3A22', '#2F6FB5', '#3F8F4A', '#C88A2A', '#7A4FB8', '#B8343A', '#5A6A78', '#1FA8A8'];
export const CLOTH_COLORS = [
  '#F3E6C8', '#FFFFFF', '#1E1A20', '#3A3A44', '#7A1F1A', '#A8322A', '#D96C3A', '#E8B33A', '#6E8B3D', '#2F6E4F',
  '#1F7A8C', '#2F8FD9', '#1F4E79', '#14284A', '#4A2E6E', '#8A5A2B', '#5A3A22', '#C8A27A',
];

/** Farben für Zufallsfiguren: Hemden und Westen, Schärpen, Mäntel */
const SEA_SHIRTS = ['#F3E6C8', '#FFFFFF', '#EDE6D6', '#C8A27A', '#8A5A2B', '#5A3A22', '#3A3A44', '#7A1F1A', '#2F6E4F', '#1F4E79'];
const SEA_SASHES = ['#A8322A', '#7A1F1A', '#E8B33A', '#2F6E4F', '#1F4E79', '#4A2E6E', '#1E1A20'];
const SEA_COATS = ['#7A1F1A', '#1E1A20', '#5A3A22', '#14284A', '#2F6E4F', '#4A2E6E', '#3A3A44'];

export const LOOK_OPTIONS = {
  gender: GENDERS, body: BODY_TYPES, face: FACE_SHAPES, eyes: EYE_STYLES, brows: BROW_STYLES, mouth: MOUTH_STYLES,
  hair: HAIR_STYLES, beard: BEARD_STYLES, outfit: OUTFITS, coat: COATS, shoes: SHOES, hat: HATS, glasses: GLASSES,
} as const;

export function defaultLook(faction: Faction, gender: Gender = 'male'): CharacterLook {
  if (gender === 'female') return femaleLook(faction);
  return faction === 'pirat'
    ? {
      gender: 'male', body: 'normal', height: 1, skin: '#E8BE96', face: 'rund', eyes: 'gross', eyeColor: '#2F6FB5', brows: 'schraeg', mouth: 'grinsen',
      hair: 'stachel', hairColor: '#3A2618', beard: 'keiner', outfit: 'weste', outfitColor: '#F3E6C8', accentColor: '#A8322A',
      pantsColor: '#3A3A44', shoes: 'stiefel', shoesColor: '#5A3A22', coat: 'lang', coatColor: '#7A1F1A', hat: 'dreispitz', hatColor: '#1E1A20',
      scar: false, earring: true, eyepatch: false, scarf: false, gloves: false,
    }
    : {
      gender: 'male', body: 'normal', height: 1, skin: '#F0C8A8', face: 'schmal', eyes: 'scharf', eyeColor: '#5A6A78', brows: 'normal', mouth: 'ernst',
      hair: 'seitenscheitel', hairColor: '#D9B25A', beard: 'keiner', outfit: 'uniform', outfitColor: '#FFFFFF', accentColor: '#1F4E79',
      pantsColor: '#FFFFFF', shoes: 'stiefel', shoesColor: '#1E1A20', coat: 'lang', coatColor: '#14284A', hat: 'marine', hatColor: '#FFFFFF',
      scar: false, earring: false, eyepatch: false, scarf: false, gloves: false,
    };
}

/** 4.6G.2: Grundaussehen der weiblichen Spielfigur je Fraktion (Freibeuterin bzw. Marine-Kadettin) */
function femaleLook(faction: Faction): CharacterLook {
  return faction === 'pirat'
    ? {
      gender: 'female', body: 'schmal', height: 0.97, skin: '#F0C8A8', face: 'rund', eyes: 'gross', eyeColor: '#3F8F4A', brows: 'hoch', mouth: 'laecheln',
      hair: 'lang', hairColor: '#A8442A', beard: 'keiner', outfit: 'weste', outfitColor: '#F3E6C8', accentColor: '#A8322A',
      pantsColor: '#3A3A44', shoes: 'stiefel', shoesColor: '#5A3A22', coat: 'kurz', coatColor: '#7A1F1A', hat: 'dreispitz', hatColor: '#1E1A20',
      scar: false, earring: true, eyepatch: false, scarf: true, gloves: false,
    }
    : {
      gender: 'female', body: 'schmal', height: 0.97, skin: '#F7DCC6', face: 'schmal', eyes: 'scharf', eyeColor: '#2F6FB5', brows: 'normal', mouth: 'ernst',
      hair: 'lang', hairColor: '#1E1A18', beard: 'keiner', outfit: 'uniform', outfitColor: '#FFFFFF', accentColor: '#1F4E79',
      pantsColor: '#14284A', shoes: 'stiefel', shoesColor: '#1E1A20', coat: 'lang', coatColor: '#14284A', hat: 'marine', hatColor: '#FFFFFF',
      scar: false, earring: false, eyepatch: false, scarf: false, gloves: false,
    };
}

/** Ein Vorlagen-Knopf im Editor: setzt mehrere Werte des Aussehens auf einmal */
export interface LookPreset { id: string; label: string; look: Partial<CharacterLook> }
export type PresetTab = 'koerper' | 'gesicht' | 'haare' | 'kleidung' | 'accessoires';

/**
 * 4.6G.2: Vorlagen je Geschlecht und Editor-Reiter (reine Daten, Beschriftungen kurz und deutsch). Sie ändern nur die Werte ihres Reiters –
 * Kleidung, Farben, Hüte, Haare; das Geschlecht selbst wählt der Editor oben im Reiter „Körper & Statur“.
 */
export const LOOK_PRESETS: Record<Gender, Record<PresetTab, readonly LookPreset[]>> = {
  male: {
    koerper: [
      { id: 'm_matrose', label: 'Junger Matrose', look: { body: 'schmal', height: 0.97, skin: '#E8BE96' } },
      { id: 'm_kapitaen', label: 'Kapitän', look: { body: 'normal', height: 1.03, skin: '#DDA77F' } },
      { id: 'm_huene', label: 'Hüne', look: { body: 'kraeftig', height: 1.08, skin: '#C68A5E' } },
    ],
    gesicht: [
      { id: 'm_held', label: 'Heldenblick', look: { eyeColor: '#2F6FB5', scar: false } },
      { id: 'm_narbe', label: 'Narbengesicht', look: { eyeColor: '#B8343A', scar: true } },
      { id: 'm_ruhig', label: 'Ruhiger Stratege', look: { eyeColor: '#5A6A78', scar: false } },
    ],
    haare: [
      { id: 'm_schwarz', label: 'Rabenschwarz', look: { hairColor: '#1E1A18', beard: 'keiner' } },
      { id: 'm_seebaer', label: 'Seebär', look: { hairColor: '#8A5A2E', beard: 'vollbart' } },
      { id: 'm_stoppel', label: 'Draufgänger', look: { hairColor: '#3A2618', beard: 'stoppeln' } },
      { id: 'm_silber', label: 'Silberfuchs', look: { hairColor: '#C8CCD8', beard: 'kinnbart' } },
    ],
    kleidung: [
      { id: 'm_freibeuter', label: 'Freibeuter', look: { outfit: 'weste', outfitColor: '#F3E6C8', accentColor: '#A8322A', coat: 'lang', coatColor: '#7A1F1A', pantsColor: '#3A3A44', shoes: 'stiefel', scarf: false } },
      { id: 'm_admiral', label: 'Admiral', look: { outfit: 'uniform', outfitColor: '#FFFFFF', accentColor: '#1F4E79', coat: 'schulter', coatColor: '#14284A', pantsColor: '#FFFFFF', shoes: 'stiefel', scarf: false } },
      { id: 'm_deck', label: 'Deckmatrose', look: { outfit: 'matrose', outfitColor: '#FFFFFF', accentColor: '#1F4E79', coat: 'keiner', pantsColor: '#3A3A44', shoes: 'schuhe', scarf: true } },
    ],
    accessoires: [
      { id: 'm_dreispitz', label: 'Dreispitz & Ring', look: { hat: 'dreispitz', hatColor: '#1E1A20', glasses: 'keine', earring: true, eyepatch: false } },
      { id: 'm_gelehrt', label: 'Gelehrter', look: { hat: 'keiner', glasses: 'rund', earring: false, eyepatch: false } },
      { id: 'm_einauge', label: 'Einäugiger Wolf', look: { hat: 'bandana', hatColor: '#A8322A', glasses: 'keine', earring: true, eyepatch: true } },
    ],
  },
  female: {
    koerper: [
      { id: 'f_flink', label: 'Flinke Klinge', look: { body: 'schmal', height: 0.95, skin: '#F0C8A8' } },
      { id: 'f_kapitaenin', label: 'Kapitänin', look: { body: 'normal', height: 1.0, skin: '#E8BE96' } },
      { id: 'f_kriegerin', label: 'Kriegerin', look: { body: 'kraeftig', height: 1.04, skin: '#A9714A' } },
    ],
    gesicht: [
      { id: 'f_strahlend', label: 'Strahlend', look: { eyeColor: '#3F8F4A', scar: false } },
      { id: 'f_kuehl', label: 'Kühler Blick', look: { eyeColor: '#1FA8A8', scar: false } },
      { id: 'f_narbe', label: 'Kampfnarbe', look: { eyeColor: '#7A4FB8', scar: true } },
    ],
    haare: [
      { id: 'f_rot', label: 'Feuerrot', look: { hairColor: '#A8442A' } },
      { id: 'f_nacht', label: 'Nachtblau', look: { hairColor: '#2E4F8C' } },
      { id: 'f_gold', label: 'Goldblond', look: { hairColor: '#D9B25A' } },
      { id: 'f_silber', label: 'Silberweiß', look: { hairColor: '#F0E6C8' } },
    ],
    kleidung: [
      { id: 'f_freibeuterin', label: 'Freibeuterin', look: { outfit: 'weste', outfitColor: '#F3E6C8', accentColor: '#A8322A', coat: 'kurz', coatColor: '#7A1F1A', pantsColor: '#3A3A44', shoes: 'stiefel', scarf: true } },
      { id: 'f_offizierin', label: 'Offizierin', look: { outfit: 'uniform', outfitColor: '#FFFFFF', accentColor: '#14284A', coat: 'schulter', coatColor: '#14284A', pantsColor: '#14284A', shoes: 'stiefel', scarf: false } },
      { id: 'f_seglerin', label: 'Seglerin', look: { outfit: 'matrose', coat: 'keiner', outfitColor: '#FFFFFF', accentColor: '#1F7A8C', pantsColor: '#5A3A22', shoes: 'schuhe', scarf: false } },
    ],
    accessoires: [
      { id: 'f_hut', label: 'Dreispitz & Ring', look: { hat: 'dreispitz', hatColor: '#1E1A20', glasses: 'keine', earring: true, eyepatch: false } },
      { id: 'f_kopftuch', label: 'Kopftuch', look: { hat: 'bandana', hatColor: '#A8322A', glasses: 'keine', earring: true, eyepatch: false } },
      { id: 'f_navigatorin', label: 'Navigatorin', look: { hat: 'keiner', glasses: 'rund', earring: false, eyepatch: false } },
    ],
  },
};

/** Prüft und ergänzt einen gespeicherten Look (unbekannte Werte → Standard). */
export function sanitizeLook(raw: unknown, faction: Faction): CharacterLook {
  const d = defaultLook(faction);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const out: any = { ...d };
  for (const [k, opts] of Object.entries(LOOK_OPTIONS)) if (typeof r[k] === 'string' && r[k] as string in opts) out[k] = r[k];
  // 4.6G.2: Geschlecht – fehlt es, entscheidet genderOf (männlich; alte Stände mit langer Grundfrisur bleiben weiblich)
  out.gender = genderOf({ gender: r.gender as Gender | undefined, hair: typeof r.hair === 'string' ? r.hair as HairStyle : out.hair });
  if (out.gender === 'female') out.beard = 'keiner';
  for (const k of ['skin', 'eyeColor', 'hairColor', 'outfitColor', 'accentColor', 'pantsColor', 'shoesColor', 'coatColor', 'hatColor']) {
    if (typeof r[k] === 'string' && /^#[0-9a-f]{6}$/i.test(r[k] as string)) out[k] = r[k];
  }
  for (const k of ['scar', 'earring', 'eyepatch', 'scarf', 'gloves']) if (typeof r[k] === 'boolean') out[k] = r[k];
  // 4.6G: die Fliegerbrille war ein „Hut“ – jetzt eine Brille, der Kopf bleibt frei für einen Hut
  if (r.hat === 'brille') { out.glasses = 'flieger'; out.hat = 'keiner'; }
  if (out.glasses === 'keine') delete out.glasses;
  if (typeof r.height === 'number' && isFinite(r.height)) out.height = Math.min(1.1, Math.max(0.9, r.height));
  return out as CharacterLook;
}

type Rng = () => number;
const pickOf = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const keyOf = <T extends object>(rng: Rng, o: T): keyof T => pickOf(rng, Object.keys(o)) as keyof T;

export type NpcRole = 'buerger' | 'fischer' | 'haendler' | 'pirat' | 'marine' | 'offizier' | 'koch' | 'schmied' | 'wirt';

/** NPC-Baukasten: zufälliger, aber zur Rolle passender Look. */
/** 4.6G.2: Anteil weiblicher Figuren je Rolle (Stadtleute, Seeleute, Marine) */
export const FEMALE_SHARE: Record<NpcRole, number> = { buerger: 0.45, fischer: 0.25, haendler: 0.4, pirat: 0.35, marine: 0.3, offizier: 0.3, koch: 0.3, schmied: 0.2, wirt: 0.35 };

export function randomLook(rng: Rng, role: NpcRole = 'buerger'): CharacterLook {
  const faction: Faction = role === 'marine' || role === 'offizier' ? 'marine' : 'pirat';
  const l = defaultLook(faction);
  // 4.6G.2: Geschlecht zuerst (eigener Zufallswert), Frisur und Bart passend dazu
  const female = rng() < FEMALE_SHARE[role];
  l.gender = female ? 'female' : 'male';
  l.body = keyOf(rng, BODY_TYPES);
  l.height = 0.92 + rng() * 0.16;
  l.skin = pickOf(rng, SKIN_TONES);
  l.face = keyOf(rng, FACE_SHAPES);
  l.eyes = keyOf(rng, EYE_STYLES);
  l.eyeColor = pickOf(rng, EYE_COLORS);
  l.brows = keyOf(rng, BROW_STYLES);
  l.mouth = keyOf(rng, MOUTH_STYLES);
  l.hair = female ? pickOf(rng, FEMALE_HAIR) : pickOf(rng, MALE_HAIR);
  l.hairColor = pickOf(rng, HAIR_COLORS.slice(0, 8));
  l.beard = !female && rng() < 0.35 ? keyOf(rng, BEARD_STYLES) : 'keiner';
  if (female) l.height = Math.min(l.height, 1.02);
  l.outfit = pickOf(rng, ['hemd', 'weste', 'jacke', 'matrose', 'tunika'] as Outfit[]);
  // gedeckte Seefahrer-Farben statt Bonbonfarben (die wirkten wie Schuluniformen)
  l.outfitColor = pickOf(rng, SEA_SHIRTS);
  l.accentColor = pickOf(rng, SEA_SASHES);
  l.pantsColor = pickOf(rng, ['#3A3A44', '#5A3A22', '#8A5A2B', '#1F4E79', '#C8A27A', '#1E1A20']);
  l.shoes = rng() < 0.7 ? 'stiefel' : 'schuhe';
  l.shoesColor = pickOf(rng, ['#5A3A22', '#1E1A20', '#8A5A2B', '#3A2618']);
  l.coat = rng() < 0.3 ? pickOf(rng, ['kurz', 'lang'] as Coat[]) : 'keiner';
  l.coatColor = pickOf(rng, SEA_COATS);
  l.hat = rng() < 0.45 ? pickOf(rng, ['dreispitz', 'bandana', 'bandana', 'muetze', 'keiner'] as Hat[]) : 'keiner';
  l.hatColor = pickOf(rng, [...SEA_COATS, '#A8322A']);
  l.scar = rng() < 0.1;
  l.earring = rng() < 0.25;
  l.eyepatch = rng() < 0.05;
  l.scarf = rng() < 0.15;
  switch (role) {
    case 'fischer': l.hat = 'suedwester'; l.hatColor = '#E8C22B'; l.outfit = 'jacke'; l.outfitColor = '#E8C22B'; l.shoes = 'stiefel'; break;
    case 'haendler': l.outfit = 'weste'; l.coat = 'kurz'; l.hat = rng() < 0.5 ? 'keiner' : 'dreispitz'; break;
    case 'koch': l.hat = 'kochmuetze'; l.hatColor = '#FFFFFF'; l.outfit = 'hemd'; l.outfitColor = '#FFFFFF'; break;
    case 'schmied': l.body = 'kraeftig'; l.outfit = 'hemd'; l.outfitColor = '#5A4A3A'; l.hat = 'keiner'; l.glasses = 'flieger'; l.gloves = true; break;
    case 'wirt': l.body = 'kraeftig'; l.outfit = 'weste'; l.beard = 'vollbart'; break;
    case 'pirat': l.outfit = pickOf(rng, ['matrose', 'weste', 'hemd'] as Outfit[]); l.hat = pickOf(rng, ['bandana', 'bandana', 'dreispitz', 'keiner'] as Hat[]); l.hatColor = pickOf(rng, ['#A8322A', '#1E1A20', '#7A1F1A', '#2F6E4F']); l.eyepatch = rng() < 0.12; l.earring = rng() < 0.5; l.shoes = 'stiefel'; l.coat = rng() < 0.45 ? pickOf(rng, ['kurz', 'lang'] as Coat[]) : 'keiner'; break;
    case 'marine': l.outfit = 'uniform'; l.outfitColor = '#FFFFFF'; l.accentColor = '#1F4E79'; l.pantsColor = pickOf(rng, ['#14284A', '#FFFFFF']); l.hat = 'marine'; l.hatColor = '#FFFFFF'; l.beard = rng() < 0.2 ? 'schnurrbart' : 'keiner'; l.eyepatch = false; l.scar = false; l.shoes = 'stiefel'; l.shoesColor = '#1E1A20'; l.coat = rng() < 0.6 ? 'kurz' : 'keiner'; l.coatColor = '#14284A'; break;
    // Offiziere tragen den Admiralsmantel oft lässig über den Schultern (4.6F)
    case 'offizier': l.outfit = 'uniform'; l.outfitColor = '#FFFFFF'; l.accentColor = '#14284A'; l.coat = rng() < 0.4 ? 'schulter' : 'kapitaen'; l.coatColor = '#14284A'; l.pantsColor = '#FFFFFF'; l.hat = 'zweispitz'; l.hatColor = '#14284A'; break;
    default: break;
  }
  // Frauen tragen keinen Bart (auch nicht aus den Rollen-Vorgaben)
  if (female) l.beard = 'keiner';
  return l;
}
