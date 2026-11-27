// Phase 4.93A – Klang-Rezepte der Kino-Endgame-Regie (rein: nur Zahlen; die Stimmen erzeugt `audio/kinoDsp.ts`).
// Jede Regie-Aktion (`DirectorActionId`) hat EIN Rezept aus vier Schichten plus der Stille vor dem Sturm:
//   Schicht 1 – Auflade-Sog (Phase 1):     gefiltertes Rosa-/Braun-Rauschen, Bandpass steigt 120 Hz → 2 400 Hz, dazu ein tiefer Puls-Sub (42 – 75 Hz)
//   Schicht 2 – Bewegungs-Transient (Ph. 2): peitschender Luft-/Blitz-Riss (Weißrausch-Stoß mit schneller Tonhöhen-Hüllkurve) und Doppler-Schwung,
//                                           danach die 45 ms Stille-Senke unmittelbar vor dem Einschlag
//   Schicht 3 – Einschlag (Phase 3):       Sub-Bass-Fall 90 Hz → 22 Hz in 150 ms, verzerrter Mitten-Punch (180 – 450 Hz), hochfrequentes Krachen
//                                           (Donnerknall, Steinbruch, Wasserfontäne oder Kanonen-Detonation)
//   Schicht 4 – Nachbeben (Phase 4):       auslaufender Tiefbass-Groll, knisternde Blitze oder prasselnde Wassermassen
// Die alten Einzelton-Auslöser (`fistBarrage`, `fistQuake`, `cineDrop`, `impactCrack`, `boom` …) spielen für Regie-Aktionen nicht mehr.
import type { DirectorActionId, FormSlot } from '../graphics/endgameDirector';

/** Art des hochfrequenten Krachens im Einschlag */
export type CrackKind = 'thunder' | 'stone' | 'water' | 'cannon';
/** Art des Nachbebens */
export type AfterKind = 'rumble' | 'crackle' | 'water';

export interface KinoCue {
  /** Schicht 1: Rauschfarbe, Bandpass von → bis (Hz), Pegel; Puls-Sub (Hz), Pulsfolge (Schläge/s), Pegel */
  noise: 'pink' | 'brown'; sweepFrom: number; sweepTo: number; chargeGain: number; pulseHz: number; pulseRate: number; pulseGain: number;
  /** Schicht 2: Riss von → bis (Hz, fällt in gut 0,1 s), Pegel; Doppler-Schwung 0 … 1 (Stereo-Fahrt und fallende Tonhöhe) */
  whipFrom: number; whipTo: number; whipGain: number; doppler: number;
  /** Stereo-Doppelknall (links, rechts) und Stakkato-Sub-Bass (Zahl der Schläge in Phase 2; 0 = keiner) */
  double: boolean; staccato: number;
  /** Stille-Senke vor dem Einschlag (ms; 0 = keine) */
  silenceMs: number;
  /** Schicht 3: Sub-Bass-Fall von → bis (Hz) in `subMs`, Pegel; Mitten-Punch von → bis (Hz), Pegel; Krachen, Pegel, Nachhall-Stufen */
  subFrom: number; subTo: number; subMs: number; subGain: number; midFrom: number; midTo: number; midGain: number; crack: CrackKind; crackGain: number; echoes: number;
  /** Schicht 4: Art, Pegel, Dauer (s), Grenzfrequenz des Grolls (Hz) */
  after: AfterKind; afterGain: number; afterDur: number; rumbleHz: number;
  /** Musik absenken (Pegel 0 … 1 für die Dauer der Aktion) */
  duck: number;
}

/** Eckwerte der Vorgabe (Prüfungen lesen sie) */
export const KINO_SPEC = {
  /** Auflade-Sog: Bandpass von 120 Hz bis 2 400 Hz */
  sweep: [120, 2400],
  /** Puls-Sub der Aufladung */
  pulse: [42, 75],
  /** Stille-Senke unmittelbar vor dem Einschlag (ms) */
  silenceMs: 45,
  /** Sub-Bass-Fall des Einschlags: 90 Hz → 22 Hz in 150 ms */
  subDrop: [90, 22], subDropMs: 150,
  /** verzerrter Mitten-Punch */
  mid: [180, 450],
  /** Zielbereich der Sub-Bass-Fälle der Formen (auch auf kleinen Lautsprechern über die Sättigung hörbar) */
  subBand: [22, 55],
} as const;

type Path = 'blitz' | 'tektonik' | 'kosmos';

/** Grundrezept je Pfad: Blitz & Vakuum (hell, schnell, Donner, Knistern), Tektonik (dunkel, schwer, Steinbruch, Groll), Kosmos (Meteoriten) */
function base(path: Path, k: number): KinoCue {
  // k = Wucht 0 … 1 (Form I … X bzw. Ultimate = 1)
  const blitz = path === 'blitz', kosmos = path === 'kosmos';
  return {
    noise: blitz ? 'pink' : 'brown',
    sweepFrom: KINO_SPEC.sweep[0], sweepTo: Math.round(1300 + (KINO_SPEC.sweep[1] - 1300) * k), chargeGain: 0.2 + 0.2 * k,
    pulseHz: blitz ? 62 + 13 * k : kosmos ? 48 : 42 + 8 * k, pulseRate: blitz ? 9 : kosmos ? 4 : 5, pulseGain: 0.22 + 0.2 * k,
    whipFrom: blitz ? 5200 : kosmos ? 3400 : 2600, whipTo: blitz ? 900 : kosmos ? 380 : 420, whipGain: 0.3 + 0.22 * k, doppler: 0.35 + 0.4 * k,
    double: false, staccato: 0,
    silenceMs: 0,
    subFrom: KINO_SPEC.subDrop[0], subTo: Math.round(KINO_SPEC.subBand[1] - (KINO_SPEC.subBand[1] - 28) * k), subMs: KINO_SPEC.subDropMs, subGain: 0.5 + 0.4 * k,
    midFrom: KINO_SPEC.mid[1], midTo: KINO_SPEC.mid[0], midGain: 0.3 + 0.28 * k,
    crack: blitz ? 'thunder' : 'stone', crackGain: 0.3 + 0.3 * k, echoes: k > 0.75 ? 2 : k > 0.4 ? 1 : 0,
    after: blitz ? 'crackle' : 'rumble', afterGain: 0.14 + 0.2 * k, afterDur: 0.3 + 0.7 * k, rumbleHz: blitz ? 110 : 70,
    duck: 0.75 - 0.3 * k,
  };
}

const form = (path: Path, slot: FormSlot, silence: boolean, o: Partial<KinoCue> = {}): KinoCue =>
  Object.freeze({ ...base(path, (slot - 1) / 9 * 0.85), silenceMs: silence ? KINO_SPEC.silenceMs : 0, ...o });

/** Die Rezepte aller Regie-Aktionen */
export const KINO_CUES: Readonly<Record<DirectorActionId, KinoCue>> = Object.freeze({
  // ---------- Pfad 1: Schneller Faustkämpfer (Blitz- & Vakuum-Sturm) ----------
  'sturmfaust.l4': Object.freeze({ ...base('blitz', 0.05), chargeGain: 0.1, pulseGain: 0.08, subGain: 0.34, midGain: 0.24, crackGain: 0.22, afterGain: 0.06, afterDur: 0.2, duck: 1 }),
  // I Vakuum-Jab: peitschender Schallknall
  'sturmfaust.k1': form('blitz', 1, false, { whipGain: 0.5, crack: 'cannon', crackGain: 0.42 }),
  // II Zwillings-Blitztritt: Stereo-Doppelknall
  'sturmfaust.k2': form('blitz', 2, false, { double: true, whipGain: 0.46 }),
  // III Windmühlen-Parade: kreisender Wind, weicher Einschlag
  'sturmfaust.k3': form('blitz', 3, false, { doppler: 0.9, whipGain: 0.3, crackGain: 0.18, subGain: 0.4 }),
  'sturmfaust.k4': form('blitz', 4, false, { doppler: 0.95, whipGain: 0.5 }),
  // V Donner-Fallkick: Blitzsäule mit Donnerknall
  'sturmfaust.k5': form('blitz', 5, true, { crack: 'thunder', crackGain: 0.5, echoes: 1 }),
  // VI Zyklon-Sog: langer Sog
  'sturmfaust.k6': form('blitz', 6, true, { chargeGain: 0.4, doppler: 1, after: 'rumble' }),
  // VII Hundert-Fäuste-Maschinengewehr: Stakkato-Sub-Bass
  'sturmfaust.k7': form('blitz', 7, true, { staccato: 12, whipGain: 0.34, midGain: 0.5 }),
  // VIII Kugelblitz-Käfig: Knister-Schicht
  'sturmfaust.k8': form('blitz', 8, true, { after: 'crackle', afterGain: 0.42, afterDur: 1.1, staccato: 4 }),
  'sturmfaust.k9': form('blitz', 9, true, { crackGain: 0.62, echoes: 2 }),
  // X Kaiser-Vakuumkanone: langer Strahl
  'sturmfaust.k10': form('blitz', 10, true, { chargeGain: 0.42, whipGain: 0.56, subTo: 28, echoes: 2 }),
  // Stufe 60: 26 Hz gesättigter Sub-Bass-Fall + krachender Donnerhall
  'sturmfaust.u': Object.freeze({ ...base('blitz', 1), silenceMs: KINO_SPEC.silenceMs, staccato: 24, subTo: 26, subGain: 1, crack: 'thunder' as const, crackGain: 0.7, echoes: 3, after: 'crackle' as const, afterGain: 0.4, afterDur: 1.7, duck: 0.3 }),

  // ---------- Pfad 2: Kräftiger Faustkämpfer (Tektonik- & Titanen-Wucht) ----------
  'erdspalter.l4': Object.freeze({ ...base('tektonik', 0.1), chargeGain: 0.1, pulseGain: 0.1, subGain: 0.5, midGain: 0.3, crackGain: 0.26, afterGain: 0.1, afterDur: 0.3, duck: 1 }),
  // I Rammstoß: tiefer Trommel-Bass
  'erdspalter.k1': form('tektonik', 1, false, { subGain: 0.7, midFrom: 260, midGain: 0.42, crack: 'cannon' }),
  'erdspalter.k2': form('tektonik', 2, false, { doppler: 0.8, staccato: 3 }),
  // III Eisenkörper-Bollwerk: metallischer Punch
  'erdspalter.k3': form('tektonik', 3, false, { midFrom: 450, midTo: 300, midGain: 0.44, crackGain: 0.2 }),
  'erdspalter.k4': form('tektonik', 4, false, { doppler: 0.9, subGain: 0.8 }),
  'erdspalter.k5': form('tektonik', 5, true, { subGain: 0.92, crackGain: 0.5 }),
  // VI Tektonik-Fessel: auf See prasselnde Wassersäulen
  'erdspalter.k6': form('tektonik', 6, true, { staccato: 4, afterDur: 0.8 }),
  // VII Beben-Salve: sechs Schläge
  'erdspalter.k7': form('tektonik', 7, true, { staccato: 6 }),
  'erdspalter.k8': form('tektonik', 8, true, { afterGain: 0.4, afterDur: 1.1, rumbleHz: 60 }),
  'erdspalter.k9': form('tektonik', 9, true, { whipGain: 0.5, subTo: 30, echoes: 2 }),
  'erdspalter.k10': form('tektonik', 10, true, { subTo: 28, afterGain: 0.46, afterDur: 1.2, echoes: 2 }),
  // Stufe 60: 35 Hz Erdbeben-Grollen im Aufbau, 24 Hz gesättigte Sub-Bass-Detonation
  'erdspalter.u': Object.freeze({ ...base('tektonik', 1), silenceMs: KINO_SPEC.silenceMs, pulseHz: 42, pulseRate: 3, pulseGain: 0.5, rumbleHz: 35, subTo: 24, subGain: 1, crackGain: 0.66, echoes: 2, afterGain: 0.5, afterDur: 2, duck: 0.3 }),

  // ---------- Stufe 101: Himmelssturz – 22 Hz Sub-Bass-Detonation, mehrstufiger Donnerhall ----------
  'kosmos.u': Object.freeze({ ...base('kosmos', 1), silenceMs: 50, staccato: 5, subTo: 22, subGain: 1, crack: 'thunder' as const, crackGain: 0.8, echoes: 4, after: 'rumble' as const, afterGain: 0.56, afterDur: 1.5, rumbleHz: 48, duck: 0.25 }),
});

/** Rezept einer Regie-Aktion */
export const kinoCue = (id: DirectorActionId): KinoCue => KINO_CUES[id];

/** Krachen je Oberfläche: über dem Meer wird Steinbruch zur Wasserfontäne, an Land Wasser zu Stein */
export function crackFor(cue: KinoCue, sea: boolean): CrackKind {
  if (cue.crack === 'stone' && sea) return 'water';
  if (cue.crack === 'water' && !sea) return 'stone';
  return cue.crack;
}

/** Nachbeben je Oberfläche: der Groll wird über dem Meer zu prasselnden Wassermassen */
export function afterFor(cue: KinoCue, sea: boolean): AfterKind {
  return cue.after === 'rumble' && sea ? 'water' : cue.after;
}
