// Phase 4.93A – Kino-Endgame-Regie (Fundament): eine einzige, eindeutige Kennung (`DirectorActionId`) je Kino-Aktion und eine exakte
// 4-Phasen-Zeitachse für jede davon. Rein (ohne three.js, ohne DOM, keine Speicheranforderung je Bild) – die Welt (`SeaWorld`), die
// Kataklysmus-Regie, die Klang-Engine und die Empfänger-Seite der Mitspieler lesen alle dieselben Daten.
//
//   Phase 1 – Aufbau       Low-Angle-Zoom (Sichtfeld −5° … −11°), sichtbare Kampfpose des Kapitäns, zusammenströmende Partikel
//   Phase 2 – Entladung    Peitschen-/Verfolgungs-Schnitt entlang der Flugbahn, radiale Speedlines am Bildrand
//   Phase 3 – Einschlag    Manga-Impact-Frame als hartes Doppelbild (invertiert bzw. blau-weiß → Schwarz-Weiß-Tusche), Hit-Stop (Zeitmaß 0,04),
//                          gerichteter Kamera-Stoß. Dauer 70 – 180 ms: die erste Fassung (35 – 95 ms) war im Spiel zu unauffällig – drei
//                          Bilder bei 60 fps nimmt man kaum wahr; gezeichnete Impact-Frames stehen zwei bis vier Bilder bei 24 fps
//   Phase 4 – Nachbeben    Weitwinkel-Rückzug (Sichtfeld +7°), Krater/Graben/Schiffshälften, der Kapitän kehrt in seine Haltung zurück
//
// Zeiten: Formen dauern 0,55 – 1,50 s, ihre Phasen folgen der Vorlage 180 / 320 / 380 / 900 ms im Verhältnis ihrer Dauer; Ultimates dauern
// 3,40 – 4,20 s (Vorlage 950 / 1 450 / 1 545 / 3 400 ms, je Ultimate mit seinen eigenen Akt-Längen). Die Regie läuft in ECHTZEIT.
//
// Kategorie 1 (diese Phase): beide Faustkämpfer-Pfade (Schneller Faustkämpfer = `sturmfaust`, Kräftiger Faustkämpfer = `erdspalter`) mit
// Auto-Angriff, allen zehn Formen und dem Stufe-60-Ultimate, dazu das geheime Stufe-101-Ultimate „Himmelssturz“ aller Klassen.
//
// **Keine Doppel-Auslöser:** für eine Regie-Aktion läuft NIE zusätzlich ein alter Standard-Effekt, Einzelton oder Fokus-Puls. Jede frühere
// Auslöse-Stelle fragt `EndgameDirector.legacyAllowed(moveId)` bzw. `isDirectorAction(moveId)`; solange die Regie läuft, gehören ihr Kamera,
// Pose, Netze, Zeit und Klang (`locks`), spätere Bild-Takte anderer Systeme überschreiben sie nicht.
import type { CataclysmKind } from '../data/actionKit';
import type { VfxMeshFile } from './vfxMeshes';

// ---------------------------------------------------------------------------------------------------------------
// Kennungen
// ---------------------------------------------------------------------------------------------------------------

export type BrawlerStyleId = 'sturmfaust' | 'erdspalter';
export const BRAWLER_STYLES: readonly BrawlerStyleId[] = ['sturmfaust', 'erdspalter'];
export type FormSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Kennung einer Kino-Aktion = Kennung ihres Angriffs in der Engine (`ActionMove.id`) */
export type DirectorActionId =
  | `${BrawlerStyleId}.k${FormSlot}`
  /** Auto-Angriff: der vierte Schlag der Kette (Vakuum-Stoß bzw. Erd-Schmetterschlag) */
  | `${BrawlerStyleId}.l4`
  /** Stufe-60-Ultimates der beiden Pfade und das Stufe-101-Ultimate (Kosmos) */
  | `${BrawlerStyleId}.u` | 'kosmos.u';

export type DirectorPhaseId = 'aufbau' | 'entladung' | 'einschlag' | 'nachbeben';
export const DIRECTOR_PHASES: readonly DirectorPhaseId[] = ['aufbau', 'entladung', 'einschlag', 'nachbeben'];
export const PHASE_LABEL: Readonly<Record<DirectorPhaseId, string>> = {
  aufbau: 'Aufbau', entladung: 'Entladung', einschlag: 'Einschlag & Impact-Frame', nachbeben: 'Nachbeben',
};

export type DirectorKind = 'auto' | 'form' | 'ultimate';
/** Kampfmodus einer Aktion: am Steuerrad (Seeschlacht) oder zu Fuß (Insel, Deck, Wasserlauf) – Regeln in `combat/combatModes.ts` */
export type DirectorMode = 'helm' | 'foot';
/** Was die Regie während einer Aktion besitzt */
export type DirectorChannel = 'camera' | 'pose' | 'mesh' | 'time' | 'audio';

/** Bildwirkung des Impact-Frames: Schwarz-Weiß-Tusche, invertierte Schwarz-Weiß-Tusche, blau-weiße Tusche */
export type ImpactStyle = 'ink' | 'inkInv' | 'inkBlue';

/** Kampfposen des Kapitäns (Darstellung: Kauern, Vorlage, Blick, Drehung, Abheben, Hände – wie die Posen der Kino-Regie) */
export type DirectorPoseId =
  | 'blitzGuard' | 'jabCoil' | 'kickCoil' | 'spinGuard' | 'dashCoil' | 'skyLeap' | 'vortexPull' | 'barrageStance' | 'cageRaise' | 'avatarWind' | 'cannonBrace'
  | 'ramCoil' | 'fanSweep' | 'ironGuard' | 'chargeCoil' | 'hammerRaise' | 'bindSlam' | 'quakeStomp' | 'riftDrive' | 'giantCall' | 'worldBrace'
  /** am Steuerrad: Sprung auf die Bugreling mit aufgeladener Aura */
  | 'railLeap'
  /** Ultimates: tiefe Stellung mit glühenden Fäusten, Hand zum aufreißenden Himmel */
  | 'stormCrown' | 'worldBreaker' | 'gravityCall';

export interface DirectorPose {
  id: DirectorPoseId; label: string;
  /** Kauern (m), Vorlage (rad, + vorn), Blick nach oben (rad), Drehung der Brust (rad, + links), sichtbares Abheben (m) */
  crouch: number; lean: number; look: number; twist: number; lift: number;
  /** Fäuste geballt und glühend (beide Hände) */
  fists: boolean;
  /** Wirbelwind an Mantel und Haar (m/s) */
  whirl: number;
}

const P = (id: DirectorPoseId, label: string, crouch: number, lean: number, look: number, twist: number, lift = 0, whirl = 3, fists = true): DirectorPose =>
  Object.freeze({ id, label, crouch, lean, look, twist, lift, fists, whirl });

export const DIRECTOR_POSES: Readonly<Record<DirectorPoseId, DirectorPose>> = {
  blitzGuard: P('blitzGuard', 'Blitz-Deckung', 0.16, 0.14, 0, 0.2),
  jabCoil: P('jabCoil', 'Gespannter Jab', 0.18, 0.22, 0, 0.32),
  kickCoil: P('kickCoil', 'Tritt-Vorspannung', 0.22, 0.1, 0.05, -0.3, 0.25),
  spinGuard: P('spinGuard', 'Windmühlen-Deckung', 0.14, 0, 0.08, 0.5, 0, 6),
  dashCoil: P('dashCoil', 'Sprint-Kauern', 0.3, 0.42, -0.05, 0.1, 0, 5),
  skyLeap: P('skyLeap', 'Sprung zum Himmel', 0.12, -0.1, 0.4, 0, 1.6, 6),
  vortexPull: P('vortexPull', 'Sog-Griff', 0.2, 0.18, 0, -0.25, 0, 7, false),
  barrageStance: P('barrageStance', 'Hundert-Fäuste-Stand', 0.24, 0.3, 0, 0.15, 0, 5),
  cageRaise: P('cageRaise', 'Arme zum Käfig', 0.1, -0.08, 0.3, 0, 0.2, 6, false),
  avatarWind: P('avatarWind', 'Avatar-Ausholen', 0.26, 0.32, 0.18, 0.45, 0.3, 7),
  cannonBrace: P('cannonBrace', 'Kanonen-Stand', 0.32, 0.36, 0, 0.2, 0, 8),
  ramCoil: P('ramCoil', 'Ramm-Vorspannung', 0.24, 0.3, 0, 0.3, 0, 2),
  fanSweep: P('fanSweep', 'Fächer-Ausholen', 0.22, 0.2, 0, -0.45, 0, 3),
  ironGuard: P('ironGuard', 'Eisenkörper', 0.12, 0.06, 0, 0, 0, 2),
  chargeCoil: P('chargeCoil', 'Koloss-Schulter', 0.3, 0.44, -0.05, 0.25, 0, 4),
  hammerRaise: P('hammerRaise', 'Beidhändiges Ausholen', 0.14, -0.2, 0.3, 0, 0.35, 3),
  bindSlam: P('bindSlam', 'Faust in den Boden', 0.34, 0.4, -0.15, 0.1, 0, 3),
  quakeStomp: P('quakeStomp', 'Beben-Stand', 0.28, 0.24, 0, 0.2, 0, 3),
  riftDrive: P('riftDrive', 'Graben-Hieb', 0.36, 0.46, -0.18, 0.15, 0, 4),
  giantCall: P('giantCall', 'Ruf der Giganten-Faust', 0.1, -0.22, 0.5, 0, 0.3, 5),
  worldBrace: P('worldBrace', 'Weltbeben-Stand', 0.34, 0.3, 0, 0, 0, 6),
  railLeap: P('railLeap', 'Sprung auf die Bugreling', 0.2, 0.26, 0.12, 0.2, 1.1, 7),
  stormCrown: P('stormCrown', 'Sturmkrone der Fäuste', 0.24, 0.3, 0.1, 0.25, 0.2, 8),
  worldBreaker: P('worldBreaker', 'Weltenbrecher-Stand', 0.34, 0.4, -0.1, 0.2, 0, 5),
  gravityCall: P('gravityCall', 'Hand zum Himmel', 0.06, -0.14, 0.55, 0, 0.5, 6, false),
};

// ---------------------------------------------------------------------------------------------------------------
// Zeitachsen
// ---------------------------------------------------------------------------------------------------------------

/** Vorlagen (ms ab Start): Ende von Aufbau, Entladung, Einschlag und Gesamtdauer */
export const FORM_TEMPLATE_MS = { build: 180, release: 320, impact: 380, total: 900 } as const;
export const ULT_TEMPLATE_MS = { build: 950, release: 1450, impact: 1545, total: 3400 } as const;

export const DIRECTOR = {
  /** Hit-Stop im Impact-Frame: Zeitmaß der Spielzeit (Zeitlupe 0,04×) */
  hitStop: 0.04,
  /** „Silence before the Storm“: Stille-Senke unmittelbar vor dem Einschlag (ms) */
  silenceMs: 45,
  /** Impact-Frame (ms): Formen IV … X 70 – 150, Ultimates 150 – 180 */
  impactMin: 70, impactMax: 180,
  /** Sichtfeld-Änderung im Aufbau: Formen I … X von −5° bis −11°; Rückzug im Nachbeben */
  fovBuildMin: -5, fovBuildMax: -11, fovAfter: 7,
  /** Dauer der Formen und Ultimates (s) */
  formMin: 0.55, formMax: 1.5, ultMin: 3.4, ultMax: 4.2,
  /** bleibt der Treffer der Welt aus, setzt die Regie ihn nach so vielen Sekunden selbst */
  overrun: 0.14,
  /** Reichweite am Steuerrad (m) */
  helmRange: 650,
} as const;

export interface DirectorStage { label: string; from: number; to: number }

export interface DirectorTimeline {
  id: DirectorActionId; kind: DirectorKind; style: BrawlerStyleId | 'kosmos';
  /** Form 1 … 10 (sonst 0) */
  slot: number;
  label: string;
  /** Gesamtdauer und Phasen-Grenzen (s ab Start, Echtzeit): Ende von Aufbau (t1), Entladung (t2 = Treffermoment), Einschlag (t3) */
  total: number; t1: number; t2: number; t3: number;
  /** Impact-Frame (ms; 0 = keiner) und sein Stil, Zeitmaß des Hit-Stops, Stille-Senke vor dem Einschlag (ms; 0 = keine) */
  impactMs: number; impactStyle: ImpactStyle; hitStop: number; silenceMs: number;
  /** Kamera: Sichtfeld im Aufbau (Grad, negativ = heran), im Nachbeben (+), Untersicht 0 … 1, Peitschen-Schwenk 0 … 1, Speedlines 0 … 1 */
  fovBuild: number; fovAfter: number; lowAngle: number; whip: number; speedlines: number;
  /** Kamera-Stoß im Treffermoment: Stärke und Richtung */
  shake: number; shakeDir: 'fwd' | 'down' | 'up' | 'side' | 'radial';
  /** Himmel verdunkeln (0 … 1) */
  darken: number;
  /** Pose an Land bzw. am Steuerrad */
  poseFoot: DirectorPoseId; poseHelm: DirectorPoseId;
  /** Blender-Netze dieser Aktion */
  meshes: readonly VfxMeshFile[];
  /** Farben: leuchtender Kern, Akzent */
  color: string; accent: string;
  /** die vier Phasen in Worten (Kompendium, Vorschau, Prüfungen) */
  beats: readonly [string, string, string, string];
  /** Ultimates: Akte bzw. Stufen (Himmelssturz: vier Stufen) mit ihren Grenzen in s */
  stages: readonly DirectorStage[];
  /** Ultimates: Art des Kataklysmus (Welt-Zeitachse) */
  cataclysm: CataclysmKind | null;
}

/** Farben der beiden Pfade: Blitz- & Vakuum-Sturm (blau-weiß), Tektonik- & Titanen-Wucht (gold-bernstein) */
export const BRAWLER_COLORS: Readonly<Record<BrawlerStyleId, { color: string; accent: string; ink: string }>> = {
  sturmfaust: { color: '#7FD0FF', accent: '#EAF8FF', ink: '#061426' },
  erdspalter: { color: '#FFC860', accent: '#E08A2A', ink: '#1A0E03' },
};
export const SKYFALL_COLORS = { color: '#FF7A3A', accent: '#B07DFF', ink: '#12061C' } as const;

const r3 = (x: number) => Math.round(x * 1000) / 1000;

interface FormIn {
  label: string; total: number; impactMs: number; style?: ImpactStyle; shake: number; shakeDir: DirectorTimeline['shakeDir'];
  poseFoot: DirectorPoseId; meshes: readonly VfxMeshFile[]; darken?: number; whip?: number; beats: readonly [string, string, string, string];
}

/**
 * Zeitachse einer Form: die Phasen folgen der Vorlage 180 / 320 / 380 / 900 ms im Verhältnis der Dauer; Phase 3 ist so lang wie der
 * Impact-Frame der Form (Formen ohne Impact-Frame: der Anteil der Vorlage).
 */
function form(style: BrawlerStyleId, slot: FormSlot, o: FormIn): DirectorTimeline {
  const k = o.total / (FORM_TEMPLATE_MS.total / 1000);
  const t1 = r3((FORM_TEMPLATE_MS.build / 1000) * k), t2 = r3((FORM_TEMPLATE_MS.release / 1000) * k);
  const win = o.impactMs > 0 ? o.impactMs / 1000 : ((FORM_TEMPLATE_MS.impact - FORM_TEMPLATE_MS.release) / 1000) * k;
  const c = BRAWLER_COLORS[style];
  return Object.freeze({
    id: `${style}.k${slot}` as DirectorActionId, kind: 'form' as const, style, slot, label: o.label,
    total: o.total, t1, t2, t3: r3(t2 + win),
    impactMs: o.impactMs, impactStyle: o.style ?? (slot >= 8 ? 'inkInv' : style === 'sturmfaust' ? 'inkBlue' : 'ink'), hitStop: DIRECTOR.hitStop,
    silenceMs: o.impactMs > 0 && slot >= 5 ? DIRECTOR.silenceMs : 0,
    fovBuild: r3(DIRECTOR.fovBuildMin + ((DIRECTOR.fovBuildMax - DIRECTOR.fovBuildMin) * (slot - 1)) / 9), fovAfter: slot >= 4 ? DIRECTOR.fovAfter : r3(DIRECTOR.fovAfter * 0.6),
    lowAngle: r3(0.35 + slot * 0.065), whip: o.whip ?? r3(0.4 + slot * 0.06), speedlines: r3(Math.min(1, 0.35 + slot * 0.07)),
    shake: o.shake, shakeDir: o.shakeDir, darken: o.darken ?? r3(slot >= 8 ? 0.3 + (slot - 8) * 0.1 : slot >= 5 ? 0.16 : 0.06),
    poseFoot: o.poseFoot, poseHelm: 'railLeap' as const, meshes: o.meshes, color: c.color, accent: c.accent, beats: o.beats,
    stages: [], cataclysm: null,
  });
}

const CONE: readonly VfxMeshFile[] = ['vfx_fist_shockcone'];
const BARR: readonly VfxMeshFile[] = ['vfx_fist_rapid_barrage'];
const CONE_BARR: readonly VfxMeshFile[] = ['vfx_fist_shockcone', 'vfx_fist_rapid_barrage'];
const FISS: readonly VfxMeshFile[] = ['vfx_trench_fissure'];
const CONE_FISS: readonly VfxMeshFile[] = ['vfx_fist_shockcone', 'vfx_trench_fissure'];
const BARR_FISS: readonly VfxMeshFile[] = ['vfx_fist_rapid_barrage', 'vfx_trench_fissure'];

/** Pfad 1 – Schneller Faustkämpfer (Blitz- & Vakuum-Sturm): die zehn Formen */
const STURM_FORMS: readonly DirectorTimeline[] = [
  form('sturmfaust', 1, { label: 'Vakuum-Jab', total: 0.55, impactMs: 0, shake: 0.3, shakeDir: 'fwd', poseFoot: 'jabCoil', meshes: CONE,
    beats: ['Die Faust spannt sich, Luft strömt in die Knöchel', 'Der Jab schnellt vor, ein Luftdruck-Schuss reißt die Luft auf', 'Peitschender Schallknall am Ziel', 'Druckringe laufen aus, der Kapitän federt zurück'] }),
  form('sturmfaust', 2, { label: 'Zwillings-Blitztritt', total: 0.65, impactMs: 0, shake: 0.35, shakeDir: 'side', poseFoot: 'kickCoil', meshes: CONE,
    beats: ['Tiefe Tritt-Vorspannung, Blitze laufen das Schienbein hinab', 'Zwei gekreuzte blau-weiße Luftklingen-Sicheln schneiden heraus', 'Doppelknall links und rechts', 'Die Sicheln verglühen, Funken regnen'] }),
  form('sturmfaust', 3, { label: 'Windmühlen-Parade', total: 0.75, impactMs: 0, shake: 0.3, shakeDir: 'radial', poseFoot: 'spinGuard', meshes: CONE, whip: 0.2,
    beats: ['Die Arme kreisen, die Luft verdichtet sich zur Kuppel', 'Eine rotierende Luftdruck-Kuppel umschließt Kapitän bzw. Schiff', 'Geschosse prallen ab, die Kuppel zerplatzt als Druckring', 'Wirbel klingen aus'] }),
  form('sturmfaust', 4, { label: 'Schallmauer-Schritt', total: 0.75, impactMs: 70, shake: 0.5, shakeDir: 'fwd', poseFoot: 'dashCoil', meshes: CONE,
    beats: ['Tiefes Kauern, die Füße laden sich blau auf', 'Blitzschneller Vorstoß mit blauen Nachbildern', 'Mini-Impact-Frame: die Schockwelle bricht die Schallmauer', 'Mach-Kegel fächern auf, Staub bzw. Gischt steht'] }),
  form('sturmfaust', 5, { label: 'Donner-Fallkick', total: 0.85, impactMs: 90, shake: 0.7, shakeDir: 'down', poseFoot: 'skyLeap', meshes: CONE,
    beats: ['Steiler Sprung in den Himmel, Blitze sammeln sich an der Ferse', 'Sturz senkrecht hinab, eine blaue Blitzsäule begleitet ihn', 'Impact-Frame: der Einschlag bricht die Haltung', 'Blitzringe laufen über Boden bzw. Wasser'] }),
  form('sturmfaust', 6, { label: 'Zyklon-Sog', total: 0.9, impactMs: 90, shake: 0.6, shakeDir: 'radial', poseFoot: 'vortexPull', meshes: CONE, whip: 0.3,
    beats: ['Die offene Hand zieht die Luft an sich', 'Ein Unterdruck-Wirbel reißt Gegner ins Zentrum bzw. das Zielschiff quer', 'Impact-Frame im Auge des Wirbels', 'Der Sog kollabiert, alles taumelt'] }),
  form('sturmfaust', 7, { label: 'Hundert-Fäuste-Maschinengewehr', total: 1.05, impactMs: 100, shake: 0.75, shakeDir: 'fwd', poseFoot: 'barrageStance', meshes: BARR,
    beats: ['Fester Stand, beide Fäuste glühen blau-weiß', '24 versetzte Phantom-Fäuste trommeln im Stakkato aufs Ziel', 'Impact-Frame mit dem letzten Schlag', 'Druckwellen laufen nach, die Fäuste verglühen'] }),
  form('sturmfaust', 8, { label: 'Kugelblitz-Käfig', total: 1.15, impactMs: 115, shake: 0.8, shakeDir: 'radial', poseFoot: 'cageRaise', meshes: CONE_BARR, whip: 0.3,
    beats: ['Die Arme heben sich, Funken springen zwischen den Händen', 'Eine Hochspannungs-Kuppel schließt sich, Kettenblitze springen über', 'Impact-Frame: der Käfig entlädt sich', 'Knisternde Restladungen zucken über den Boden'] }),
  form('sturmfaust', 9, { label: 'Sturm-Avatar-Schlag', total: 1.3, impactMs: 130, shake: 1.0, shakeDir: 'down', poseFoot: 'avatarWind', meshes: CONE_BARR,
    beats: ['Weites Ausholen, hinter dem Kapitän formt sich ein Sturm-Avatar', 'Eine riesige leuchtende Blitz-Faust stürzt aufs Ziel', 'Impact-Frame: die Projektion schmettert auf Ziel bzw. Deck', 'Ein Blitzkrater glüht nach'] }),
  form('sturmfaust', 10, { label: 'Kaiser-Vakuumkanone', total: 1.5, impactMs: 145, shake: 1.2, shakeDir: 'fwd', poseFoot: 'cannonBrace', meshes: CONE_BARR, darken: 0.5,
    beats: ['Der Himmel verdunkelt sich, Luft und Blitz komprimieren sich vor der Faust', 'Ein langer Luft- und Blitzstrahl durchschlägt ganze Reihen bzw. zwei Schiffe hintereinander', 'Impact-Frame am Ende des Strahls', 'Die Schneise dampft, Druckringe laufen aus'] }),
];

/** Pfad 2 – Kräftiger Faustkämpfer (Tektonik- & Titanen-Wucht): die zehn Formen */
const ERD_FORMS: readonly DirectorTimeline[] = [
  form('erdspalter', 1, { label: 'Rammstoß', total: 0.6, impactMs: 0, shake: 0.4, shakeDir: 'fwd', poseFoot: 'ramCoil', meshes: CONE,
    beats: ['Die Rammfaust zieht zurück, Staub hebt sich', 'Ein schwerer gold-bernsteinfarbener Druckkegel schiebt sich vor', 'Tiefer Trommel-Bass beim Aufprall', 'Der Kegel verläuft, Gestein bzw. Gischt fällt'] }),
  form('erdspalter', 2, { label: 'Felsbrecher-Fächer', total: 0.7, impactMs: 0, shake: 0.45, shakeDir: 'side', poseFoot: 'fanSweep', meshes: CONE_FISS,
    beats: ['Der Arm holt weit aus', 'Drei breite Erdschock-Wellen fächern sich über Boden bzw. Wasser auf', 'Die Wellen brechen am Ziel', 'Staub- bzw. Gischtfahnen sinken'] }),
  form('erdspalter', 3, { label: 'Eisenkörper-Bollwerk', total: 0.8, impactMs: 0, shake: 0.3, shakeDir: 'radial', poseFoot: 'ironGuard', meshes: CONE, whip: 0.2,
    beats: ['Der Körper spannt sich, Gold legt sich über die Haut', 'Eine gold-schwarze Rüstungsaura schließt sich', 'Ein Treffer prallt ab und kehrt als Druckwelle zurück', 'Die Aura glimmt nach'] }),
  form('erdspalter', 4, { label: 'Koloss-Ansturm', total: 0.8, impactMs: 75, shake: 0.7, shakeDir: 'fwd', poseFoot: 'chargeCoil', meshes: CONE,
    beats: ['Die Schulter senkt sich, der Boden knirscht', 'Unaufhaltsamer Rammstoß hinter einem Druckkegel', 'Mini-Impact-Frame: Ziele fliegen zurück', 'Die Schleifspur dampft'] }),
  form('erdspalter', 5, { label: 'Titanen-Hammer', total: 0.9, impactMs: 95, shake: 0.9, shakeDir: 'down', poseFoot: 'hammerRaise', meshes: FISS,
    beats: ['Beide Fäuste heben sich über den Kopf', 'Der beidhändige Niederschlag fällt', 'Impact-Frame: Haltungsleisten zerbrechen sofort', 'Risse laufen sternförmig aus'] }),
  form('erdspalter', 6, { label: 'Tektonik-Fessel', total: 0.95, impactMs: 95, shake: 0.7, shakeDir: 'up', poseFoot: 'bindSlam', meshes: FISS, whip: 0.3,
    beats: ['Die Faust fährt in den Boden', 'Gesteins- bzw. Wasser-Säulen brechen rund um das Ziel auf', 'Impact-Frame: der Kessel schließt sich', 'Die Säulen stehen, Staub bzw. Gischt rieselt'] }),
  form('erdspalter', 7, { label: 'Beben-Salve', total: 1.1, impactMs: 105, shake: 0.85, shakeDir: 'fwd', poseFoot: 'quakeStomp', meshes: FISS,
    beats: ['Fester Stand, die Erde brummt', 'Sechs seismische Bodenschläge bzw. Wasserfontänen laufen auf das Ziel zu', 'Impact-Frame beim sechsten Schlag', 'Die Schneise raucht'] }),
  form('erdspalter', 8, { label: 'Magma-Grabenbruch', total: 1.2, impactMs: 120, shake: 1.0, shakeDir: 'down', poseFoot: 'riftDrive', meshes: FISS,
    beats: ['Tiefe Ausholpose, der Boden glüht unter den Füßen', 'Eine glühende Spalte reißt unter Gegnern bzw. dem Zielschiff auf', 'Impact-Frame: Schollen kippen hoch', 'Magma bzw. Tiefsee-Leuchten glimmt in der Spalte'] }),
  form('erdspalter', 9, { label: 'Giganten-Faust', total: 1.35, impactMs: 135, shake: 1.15, shakeDir: 'down', poseFoot: 'giantCall', meshes: BARR_FISS,
    beats: ['Die Hand ruft zum Himmel, die Wolken reißen golden auf', 'Eine 20 m große tektonisch-goldene Energie-Faust stürzt senkrecht herab', 'Impact-Frame: sie schmettert ein', 'Ein Krater mit glühenden Rissen bleibt'] }),
  form('erdspalter', 10, { label: 'Weltbeben-Stoß', total: 1.5, impactMs: 150, shake: 1.3, shakeDir: 'radial', poseFoot: 'worldBrace', meshes: CONE_FISS, darken: 0.5,
    beats: ['Der Himmel verdunkelt sich, alles hält den Atem an', 'Eine radiale Schockwelle rast über das Schlachtfeld', 'Impact-Frame: das ganze Feld bebt', 'Spalten glühen, Druckringe laufen aus'] }),
];

/** Auto-Angriff (vierter Schlag der Kette): kurze Zeitachse ohne Impact-Frame – die Kette darf die Kamera nicht führen */
function auto(style: BrawlerStyleId, label: string, total: number, pose: DirectorPoseId, meshes: readonly VfxMeshFile[], beats: readonly [string, string, string, string]): DirectorTimeline {
  const k = total / (FORM_TEMPLATE_MS.total / 1000), c = BRAWLER_COLORS[style];
  const t1 = r3(0.18 * k), t2 = r3(0.32 * k);
  return Object.freeze({
    id: `${style}.l4` as DirectorActionId, kind: 'auto' as const, style, slot: 0, label, total, t1, t2, t3: r3(t2 + 0.06 * k),
    impactMs: 0, impactStyle: 'ink' as const, hitStop: DIRECTOR.hitStop, silenceMs: 0,
    fovBuild: -2, fovAfter: 2.5, lowAngle: 0.15, whip: 0.2, speedlines: 0.25, shake: style === 'erdspalter' ? 0.55 : 0.3, shakeDir: style === 'erdspalter' ? 'down' as const : 'fwd' as const,
    darken: 0, poseFoot: pose, poseHelm: 'railLeap' as const, meshes, color: c.color, accent: c.accent, beats, stages: [], cataclysm: null,
  });
}

const AUTOS: readonly DirectorTimeline[] = [
  auto('sturmfaust', 'Vakuum-Stoß', 0.58, 'jabCoil', CONE, ['Die Faust zieht eine Luftblase zusammen', 'Eine komprimierte blaue Luftdruckkugel schießt 18 m weit', 'Sie platzt am Ziel', 'Druckring und Gischt bzw. Staub']),
  auto('erdspalter', 'Erd-Schmetterschlag', 0.9, 'bindSlam', FISS, ['Die Faust hebt sich', 'Sie fährt in den Boden', 'Der Boden bebt in 6 m, Haltungen brechen', 'Risse und Staub']),
];

function ult(id: DirectorActionId, style: DirectorTimeline['style'], label: string, cataclysm: CataclysmKind, stages: readonly DirectorStage[], t1: number, t2: number,
  impactMs: number, impactStyle: ImpactStyle, silenceMs: number, o: { fovBuild: number; shake: number; shakeDir: DirectorTimeline['shakeDir']; darken: number; pose: DirectorPoseId; meshes: readonly VfxMeshFile[]; color: string; accent: string; beats: readonly [string, string, string, string] }): DirectorTimeline {
  const total = stages[stages.length - 1].to;
  return Object.freeze({
    id, kind: 'ultimate' as const, style, slot: 0, label, total, t1, t2, t3: r3(t2 + impactMs / 1000),
    impactMs, impactStyle, hitStop: DIRECTOR.hitStop, silenceMs,
    fovBuild: o.fovBuild, fovAfter: DIRECTOR.fovAfter, lowAngle: 1, whip: 1, speedlines: 1, shake: o.shake, shakeDir: o.shakeDir, darken: o.darken,
    poseFoot: o.pose, poseHelm: 'railLeap' as const, meshes: o.meshes, color: o.color, accent: o.accent, beats: o.beats, stages, cataclysm,
  });
}

const ULTS: readonly DirectorTimeline[] = [
  // Stufe 60, Pfad 1 – 3,4 s: Akt 1 0,9 s · Akt 2 0,6 s (→ 45 ms Stille → blau-weißer Impact-Frame, 150 ms) · Akt 3 1,9 s
  ult('sturmfaust.u', 'sturmfaust', 'Sturmfaust der Tausend Blitze', 'fistStorm',
    [{ label: 'Akt 1 – Der Himmel verdunkelt sich', from: 0, to: 0.9 }, { label: 'Akt 2 – 24 Blitzeinschläge umkreisen das Ziel', from: 0.9, to: 1.5 }, { label: 'Akt 3 – Die Kugelblitz-Kuppel zerspringt', from: 1.5, to: 3.4 }],
    0.9, 1.5, 150, 'inkBlue', 45,
    { fovBuild: -9, shake: 1.4, shakeDir: 'fwd', darken: 0.6, pose: 'stormCrown', meshes: CONE_BARR, color: BRAWLER_COLORS.sturmfaust.color, accent: BRAWLER_COLORS.sturmfaust.accent,
      beats: ['Der Himmel verdunkelt sich, blaue Blitze tanzen um Fäuste bzw. Masten, Low-Angle-Zoom', '24 Hochgeschwindigkeits-Blitzeinschläge umkreisen das Ziel bzw. Gegnerschiff', 'Ein Atemzug Stille, dann der blau-weiße Manga-Impact-Frame mit Hit-Stop', 'Der Zentralschlag sprengt eine riesige Kugelblitz-Kuppel auf und zerbricht das Zielschiff'] }),
  // Stufe 60, Pfad 2 – 3,6 s: Akt 1 1,0 s · Akt 2 0,5 s (→ 45 ms Stille → invertierter Impact-Frame, 165 ms) · Akt 3 2,1 s
  ult('erdspalter.u', 'erdspalter', 'Weltenbrecher-Erdspalter', 'oceanSplit',
    [{ label: 'Akt 1 – Die Fäuste glühen tektonisch-golden', from: 0, to: 1.0 }, { label: 'Akt 2 – Der Zentralschlag fällt', from: 1.0, to: 1.5 }, { label: 'Akt 3 – Magma-Graben bzw. geteiltes Meer', from: 1.5, to: 3.6 }],
    1.0, 1.5, 165, 'inkInv', 45,
    { fovBuild: -8, shake: 1.5, shakeDir: 'down', darken: 0.45, pose: 'worldBreaker', meshes: CONE_FISS, color: BRAWLER_COLORS.erdspalter.color, accent: BRAWLER_COLORS.erdspalter.accent,
      beats: ['Beide Fäuste glühen tektonisch-golden, die Kamera fährt knapp über Boden bzw. Deck, die Erde grollt', 'Der Zentralschlag fährt nieder', 'Ein Atemzug Stille, dann der invertierte Manga-Impact-Frame mit Hit-Stop', 'An Land reißt ein glühender Magma-Graben auf; auf See teilt die Schockwelle das Meer bis zum Grund und zerbricht das Zielschiff in zwei Hälften'] }),
  // Stufe 101 – 4,2 s in vier Stufen: Schwerkraft-Umkehr · Vorhut-Bombardement · Koloss-Meteorit · Impact-Frame & Kataklysmus
  ult('kosmos.u', 'kosmos', 'Himmelssturz', 'skyfall',
    [{ label: 'Stufe 1 – Schwerkraft-Umkehr', from: 0, to: 0.9 }, { label: 'Stufe 2 – Vorhut-Bombardement', from: 0.9, to: 1.8 }, { label: 'Stufe 3 – Der Koloss-Meteorit', from: 1.8, to: 2.6 }, { label: 'Stufe 4 – Impact-Frame & Kataklysmus', from: 2.6, to: 4.2 }],
    0.9, 2.6, 180, 'inkInv', 50,
    { fovBuild: -11, shake: 1.8, shakeDir: 'down', darken: 0.7, pose: 'gravityCall', meshes: ['vfx_meteor_colossus', 'vfx_meteor_shards', 'vfx_trench_fissure'], color: SKYFALL_COLORS.color, accent: SKYFALL_COLORS.accent,
      beats: ['Lila Gravitations-Ringe breiten sich aus, Kiesel und Meerwasser-Tropfen schweben nach oben, die Kamera blickt steil in den aufreißenden Himmel', 'Der Himmel färbt sich glutrot-violett, fünf brennende Vorhut-Meteoriten schlagen ein; dann rast der 45 m große Koloss mit Plasma-Bugwelle herab', 'Ein Atemzug Stille, dann der invertierte Schwarz-Weiß-Manga-Impact-Frame mit Hit-Stop', '120 m hohe Wasser- bzw. Lava-Fontäne, aufgerissener Krater, die getroffenen Kriegsschiffe zerbrechen'] }),
];

/** Alle Zeitachsen nach Kennung */
export const DIRECTOR_TIMELINES: Readonly<Record<DirectorActionId, DirectorTimeline>> = Object.freeze(
  Object.fromEntries([...STURM_FORMS, ...ERD_FORMS, ...AUTOS, ...ULTS].map((t) => [t.id, t])) as Record<DirectorActionId, DirectorTimeline>,
);
export const DIRECTOR_ACTION_IDS: readonly DirectorActionId[] = Object.freeze(Object.keys(DIRECTOR_TIMELINES) as DirectorActionId[]);

/** Gehört dieser Angriff (Kennung der Engine) der Kino-Endgame-Regie? */
export function isDirectorAction(moveId: string | null | undefined): moveId is DirectorActionId {
  return !!moveId && Object.prototype.hasOwnProperty.call(DIRECTOR_TIMELINES, moveId);
}
export function directorTimeline(moveId: string | null | undefined): DirectorTimeline | null {
  return isDirectorAction(moveId) ? DIRECTOR_TIMELINES[moveId] : null;
}
export const isBrawlerStyle = (style: string | null | undefined): style is BrawlerStyleId => style === 'sturmfaust' || style === 'erdspalter';

/** Zeitachse einer Form (Stil, Platz 1 … 10) bzw. null, wenn der Stil (noch) nicht zur Kino-Endgame-Regie gehört */
export function formTimeline(style: string, slot: number): DirectorTimeline | null {
  if (!isBrawlerStyle(style)) return null;
  const s = Math.round(slot);
  return s >= 1 && s <= 10 ? DIRECTOR_TIMELINES[`${style}.k${s as FormSlot}`] : null;
}

/** Kennung des Ultimates einer Kataklysmus-Art (nur die drei ausgebauten) */
export function ultimateActionOf(kind: string): DirectorActionId | null {
  return kind === 'fistStorm' ? 'sturmfaust.u' : kind === 'oceanSplit' ? 'erdspalter.u' : kind === 'skyfall' ? 'kosmos.u' : null;
}

/**
 * Kennung der Kino-Aktion einer übertragenen Kampf-Aktion (`CombatActionBroadcast`: Art, Stil, Platz, bei Ultimates die Kataklysmus-Art im
 * Feld `el`, bei Standard-Angriffen die Kennzahl der Stufe im Feld `n`) – so spielen Mitspieler dieselbe Zeitachse ab, ohne dass das
 * Protokoll ein neues Feld braucht. Kennzahl 4 = vierte Stufe der Leicht-Kette (`SWING_CODE.light + 3` in `combat/actionBroadcast.ts`);
 * das Protokoll säubert `slot` auf 0 … 16 – eine negative Kennung dort ginge auf dem Weg zum Mitspieler verloren.
 */
export function directorActionOfAct(a: { t: string; style: string; slot: number; el: string; n?: number }): DirectorActionId | null {
  if (a.t === 'ult') return ultimateActionOf(a.el);
  if (a.t === 'art') return formTimeline(a.style, a.slot)?.id ?? null;
  if (a.t === 'swing' && isBrawlerStyle(a.style) && a.n === 4) return `${a.style}.l4`;
  return null;
}

/** Phase zum Zeitpunkt t (s ab Start) */
export function phaseAt(tl: DirectorTimeline, t: number): DirectorPhaseId {
  return t < tl.t1 ? 'aufbau' : t < tl.t2 ? 'entladung' : t < tl.t3 ? 'einschlag' : 'nachbeben';
}

/** Grenzen einer Phase (s ab Start) */
export function phaseSpan(tl: DirectorTimeline, p: DirectorPhaseId): readonly [number, number] {
  return p === 'aufbau' ? [0, tl.t1] : p === 'entladung' ? [tl.t1, tl.t2] : p === 'einschlag' ? [tl.t2, tl.t3] : [tl.t3, tl.total];
}

/**
 * Dauer des Angriffs in SPIELZEIT: während des Impact-Frames läuft die Spielzeit nur mit dem Hit-Stop-Zeitmaß, die Echtzeit-Dauer der Form
 * bleibt so exakt ihre Vorgabe (0,55 – 1,50 s).
 */
export function engineDuration(tl: DirectorTimeline): number {
  return r3(tl.total - (tl.impactMs / 1000) * (1 - tl.hitStop));
}

/** Treffermoment als Anteil der Engine-Dauer (Beginn des entscheidenden Trefferfensters) */
export function decisiveFraction(tl: DirectorTimeline): number {
  return tl.t2 / engineDuration(tl);
}

/** Stufe einer Zeitachse zum Zeitpunkt t (−1 = keine Stufen) */
export function stageAt(tl: DirectorTimeline, t: number): number {
  for (let i = tl.stages.length - 1; i >= 0; i--) if (t >= tl.stages[i].from) return i;
  return tl.stages.length ? 0 : -1;
}

// ---------------------------------------------------------------------------------------------------------------
// Beseitigte Alt-Auslöser (Legacy-Purge) – zur Dokumentation und für die Prüfungen
// ---------------------------------------------------------------------------------------------------------------

/** Was Phase 4.93A an alten Platzhaltern, Doppel-Auslösern und Einzeltönen entfernt bzw. abgeklemmt hat */
export const LEGACY_PURGED: readonly { where: string; what: string }[] = [
  { where: 'combat/cataclysmFx.ts', what: 'Grundform „fist“ (Geister-Faust aus sieben Kisten) samt `fistGeo` – ersetzt durch das Blender-Netz „barrage“' },
  { where: 'world/cataclysmDirector.ts', what: '`stepFistStorm` (Kisten-Faust-Flut, Kugel-Einschläge, `combatFx.shockwave`, Einzeltöne `fistBarrage`/`impactCrack`)' },
  { where: 'world/cataclysmDirector.ts', what: '`stepOcean` an Land (Ikosaeder-Felsbrocken als „Graben“, `combatFx.crack`) und die Wasserwände aus Rechtecken' },
  { where: 'world/cataclysmDirector.ts', what: '`beginSkyfall`/`meteorAt`/`stepSkyfall` (Zwillings-Meteoriten aus Kugeln, Planet aus Kugel + Ring, Einzeltöne `voidRumble`/`quakeRumble`/`impactCrack`)' },
  { where: 'world/cataclysmDirector.ts', what: 'Pose-Effekte `poseFx` für fistStorm/oceanSplit/skyfall (Glutkugeln an den Händen) und das Bodensiegel `combatFx.sigil` der drei Ultimates' },
  { where: 'world/cataclysmDirector.ts', what: '`formCharge`/`formImpact`/`swingFx`/`slashFx` für Faustkämpfer-Formen und den vierten Kettenschlag (Lichtsäule, Kugel-Kernblitz, Einheits-Druckringe)' },
  { where: 'world/seaWorld.ts', what: 'Einzeltöne `cineDrop`/`cutin`/`impactCrack`/`boom` und Stimmen `elementVoice`/`formVoiceLayer` für Regie-Aktionen; Fokus-Puls der Formen' },
  { where: 'world/seaWorld.ts', what: 'Faust-Zweig von `castHelmArt` (Einheits-Druckring + Mach-Kegel) und `helmFormMirror` für Faustkämpfer' },
  { where: 'entities/player/playerFoot.ts', what: 'weißer Einheits-Blitz `impactFrame()`, `fx.shockwave`/`fx.crack`/`fx.sigil` und Speedlines des Cut-ins für Regie-Aktionen' },
  { where: 'world/remoteActionFx.ts', what: 'Einheits-Darstellung fremder Faustkämpfer-Formen und Ultimates (Sichel + Druckring bzw. Wirbel + Säule) samt `cineDrop`' },
  { where: 'graphics/ultimateCinematics.ts', what: '3-Akt-Kurzfassungen (≈ 1 s) von fistStorm, oceanSplit und skyfall – ersetzt durch die 4-Phasen-Regie mit 3,4 / 3,6 / 4,2 s' },
  { where: 'audio/classVoices.ts', what: 'Einzelton-Stimmen `fistBarrage` und `fistQuake` als Signatur der Faustkämpfer-Formen – ersetzt durch die 4-Schichten-Rezepte der Kino-DSP' },
];

// ---------------------------------------------------------------------------------------------------------------
// Laufzeit-Regie
// ---------------------------------------------------------------------------------------------------------------

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const easeOut = (x: number) => { const k = 1 - clamp01(x); return 1 - k * k * k; };

/**
 * Zustand der laufenden Kino-Aktion (eine je Figur). Liefert je Bild die Größen, mit denen die Welt Kamera, Pose, Zeit und Bildschicht führt,
 * und entscheidet, ob ein alter Auslöser noch laufen darf (`legacyAllowed`) – so wird nie doppelt ausgelöst.
 */
export class EndgameDirector {
  id: DirectorActionId | null = null;
  tl: DirectorTimeline | null = null;
  mode: DirectorMode = 'foot';
  phase: DirectorPhaseId | 'idle' = 'idle';
  /** Zeit seit dem Start (echte s) und Zeit auf der Zeitachse (nach dem Treffermoment um dessen Verspätung verschoben) */
  clock = 0;
  t = 0;
  /** laufende Nummer der Aktion (Schutz vor Auslösern einer früheren Aktion) */
  seq = 0;
  /** Treffermoment erreicht; `late` = die Regie setzte ihn selbst */
  impacted = false;
  late = false;
  /** in diesem Bild betretene Phase (null = keine neue) */
  entered: DirectorPhaseId | null = null;
  /** Größen je Bild: Sichtfeld (Grad), Untersicht, Peitschen-Schwenk, Speedlines, Pose, Faust-Glut, Verdunkeln, Abheben (alle 0 … 1 außer fov) */
  fovDelta = 0;
  lowK = 0;
  whipK = 0;
  speedK = 0;
  poseK = 0;
  glowK = 0;
  darkK = 0;
  liftK = 0;
  /** Zeitmaß der Spielzeit (1 außerhalb des Impact-Frames) und ob gerade der Impact-Frame steht */
  timeScale = 1;
  impactOn = false;
  private shift = 0;
  readonly stats = { begun: 0, ended: 0, preempted: 0, legacyBlocked: 0, impacts: 0, phases: 0, late: 0, unknown: 0 };

  get active(): boolean { return this.id !== null; }
  /** Pose der laufenden Aktion für ihren Modus */
  get pose(): DirectorPose | null { const tl = this.tl; return tl ? DIRECTOR_POSES[this.mode === 'helm' ? tl.poseHelm : tl.poseFoot] : null; }
  /** Anteil der laufenden Phase (0 … 1) */
  get u(): number {
    const tl = this.tl;
    if (!tl || this.phase === 'idle') return 0;
    const [a, b] = phaseSpan(tl, this.phase);
    return clamp01((this.t - a) / Math.max(1e-4, b - a));
  }

  /** Aktion beginnen (Phase 1). Eine laufende Aktion derselben Figur endet sofort – nie zwei Zeitachsen zugleich. */
  begin(moveId: string, mode: DirectorMode): DirectorTimeline | null {
    const tl = directorTimeline(moveId);
    if (!tl) { this.stats.unknown++; return null; }
    if (this.id) this.stats.preempted++;
    this.id = tl.id; this.tl = tl; this.mode = mode;
    this.phase = 'aufbau'; this.clock = 0; this.t = 0; this.shift = 0; this.seq++;
    this.impacted = false; this.late = false; this.entered = 'aufbau';
    this.stats.begun++; this.stats.phases++;
    this.apply();
    return tl;
  }

  /**
   * Alt-Auslöser fragen hier nach: darf der frühere Standard-Effekt, Einzelton oder Fokus-Puls für diesen Angriff noch laufen? Für jede
   * Regie-Aktion NIE (auch nicht, wenn die Regie gerade nicht läuft) – sie hat ihre eigene 4-Phasen-Regie.
   */
  legacyAllowed(moveId: string | null | undefined): boolean {
    if (isDirectorAction(moveId)) { this.stats.legacyBlocked++; return false; }
    return true;
  }

  /** Besitzt die Regie diesen Kanal? Solange eine Aktion läuft, überschreibt kein späterer Bild-Takt Kamera, Pose, Netze, Zeit oder Klang. */
  locks(channel: DirectorChannel): boolean {
    if (!this.tl) return false;
    // Auto-Angriffe führen die Kamera nicht (nur Sichtfeld-Puls) und halten die Zeit nicht an
    if (this.tl.kind === 'auto') return channel === 'mesh' || channel === 'audio';
    return channel !== 'time' || this.impactOn;
  }

  /**
   * Der entscheidende Treffer der Welt (stärkster Treffer der Form, Einschlag des Ultimates): Phase 3 beginnt genau jetzt. Doppelte Meldungen
   * zählen nicht; gibt true zurück, wenn dieser Aufruf den Treffermoment gesetzt hat.
   */
  impactNow(): boolean {
    const tl = this.tl;
    if (!tl || this.impacted) return false;
    this.impacted = true;
    this.shift = this.clock - tl.t2;
    this.t = tl.t2;
    this.stats.impacts++;
    if (this.phase !== 'einschlag') { this.phase = 'einschlag'; this.entered = 'einschlag'; this.stats.phases++; }
    this.apply();
    return true;
  }

  /** Je Bild in ECHTZEIT */
  update(realDt: number) {
    this.entered = null;
    const tl = this.tl;
    if (!tl) { this.idle(); return; }
    const dt = Math.max(0, Math.min(0.1, Number.isFinite(realDt) ? realDt : 0));
    this.clock += dt;
    if (!this.impacted) {
      // Bis zum Treffermoment läuft die Zeitachse mit der Uhr. Den Treffermoment meldet IMMER die Welt (`impactNow`: stärkster Treffer der
      // Engine, Einschlag am Zielschiff, entscheidender Treffer des Ultimates) – setzte ihn die Regie selbst ein Bild früher, liefe die Engine
      // unter dem Hit-Stop-Zeitmaß 0,04 und ihr Treffer fiele erst nach dem Impact-Frame. Bleibt die Meldung aus (Form abgebrochen), hält
      // Phase 2 höchstens `overrun` s und die Regie setzt den Treffermoment als Rückfall (`late`).
      if (this.clock >= tl.t2 + DIRECTOR.overrun) { this.late = true; this.stats.late++; this.impactNow(); }
      else this.t = Math.min(this.clock, tl.t2 - 1e-4);
    } else this.t = this.clock - this.shift;
    if (this.t >= tl.total) { this.end(); return; }
    const p = phaseAt(tl, this.t);
    if (p !== this.phase) { this.phase = p; this.entered = p; this.stats.phases++; }
    this.apply();
  }

  /** Aktion beenden (Ablauf, Abbruch, Szenenwechsel) */
  end() {
    if (this.id) this.stats.ended++;
    this.id = null; this.tl = null; this.phase = 'idle'; this.impacted = false; this.late = false;
    this.idle();
  }

  private idle() {
    this.fovDelta = 0; this.lowK = 0; this.whipK = 0; this.speedK = 0; this.poseK = 0; this.glowK = 0; this.darkK = 0; this.liftK = 0; this.timeScale = 1; this.impactOn = false;
  }

  /** Größen für den aktuellen Zeitpunkt */
  private apply() {
    const tl = this.tl!;
    const u = this.u;
    this.timeScale = 1;
    this.impactOn = false;
    switch (this.phase) {
      case 'aufbau':
        this.fovDelta = tl.fovBuild * easeOut(u);
        this.lowK = tl.lowAngle * smooth(u);
        this.whipK = 0;
        this.speedK = 0;
        this.poseK = smooth(u / 0.5);
        this.glowK = u;
        this.darkK = tl.darken * smooth(u);
        this.liftK = easeOut(u);
        break;
      case 'entladung':
        this.fovDelta = tl.fovBuild * (1 - 0.35 * smooth(u));
        this.lowK = tl.lowAngle * (1 - 0.5 * smooth(u));
        this.whipK = tl.whip * Math.sin(Math.PI * clamp01(u));
        this.speedK = tl.speedlines * smooth(u / 0.25);
        this.poseK = 1;
        this.glowK = 1;
        this.darkK = tl.darken;
        this.liftK = 1 - smooth((u - 0.5) / 0.5);
        break;
      case 'einschlag':
        this.fovDelta = tl.fovBuild * 0.65;
        this.lowK = tl.lowAngle * 0.5;
        this.whipK = 0;
        this.speedK = tl.speedlines * (1 - u);
        this.poseK = 1;
        this.glowK = 1;
        this.darkK = tl.darken;
        this.liftK = 0;
        this.impactOn = tl.impactMs > 0;
        this.timeScale = tl.impactMs > 0 ? tl.hitStop : 1;
        break;
      case 'nachbeben': {
        // Weitwinkel-Rückzug: rasch auf +7° hinaus, dann ruhig zurück; die Pose löst sich im ersten Drittel
        const out = easeOut(u / 0.22), back = 1 - smooth((u - 0.35) / 0.65);
        this.fovDelta = tl.fovAfter * out * back;
        this.lowK = tl.lowAngle * 0.5 * (1 - smooth(u / 0.4));
        this.whipK = 0;
        this.speedK = 0;
        this.poseK = 1 - smooth(u / 0.45);
        this.glowK = 1 - smooth(u / 0.3);
        this.darkK = tl.darken * (1 - smooth((u - 0.3) / 0.7));
        this.liftK = 0;
        break;
      }
      default: this.idle(); break;
    }
  }
}
