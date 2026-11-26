// Phase 4.7D.1 – Stufe C des Einstiegs: Klassen-, Formen- & Ultimate-Showcase als reine Daten. Für jede der 15 Spezialisierungen (Faustkämpfer
// Schnell/Kräftig, Schwertkämpfer mit vier Klingen, Faji-Wirker mit acht Elementen und Priester): MMO-Rolle, „Worin diese Klasse glänzt“, alle
// zehn Formen (Form I … X) mit Symbol und Kurzbeschreibung und das Level-60-Ultimate samt seiner 3-Akt-Choreografie
// (`graphics/ultimateCinematics.ts`) für die animierte Vorschau. Alles wird aus den Klassen- und Stil-Daten abgeleitet – neue Formen oder
// Ultimates erscheinen hier ohne Umbau.
import { ACTION_STYLES, type ActionStyleId } from './actionStyles';
import { CLASS_BASES, CLASS_BASE_IDS, SPECS, SPECS_OF, ULT_NODE, FORM_NODES, type ClassBase, type RoleTag, type SpecId } from './classes';
import { ULTIMATE_CINEMATICS, cineTotal } from '../graphics/ultimateCinematics';
import type { CataclysmKind } from './actionKit';

/** Römische Ziffern der zehn Formen */
export const ROMAN: readonly string[] = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Worin eine Spezialisierung glänzt (3 – 4 kurze Punkte, eigene Worte des Sturmkrone-Universums) */
export const SPEC_STRENGTHS: Readonly<Record<SpecId, readonly string[]>> = {
  schnell: ['Höchster Dauerschaden durch rasende Schlaghagel', 'Blitzschnelle Ausweichschritte und Ansturm', 'Stark gegen Verbände auf engem Raum', 'Luftkombos mit Uppercut-Start'],
  kraeftig: ['Steht in der ersten Reihe – viel Leben und Rüstung', 'Bricht die Haltung von Elite-Gegnern und Bossen', 'Stampfer und Hämmer gegen ganze Gruppen', 'Hält Druck aus und schützt die Crew'],
  doppel: ['Tödlich gegen einzelne Ziele', 'Schattenschritte in den Rücken des Gegners', 'Höchste Krit-Chance und Hinrichtungen', 'Flink und schwer zu treffen'],
  saebel: ['Lange, flüssige Kombo-Ketten', 'Paraden und Konter im richtigen Moment', 'Blitz-Sprints quer über das Deck', 'Ausgewogen zwischen Angriff und Bewegung'],
  langschwert: ['Kämpft sicher aus mittlerer Distanz', 'Fernschnitt-Wellen durch mehrere Gegner', 'Zusätzlicher Durchschlag gegen Rüstung', 'Langes Fenster für perfektes Ausweichen'],
  grossschwert: ['Bollwerk mit gewaltiger Reichweite', 'Haltungsbrecher gegen Elite und Bosse', 'Erdbeben-Räder gegen ganze Gruppen', 'Steckt schwere Treffer weg'],
  feuer: ['Flächenschaden mit Brand über Zeit', 'Flammenwirbel gegen dichte Gruppen', 'Stark aus sicherer Entfernung', 'Brennende Wellen über Deck und Wasser'],
  eis: ['Verlangsamt und friert Gegner ein', 'Kontrolle ganzer Gruppen', 'Eislanzen mit hoher Reichweite', 'Sicher auf Abstand'],
  wasser: ['Gezeiten-Konter gegen Nahkämpfer', 'Strudel ziehen Gegner zusammen', 'Hochdruckstrahlen mit Durchschlag', 'Zu Hause auf See und an der Küste'],
  wind: ['Schnellster Faji-Wirker mit Überschall-Sprints', 'Vakuumklingen auf weite Distanz', 'Auftrieb wirft Gegner in die Luft', 'Kaum zu fassen'],
  blitz: ['Kettenblitze springen durch ganze Formationen', 'Betäubt mehrere Gegner zugleich', 'Sehr hoher Spitzenschaden', 'Schnelle Reaktions-Formen'],
  sonne: ['Glut, die Rüstungen durchbrennt', 'Stark gegen gepanzerte Ziele und Bosse', 'Leuchtende Flächen-Explosionen', 'Gleißende Ultimate-Kraft'],
  mond: ['Mondsicheln begleiten jeden Schlag', 'Elegante Distanz-Kombos gegen Gruppen', 'Effiziente Abklingzeiten', 'Stark in der Nacht'],
  schwarzloch: ['Gravitationsfelder ziehen alles zusammen', 'Löscht feindliche Auren', 'Kontrolle über ganze Schlachtfelder', 'Verheerend gegen dichte Verbände'],
  priester: ['Heilt dich und deine Verbündeten', 'Lichtstrahlen und Urteile auf Abstand', 'Segen stärken die ganze Crew', 'Unverzichtbar in Raids'],
};

/** Kurzbeschreibung der MMO-Rollen (Anzeige neben dem Abzeichen) */
export const ROLE_INFO: Readonly<Record<RoleTag, string>> = {
  'DPS': 'Schaden im Dauerfeuer',
  'Tank-DPS': 'Hält aus und teilt aus',
  'Assassinen-DPS': 'Einzelziel-Vernichter',
  'Kombo-DPS': 'Ketten und Konter',
  'Midrange-DPS': 'Schaden aus mittlerer Distanz',
  'Elementar-DPS': 'Elementar-Schaden auf Abstand',
  'DPS/Heal': 'Schaden und Heilung',
};

export interface ShowcaseForm { nr: number; roman: string; icon: string; label: string; short: string; desc: string; clip: string; dur: number; node: number }
export interface ShowcaseUltimate {
  label: string; kind: CataclysmKind; title: string;
  /** die drei Akte in Worten */
  beats: readonly [string, string, string];
  color: string; accent: string; clip: string;
  /** Dauer der Choreografie im Spiel (s) */
  dur: number;
  /** Knoten des Klassenbaums, an dem es frei wird (= Stufe 60 des Pfads) */
  node: number;
}
export interface ShowcaseEntry {
  spec: SpecId; base: ClassBase; style: ActionStyleId;
  label: string; baseLabel: string; crest: string; color: string; accent: string;
  role: RoleTag; roleInfo: string; desc: string; strengths: readonly string[];
  forms: readonly ShowcaseForm[];
  ultimate: ShowcaseUltimate;
  /** Leicht-Kette für die Kampf-Vorschau (Clips) */
  combo: readonly { clip: string; dur: number }[];
  /** Hinweis, wann die Spezialisierung endgültig wird (Faust/Faji: in der Einführung) */
  choice: string;
}

const MEMO = new Map<SpecId, ShowcaseEntry>();

/** Showcase-Eintrag einer Spezialisierung */
export function showcaseOf(spec: SpecId): ShowcaseEntry {
  const memo = MEMO.get(spec);
  if (memo) return memo;
  const sp = SPECS[spec];
  const st = ACTION_STYLES[sp.style];
  const forms: ShowcaseForm[] = st.skills.slice().sort((a, b) => a.slot - b.slot).map((k, i) => ({
    nr: k.slot, roman: ROMAN[k.slot - 1] ?? String(k.slot), icon: k.icon, label: k.label, short: k.short, desc: k.desc, clip: k.clip, dur: k.dur, node: FORM_NODES[i] ?? 0,
  }));
  const um = st.ultimate;
  const spec0 = um?.ultimate;
  const kind = (spec0?.kind ?? 'skyfall') as CataclysmKind;
  const cine = ULTIMATE_CINEMATICS[kind];
  const entry: ShowcaseEntry = {
    spec, base: sp.base, style: sp.style,
    label: sp.label, baseLabel: CLASS_BASES[sp.base].label, crest: sp.crest, color: sp.color, accent: sp.accent,
    role: sp.role, roleInfo: ROLE_INFO[sp.role], desc: sp.desc, strengths: SPEC_STRENGTHS[spec],
    forms,
    ultimate: {
      // „7. Form: …“ stammt aus der alten Faji-Zählung – im Showcase heißt es schlicht nach seinem Namen (Formen sind hier I … X)
      label: (um?.label ?? cine.title).replace(/^\d+\. Form:\s*/, ''), kind, title: cine.title, beats: cine.beats,
      color: spec0?.color ?? sp.color, accent: spec0?.accent ?? sp.accent, clip: um?.clip ?? st.heavy.clip,
      dur: cineTotal(cine), node: ULT_NODE,
    },
    combo: st.light.map((m) => ({ clip: m.clip, dur: m.dur })),
    choice: sp.base === 'schwert' ? 'Deine Klinge steht ab Spielbeginn fest.' : CLASS_BASES[sp.base].choice,
  };
  MEMO.set(spec, entry);
  return entry;
}

/** Gruppen der Auswahl in Anzeige-Reihenfolge: Klasse → Pfade */
export const SHOWCASE_GROUPS: readonly { base: ClassBase; label: string; icon: string; desc: string; specs: readonly SpecId[] }[] = CLASS_BASE_IDS.map((b) => ({
  base: b, label: CLASS_BASES[b].label, icon: CLASS_BASES[b].icon, desc: CLASS_BASES[b].desc, specs: SPECS_OF[b],
}));

/**
 * Ablauf der animierten Vorschau einer Klasse (Sekunden der Vorschau): Kampf-Kombo, drei Formen (I, V, X), dann das Ultimate in seinen drei
 * Akten – im Showcase 2,4-mal gedehnt, damit man die Choreografie lesen kann –, danach eine kurze Ruhe und von vorn.
 */
export const SHOWCASE_SLOW = 2.4;
export type PreviewPart = { kind: 'combo' } | { kind: 'form'; slot: number } | { kind: 'ult' } | { kind: 'rest' };
export interface PreviewStep { at: number; dur: number; part: PreviewPart }

export function previewScript(spec: SpecId): PreviewStep[] {
  const e = showcaseOf(spec);
  const out: PreviewStep[] = [];
  let t = 0.4;
  const comboDur = Math.min(3.2, Math.max(1.2, e.combo.reduce((s, c) => s + c.dur, 0)));
  out.push({ at: t, dur: comboDur, part: { kind: 'combo' } }); t += comboDur + 0.35;
  for (const slot of [1, 5, 10]) {
    const f = e.forms.find((x) => x.nr === slot);
    const d = Math.max(0.9, Math.min(1.8, (f?.dur ?? 1) + 0.35));
    out.push({ at: t, dur: d, part: { kind: 'form', slot } }); t += d + 0.25;
  }
  const ud = e.ultimate.dur * SHOWCASE_SLOW + 1.1;
  out.push({ at: t, dur: ud, part: { kind: 'ult' } }); t += ud;
  out.push({ at: t, dur: 1.2, part: { kind: 'rest' } });
  return out;
}

/** Gesamtlänge einer Vorschau-Schleife (s) */
export const previewLength = (spec: SpecId): number => { const s = previewScript(spec); const l = s[s.length - 1]; return l.at + l.dur; };
