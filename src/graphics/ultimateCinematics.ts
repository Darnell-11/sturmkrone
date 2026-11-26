// Phase 4.6I – Kino-Regie der Ultimates: für JEDES der 15 Ultimates eine maßgeschneiderte, hochdramatische 3-Akt-Choreografie (~1 s) statt
// der früheren Einheits-Nahaufnahme.
//   Akt 1 – Vorbereitung & Aufladung (0,30 – 0,35 s): Kampf-Pose der Figur (Griff an die Klinge, zweihändiges Ausholen, Faust-Spannung, Hand
//           zum Himmel …), Fokus-Kamera mit leuchtenden Augen, aufwirbelnder Mantel, lokale Aura; die Spielzeit läuft in Zeitlupe (≈ 0,32).
//   Akt 2 – Bedrohlicher Aufbau & Perspektiv-Schwenk (0,35 – 0,42 s): die Kamera schwenkt auf die ENTSTEHENDE Gefahr (Meteoriten mit
//           Mach-Kegeln, Klingenwelle, Geister-Armada, Gewitterwolke, Raumrisse …); die Spielzeit läuft fast in Echtzeit bis zum Treffer.
//   Akt 3 – Einschlag, Doppel-Impact-Frame & Zerstörungs-Follow (0,32 – 0,38 s): exakt im Treffermoment invertiert → Schwarz-Weiß-Tusche mit
//           radialen Speedlines (Standbild/Hit-Stop, `AnimeImpactRig`), dann Kamera-Stoß und weiter Blick auf die Zerstörung.
// Danach gleitet die Kamera weich (Kugelbahn, `orbitBlend`) in die freie 3D-Steuerung zurück; die Eingabe ist da schon frei.
//
// Rein: keine three.js-Szene, keine Speicheranforderung je Bild (vorab angelegte Ergebnis-Objekte, modulweite Hilfsvektoren). Die Welt
// (`SeaWorld`) füllt je Bild die Bezugspunkte (`CineAnchors`: Füße, Kopf, Hand, Hüfte, entstehende Gefahr, Einschlag …), liest Zeitmaß,
// Kamera-Lage, Pose und Einblendungen, und prüft beim Wechsel jedes Akts EINMAL die Sichtlinien (`CineSight`: Masten, Takelage, Mauern,
// Gelände) – die Regie wählt daraus eine freie Variante (gespiegelt, gedreht, angehoben, herangerückt). Je Bild hält zusätzlich ein
// Spring-Arm (`CINE_ARM` in cameraRig.ts) die Kamera aus Fels, Mauern und Rümpfen.
// Zeiten: die Regie läuft in ECHTZEIT und setzt das Zeitmaß der Spielzeit so, dass das Aufladen der Engine (`charge`) genau Akt 1 füllt und
// der entscheidende Treffer (`strikeAt + lag`) genau ans Ende von Akt 2 fällt. Akt 3 beginnt beim Treffer der Welt (`impact()`, ausgelöst von
// der Kataklysmus-Regie) – kommt er früher, schneidet die Regie früher; bleibt er aus, setzt sie ihn nach `CINE.overrun` selbst.
import { Vector3 } from 'three';
import type { CataclysmKind, UltimateSpec } from '../data/actionKit';
import type { HandPoseId } from '../data/characterRig';
import { orbitBlend } from './cameraRig';

// ---------------------------------------------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------------------------------------------

export type CineActId = 'prep' | 'build' | 'impact';
export type CinePhase = 'idle' | CineActId | 'return';
export const CINE_ACTS: readonly CineActId[] = ['prep', 'build', 'impact'];
export const ACT_LABEL: Readonly<Record<CineActId, string>> = {
  prep: 'Vorbereitung & Aufladung',
  build: 'Bedrohlicher Aufbau & Perspektiv-Schwenk',
  impact: 'Einschlag, Doppel-Impact-Frame & Zerstörungs-Follow',
};

/** Grenzen und Zeiten der Regie (echte Sekunden) */
export const CINE = {
  prep: [0.3, 0.35], build: [0.35, 0.42], impact: [0.32, 0.38],
  /** die drei Akte zusammen höchstens */
  maxTotal: 1.2,
  /** weiche Rückkehr in die freie Kamera nach Akt 3 (die Steuerung liegt dann schon beim Spieler) */
  returnDur: 0.45,
  /** Überblendung am Beginn von Akt 2 (nahtlose Verzahnung); Akt 3 beginnt mit einem harten Schnitt unter dem invertierten Impact-Bild */
  seam: 0.1,
  /** Kamera übernimmt am Anfang von Akt 1 so schnell (Schnitt in die Fokus-Kamera) */
  cutIn: 0.11,
  /** so lange wartet Akt 2 über seine Dauer hinaus auf den Treffer der Welt, danach setzt die Regie ihn selbst */
  overrun: 0.14,
  /** Kinobalken und HUD-Ausblendung */
  barsIn: 0.12, barsOut: 0.3,
  /** nie schneller als Echtzeit (Akt 2) */
  maxBuildScale: 1,
  /** Kamera nie näher als so an ihren Drehpunkt (m) */
  minDist: 0.38,
  /** Sichtfeld (Grad) */
  fovMin: 24, fovMax: 74,
  /** Sichtprüfung: so frei gilt eine Einstellung als frei */
  freeOk: 0.98,
} as const;

/** Bezugspunkte der Einstellungen */
export type CineAnchorId = 'origin' | 'feet' | 'chest' | 'head' | 'hand' | 'hip' | 'threat' | 'impact' | 'path' | 'sky';
export interface CinePoint { x: number; y: number; z: number }
/** Bezugspunkte in der Welt (je Bild von der Welt gefüllt; einmal anlegen mit `makeAnchors`) */
export interface CineAnchors {
  /** Blickrichtung der Figur (rad; vorn = (sin, cos)) */
  yaw: number;
  /** Ort der Figur beim Start (Boden), Füße, Brust, Kopf, Haupthand, Hüfte (Schwertscheide) */
  origin: CinePoint; feet: CinePoint; chest: CinePoint; head: CinePoint; hand: CinePoint; hip: CinePoint;
  /** die entstehende Gefahr (Meteor, Wellenfront, Säge, Wirbel, Blitzspitze …), der Treffer-/Zerstörungspunkt, Mitte des Wegs, Himmel */
  threat: CinePoint; impact: CinePoint; path: CinePoint; sky: CinePoint;
}
const pt = (): CinePoint => ({ x: 0, y: 0, z: 0 });
export const makeAnchors = (): CineAnchors => ({ yaw: 0, origin: pt(), feet: pt(), chest: pt(), head: pt(), hand: pt(), hip: pt(), threat: pt(), impact: pt(), path: pt(), sky: pt() });

/**
 * Schlüssel-Einstellung: Drehpunkt `at`, Abstand, Winkel um den Drehpunkt relativ zur Blickrichtung der Figur (0 = vor ihr, π = hinter ihr,
 * + = links von ihr), Höhe über dem Drehpunkt; Blickpunkt `look` + Höhe `ly` + `ahead` m in Blickrichtung; Sichtfeld; Neigung (Dutch Angle)
 */
export interface CineKey {
  at: CineAnchorId; dist: number; az: number; dy: number;
  look: CineAnchorId; ly: number; ahead?: number;
  fov: number; roll?: number;
}
export type CineEase = 'linear' | 'inOut' | 'out' | 'in' | 'snap' | 'hold';
/** Kamerafahrt eines Akts: von → bis mit Verlauf */
export interface CineShot { from: CineKey; to: CineKey; ease: CineEase }

export type CinePoseId =
  | 'skyHand' | 'twoHandDraw' | 'thumbHilt' | 'crossJump' | 'sabreLeap' | 'fistLunge' | 'crouchWindup' | 'palmSphere'
  | 'flameArms' | 'palmSlam' | 'flowHands' | 'windGather' | 'rocketRise' | 'sunCrown' | 'crimsonArc';
/** Hand-Ziel im Figurenraum (x links, y oben ab den Füßen, z vorn; m): Anfang (x, y, z) → Ende (x, y, z) von Akt 1 */
export type CineReach = readonly [number, number, number, number, number, number];
/** Kampf-Pose der Figur in Akt 1 */
export interface CinePose {
  id: CinePoseId;
  label: string;
  /** Stand des Ultimate-Clips in Akt 1 (Anteil des ganzen Clips): Anfang → Ende (= Anfang des Angriffs-Abschnitts, nahtlos); null = Engine */
  clip: readonly [number, number] | null;
  /** Kauern (m), Vorlage (rad, + vorn), Blick nach oben (rad), Drehung der Brust (rad, + links) */
  crouch: number; lean: number; look: number; twist: number;
  /** sichtbares Abheben in Akt 1 (m: Sprung, Aufstieg) – klingt in Akt 2 aus, die Engine übernimmt den echten Flug */
  lift: number;
  handR: HandPoseId; handL: HandPoseId;
  reachR: CineReach | null; reachL: CineReach | null;
  /** die Pose hält bis in Akt 2 (Arm zum Himmel, Sphäre in der Hand) */
  hold: boolean;
  /** Wirbelwind an Mantel und Haar (m/s) */
  whirl: number;
}

/** Himmelsreaktion: spiralförmig aufreißend (Sterne / Sturm), Gewitterwolke, Finsternis, Sonnenglut, Sturmböen, Riss */
export type CineSky = 'starSpiral' | 'stormSpiral' | 'thunderhead' | 'eclipse' | 'sunburst' | 'gale' | 'rift';
/** was in Akt 2 entsteht */
export type CineThreat =
  | 'meteors' | 'bladeWave' | 'dash' | 'saw' | 'armada' | 'fistFlood' | 'trench' | 'vortex' | 'dragons' | 'glacier' | 'tsunami'
  | 'tornado' | 'bolt' | 'sunRing' | 'sickleRain';

export interface UltimateCinematic {
  kind: CataclysmKind;
  /** Titel der Choreografie (wie das Ultimate) */
  title: string;
  /** die drei Akte in Worten (Kompendium, Prüfungen) */
  beats: readonly [string, string, string];
  /** Echtzeit-Dauer der Akte (s) */
  dur: readonly [number, number, number];
  pose: CinePose;
  sky: CineSky;
  threat: CineThreat;
  shots: readonly [CineShot, CineShot, CineShot];
  /** Impact-Bilder im Treffermoment (2 = Doppel: invertiert → Tusche; 3 – 4 mit länger stehender Tusche) */
  frames: number;
  /** Kamera-Stoß im Treffermoment: Stärke (0 … 1,5) und Richtung */
  kick: number; kickDir: 'fwd' | 'down' | 'up' | 'side';
  /** Zeitlupe in Akt 3 nach dem Standbild: Anfang → Ende */
  slow3: readonly [number, number];
  /** Aura der Vorbereitung, wenn sie von den Farben des Ultimates abweicht (Zweihänder: schwarz-smaragdgrün) */
  aura?: string; auraInk?: string;
  /**
   * 4.6J: Bildregelung in Akt 2 – Belichtung und Bloom als Faktoren (1 = unverändert). Große leuchtende Wände (Klingenwelle, Drachenwelle)
   * überstrahlten sonst das Bild; gedämpft bleiben Klingenwelle, Wasserdrache und Tusche-Konturen gestochen scharf.
   */
  grade2?: { exposure: number; bloom: number };
}

/** 4.6J: Akt-2-Bildregelung blendet so schnell ein und am Beginn von Akt 3 aus (echte s) */
export const GRADE_BLEND = 0.08;

// ---------------------------------------------------------------------------------------------------------------
// Die 15 Choreografien
// ---------------------------------------------------------------------------------------------------------------

const K = (at: CineAnchorId, dist: number, az: number, dy: number, look: CineAnchorId, ly: number, fov: number, ahead = 0, roll = 0): CineKey => ({ at, dist, az, dy, look, ly, fov, ahead, roll });
const S = (from: CineKey, to: CineKey, ease: CineEase): CineShot => ({ from, to, ease });
const P = (id: CinePoseId, label: string, o: Partial<CinePose>): CinePose => ({
  id, label, clip: null, crouch: 0, lean: 0, look: 0, twist: 0, lift: 0, handR: 'offen', handL: 'offen', reachR: null, reachL: null, hold: false, whirl: 3, ...o,
});

export const ULTIMATE_CINEMATICS: Readonly<Record<CataclysmKind, UltimateCinematic>> = {
  skyfall: {
    kind: 'skyfall', title: 'Himmelssturz: Zwillings-Meteoriten & Planeten-Kollaps',
    beats: [
      'Tiefe Helden-Untersicht: der Kapitän hebt den Arm gen Himmel, kosmisch-violette Blitze zucken vom Mantel weg',
      'Schwenk schräg hoch in den aufreißenden Sternenhimmel: die Wolkendecke öffnet sich spiralförmig, zwei brennende Zwillings-Meteoriten mit Mach-Kegeln und Kometenschweifen, dahinter die Planetensphäre',
      'Die Kamera folgt dem Einschlag: Doppel-Impact-Frame, Feuer- und Gischtfontäne, Schiffe zerschmettert, tiefer Meeres-Trichter',
    ],
    dur: [0.33, 0.4, 0.38],
    pose: P('skyHand', 'Hand zum Himmel', { clip: [0.2, 0.45], look: 0.5, lean: -0.12, handR: 'offen', reachR: [-0.3, 1.5, 0.35, -0.16, 2.06, 0.16], hold: true, whirl: 5 }),
    sky: 'starSpiral', threat: 'meteors',
    shots: [
      S(K('origin', 3.3, 0.55, 0.6, 'head', 0.15, 44), K('origin', 2.9, 0.78, 0.45, 'head', 0.65, 50), 'out'),
      // seitlich neben der Bordwand, schräg hoch zum aufreißenden Himmel (nicht durch die eigenen Segel)
      S(K('origin', 8, 1.7, 0.8, 'threat', 0, 56, 0, -0.06), K('origin', 10, 1.9, 1.2, 'threat', -4, 60, 0, 0.05), 'inOut'),
      S(K('impact', 26, 2.7, 9, 'impact', 3, 58), K('impact', 36, 2.9, 14, 'impact', 0, 62), 'out'),
    ],
    frames: 4, kick: 1.3, kickDir: 'down', slow3: [0.28, 1],
  },
  horizonCut: {
    kind: 'horizonCut', title: 'Himmelsspalter: Horizont-Zäsur',
    beats: [
      'Tiefes, zweihändiges Anziehen der schwarz-smaragdgrün umhüllten Klinge',
      'Seitliche Verfolgungskamera: die 180 m breite Klingenwelle rast über das Wasser',
      'Tusche-Impact-Frame exakt beim Auseinanderkippen von Bug- und Heckhälfte des Kriegsschiffs',
    ],
    dur: [0.32, 0.38, 0.36],
    pose: P('twoHandDraw', 'Zweihändiges Anziehen', { clip: [0.16, 0.38], crouch: 0.14, lean: 0.2, twist: 0.3, handR: 'griff', handL: 'griff', whirl: 4 }),
    sky: 'rift', threat: 'bladeWave',
    shots: [
      S(K('hand', 1.6, 1.15, -0.15, 'hand', 0.15, 38, 0, 0.1), K('chest', 2.1, 1.5, -0.55, 'head', 0.1, 40, 0, 0.04), 'out'),
      // jenseits des Kriegsschiffs knapp über dem Wasser, Blick zurück: die Klingenwelle rast als leuchtende Linie heran (die Energiesichel liegt
      // flach in Deckshöhe – von oben oder dicht dahinter deckte ihr Leuchten das ganze Bild zu)
      S(K('impact', 28, 0.75, 1.0, 'threat', 0.5, 50), K('impact', 21, 0.45, 1.6, 'threat', 1.5, 58), 'inOut'),
      S(K('impact', 18, 1.9, 5, 'impact', 2, 50), K('impact', 26, 2.2, 8, 'impact', 1, 56), 'out'),
    ],
    frames: 3, kick: 1.1, kickDir: 'side', slow3: [0.3, 1],
    aura: '#2AE0A0', auraInk: '#03140C',
    grade2: { exposure: 0.8, bloom: 0.35 },
  },
  iaiWorldBreak: {
    kind: 'iaiWorldBreak', title: 'Lautloser Blitz: Iaijutsu-Weltenbruch',
    beats: [
      'Extrem tiefe Nahaufnahme auf Daumen und Schwertgriff',
      'Überschall-Dash-Schnitt durch alle Gegner hindurch bis in die tiefe Landepose',
      'Nahaufnahme auf die Schwertscheide beim metallischen Einrast-Klick, Schwarz-Weiß-Impact-Frame, alle durchquerten Schiffe zerbrechen entlang leuchtender Raumrisse',
    ],
    dur: [0.32, 0.38, 0.38],
    pose: P('thumbHilt', 'Daumen am Schwertgriff', { clip: [0.02, 0.1], crouch: 0.16, lean: 0.28, handR: 'griff', whirl: 2 }),
    sky: 'rift', threat: 'dash',
    shots: [
      S(K('hand', 1.15, 0.55, -0.35, 'hand', 0.1, 34, 0, 0.1), K('hand', 0.95, 0.7, -0.3, 'hand', 0.12, 30, 0, 0.05), 'inOut'),
      S(K('chest', 6, 1.45, 0.4, 'chest', 0, 58), K('chest', 4.2, 1.9, -0.3, 'chest', 0, 46), 'out'),
      S(K('hip', 0.75, 1.3, 0.05, 'hip', 0, 32), K('path', 22, 2.2, 7, 'path', 1, 58), 'hold'),
    ],
    frames: 4, kick: 0.9, kickDir: 'side', slow3: [0.22, 1],
  },
  sawCyclone: {
    kind: 'sawCyclone', title: 'Klingen-Zyklon: Tausend-Schnitt-Wirbel',
    beats: [
      'Akrobatischer Hochsprung mit gekreuzten Klingen',
      'Action-Verfolgungskamera direkt hinter der rotierenden 360°-Klingen-Kreissäge beim Durchfräsen von Bug bis Heck',
      'Impact-Frame: die Schiffe brechen in vier Sektionen auseinander',
    ],
    dur: [0.32, 0.38, 0.36],
    pose: P('crossJump', 'Gekreuzte Klingen im Sprung', { lift: 1.5, handR: 'griff', handL: 'griff', reachR: [-0.3, 1.3, 0.25, 0.12, 1.4, 0.34], reachL: [0.3, 1.3, 0.25, -0.12, 1.42, 0.34], whirl: 6 }),
    sky: 'gale', threat: 'saw',
    shots: [
      S(K('origin', 3.2, 0.6, 0.7, 'head', 0, 44), K('origin', 3.6, 0.9, 0.5, 'head', 0.3, 50), 'out'),
      S(K('threat', 5, 3.14, 1.6, 'threat', 0.6, 62, 4), K('threat', 6.5, 2.9, 2.2, 'threat', 0.5, 64, 8), 'linear'),
      S(K('impact', 16, 2.4, 6, 'impact', 1.5, 52), K('impact', 22, 2.6, 9, 'impact', 0.5, 56), 'out'),
    ],
    frames: 2, kick: 1.0, kickDir: 'fwd', slow3: [0.3, 1],
  },
  sevenSeas: {
    kind: 'sevenSeas', title: 'Souverän-Orkan: Sieben-Meere-Zäsur',
    beats: [
      'Sprung in die Luft mit golden-roten Säbel-Blitzen',
      'Weite Halbkreis-Kamera hinter dem Kapitän: links und rechts geht die Geister-Armada aus goldenen Schiffsgeschützen in Stellung',
      'Herabfahrende Blitz-Zäsur und Leuchtspur-Kanonensalve mit Impact-Frame',
    ],
    dur: [0.32, 0.4, 0.36],
    pose: P('sabreLeap', 'Säbel-Sprung', { clip: [0.05, 0.15], crouch: 0.12, lean: 0.1, lift: 0.9, handR: 'griff', whirl: 6 }),
    sky: 'stormSpiral', threat: 'armada',
    shots: [
      S(K('origin', 3.4, 0.4, 0.3, 'head', 0.1, 44), K('origin', 3.8, 0.55, -0.1, 'head', 0.6, 50), 'out'),
      S(K('chest', 12, 1.9, 4, 'chest', 1, 58, 6), K('chest', 13, 4.4, 5.5, 'chest', 1.5, 60, 10), 'inOut'),
      S(K('chest', 9, 3.3, 5, 'impact', 0, 60), K('impact', 30, 3.0, 12, 'impact', 0, 60), 'out'),
    ],
    frames: 3, kick: 1.1, kickDir: 'down', slow3: [0.3, 1],
  },
  fistStorm: {
    kind: 'fistStorm', title: 'Sturmfaust-Stakkato: Zehntausend-Hiebe-Orkan',
    beats: [
      'Tiefer Ausfallschritt mit glühenden Fäusten und Zoom-Punch',
      'Leicht seitliche Weitwinkel-Kamera auf die explodierende Kegel-Flut aus hunderten Geister-Fäusten und Überschall-Ringen',
      'Impact-Frame und Zerbersten der getroffenen Ziele',
    ],
    dur: [0.3, 0.38, 0.34],
    pose: P('fistLunge', 'Ausfallschritt mit glühenden Fäusten', { clip: [0.0, 0.1], crouch: 0.22, lean: 0.3, handR: 'faust', handL: 'faust', reachR: [-0.22, 1.12, -0.1, -0.08, 1.36, 0.6], reachL: [0.14, 1.4, 0.3, 0.14, 1.38, 0.28], whirl: 4 }),
    sky: 'rift', threat: 'fistFlood',
    shots: [
      S(K('hand', 2.2, 0.35, -0.2, 'hand', 0, 50), K('hand', 1.2, 0.3, -0.1, 'head', -0.2, 32), 'snap'),
      S(K('chest', 8, 1.75, 1.6, 'chest', 0, 62, 9), K('chest', 9.5, 1.55, 2.2, 'chest', 0, 66, 14), 'linear'),
      S(K('impact', 16, 2.5, 5, 'impact', 1.5, 54), K('impact', 22, 2.7, 7, 'impact', 1, 58), 'out'),
    ],
    frames: 2, kick: 1.2, kickDir: 'fwd', slow3: [0.32, 1],
  },
  oceanSplit: {
    kind: 'oceanSplit', title: 'Erdspalter-Beben: Ozean-Teilung',
    beats: [
      'Tief geduckte Aushol-Pose, der Boden bebt, Steine und Tropfen springen hoch',
      'Tiefe Blickachse entlang der Schneise: die Luft reißt wie Glas, das Meer teilt sich zu einem 9 m tiefen Graben mit hohen Gischt-Wänden',
      'Impact-Frame und Zusammenprall der Schiffe im Graben',
    ],
    dur: [0.33, 0.4, 0.36],
    pose: P('crouchWindup', 'Geduckte Aushol-Pose', { clip: [0.15, 0.38], crouch: 0.26, lean: 0.36, twist: 0.2, handR: 'griff', handL: 'griff', whirl: 2 }),
    sky: 'rift', threat: 'trench',
    shots: [
      S(K('feet', 2.8, 1.1, 0.15, 'chest', 0.2, 44), K('feet', 2.3, 1.25, 0.1, 'head', 0.1, 42), 'out'),
      S(K('feet', 3.2, 3.14, 0.9, 'feet', 0.5, 56, 30), K('feet', 4.5, 3.14, 1.6, 'feet', -2, 60, 55), 'inOut'),
      S(K('impact', 20, 2.0, 7, 'impact', -3, 54), K('impact', 26, 2.3, 10, 'impact', -2, 58), 'out'),
    ],
    frames: 3, kick: 1.3, kickDir: 'down', slow3: [0.3, 1],
  },
  blackHole: {
    kind: 'blackHole', title: '7. Form: Ereignishorizont – Schwarzer Abgrund',
    beats: [
      'Finstere Sphäre in der Handfläche, das Licht verzerrt sich um sie',
      'Weitwinkel-Sog-Kamera: Schiffe und Trümmer werden spiralförmig ins Zentrum gezogen',
      'Impact-Frame bei der Implosion, dann Explosion nach außen',
    ],
    dur: [0.33, 0.4, 0.38],
    pose: P('palmSphere', 'Sphäre in der Handfläche', { clip: [0.08, 0.2], look: -0.18, handR: 'offen', reachR: [-0.14, 1.28, 0.42, -0.1, 1.34, 0.5], hold: true, whirl: 4 }),
    sky: 'eclipse', threat: 'vortex',
    shots: [
      S(K('hand', 1.1, 0.6, 0.1, 'hand', 0, 36), K('hand', 0.85, 0.75, 0.15, 'hand', 0.05, 34), 'inOut'),
      S(K('threat', 26, 2.6, 11, 'threat', 0, 68), K('threat', 22, 3.3, 9, 'threat', 0, 70), 'linear'),
      S(K('threat', 18, 3.2, 7, 'threat', 0, 60), K('threat', 32, 3.4, 12, 'threat', 0, 64), 'snap'),
    ],
    frames: 4, kick: 1.2, kickDir: 'fwd', slow3: [0.25, 1],
  },
  fireDragons: {
    kind: 'fireDragons', title: '7. Form: Purpur-Sonneninferno',
    beats: [
      'Wirbelnde Flammen-Spiralen um beide Arme',
      'Dynamischer Schwenk entlang des sich windenden 3D-Feuerdrachen-Wirbelsturms',
      'Impact-Frame mit verkohlten Schiffsrümpfen und Lavarissen',
    ],
    dur: [0.32, 0.4, 0.36],
    pose: P('flameArms', 'Flammen um beide Arme', { clip: [0.08, 0.2], handR: 'faust', handL: 'faust', reachR: [-0.45, 1.2, 0.25, -0.38, 1.55, 0.35], reachL: [0.45, 1.2, 0.25, 0.38, 1.55, 0.35], whirl: 5 }),
    sky: 'sunburst', threat: 'dragons',
    shots: [
      S(K('chest', 2.0, 0.5, 0.1, 'chest', 0.2, 42), K('chest', 1.6, 0.8, 0.2, 'chest', 0.25, 40), 'out'),
      S(K('threat', 20, 1.9, 10, 'threat', 0, 58), K('threat', 18, 1.2, 12, 'threat', 2, 60), 'inOut'),
      S(K('impact', 18, 2.2, 6, 'impact', 1, 54), K('impact', 24, 2.45, 9, 'impact', 1, 58), 'out'),
    ],
    frames: 3, kick: 1.0, kickDir: 'fwd', slow3: [0.3, 1],
  },
  glacier: {
    kind: 'glacier', title: '7. Form: Ewiger Gletscher-Kataklysmus',
    beats: [
      'Handflächen-Aufschlag, eine Eiswelle friert blitzschnell über das Meer',
      'Tiefe Untersicht: Gletschersäulen schießen aus dem Wasser und heben das Schiff an',
      'Impact-Frame beim Zersplittern des Eises',
    ],
    dur: [0.33, 0.4, 0.36],
    pose: P('palmSlam', 'Handflächen-Aufschlag', { clip: [0.25, 0.55], crouch: 0.3, lean: 0.45, handR: 'offen', handL: 'offen', whirl: 3 }),
    sky: 'rift', threat: 'glacier',
    shots: [
      S(K('feet', 2.6, 1.0, 0.6, 'chest', -0.2, 44), K('feet', 3.2, 1.3, 1.1, 'chest', -0.45, 48), 'out'),
      S(K('impact', 14, 2.4, -0.5, 'impact', 3.5, 58), K('impact', 12, 2.6, 0.2, 'impact', 5.5, 60), 'inOut'),
      S(K('impact', 16, 2.6, 4, 'impact', 6, 56), K('impact', 24, 2.8, 8, 'impact', 3, 60), 'out'),
    ],
    frames: 3, kick: 1.0, kickDir: 'up', slow3: [0.3, 1],
  },
  floodDragon: {
    kind: 'floodDragon', title: '7. Form: Tiefsee-Sintflutdrache',
    beats: [
      'Fließende Doppelhand-Bewegung, ein Wasserstrudel steigt auf',
      'Dramatische Untersicht vor der türmenden Tsunami-Drachenwelle',
      'Impact-Frame beim Kentern der Schiffe',
    ],
    dur: [0.33, 0.4, 0.36],
    pose: P('flowHands', 'Fließende Doppelhand', { clip: [0.1, 0.24], handR: 'offen', handL: 'offen', reachR: [-0.4, 1.0, 0.3, -0.2, 1.55, 0.5], reachL: [0.4, 1.0, 0.3, 0.2, 1.55, 0.5], whirl: 4 }),
    sky: 'stormSpiral', threat: 'tsunami',
    shots: [
      S(K('chest', 3.2, 0.7, 0.1, 'chest', 0.2, 44), K('chest', 2.8, 1.0, -0.1, 'head', 0.2, 44), 'inOut'),
      // Untersicht von hinter der Figur, Blick über den Bug nach vorn: die Drachenwelle bäumt sich vor den Schiffen auf, dahinter das dunkle Meer
      // (vor dem hellen Taghimmel ging die durchscheinende Wasserwand unter; die Regie dunkelt den Himmel beim Flutdrachen zusätzlich ab)
      S(K('threat', 11, 3.0, -4.5, 'threat', -4, 60, 14), K('threat', 9, 2.75, -5, 'threat', -2.5, 64, 18), 'inOut'),
      S(K('impact', 18, 1.8, 6, 'impact', 1, 54), K('impact', 24, 2.1, 9, 'impact', 1, 58), 'out'),
    ],
    frames: 3, kick: 1.1, kickDir: 'fwd', slow3: [0.3, 1],
    grade2: { exposure: 0.78, bloom: 0.3 },
  },
  vacuumStorm: {
    kind: 'vacuumStorm', title: '7. Form: Vakuum-Himmelssturm',
    beats: [
      'Klingenartige Windböen sammeln sich um die Figur',
      'Kreisende Kamera um den gewaltigen Vakuum-Tornado voller Windsicheln',
      'Impact-Frame beim Wegschleudern der Ziele',
    ],
    dur: [0.32, 0.4, 0.34],
    pose: P('windGather', 'Böen sammeln', { clip: [0.1, 0.24], handR: 'offen', handL: 'offen', reachR: [-0.55, 1.35, 0.1, -0.35, 1.45, 0.4], reachL: [0.55, 1.35, 0.1, 0.35, 1.45, 0.4], whirl: 8 }),
    sky: 'gale', threat: 'tornado',
    shots: [
      S(K('chest', 2.4, 0.4, 0.3, 'chest', 0.1, 46), K('chest', 2.0, 1.4, 0.2, 'head', 0, 44), 'inOut'),
      S(K('threat', 40, 2.4, 24, 'threat', 4, 58), K('threat', 36, 3.8, 28, 'threat', 6, 60), 'linear'),
      S(K('impact', 20, 2.6, 8, 'impact', 3, 56), K('impact', 28, 2.9, 12, 'impact', 2, 60), 'out'),
    ],
    frames: 2, kick: 1.0, kickDir: 'side', slow3: [0.3, 1],
  },
  thunderJudgment: {
    kind: 'thunderJudgment', title: '7. Form: Donnergott-Urteil',
    beats: [
      'Raketenartiger Aufstieg in eine schwarze Gewitterwolke',
      'Blick von oben schräg hinab auf den herabstürzenden zwölfästigen Fraktal-Hauptblitz',
      'Greller Tusche-Impact-Frame: gesprengte Masten, Plasma-Gischtringe',
    ],
    dur: [0.33, 0.42, 0.36],
    pose: P('rocketRise', 'Raketenaufstieg', { clip: [0.12, 0.24], crouch: 0.1, look: 0.45, lift: 3.4, handR: 'faust', reachR: [-0.14, 1.9, 0.14, -0.1, 2.12, 0.06], whirl: 7 }),
    sky: 'thunderhead', threat: 'bolt',
    shots: [
      S(K('origin', 4.5, 0.5, 0.4, 'head', 0.4, 50), K('origin', 5, 0.65, 0.2, 'head', 1.5, 58), 'out'),
      S(K('head', 4, 2.9, 2.5, 'threat', 0, 60, 0, 0.1), K('head', 5, 3.3, 3.5, 'impact', 0, 62, 0, -0.05), 'inOut'),
      S(K('impact', 22, 2.5, 9, 'impact', 2, 58), K('impact', 30, 2.7, 13, 'impact', 1, 60), 'out'),
    ],
    frames: 4, kick: 1.3, kickDir: 'down', slow3: [0.26, 1],
  },
  sunDance: {
    kind: 'sunDance', title: '7. Form: Zenit-Sonnentanz',
    beats: [
      'Ein blendender Sonnen-Kranz entzündet sich hinter den Schultern',
      'Dynamische Spiral-Kamera um den rotierenden Sonnen-Feuerring',
      'Impact-Frame mit glühenden Wracks',
    ],
    dur: [0.33, 0.4, 0.36],
    pose: P('sunCrown', 'Sonnen-Kranz', { clip: [0.1, 0.24], lean: -0.15, look: 0.2, handR: 'offen', handL: 'offen', reachR: [-0.62, 1.45, 0.05, -0.66, 1.62, 0.0], reachL: [0.62, 1.45, 0.05, 0.66, 1.62, 0.0], whirl: 3 }),
    sky: 'sunburst', threat: 'sunRing',
    shots: [
      S(K('chest', 2.6, 0.25, -0.3, 'head', 0.1, 42), K('chest', 2.2, 0.15, -0.45, 'head', 0.3, 40), 'inOut'),
      S(K('feet', 9, 0.8, 1.2, 'chest', 0, 56), K('feet', 12, 2.9, 6, 'chest', 0, 58), 'inOut'),
      S(K('impact', 18, 2.3, 6, 'impact', 1, 54), K('impact', 25, 2.5, 9, 'impact', 1, 58), 'out'),
    ],
    frames: 3, kick: 1.0, kickDir: 'fwd', slow3: [0.3, 1],
  },
  bloodMoon: {
    kind: 'bloodMoon', title: '7. Form: Blutmond-Finsternis',
    beats: [
      'Die Hand zieht einen karmesinroten Halbkreis vor dem sich verdunkelnden Blutmond-Halo',
      'Weite Perspektive auf den herabregnenden Sichel-Sturm mit dunklen Tusche-Schweifen',
      'Impact-Frame beim Vierteilen der Schiffe',
    ],
    dur: [0.33, 0.4, 0.36],
    pose: P('crimsonArc', 'Karmesin-Halbkreis', { clip: [0.1, 0.24], look: 0.12, handR: 'offen', reachR: [0.35, 1.0, 0.45, -0.55, 1.75, 0.3], whirl: 4 }),
    sky: 'eclipse', threat: 'sickleRain',
    shots: [
      S(K('chest', 3.2, 0.25, -0.55, 'head', 0.35, 50, 0, -0.05), K('chest', 2.8, 0.1, -0.7, 'head', 0.55, 52, 0, 0.05), 'inOut'),
      S(K('chest', 18, 2.5, 9, 'chest', 0, 62, 14), K('chest', 22, 2.8, 12, 'chest', 0, 64, 18), 'linear'),
      S(K('impact', 18, 2.4, 6, 'impact', 1, 54), K('impact', 24, 2.6, 9, 'impact', 1, 58), 'out'),
    ],
    frames: 3, kick: 1.0, kickDir: 'side', slow3: [0.3, 1],
  },
};

/** Reihenfolge der 15 Choreografien (14 Stil-Ultimates wie in der Vorgabe + Himmelssturz zuerst) */
export const CINEMATIC_ORDER: readonly CataclysmKind[] = [
  'skyfall', 'horizonCut', 'iaiWorldBreak', 'sawCyclone', 'sevenSeas', 'fistStorm', 'oceanSplit', 'blackHole',
  'fireDragons', 'glacier', 'floodDragon', 'vacuumStorm', 'thunderJudgment', 'sunDance', 'bloodMoon',
];

// ---------------------------------------------------------------------------------------------------------------
// Zeit: Zeitmaß je Akt aus den Zeiten der Engine
// ---------------------------------------------------------------------------------------------------------------

export interface CineTiming {
  /** Zeitmaß in Akt 1 (Aufladen der Engine füllt den Akt) und Akt 2 (entscheidender Treffer fällt ans Ende) */
  s1: number; s2: number;
  /** Spielzeit von Akt 2 bis zum entscheidenden Treffer */
  g2: number;
  /** Einschlag der Engine am Anfang von Akt 2 (die Gefahr entsteht sichtbar) oder am Ende (der Einschlag selbst trifft) */
  strike: 'launch' | 'impact';
}

/** Zeitmaße für eine Choreografie und die Zeiten des Ultimates (schreibt in `out`) */
export function cineTiming(def: UltimateCinematic, spec: Pick<UltimateSpec, 'strikeAt' | 'lag' | 'charge'>, out: CineTiming = { s1: 0, s2: 0, g2: 0, strike: 'impact' }): CineTiming {
  const lag = Math.max(0, spec.lag || 0);
  out.strike = lag > 0 ? 'launch' : 'impact';
  out.g2 = Math.max(0, spec.strikeAt) + lag;
  out.s1 = Math.max(0.05, spec.charge / def.dur[0]);
  out.s2 = Math.min(CINE.maxBuildScale, Math.max(0.05, out.g2 / def.dur[1]));
  return out;
}

/** Gesamtdauer der drei Akte (s) */
export const cineTotal = (def: UltimateCinematic) => def.dur[0] + def.dur[1] + def.dur[2];

// ---------------------------------------------------------------------------------------------------------------
// Verläufe
// ---------------------------------------------------------------------------------------------------------------

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const smoother = (x: number) => { const k = clamp01(x); return k * k * k * (k * (k * 6 - 15) + 10); };

export function cineEase(e: CineEase, u: number): number {
  const x = clamp01(u);
  switch (e) {
    case 'linear': return x;
    case 'inOut': return smoother(x);
    case 'out': return 1 - (1 - x) * (1 - x) * (1 - x);
    case 'in': return x * x * x;
    // schneller Zoom-Stoß: fast alles im ersten Drittel
    case 'snap': return 1 - Math.pow(1 - x, 5);
    // Nahaufnahme hält ein Drittel des Akts, dann reißt die Kamera weit auf
    case 'hold': return smoother((x - 0.34) / 0.66);
    default: return x;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Kamera-Lage und Sichtlinien
// ---------------------------------------------------------------------------------------------------------------

/** Kamera einer Einstellung: Position, Blickpunkt, Sichtfeld (Grad), Neigung um die Blickachse (rad) */
export interface CineCam { px: number; py: number; pz: number; lx: number; ly: number; lz: number; fov: number; roll: number }
export const makeCam = (): CineCam => ({ px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 1, fov: 50, roll: 0 });

/**
 * Sichtprüfung der Welt: Anteil der Strecke A → B ohne Hindernis (1 = frei) – Rümpfe, Masten, Takelage, Mauern, Gelände. `margin` (m): so weit
 * vor dem Motiv endet die Prüfung (Standard 0,25: der Blickpunkt liegt oft auf Deck, im Rauch oder im eigenen Rumpf); die Prüfung auf den
 * Körper der Figur nimmt einen kleinen Rand – eine Reling direkt vor der Brust verdeckt sonst unbemerkt den ganzen Körper.
 */
export interface CineSight { free(ax: number, ay: number, az: number, bx: number, by: number, bz: number, margin?: number): number }
/** Rand der Körper-Prüfung (m): die Brust liegt im Körper, Figuren zählen nicht als Hindernis */
export const BODY_MARGIN = 0.06;

/**
 * Ausweich-Variante einer Einstellung nach der Sichtprüfung: Drehung um den Drehpunkt (rad), gespiegelt, Anheben (Anteil 0 … 1 einer
 * Höhe, die mit dem Abstand wächst: Nahaufnahmen nur ein Stück, weite Einstellungen bis 2,4 m), Heranrücken (Anteil des Abstands)
 */
export interface CineFix { yaw: number; mirror: boolean; lift: number; pull: number; free: number }
const makeFix = (): CineFix => ({ yaw: 0, mirror: false, lift: 0, pull: 1, free: 1 });
/**
 * Varianten in Prüfreihenfolge: wie geplant, gespiegelt, sanft bis deutlich gedreht (auch gespiegelt), von schräg hinten über die Schulter
 * (die Figur steht dicht an einer Reling oder Brüstung: dann ist vorn und seitlich alles zu, hinter ihr aber frei), angehoben, herangerückt
 */
const VARIANTS: readonly (readonly [yaw: number, mirror: boolean, lift: number, pull: number])[] = [
  [0, false, 0, 1], [0, true, 0, 1], [0.45, false, 0, 1], [-0.45, false, 0, 1], [0.45, true, 0, 1], [-0.45, true, 0, 1],
  [0.95, false, 0, 1], [-0.95, false, 0, 1], [1.5, false, 0, 1], [-1.5, false, 0, 1], [2.3, false, 0, 1], [-2.3, false, 0, 1],
  [Math.PI, false, 0, 1], [0, false, 1, 1], [0, false, 0, 0.62],
];
/** Höhe des Anhebens für einen Abstand (m) */
const liftFor = (dist: number) => Math.min(2.4, 0.4 + dist * 0.22);
/** Zeitpunkte je Akt, an denen die Sichtlinie geprüft wird */
const SIGHT_U = [0, 0.5, 1] as const;
/** Bezugspunkte an der Figur (Einstellungen darauf prüfen auch den Körper) */
const FIGURE_ANCHORS: readonly CineAnchorId[] = ['head', 'chest', 'hand', 'hip', 'feet', 'origin'];

const _from = new Vector3();
const _to = new Vector3();
const _focus = new Vector3();
const PA = pt(), PB = pt(), LA = pt(), LB = pt();

function anchorOf(a: CineAnchors, id: CineAnchorId): CinePoint { return a[id]; }

// ---------------------------------------------------------------------------------------------------------------
// Die Regie
// ---------------------------------------------------------------------------------------------------------------

export class UltimateCinematics {
  phase: CinePhase = 'idle';
  def: UltimateCinematic | null = null;
  /** Zeit in der laufenden Phase und seit dem Start (echte s) */
  t = 0;
  clock = 0;
  readonly timing: CineTiming = { s1: 0.32, s2: 1, g2: 0.38, strike: 'impact' };
  /** Zeitmaß der Spielzeit (Zeitlupe, Standbild im Treffermoment) – die Welt übernimmt es, solange die Regie läuft */
  timeScale = 1;
  /** Übernahme der Kamera, Kinobalken/HUD-Ausblendung, Augen-Leuchten, Einblendung der Pose (0 … 1) */
  camK = 0;
  barsK = 0;
  glow = 0;
  poseK = 0;
  /** 4.6J: Faktoren für Belichtung und Bloom (Akt-2-Bildregelung `grade2`; 1 = unverändert) */
  exposureK = 1;
  bloomK = 1;
  /** Clip-Stand der Pose (Anteil des Clips; −1 = Engine) und sichtbares Abheben (m) */
  clipU = -1;
  lift = 0;
  /** Treffermoment erreicht; `forced`: die Regie setzte ihn selbst (die Welt meldete ihn nicht rechtzeitig) – die Welt löst dann die Bilder aus */
  impacted = false;
  forced = false;
  /** Echtzeit, bis zu der im Treffermoment das Standbild stand (danach Zeitlupe von Akt 3) */
  private holdEnd = -1;
  /** Sichtprüfung für den laufenden Akt steht aus (die Welt ruft `resolve`) */
  resolvePending = false;
  /** Ausweich-Varianten je Akt */
  readonly fix: [CineFix, CineFix, CineFix] = [makeFix(), makeFix(), makeFix()];
  /** zuletzt berechnete Kamera (Ausgang der Überblendung beim nächsten Akt) */
  readonly cam: CineCam = makeCam();
  private readonly seamFrom: CineCam = makeCam();
  private seamOn = false;
  /** Zähler für Prüfungen */
  readonly stats = { starts: 0, acts: 0, impacts: 0, forced: 0, resolves: 0, blocked: 0, returns: 0, sightRays: 0 };

  get active(): boolean { return this.phase !== 'idle'; }
  /** Läuft einer der drei Akte (nicht die Rückkehr)? */
  get inActs(): boolean { return this.phase === 'prep' || this.phase === 'build' || this.phase === 'impact'; }
  /** Nummer des laufenden Akts (0 … 2; in der Rückkehr 2, sonst −1) */
  get actIndex(): number { return this.phase === 'prep' ? 0 : this.phase === 'build' ? 1 : this.phase === 'impact' || this.phase === 'return' ? 2 : -1; }
  /** Anteil des laufenden Akts (0 … 1) */
  get u(): number {
    const d = this.def;
    if (!d) return 0;
    const i = this.actIndex;
    if (i < 0) return 0;
    if (this.phase === 'return') return 1;
    return clamp01(this.t / d.dur[i]);
  }

  /** Sequenz beginnen (Ultimate ausgelöst): Akt 1 */
  start(kind: CataclysmKind, spec: Pick<UltimateSpec, 'strikeAt' | 'lag' | 'charge'>): UltimateCinematic {
    const def = ULTIMATE_CINEMATICS[kind];
    this.def = def;
    cineTiming(def, spec, this.timing);
    this.phase = 'prep';
    this.t = 0;
    this.clock = 0;
    this.impacted = false;
    this.forced = false;
    this.holdEnd = -1;
    this.seamOn = false;
    this.resolvePending = true;
    for (const f of this.fix) { f.yaw = 0; f.mirror = false; f.lift = 0; f.pull = 1; f.free = 1; }
    this.stats.starts++;
    this.stats.acts++;
    this.apply();
    return def;
  }

  /**
   * Der entscheidende Treffer (die Welt meldet ihn: Klinge rastet ein, Welle erreicht das Schiff, Meteor schlägt ein …): Akt 3 beginnt.
   * Gibt true zurück, wenn er die Sequenz weiterschaltet (dann zeigt die Welt die Impact-Bilder); doppelte Meldungen zählen nicht.
   */
  impact(): boolean {
    if (this.impacted || (this.phase !== 'prep' && this.phase !== 'build')) return false;
    this.impacted = true;
    this.stats.impacts++;
    this.enter('impact');
    return true;
  }

  private enter(p: CineActId) {
    // Ausgang der Überblendung: die zuletzt gezeigte Kamera
    const c = this.cam, s = this.seamFrom;
    s.px = c.px; s.py = c.py; s.pz = c.pz; s.lx = c.lx; s.ly = c.ly; s.lz = c.lz; s.fov = c.fov; s.roll = c.roll;
    // Akt 3 schneidet hart: das invertierte Bild verdeckt den Schnitt, und beide Impact-Bilder zeigen schon die Einstellung des Einschlags
    // (eine Überblendung zeigte darin halb den Himmel oder die Welle von Akt 2)
    this.seamOn = this.camK > 0.5 && p !== 'impact';
    this.phase = p;
    this.t = 0;
    this.holdEnd = -1;
    this.resolvePending = true;
    this.stats.acts++;
  }

  /**
   * Je Bild in ECHTZEIT. `framesLeft` = noch zu zeichnende Impact-Bilder (`AnimeImpactRig.framesLeft`): solange welche ausstehen, steht die
   * Spielzeit (Hit-Stop).
   */
  update(realDt: number, framesLeft = 0) {
    const d = this.def;
    if (this.phase === 'idle' || !d) { this.timeScale = 1; this.camK = 0; this.barsK = 0; this.glow = 0; this.poseK = 0; this.clipU = -1; this.lift = 0; this.exposureK = 1; this.bloomK = 1; return; }
    const dt = Math.max(0, Math.min(0.1, Number.isFinite(realDt) ? realDt : 0));
    this.t += dt;
    this.clock += dt;
    switch (this.phase) {
      case 'prep':
        if (this.t >= d.dur[0]) this.enter('build');
        break;
      case 'build':
        // bleibt der Treffer der Welt aus (Szenenwechsel, Engine blockiert), setzt die Regie ihn selbst
        if (this.t >= d.dur[1] + CINE.overrun && !this.impacted) { this.forced = true; this.stats.forced++; this.impact(); }
        break;
      case 'impact':
        if (framesLeft <= 0 && this.holdEnd < 0) this.holdEnd = this.t;
        if (this.t >= d.dur[2] && framesLeft <= 0) { this.phase = 'return'; this.t = 0; this.stats.returns++; }
        break;
      case 'return':
        if (this.t >= CINE.returnDur) { this.reset(); return; }
        break;
      default: break;
    }
    this.apply(framesLeft);
  }

  /** Zeitmaß und Einblendungen für den aktuellen Zeitpunkt */
  private apply(framesLeft = 0) {
    const d = this.def!;
    const u = this.u;
    const pose = d.pose;
    switch (this.phase) {
      case 'prep':
        this.timeScale = this.timing.s1;
        this.camK = smooth(this.t / CINE.cutIn);
        this.glow = smooth(u / 0.6);
        this.poseK = smooth(u / 0.45);
        this.clipU = pose.clip ? pose.clip[0] + (pose.clip[1] - pose.clip[0]) * smoother(u) : -1;
        this.lift = pose.lift * cineEase('out', u);
        break;
      case 'build':
        this.timeScale = this.timing.s2;
        this.camK = 1;
        this.glow = 0.75 + 0.25 * (1 - u);
        this.poseK = pose.hold ? 1 : 1 - smooth(u / 0.4);
        this.clipU = -1;
        this.lift = pose.lift * (1 - smooth(u / 0.55));
        break;
      case 'impact': {
        // Standbild, solange Impact-Bilder ausstehen; danach Zeitlupe, die in Echtzeit ausläuft
        if (framesLeft > 0 || this.holdEnd < 0) this.timeScale = 0;
        else {
          const k = smooth((this.t - this.holdEnd) / Math.max(0.05, d.dur[2] - this.holdEnd));
          this.timeScale = d.slow3[0] + (d.slow3[1] - d.slow3[0]) * k;
        }
        this.camK = 1;
        this.glow = 0.5 * (1 - u);
        this.poseK = pose.hold ? 1 - smooth(u / 0.5) : 0;
        this.clipU = -1;
        this.lift = 0;
        break;
      }
      case 'return':
        this.timeScale = 1;
        this.camK = 1 - smoother(this.t / CINE.returnDur);
        this.glow = 0;
        this.poseK = 0;
        this.clipU = -1;
        this.lift = 0;
        break;
      default: break;
    }
    // Kinobalken und HUD: rasch hinein, in der Rückkehr heraus
    this.barsK = this.phase === 'return' ? 1 - smooth(this.t / CINE.barsOut) : smooth(this.clock / CINE.barsIn);
    // 4.6J: Akt-2-Bildregelung – blendet mit Akt 2 ein und im Treffermoment (unter dem invertierten Bild) wieder aus
    const g2 = d.grade2;
    let gk = 0;
    if (g2) {
      if (this.phase === 'build') gk = smooth(this.t / GRADE_BLEND);
      else if (this.phase === 'impact') gk = 1 - smooth(this.t / GRADE_BLEND);
    }
    this.exposureK = g2 ? 1 + (g2.exposure - 1) * gk : 1;
    this.bloomK = g2 ? 1 + (g2.bloom - 1) * gk : 1;
  }

  /**
   * Kamera eines Akts zum Anteil u (0 … 1) mit seiner Ausweich-Variante – rein, schreibt in `out`. Grundlage für `pose` und die Sichtprüfung.
   * `fix` = Variante (Standard: die gewählte des Akts).
   */
  keyPose(act: number, u: number, a: CineAnchors, out: CineCam, fix: CineFix = this.fix[act]): CineCam {
    const d = this.def;
    if (!d) return out;
    const shot = d.shots[act];
    const e = cineEase(shot.ease, u);
    const A = shot.from, B = shot.to;
    const yaw = a.yaw;
    const fwx = Math.sin(yaw), fwz = Math.cos(yaw);
    const pa = anchorOf(a, A.at), pb = anchorOf(a, B.at);
    PA.x = pa.x; PA.y = pa.y; PA.z = pa.z;
    PB.x = pb.x; PB.y = pb.y; PB.z = pb.z;
    const px = PA.x + (PB.x - PA.x) * e, py = PA.y + (PB.y - PA.y) * e, pz = PA.z + (PB.z - PA.z) * e;
    const sign = fix.mirror ? -1 : 1;
    const az = (A.az + (B.az - A.az) * e) * sign + fix.yaw;
    const plan = Math.exp(Math.log(Math.max(0.05, A.dist)) + (Math.log(Math.max(0.05, B.dist)) - Math.log(Math.max(0.05, A.dist))) * e);
    const dist = Math.max(CINE.minDist, plan * fix.pull);
    const dy = (A.dy + (B.dy - A.dy) * e) * Math.min(1, fix.pull + 0.25) + fix.lift * liftFor(plan);
    const ang = yaw + az;
    out.px = px + Math.sin(ang) * dist;
    out.pz = pz + Math.cos(ang) * dist;
    out.py = py + dy;
    const la = anchorOf(a, A.look), lb = anchorOf(a, B.look);
    LA.x = la.x + fwx * (A.ahead ?? 0); LA.y = la.y + A.ly; LA.z = la.z + fwz * (A.ahead ?? 0);
    LB.x = lb.x + fwx * (B.ahead ?? 0); LB.y = lb.y + B.ly; LB.z = lb.z + fwz * (B.ahead ?? 0);
    out.lx = LA.x + (LB.x - LA.x) * e;
    out.ly = LA.y + (LB.y - LA.y) * e;
    out.lz = LA.z + (LB.z - LA.z) * e;
    out.fov = Math.min(CINE.fovMax, Math.max(CINE.fovMin, A.fov + (B.fov - A.fov) * e));
    out.roll = ((A.roll ?? 0) + ((B.roll ?? 0) - (A.roll ?? 0)) * e) * sign;
    if (!Number.isFinite(out.px + out.py + out.pz + out.lx + out.ly + out.lz)) { out.px = a.head.x - fwx * 3; out.py = a.head.y + 1; out.pz = a.head.z - fwz * 3; out.lx = a.head.x; out.ly = a.head.y; out.lz = a.head.z; }
    return out;
  }

  /**
   * Kamera des aktuellen Zeitpunkts (schreibt in `out` und merkt sie als Ausgang der nächsten Überblendung). Zu Beginn von Akt 2 und 3 gleitet
   * sie auf einer Kugelbahn um den neuen Blickpunkt aus der letzten Einstellung in die neue (nie gerade durch die Figur).
   */
  pose(a: CineAnchors, out: CineCam): CineCam {
    const i = this.actIndex;
    if (!this.def || i < 0) return out;
    this.keyPose(i, this.u, a, out);
    if (this.seamOn && this.phase !== 'return') {
      const k = smoother(this.t / CINE.seam);
      if (k >= 1) this.seamOn = false;
      else {
        const s = this.seamFrom;
        _focus.set(out.lx, out.ly, out.lz);
        _from.set(s.px, s.py, s.pz);
        _to.set(out.px, out.py, out.pz);
        orbitBlend(_from, false, _to, _focus, k, _to);
        out.px = _to.x; out.py = _to.y; out.pz = _to.z;
        out.lx = s.lx + (out.lx - s.lx) * k; out.ly = s.ly + (out.ly - s.ly) * k; out.lz = s.lz + (out.lz - s.lz) * k;
        out.fov = s.fov + (out.fov - s.fov) * k;
        out.roll = s.roll + (out.roll - s.roll) * k;
      }
    }
    const c = this.cam;
    c.px = out.px; c.py = out.py; c.pz = out.pz; c.lx = out.lx; c.ly = out.ly; c.lz = out.lz; c.fov = out.fov; c.roll = out.roll;
    return out;
  }

  /**
   * Sichtlinien-Schutz (einmal je Akt, beim Wechsel): die Strecke Blickpunkt → Kamera wird am Anfang, in der Mitte und am Ende des Akts gegen
   * Masten, Takelage, Rümpfe, Mauern und Gelände geprüft (vom Objektiv aus: was nah vor der Linse liegt, zählt). Die erste freie Variante
   * gewinnt (wie geplant, gespiegelt, um ±0,45/±0,95/±1,5 rad gedreht, angehoben, auf 62 % herangerückt); ist keine frei, die freieste –
   * und die Kamera rückt bis vor das Hindernis.
   */
  resolve(act: number, a: CineAnchors, sight: CineSight) {
    if (!this.def || act < 0 || act > 2) return;
    const fix = this.fix[act];
    const tryFix = TRY_FIX;
    const shot = this.def.shots[act];
    const body = FIGURE_ANCHORS.includes(shot.from.look) || FIGURE_ANCHORS.includes(shot.to.look);
    let best = -1, bi = 0;
    for (let v = 0; v < VARIANTS.length; v++) {
      const V = VARIANTS[v];
      tryFix.yaw = V[0]; tryFix.mirror = V[1]; tryFix.lift = V[2]; tryFix.pull = V[3];
      let free = 1;
      for (const u of SIGHT_U) {
        const c = this.keyPose(act, u, a, TRY_CAM, tryFix);
        this.stats.sightRays++;
        free = Math.min(free, sight.free(c.lx, c.ly, c.lz, c.px, c.py, c.pz));
        // Einstellung auf die Figur: auch ihr Körper muss frei sein (der Blickpunkt liegt oft über dem Kopf oder an der Hand)
        if (body && free > best) { this.stats.sightRays++; free = Math.min(free, sight.free(a.chest.x, a.chest.y, a.chest.z, c.px, c.py, c.pz, BODY_MARGIN)); }
        if (free <= best) break;
      }
      if (free > best) { best = free; bi = v; }
      if (free >= CINE.freeOk) break;
    }
    const V = VARIANTS[bi];
    fix.yaw = V[0]; fix.mirror = V[1]; fix.lift = V[2]; fix.pull = V[3]; fix.free = Math.max(0, best);
    if (best < CINE.freeOk) {
      // nichts ganz frei: bis vor das Hindernis heran (Nahblende der Figur beachten: nie unter 35 %)
      fix.pull = Math.min(fix.pull, Math.max(0.35, best - 0.08));
      this.stats.blocked++;
    }
    this.stats.resolves++;
    if (act === this.actIndex) this.resolvePending = false;
  }

  /** Abbrechen (Szenenwechsel, K.O., Menü) */
  reset() {
    this.phase = 'idle';
    this.def = null;
    this.t = 0;
    this.clock = 0;
    this.timeScale = 1;
    this.camK = 0; this.barsK = 0; this.glow = 0; this.poseK = 0; this.clipU = -1; this.lift = 0; this.exposureK = 1; this.bloomK = 1;
    this.impacted = false; this.forced = false; this.holdEnd = -1; this.seamOn = false; this.resolvePending = false;
  }
}

const TRY_FIX: CineFix = makeFix();
const TRY_CAM: CineCam = makeCam();

// ---------------------------------------------------------------------------------------------------------------
// Pose: Hand-Ziele im Figurenraum → Welt
// ---------------------------------------------------------------------------------------------------------------

/**
 * Hand-Ziel einer Pose in der Welt zum Anteil k (0 Anfang, 1 Ende von Akt 1): Figurenraum (x links, y oben ab den Füßen, z vorn) um die
 * Blickrichtung gedreht und an die Füße gesetzt. Schreibt in `out`.
 */
export function reachTarget(r: CineReach, k: number, feetX: number, feetY: number, feetZ: number, yaw: number, out: CinePoint): CinePoint {
  const e = smoother(k);
  const x = r[0] + (r[3] - r[0]) * e, y = r[1] + (r[4] - r[1]) * e, z = r[2] + (r[5] - r[2]) * e;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out.x = feetX + c * x + s * z;
  out.y = feetY + y;
  out.z = feetZ - s * x + c * z;
  return out;
}

/** Richtung des Kamera-Stoßes im Treffermoment (Welt; schreibt in `out`, Länge 1) */
export function kickDirection(def: UltimateCinematic, yaw: number, out: CinePoint): CinePoint {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  switch (def.kickDir) {
    case 'down': out.x = fx * 0.3; out.y = -1; out.z = fz * 0.3; break;
    case 'up': out.x = 0; out.y = 1; out.z = 0; break;
    case 'side': out.x = Math.cos(yaw); out.y = -0.2; out.z = -Math.sin(yaw); break;
    default: out.x = fx; out.y = -0.25; out.z = fz; break;
  }
  const l = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= l; out.y /= l; out.z /= l;
  return out;
}
