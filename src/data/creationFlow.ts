// Phase 4.7D.1 – der dreistufige Einstieg bei „Neues Spiel“ als reine Daten und Zustandsmaschine (kein DOM, kein three.js, kein Zufall ohne
// Startwert):
//   A  VS-Face-Off   Marine (gesperrt, kommt mit einem späteren Story-Update) gegen Piraten (spielbar) – diagonal geteilter Bildschirm
//   B  Aussehen      reiner Aussehens-Editor: Körperbau, Geschlecht, Gesicht, Frisur, Bart, Hut, Kleidung, Mantel – KEINE Klassen- oder Waffenwahl
//   C  Klassenwahl   Vollbild-Showcase aller Klassen und Pfade mit Rolle, Stärken, zehn Formen und animierter Ultimate-Vorschau → „Abenteuer starten“
// Die Darstellung steht in `world/faceOffStage.ts`, `ui/faceOffScreen.ts`, `ui/editor.ts`, `world/showcaseStage.ts`, `ui/classShowcase.ts`; den
// Ablauf führt `Game.openCreation`.
import type { CharacterLook } from './characterParts';
import { ADMIRALS, SCHWARZBART } from './prologue';
import { SPECS, SPEC_BLADE, type ClassBase, type SpecId } from './classes';
import type { Faction, FightStyle } from '../core/save/types';

// ---------------------------------------------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------------------------------------------

export type CreationStep = 'faceoff' | 'aussehen' | 'klasse' | 'start';
export const CREATION_STEPS: readonly CreationStep[] = ['faceoff', 'aussehen', 'klasse'];
export const CREATION_STEP_LABEL: Readonly<Record<Exclude<CreationStep, 'start'>, string>> = {
  faceoff: 'Wähle deine Seite',
  aussehen: 'Dein Aussehen',
  klasse: 'Klasse, Formen & Ultimate',
};

export type FaceOffSide = 'marine' | 'pirat';

export interface FaceOffSideDef {
  id: FaceOffSide;
  faction: Faction;
  /** große Überschrift der Seite und Untertitel */
  title: string;
  sub: string;
  /** gesperrt (Story-Update) und Hinweis dazu */
  locked: boolean;
  lockText: string;
  /** Text der Info-Meldung beim Klick auf eine gesperrte Seite */
  lockInfo: string;
  /** Knopf zum Spielen (nur spielbare Seiten) */
  cta: string;
  /** Aura-Farben des Rekruten: Kern, Akzent, dunkler Mantel */
  aura: string; accent: string; ink: string;
}

export const MARINE_LOCK_TEXT = 'Marine-Pfad — Kommt in einem späteren Story-Update';

export const FACE_OFF_SIDES: Readonly<Record<FaceOffSide, FaceOffSideDef>> = {
  marine: {
    id: 'marine', faction: 'marine', title: 'Marine', sub: 'Rekrut der Admiralität · Ordnung, Ehre, Pflicht',
    locked: true, lockText: MARINE_LOCK_TEXT,
    lockInfo: 'Der Marine-Pfad ist noch versiegelt. Die Geschichte der sieben Admirale erzählt ein späteres großes Story-Update – bis dahin segelst du unter der schwarzen Flagge.',
    cta: 'Gesperrt', aura: '#2FB8FF', accent: '#18F0A8', ink: '#03121C',
  },
  pirat: {
    id: 'pirat', faction: 'pirat', title: 'Piraten', sub: 'Schiffsjunge der Schwarzen Krone · Freiheit, Mut, Meer',
    locked: false, lockText: '',
    lockInfo: '',
    cta: 'Als Pirat beginnen', aura: '#FF2A3A', accent: '#FFC23A', ink: '#1A0306',
  },
};

/** Ergebnis eines Klicks auf eine Seite des Face-Offs */
export interface SidePick { ok: boolean; faction: Faction | null; message: string }

/** Seite wählen: gesperrte Seiten zeigen nur ihre Info-Meldung und starten nichts */
export function pickSide(side: FaceOffSide): SidePick {
  const d = FACE_OFF_SIDES[side];
  if (d.locked) return { ok: false, faction: null, message: d.lockInfo };
  return { ok: true, faction: d.faction, message: '' };
}

/** Kampfstil und Klinge der Erschaffung zu einer gewählten Spezialisierung (Faust/Faji: der Pfad wird in der Einführung endgültig) */
export function creationOfSpec(spec: SpecId): { style: FightStyle; blade: string; base: ClassBase } {
  const base = SPECS[spec].base;
  if (base === 'faust') return { style: 'faust', blade: 'saebel', base };
  if (base === 'faji') return { style: 'effekt', blade: 'saebel', base };
  return { style: 'schwert', blade: SPEC_BLADE[spec] ?? 'saebel', base };
}

/** Zustand des Einstiegs (JSON-tauglich) */
export interface CreationState {
  step: CreationStep;
  faction: Faction | null;
  /** zuletzt gewählte Spezialisierung im Showcase (Vorschau) */
  spec: SpecId;
  /** Meldung der letzten Aktion (gesperrte Seite) */
  message: string;
  /** Klicks auf gesperrte Seiten (Prüfungen) */
  lockedClicks: number;
}

export const newCreation = (): CreationState => ({ step: 'faceoff', faction: null, spec: 'saebel', message: '', lockedClicks: 0 });

/**
 * Zustandsmaschine des Einstiegs. Jede Aktion liefert, ob sie gilt (false = nichts passiert). Nur die Piraten-Seite führt weiter; der
 * Aussehens-Editor führt zur Klassenwahl, die Klassenwahl zurück in den Editor oder zum Start.
 */
export class CreationFlow {
  readonly state: CreationState;
  constructor(state?: CreationState) { this.state = state ?? newCreation(); }

  get step(): CreationStep { return this.state.step; }

  /** Stufe A: Seite wählen */
  pick(side: FaceOffSide): SidePick {
    const st = this.state;
    if (st.step !== 'faceoff') return { ok: false, faction: null, message: '' };
    const r = pickSide(side);
    st.message = r.message;
    if (!r.ok) { st.lockedClicks++; return r; }
    st.faction = r.faction;
    st.step = 'aussehen';
    return r;
  }

  /** Stufe B → C: „Weiter zur Klassenwahl“ */
  toClasses(): boolean {
    if (this.state.step !== 'aussehen') return false;
    this.state.step = 'klasse';
    return true;
  }

  /** Stufe C: eine Klasse ansehen */
  preview(spec: SpecId): boolean {
    if (this.state.step !== 'klasse' || !SPECS[spec]) return false;
    this.state.spec = spec;
    return true;
  }

  /** zurück: C → B, B → A (A → abgebrochen: false) */
  back(): boolean {
    const st = this.state;
    if (st.step === 'klasse') { st.step = 'aussehen'; return true; }
    if (st.step === 'aussehen') { st.step = 'faceoff'; st.faction = null; return true; }
    return false;
  }

  /** Stufe C: „Abenteuer starten“ – Kampfstil und Klinge der gewählten Klasse */
  start(): { faction: Faction; style: FightStyle; blade: string; base: ClassBase; spec: SpecId } | null {
    const st = this.state;
    if (st.step !== 'klasse' || !st.faction) return null;
    st.step = 'start';
    return { faction: st.faction, spec: st.spec, ...creationOfSpec(st.spec) };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Aufstellung der Face-Off-Bühne (Meter; Bühne: +x rechts, +z zur Kamera, Figuren schauen bei yaw 0 nach +z)
// ---------------------------------------------------------------------------------------------------------------

/** Figur der Bühne: Ort, Blickrichtung, Maßstab, Aussehen (Teil-Look über dem Grund-Look der Seite) */
export interface FaceOffFigure {
  id: string;
  name: string;
  title: string;
  x: number; z: number; yaw: number; scale: number;
  /** Farbe von Randlicht und Lichthof */
  color: string;
  look: Partial<CharacterLook>;
  /** Hintergrund-Figur: dunkle Silhouette (Marine) bzw. lichtumrandete Gestalt (Piraten) */
  back: boolean;
  /** Haltungs-Clip (aus den geladenen Animationen) */
  clip: string;
}

/** Vordergrund: die Rekruten etwas kompakter, damit der Hintergrund voll zur Geltung kommt */
export const RECRUIT_SCALE = 0.9;
/** Hintergrund-Figuren stehen größer und weiter hinten (imposante Aufstellung) */
export const BACK_SCALE = 1.12;

/** Admirale im Nebel: dunkle Gala-Uniformen (die Silhouette bleibt dunkel, nur der Rand leuchtet in ihrem Spektrum) */
const marineLook = (coat: string, hat: string, hairColor: string, beard: string, gender: 'male' | 'female' = 'male'): Partial<CharacterLook> => ({
  gender, outfit: 'uniform', outfitColor: '#1A2030', accentColor: '#8A6A2A', pantsColor: '#141824', coat: coat as CharacterLook['coat'],
  coatColor: '#0E121C', hat: hat as CharacterLook['hat'], hatColor: '#0B0E16', hairColor, beard: beard as CharacterLook['beard'], body: 'kraeftig', shoes: 'stiefel', shoesColor: '#0C0A10',
});

/** Die sieben Admirale in Silhouette (Farbe = ihr Spektrum aus dem Prolog), halbkreisförmig hinter dem Marine-Rekruten */
export const ADMIRAL_FIGURES: readonly FaceOffFigure[] = ADMIRALS.map((a, i) => {
  // Großadmiral (Platz 0) in der Mitte der Reihe ganz vorn und am größten; die übrigen fächern nach außen und nach hinten
  const order = [-3, -2, -1, 0, 1, 2, 3].indexOf(a.slot);
  const s = a.slot;
  const female = a.name.startsWith('Admiralin');
  return {
    id: `adm_${a.id}`, name: a.name, title: a.title,
    x: -3.0 + s * 0.78 - Math.abs(s) * 0.12, z: -3.4 - Math.abs(s) * 0.55, yaw: 0.28 - s * 0.05,
    scale: BACK_SCALE * (s === 0 ? 1.12 : 1 - Math.abs(s) * 0.025),
    color: a.color,
    look: marineLook(i % 2 ? 'lang' : 'kapitaen', s === 0 ? 'zweispitz' : i % 3 === 0 ? 'marine' : 'zweispitz', i % 2 ? '#D8D2C4' : '#2A2228', female ? 'keiner' : i % 3 === 0 ? 'vollbart' : 'kinnbart', female ? 'female' : 'male'),
    back: true, clip: order % 2 ? 'Idle_B' : 'Idle_A',
  };
});

/** Kapitän Schwarzbart und sechs weitere epische Piraten-Kapitäne (eigene Figuren des Sturmkrone-Universums) */
export const PIRATE_CAPTAINS: readonly { id: string; name: string; title: string; color: string; look: Partial<CharacterLook> }[] = [
  { id: 'schwarzbart', name: SCHWARZBART.name, title: SCHWARZBART.title, color: SCHWARZBART.aura, look: SCHWARZBART.look },
  { id: 'sturmzahn', name: 'Kapitänin Rabea Sturmzahn', title: 'Die Hai-Königin der Brandung', color: '#FF3A4A',
    look: { gender: 'female', body: 'normal', hair: 'lang', hairColor: '#B0201C', outfit: 'weste', outfitColor: '#2A1416', accentColor: '#FFC23A', coat: 'lang', coatColor: '#5A0E14', hat: 'bandana', hatColor: '#B0201C', beard: 'keiner', earring: true } },
  { id: 'knochenbrecher', name: 'Kapitän Odo Knochenbrecher', title: 'Die Faust des Südmeers', color: '#FF8A2A',
    look: { gender: 'male', body: 'kraeftig', hair: 'igel', hairColor: '#1A1414', outfit: 'matrose', outfitColor: '#E8DCC4', accentColor: '#7A1F1A', coat: 'schulter', coatColor: '#3A1A10', hat: 'keiner', beard: 'vollbart', scar: true, gloves: true } },
  { id: 'nachtflut', name: 'Kapitänin Ysra Nachtflut', title: 'Herrin der Schattensegel', color: '#B44DFF',
    look: { gender: 'female', body: 'schmal', hair: 'lang', hairColor: '#120E1A', outfit: 'jacke', outfitColor: '#1A1224', accentColor: '#B44DFF', coat: 'kapitaen', coatColor: '#140E1E', hat: 'dreispitz', hatColor: '#0A0810', beard: 'keiner', eyepatch: true } },
  { id: 'goldkiel', name: 'Kapitän Gerrit Goldkiel', title: 'Der Schatzfürst der Bernsteinsee', color: '#FFD23A',
    look: { gender: 'male', body: 'normal', hair: 'seitenscheitel', hairColor: '#C89A3A', outfit: 'weste', outfitColor: '#F3E6C8', accentColor: '#C9A13B', coat: 'kapitaen', coatColor: '#3A2410', hat: 'dreispitz', hatColor: '#2A1A0E', beard: 'schnurrbart', earring: true, glasses: 'monokel' } },
  { id: 'feuerbart', name: 'Kapitän Bram Feuerbart', title: 'Der lebende Vulkan', color: '#FF5A1A',
    look: { gender: 'male', body: 'kraeftig', hair: 'wuschel', hairColor: '#D2451A', outfit: 'hemd', outfitColor: '#2A1A14', accentColor: '#FF7A2A', coat: 'lang', coatColor: '#2A0E08', hat: 'keiner', beard: 'vollbart' } },
  { id: 'windlied', name: 'Kapitänin Lene Windlied', title: 'Die Sturmsängerin', color: '#3AF0C8',
    look: { gender: 'female', body: 'normal', hair: 'lang', hairColor: '#E8E0D0', outfit: 'tunika', outfitColor: '#1E3A3A', accentColor: '#3AF0C8', coat: 'schulter', coatColor: '#123030', hat: 'keiner', beard: 'keiner', scarf: true } },
];

/** Aufstellung der Piraten: Schwarzbart in der Mitte vorn (riesig), je drei Kapitäne links und rechts gestaffelt */
export const PIRATE_FIGURES: readonly FaceOffFigure[] = PIRATE_CAPTAINS.map((c, i) => {
  const s = i === 0 ? 0 : i % 2 ? -Math.ceil(i / 2) : Math.ceil(i / 2);
  return {
    id: `cap_${c.id}`, name: c.name, title: c.title,
    x: 3.0 + s * 0.8 + Math.abs(s) * 0.12, z: -3.4 - Math.abs(s) * 0.55 + (i === 0 ? 0.35 : 0), yaw: -0.28 - s * 0.05,
    scale: i === 0 ? BACK_SCALE * SCHWARZBART.scale * 0.82 : BACK_SCALE * (1 - Math.abs(s) * 0.025),
    color: c.color, look: c.look, back: true, clip: i % 2 ? 'Idle_B' : 'Idle_A',
  };
});

/** Die beiden Rekruten im Vordergrund (Blick leicht zur Mitte, auf den Gegner) */
export const RECRUITS: Readonly<Record<FaceOffSide, FaceOffFigure>> = {
  marine: { id: 'rekrut_marine', name: 'Marine-Rekrut', title: 'Rekrut der Admiralität', x: -1.45, z: 1.7, yaw: 0.42, scale: RECRUIT_SCALE, color: FACE_OFF_SIDES.marine.aura, look: {}, back: false, clip: 'Idle_A' },
  pirat: { id: 'rekrut_pirat', name: 'Piraten-Rekrut', title: 'Schiffsjunge der Schwarzen Krone', x: 1.45, z: 1.7, yaw: -0.42, scale: RECRUIT_SCALE, color: FACE_OFF_SIDES.pirat.aura, look: {}, back: false, clip: 'Idle_A' },
};

/** Alle Figuren in Bau-Reihenfolge (Rekruten zuerst, dann abwechselnd je eine Admirals- und eine Kapitäns-Gestalt aus dem Nebel) */
export function faceOffBuildOrder(): FaceOffFigure[] {
  const out: FaceOffFigure[] = [RECRUITS.marine, RECRUITS.pirat];
  for (let i = 0; i < Math.max(ADMIRAL_FIGURES.length, PIRATE_FIGURES.length); i++) {
    if (PIRATE_FIGURES[i]) out.push(PIRATE_FIGURES[i]);
    if (ADMIRAL_FIGURES[i]) out.push(ADMIRAL_FIGURES[i]);
  }
  return out;
}

/** Kamera der Bühne und der Zoom in die Piraten-Seite (s, Grad, Meter) */
export const FACE_OFF_CAM = {
  /** Grundeinstellung: Blickhöhe, Abstand, Höhe der Kamera, Sichtfeld quer/hoch */
  lookY: 1.55, dist: 8.6, camY: 1.75, fovWide: 34, fovTall: 58,
  /** im Hochformat reicht die Breite so weit (halbe Breite an den Rekruten, m) */
  portraitHalf: 2.25,
  /** Zoom: Dauer, Ziel (Gesicht des Piraten-Rekruten), Sichtfeld am Ende */
  zoomDur: 0.85, zoomFov: 18, zoomDist: 1.6,
  /** Hintergrund-Figuren rechnen nur jedes n-te Bild (Leistung; sie stehen fast still) */
  backEvery: 2,
} as const;
