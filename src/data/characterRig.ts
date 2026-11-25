// Phase 4.6F (4.6.5): Daten des organischen Figuren-Rigs – Statur, Mimik, Blinzeln, Hände, Atem und Lebendigkeit, Blick, Federketten für
// Mäntel, Haare, Schals und Bänder, Präsenz der Königs- und Kaiser-Endbosse, Lebensprofile der Stadtleute und die zwölf Befestigungs-Sockets.
// Reine Daten ohne three.js: das Rig (entities/character/rig/) liest nur von hier, Tests prüfen die Grenzen.

import type { NpcRole } from './characterParts';

// ---------- Knochen ----------

/** Unsere Namen der Rig-Knochen → Knochen der Anime-Grundfigur (VRoid). Fehlt ein Knochen, überspringt das Rig ihn. */
export const RIG_BONES = {
  hips: 'J_Bip_C_Hips', spine: 'J_Bip_C_Spine', chest: 'J_Bip_C_Chest', upperChest: 'J_Bip_C_UpperChest', neck: 'J_Bip_C_Neck', head: 'J_Bip_C_Head',
  shoulderL: 'J_Bip_L_Shoulder', upperArmL: 'J_Bip_L_UpperArm', lowerArmL: 'J_Bip_L_LowerArm', handL: 'J_Bip_L_Hand',
  shoulderR: 'J_Bip_R_Shoulder', upperArmR: 'J_Bip_R_UpperArm', lowerArmR: 'J_Bip_R_LowerArm', handR: 'J_Bip_R_Hand',
  upperLegL: 'J_Bip_L_UpperLeg', lowerLegL: 'J_Bip_L_LowerLeg', footL: 'J_Bip_L_Foot', toesL: 'J_Bip_L_ToeBase',
  upperLegR: 'J_Bip_R_UpperLeg', lowerLegR: 'J_Bip_R_LowerLeg', footR: 'J_Bip_R_Foot', toesR: 'J_Bip_R_ToeBase',
  eyeL: 'J_Adj_L_FaceEye', eyeR: 'J_Adj_R_FaceEye',
} as const;
export type RigBone = keyof typeof RIG_BONES;

// ---------- Statur (Anatomie) ----------

/** Glieder, deren Umfang die Statur ändert (gleichmäßig um ihr Gelenk, die Gelenke selbst bleiben an ihrem Platz – keine Scherung) */
export type GirthBone = 'hips' | 'spine' | 'chest' | 'upperChest' | 'neck' | 'upperArm' | 'lowerArm' | 'upperLeg' | 'lowerLeg';
export type BuildId = 'schlank' | 'athletisch' | 'wuchtig' | 'koloss';

export interface BuildDef {
  label: string;
  /** Umfang je Glied (Weltfaktor, 1 = Grundfigur) */
  girth: Record<GirthBone, number>;
  /** Schulterbreite (seitlicher Abstand der Schlüsselbeine) und Hüftbreite (Abstand der Hüftgelenke) */
  shoulders: number;
  hips: number;
  /** Kopfgröße: heroische Proportionen tragen einen etwas kleineren Kopf auf breiterem Körper */
  head: number;
  /** Haltung im Stand: Brust heraus (rad), Kinn (rad, negativ = gehoben) */
  chestOut: number;
  chin: number;
}

/** Drei Staturen der Spielfigur und der Leute, dazu der Koloss der Endbosse. Werte klein halten (±12 %): größer wirkt es aufgeblasen. */
export const BUILDS: Record<BuildId, BuildDef> = {
  schlank: {
    label: 'Schlank', shoulders: 0.95, hips: 0.97, head: 1.0, chestOut: 0, chin: 0,
    girth: { hips: 0.96, spine: 0.94, chest: 0.95, upperChest: 1, neck: 0.95, upperArm: 0.93, lowerArm: 0.95, upperLeg: 0.94, lowerLeg: 0.96 },
  },
  athletisch: {
    label: 'Athletisch', shoulders: 1.04, hips: 1, head: 0.98, chestOut: 0.03, chin: -0.02,
    girth: { hips: 1, spine: 0.97, chest: 1.04, upperChest: 1.01, neck: 1.03, upperArm: 1.04, lowerArm: 1.02, upperLeg: 1.03, lowerLeg: 1.01 },
  },
  wuchtig: {
    label: 'Wuchtig', shoulders: 1.1, hips: 1.05, head: 0.96, chestOut: 0.05, chin: -0.03,
    girth: { hips: 1.06, spine: 1.06, chest: 1.1, upperChest: 1.02, neck: 1.09, upperArm: 1.11, lowerArm: 1.07, upperLeg: 1.08, lowerLeg: 1.05 },
  },
  koloss: {
    label: 'Koloss', shoulders: 1.14, hips: 1.06, head: 0.93, chestOut: 0.07, chin: -0.06,
    girth: { hips: 1.07, spine: 1.08, chest: 1.13, upperChest: 1.03, neck: 1.12, upperArm: 1.13, lowerArm: 1.08, upperLeg: 1.09, lowerLeg: 1.06 },
  },
};

/** Körperbau aus dem Editor (alte Spielstände bleiben gültig: dieselben drei Werte) → Statur des Rigs */
export const BUILD_OF_BODY: Record<string, BuildId> = { schmal: 'schlank', normal: 'athletisch', kraeftig: 'wuchtig' };

// ---------- Gesicht ----------

/** Kanäle der Mimik; je Kanal sucht das Rig das passende Morph-Ziel der Grundfigur (Name, Groß-/Kleinschreibung egal) */
export const FACE_CHANNELS = [
  'browAngry', 'browJoy', 'browSorrow', 'browSurprised', 'browFun',
  'eyeAngry', 'eyeJoy', 'eyeSorrow', 'eyeSurprised', 'eyeSpread', 'eyeFun', 'eyeClose', 'eyeCloseL', 'eyeCloseR',
  'mouthAngry', 'mouthFun', 'mouthJoy', 'mouthSorrow', 'mouthSurprised', 'mouthUp', 'mouthDown',
  'mouthA', 'mouthI', 'mouthU', 'mouthE', 'mouthO', 'fang',
] as const;
export type FaceChannel = typeof FACE_CHANNELS[number];

/** Morph-Ziel je Kanal (VRoid-Namen, Endung genügt) */
export const FACE_MORPH: Record<FaceChannel, string> = {
  browAngry: 'Fcl_BRW_Angry', browJoy: 'Fcl_BRW_Joy', browSorrow: 'Fcl_BRW_Sorrow', browSurprised: 'Fcl_BRW_Surprised', browFun: 'Fcl_BRW_Fun',
  eyeAngry: 'Fcl_EYE_Angry', eyeJoy: 'Fcl_EYE_Joy', eyeSorrow: 'Fcl_EYE_Sorrow', eyeSurprised: 'Fcl_EYE_Surprised', eyeSpread: 'Fcl_EYE_Spread', eyeFun: 'Fcl_EYE_Fun',
  eyeClose: 'Fcl_EYE_Close', eyeCloseL: 'Fcl_EYE_Close_L', eyeCloseR: 'Fcl_EYE_Close_R',
  mouthAngry: 'Fcl_MTH_Angry', mouthFun: 'Fcl_MTH_Fun', mouthJoy: 'Fcl_MTH_Joy', mouthSorrow: 'Fcl_MTH_Sorrow', mouthSurprised: 'Fcl_MTH_Surprised',
  mouthUp: 'Fcl_MTH_Up', mouthDown: 'Fcl_MTH_Down', mouthA: 'Fcl_MTH_A', mouthI: 'Fcl_MTH_I', mouthU: 'Fcl_MTH_U', mouthE: 'Fcl_MTH_E', mouthO: 'Fcl_MTH_O',
  fang: 'Fcl_HA_Fung1',
};

export type ExpressionId = 'hafen' | 'kampf' | 'entschlossen' | 'schmerz' | 'jubel' | 'gespraech' | 'erschoepft' | 'erstaunt' | 'grimmig' | 'hochmut' | 'ko';
type Expr = Partial<Record<FaceChannel, number>>;

/**
 * Gesichtsausdrücke als Gewichte je Kanal. Das Rig blendet weich zwischen ihnen (Brauen schneller als der Mund) und legt das Blinzeln darüber.
 * hafen = entspannt (Hafen, Gespräch), kampf = konzentrierter Blick, entschlossen = Grinsen im Sturm-Erwachen und bei Ultimates.
 */
export const EXPRESSIONS: Record<ExpressionId, { label: string; w: Expr; glow: number }> = {
  hafen: { label: 'Entspannt', glow: 0, w: { browJoy: 0.14, mouthFun: 0.2, eyeJoy: 0.04 } },
  gespraech: { label: 'Im Gespräch', glow: 0, w: { browJoy: 0.24, browSurprised: 0.08, mouthFun: 0.16 } },
  kampf: { label: 'Konzentriert', glow: 0, w: { browAngry: 0.58, eyeAngry: 0.34, mouthAngry: 0.12, mouthDown: 0.08 } },
  entschlossen: { label: 'Entschlossen', glow: 1, w: { browAngry: 0.82, eyeAngry: 0.2, eyeSpread: 0.12, mouthFun: 0.48, mouthA: 0.12, fang: 0.55 } },
  schmerz: { label: 'Schmerz', glow: 0, w: { browSorrow: 0.62, eyeSorrow: 0.45, eyeClose: 0.3, mouthAngry: 0.42, mouthA: 0.16 } },
  jubel: { label: 'Jubel', glow: 0, w: { browJoy: 0.72, eyeJoy: 0.82, mouthJoy: 0.76 } },
  erschoepft: { label: 'Erschöpft', glow: 0, w: { browSorrow: 0.3, eyeClose: 0.28, mouthA: 0.22, mouthSorrow: 0.18 } },
  erstaunt: { label: 'Erstaunt', glow: 0, w: { browSurprised: 0.7, eyeSurprised: 0.45, mouthO: 0.38 } },
  grimmig: { label: 'Grimmig', glow: 0, w: { browAngry: 0.48, eyeAngry: 0.42, mouthDown: 0.26, mouthAngry: 0.08 } },
  hochmut: { label: 'Hochmut', glow: 0, w: { browAngry: 0.32, eyeAngry: 0.26, mouthFun: 0.36, mouthUp: 0.08 } },
  ko: { label: 'Bewusstlos', glow: 0, w: { eyeClose: 0.92, browSorrow: 0.3, mouthA: 0.12 } },
};

/** Grundzüge aus dem Editor (Augen, Brauen, Mund): ein leiser Dauer-Anteil, über dem die Ausdrücke liegen */
export const FACE_TRAITS: { eyes: Record<string, Expr>; brows: Record<string, Expr>; mouth: Record<string, Expr> } = {
  eyes: { gross: { eyeSpread: 0.14 }, scharf: { eyeAngry: 0.22 }, sanft: { eyeJoy: 0.1, browJoy: 0.06 }, muede: { eyeClose: 0.22 } },
  brows: { normal: {}, dick: { browAngry: 0.06 }, schraeg: { browAngry: 0.26 }, hoch: { browSurprised: 0.2, browJoy: 0.06 } },
  mouth: { laecheln: { mouthFun: 0.22 }, grinsen: { mouthFun: 0.3, fang: 0.35 }, ernst: { mouthDown: 0.13 }, offen: { mouthA: 0.1, mouthO: 0.05 } },
};

/**
 * Blinzeln: Abstände unregelmäßig (gestreckte Verteilung zwischen min und max um den Mittelwert), gelegentlich doppelt oder nur halb.
 * Lid schließt schnell und öffnet langsamer. Im Kampf blinzeln Figuren seltener (Fokus), beim Blickwechsel oft.
 */
export const BLINK = {
  mean: 3.4, min: 0.9, max: 7.5,
  double: 0.16, half: 0.1, halfAmount: 0.55,
  close: 0.065, hold: 0.035, open: 0.13,
  /** Faktor auf die Abstände im Kampf-Blick, Chance auf ein Blinzeln bei einem Blicksprung über `saccade` rad */
  combat: 1.45, saccade: 0.45, saccadeChance: 0.6,
} as const;

/** Mundbewegung beim Sprechen: Laute A/I/U/E/O mit zufälliger Dauer und Stärke, Pausen zwischen Wörtern */
export const TALK = { min: 0.07, max: 0.16, ampMin: 0.32, ampMax: 0.72, wordMin: 2, wordMax: 6, pause: 0.22 } as const;

/** Glättung der Mimik je Sekunde: Brauen und Augen schneller als der Mund */
export const FACE_SPEED = { brow: 9, eye: 11, mouth: 7 } as const;

// ---------- Hände ----------

export type HandPoseId = 'offen' | 'faust' | 'griff' | 'steuer' | 'zeigen' | 'geste';
/** Je Finger (Zeige-, Mittel-, Ring-, kleiner Finger) Beugung der drei Glieder und Spreizung; Daumen: drei Glieder und Gegenstellung (rad) */
export interface HandPose { label: string; fingers: [number, number, number, number][]; thumb: [number, number, number, number] }

export const HAND_POSES: Record<HandPoseId, HandPose> = {
  offen: {
    label: 'Entspannt offen',
    fingers: [[0.16, 0.22, 0.14, 0.06], [0.22, 0.3, 0.2, 0.0], [0.3, 0.36, 0.24, -0.05], [0.38, 0.42, 0.28, -0.11]],
    thumb: [0.12, 0.18, 0.12, 0.22],
  },
  faust: {
    label: 'Geballte Faust',
    fingers: [[1.38, 1.62, 1.08, 0.02], [1.46, 1.66, 1.1, 0], [1.52, 1.68, 1.08, -0.02], [1.56, 1.66, 1.02, -0.05]],
    thumb: [0.48, 0.72, 0.62, 0.62],
  },
  griff: {
    label: 'Schwertgriff',
    fingers: [[0.92, 1.12, 0.78, 0.0], [1.06, 1.3, 0.9, 0], [1.12, 1.34, 0.88, -0.02], [1.18, 1.36, 0.84, -0.04]],
    thumb: [0.28, 0.58, 0.5, 0.5],
  },
  steuer: {
    label: 'Steuerrad',
    fingers: [[0.82, 0.98, 0.7, 0.04], [0.9, 1.1, 0.76, 0], [0.96, 1.14, 0.76, -0.03], [1.02, 1.16, 0.72, -0.06]],
    thumb: [0.24, 0.5, 0.42, 0.42],
  },
  zeigen: {
    label: 'Zeigen',
    fingers: [[0.04, 0.04, 0.02, 0.04], [1.3, 1.5, 1.0, 0], [1.36, 1.54, 1.0, -0.02], [1.4, 1.54, 0.96, -0.05]],
    thumb: [0.4, 0.62, 0.5, 0.5],
  },
  geste: {
    label: 'Erklärende Geste',
    fingers: [[0.08, 0.1, 0.06, 0.14], [0.12, 0.14, 0.08, 0.03], [0.16, 0.2, 0.12, -0.08], [0.22, 0.26, 0.16, -0.18]],
    thumb: [0.04, 0.1, 0.06, 0.08],
  },
};
/** Überblenden zwischen Handhaltungen (s) */
export const HAND_BLEND = 0.14;

// ---------- Atem, Gewicht, Blick, Bewegung ----------

/** Lebendigkeit im Stand und in Bewegung (Bogenmaß, Meter, Sekunden) */
export const LIFE = {
  breath: {
    /** Atemzüge je Sekunde in Ruhe und nach Anstrengung; Anstrengung baut sich mit `exertDecay` je Sekunde ab */
    rate: 0.23, rateExert: 0.62, exertDecay: 0.07,
    /** Brustkorb hebt sich (m), kippt nach hinten (rad), Schultern heben sich (rad) – nach Anstrengung bis zum Faktor `exertAmp` */
    lift: 0.0045, pitch: 0.028, shoulder: 0.035, exertAmp: 1.9,
  },
  /** Gewichtsverlagerung im Stand: langsames Pendeln der Hüfte, Kippen zum Standbein, Oberkörper gleicht aus */
  sway: { periodMin: 6.5, periodMax: 10.5, hip: 0.024, roll: 0.038, counter: 0.7 },
  /** kleine Bewegungen der Arme und des Kopfes im Stand */
  micro: { arm: 0.028, head: 0.022 },
  /** Blick: Grenzen (rad), Anteile der Knochen an der Drehung, Nachführ-Tempo; die Augen eilen voraus */
  look: {
    yaw: 1.15, pitchUp: 0.42, pitchDown: 0.5, behind: 2.0, speed: 5.5, eyeYaw: 0.17, eyePitch: 0.09, eyeSpeed: 16,
    share: { spine: 0.1, chest: 0.12, upperChest: 0.1, neck: 0.3, head: 0.38 },
  },
  /** Kurvenneigen aus Drehtempo × Lauftempo, Vorlage im Sprint, beides geglättet */
  bank: { k: 0.05, max: 0.3, run: 0.1, accel: 0.006, speed: 7 },
  /** Federndes In-die-Knie-Gehen nach Sprung oder Sturz: Hüfte sinkt je m/s Aufprall, Feder und Dämpfung */
  land: { perMps: 0.016, max: 0.2, stiffness: 150, damping: 15, lean: 0.9 },
  /** Fuß-Anpassung an Rampen, Brücken und Decks: höchster Ausgleich je Fuß (m), Sichtweite in m */
  foot: { maxStep: 0.36, range: 28, smooth: 14 },
  /** Bereitschaft: Knie leicht gebeugt, Brust nach vorn, Arme näher zur Deckung */
  ready: { crouch: 0.045, chest: 0.07, arms: 0.12, speed: 4 },
  /** Gelenk-Verteilung gegen harte Knicke: Anteil der Kopfdrehung im Hals, der Brustdrehung im oberen Brustkorb, Unterarm-Drehung */
  spread: { neck: 0.34, upperChest: 0.4, forearmTwist: 0.5, clavicle: 0.36, clavicleFrom: 0.85 },
} as const;

/** Haltungs-Stile im Stand (Bosse, Wachen, Händler): additiv auf die Clips */
export type StanceId = 'frei' | 'aufrecht' | 'gebeugt' | 'breit' | 'lauernd' | 'thron';
export const STANCES: Record<StanceId, { label: string; chest: number; chin: number; crouch: number; shoulders: number; sway: number }> = {
  frei: { label: 'Frei', chest: 0, chin: 0, crouch: 0, shoulders: 0, sway: 1 },
  aufrecht: { label: 'Aufrecht (Wache, Offizier)', chest: 0.045, chin: -0.03, crouch: 0, shoulders: -0.03, sway: 0.45 },
  gebeugt: { label: 'Gebeugt (Fischer, Arbeiter)', chest: -0.07, chin: 0.05, crouch: 0.015, shoulders: 0.04, sway: 1.2 },
  breit: { label: 'Breitbeinig (Koloss)', chest: 0.06, chin: -0.05, crouch: 0.03, shoulders: -0.04, sway: 0.6 },
  lauernd: { label: 'Lauernd (Klingenmeister)', chest: -0.02, chin: 0.02, crouch: 0.05, shoulders: 0.02, sway: 0.8 },
  thron: { label: 'Herrscher', chest: 0.08, chin: -0.08, crouch: 0.01, shoulders: -0.05, sway: 0.35 },
};

// ---------- Federketten: Mäntel, Umhänge, Haare, Schals, Bänder ----------

export interface ChainTuning {
  /** Zug zurück in die Ruheform (0 … 1 je Schritt, zur Spitze hin abnehmend) */
  stiffness: number;
  /** Erhalt der Geschwindigkeit je Schritt (1 = keine Dämpfung) */
  damping: number;
  /** Mitnahme durch Wind und Fahrtwind */
  drag: number;
  /** Schwerkraft-Faktor */
  gravity: number;
  /** Radius der Glieder gegen Beine, Körper und Boden (m) */
  radius: number;
  /** wie stark die Kette Bewegungen der Figur nachhinkt (0 = starr mit, 1 = frei) */
  inertia: number;
  /** größte Dehnung der Glieder (1,03 = 3 %) */
  stretch: number;
}

/** 4.6G.2: Halbmesser der Bein-Kapseln gegen Stoff-Ketten (m): Oberschenkel samt Hose, Unterschenkel samt Stiefelschaft und Stulpe */
export const LEG_CAPS = { upper: 0.084, lower: 0.074 } as const;

export const CLOTH: Record<'coat' | 'kilt' | 'cape' | 'hair' | 'scarf' | 'ribbon' | 'sleeve', ChainTuning> = {
  coat: { stiffness: 0.035, damping: 0.95, drag: 1.25, gravity: 1, radius: 0.055, inertia: 0.8, stretch: 1.04 },
  kilt: { stiffness: 0.06, damping: 0.93, drag: 0.8, gravity: 1, radius: 0.04, inertia: 0.65, stretch: 1.03 },
  cape: { stiffness: 0.025, damping: 0.95, drag: 1.4, gravity: 1, radius: 0.05, inertia: 0.85, stretch: 1.04 },
  hair: { stiffness: 0.14, damping: 0.88, drag: 0.4, gravity: 0.45, radius: 0.016, inertia: 0.5, stretch: 1.02 },
  scarf: { stiffness: 0.02, damping: 0.95, drag: 1.7, gravity: 0.8, radius: 0.02, inertia: 0.9, stretch: 1.03 },
  ribbon: { stiffness: 0.025, damping: 0.95, drag: 1.5, gravity: 0.9, radius: 0.018, inertia: 0.85, stretch: 1.03 },
  // 4.6G: leere Ärmel des Schultermantels – schwerer Wollstoff, pendelt träge und schwingt beim Laufen nach
  sleeve: { stiffness: 0.03, damping: 0.94, drag: 1.2, gravity: 1, radius: 0.042, inertia: 0.88, stretch: 1.03 },
};

/** Aufbau der Ketten je Grundfigur: Sektoren um Hüfte, Kopf und Rücken, Glieder je Kette (fest: das Skelett jeder Figur hat dieselben Knochen) */
export const CHAIN_LAYOUT = {
  /** Mantelschöße und Rock: Sektoren um die Hüfte (Winkel, 0 = vorn) und Glieder bis zum Saum */
  tails: { sectors: 8, links: 3 },
  /** Umhang: Bahnen über die Breite und Glieder vom Nacken bis zum Saum */
  cape: { columns: 5, links: 4 },
  /** Haare: Sektoren um den Kopf, zwei Glieder je Strähnenbündel */
  hair: { sectors: 8, links: 2 },
  /** Schalenden und Schärpenbänder: zwei Bänder mit je so vielen Gliedern */
  scarf: { ribbons: 2, links: 4, length: 0.3, width: 0.05 },
  sash: { ribbons: 2, links: 4, length: 0.36, width: 0.055 },
  /** 4.6G: leere Mantelärmel des Schultermantels – je Seite eine Kette ab der Schulternaht, Röhre mit Halbmesser oben/am Aufschlag */
  sleeves: { links: 4, length: 0.56, radius: 0.046, cuff: 0.058, out: 0.045, back: 0.075 },
} as const;

/** Wind an Figuren: Anteil des Seewinds (m/s), Höchstwert und das Flattern (Böen) */
export const CLOTH_WIND = { share: 0.55, max: 9, gust: 0.35, gustRate: 0.9 } as const;
/** Stöße auf die Ketten: Doppelsprung, Sturm-Schritt (Teleport ab `teleport` m je Schritt), Druckwellen (m/s Startgeschwindigkeit) */
export const CLOTH_IMPULSE = { jump: 2.6, airJump: 4.2, land: 2.2, dash: 3.4, teleport: 1.6, teleportKick: 5.5, blast: 7.5, maxSpeed: 14 } as const;

// ---------- Präsenz der Endbosse ----------

export interface PresenceDef {
  /** Statur (Endbosse: Koloss oder Klingenmeister-Silhouette) */
  build: BuildId;
  /** Haltung im Stand */
  stance: StanceId;
  /** Dauer-Ausdruck (überlagert vom Kampf-Blick) */
  face: ExpressionId;
  /** Atemtempo (schwer und langsam < 1) */
  breath: number;
}

/** Endbosse nach Ausrüstungs-Set (`EnemyDef.kit`); Kaiser erben ihre Macht und bekommen die Herrscher-Haltung */
export const BOSS_PRESENCE: Record<string, PresenceDef> = {
  boss_england: { build: 'wuchtig', stance: 'aufrecht', face: 'hochmut', breath: 0.8 },
  boss_niederlande: { build: 'koloss', stance: 'breit', face: 'grimmig', breath: 0.72 },
  boss_deutschland: { build: 'koloss', stance: 'breit', face: 'grimmig', breath: 0.7 },
  boss_frankreich: { build: 'athletisch', stance: 'lauernd', face: 'hochmut', breath: 0.9 },
  boss_kurogane: { build: 'wuchtig', stance: 'lauernd', face: 'grimmig', breath: 0.82 },
  boss_marine: { build: 'koloss', stance: 'thron', face: 'grimmig', breath: 0.7 },
};
/** Ohne eigenen Eintrag: Endbosse wuchtig und grimmig */
export const BOSS_PRESENCE_DEFAULT: PresenceDef = { build: 'wuchtig', stance: 'aufrecht', face: 'grimmig', breath: 0.8 };
/** Statur der Endbosse: Königs-Endbosse und Kaiser zusammen zwischen diesen Grenzen (Test hält es fest) */
export const BOSS_SCALE = { min: 1.35, max: 1.65 } as const;

// ---------- Stadtleute ----------

/** Lebensprofil je Rolle: Haltung, Ausdruck, wie oft sie gestikulieren und wie lange sie der Spielfigur nachschauen */
export const NPC_LIFE: Record<NpcRole, { stance: StanceId; face: ExpressionId; gesture: number; watch: number; breath: number }> = {
  buerger: { stance: 'frei', face: 'hafen', gesture: 0.5, watch: 8, breath: 1 },
  fischer: { stance: 'gebeugt', face: 'hafen', gesture: 0.35, watch: 6, breath: 0.95 },
  haendler: { stance: 'frei', face: 'gespraech', gesture: 0.9, watch: 10, breath: 1.05 },
  pirat: { stance: 'breit', face: 'hochmut', gesture: 0.6, watch: 7, breath: 1 },
  marine: { stance: 'aufrecht', face: 'grimmig', gesture: 0.25, watch: 12, breath: 0.9 },
  offizier: { stance: 'aufrecht', face: 'kampf', gesture: 0.4, watch: 12, breath: 0.9 },
  koch: { stance: 'frei', face: 'jubel', gesture: 0.7, watch: 6, breath: 1.05 },
  schmied: { stance: 'breit', face: 'grimmig', gesture: 0.3, watch: 5, breath: 1.1 },
  wirt: { stance: 'frei', face: 'hafen', gesture: 0.8, watch: 9, breath: 1 },
};

// ---------- Sockets ----------

export const SOCKET_IDS = [
  'headTop', 'faceFront', 'eyeLeft', 'eyeRight', 'beardJaw', 'neckScarf',
  'shouldersCoat', 'backWeapon', 'hipLeft', 'hipRight', 'handMain', 'handOff',
] as const;
export type CharacterSocketId = typeof SOCKET_IDS[number];

/**
 * Befestigungs-Sockets am bewegten Skelett. Raum jedes Sockets: +Z vorn, +Y oben, +X zur linken Körperseite, 1 Einheit = 1 m – gleich für
 * jede Grundfigur und Körpergröße. `bone` ist der tragende Rig-Knochen, `at` die Lage im Raum dieses Knochens (Ruhehaltung, Meter),
 * `measure` sagt, welche gemessene Stelle der Grundfigur den Wert ersetzt (Haar-Oberkante, Augen, Ohren, Schultern …).
 */
export const SOCKET_DEFS: Record<CharacterSocketId, { label: string; bone: RigBone | 'handslotr' | 'handslotl'; at: [number, number, number]; measure?: 'hairTop' | 'face' | 'eyeL' | 'eyeR' | 'jaw' | 'neck' | 'shoulders' | 'back' | 'hipL' | 'hipR' }> = {
  headTop: { label: 'Scheitel (Hüte, Kronen)', bone: 'head', at: [0, 0.17, -0.005], measure: 'hairTop' },
  faceFront: { label: 'Gesicht (Brillen, Narben, Masken)', bone: 'head', at: [0, 0.06, 0.1], measure: 'face' },
  eyeLeft: { label: 'Linkes Auge (Monokel, Augenklappe)', bone: 'head', at: [0.032, 0.06, 0.085], measure: 'eyeL' },
  eyeRight: { label: 'Rechtes Auge (Monokel, Augenklappe)', bone: 'head', at: [-0.032, 0.06, 0.085], measure: 'eyeR' },
  beardJaw: { label: 'Kinn und Kiefer (Bärte, Ohrring)', bone: 'head', at: [0, -0.035, 0.07], measure: 'jaw' },
  neckScarf: { label: 'Hals (Schals, Kragen)', bone: 'neck', at: [0, 0.02, 0.02], measure: 'neck' },
  shouldersCoat: { label: 'Schultern (Umhänge, Schultermäntel)', bone: 'upperChest', at: [0, 0.12, -0.02], measure: 'shoulders' },
  backWeapon: { label: 'Rücken (Waffen auf dem Rücken)', bone: 'upperChest', at: [0, 0.02, -0.14], measure: 'back' },
  hipLeft: { label: 'Linke Hüfte (Laterne, Scheide)', bone: 'hips', at: [0.17, 0.04, 0], measure: 'hipL' },
  hipRight: { label: 'Rechte Hüfte (Pistole, Beutel)', bone: 'hips', at: [-0.17, 0.04, 0], measure: 'hipR' },
  handMain: { label: 'Waffenhand (rechts)', bone: 'handslotr', at: [0, 0, 0] },
  handOff: { label: 'Zweithand (links)', bone: 'handslotl', at: [0, 0, 0] },
};

// ---------- 4.6G: Haltung, Grenzen der Zusatz-Drehungen, Rückenwaffe, Socket-Grenzen ----------

/**
 * Entspannte Arme außerhalb des Kampfs: die Ruhe-Clips stehen in einer steifen A-Haltung. Das Rig zieht den Oberarm in der Frontalebene bis
 * auf `target` (rad von der Senkrechten, je Statur; Mäntel brauchen etwas Luft) und beugt den Ellbogen leicht. Gilt nur, solange die Figur
 * nicht kampfbereit ist; mit einer Waffe in der Hand nur zu `armed`.
 */
export const ARM_RELAX = {
  target: { schlank: 0.13, athletisch: 0.155, wuchtig: 0.2, koloss: 0.25 } as Record<BuildId, number>,
  /** Zuschlag unter Mantel/Jacke (rad) */
  coat: 0.035,
  /** höchstens so weit holt das Rig den Arm heran (rad) */
  max: 0.55,
  /** leichte Beugung im Ellbogen (rad) und Drehung der Handfläche zum Körper (rad) */
  elbow: 0.16, palm: 0.18,
  /** Anteil mit Waffe in der Hand */
  armed: 0.45,
  /** Ein- und Ausblenden (je Sekunde) */
  speed: 3.5,
} as const;

/**
 * 4.6G.2: Haltung je Geschlecht (rad, additiv über allen Clips, mit jeder Statur kombinierbar). Weiblich: Kontrapost im Stand (Hüfte kippt zum
 * Standbein, die Fußführung beugt das andere Knie, Oberkörper gleicht aus), Hüftschwung beim Gehen mit Gegendrehung der Brust, Arme mit
 * Abstand zur breiteren Hüfte, Schultern etwas tiefer und zurück, Kinn leicht gehoben. Männlich: neutral (die Clips allein).
 */
export interface FigurePose {
  /** Faktor auf das Pendeln der Hüfte im Stand */
  sway: number;
  /** Kontrapost: Hüftkippung im ruhigen Stand, Ausgleich im Oberkörper (Anteil) */
  contra: number; contraCounter: number;
  /** Gehen: Hüftdrehung und -kippung je Schritt, Gegendrehung der Brust */
  walkYaw: number; walkRoll: number; walkCounter: number;
  /** Arme näher am Körper (rad weniger Abspreizung, negativ = weiter weg), Schultern (rad, − = tiefer), Kinn (rad, − = gehoben) */
  armIn: number; shoulders: number; chin: number;
}
export const FIGURE_POSE: Record<'male' | 'female', FigurePose> = {
  male: { sway: 1, contra: 0, contraCounter: 0, walkYaw: 0, walkRoll: 0, walkCounter: 0, armIn: 0, shoulders: 0, chin: 0 },
  // armIn negativ: die breitere Hüfte der weiblichen Grundfigur braucht mehr Abstand (sonst stachen die Finger durch Hose und Rock)
  female: { sway: 1.3, contra: 0.05, contraCounter: 0.75, walkYaw: 0.11, walkRoll: 0.045, walkCounter: 0.07, armIn: -0.075, shoulders: -0.022, chin: -0.02 },
};

/**
 * Obergrenzen der Zusatz-Drehungen aus Atem, Blick, Gewichtsverlagerung und Kurvenneigen (rad). Summen über diesen Werten wirken steif und
 * verdreht (Kopf auf den Rücken, Oberkörper im Korkenzieher) – das Rig kappt sie je Knochen und Achse.
 */
export const ROT_BUDGET = {
  bankRoll: 0.12, bankPitch: 0.085,
  spinePitch: 0.12, chestPitch: 0.1, upperChestPitch: 0.09,
  spineYaw: 0.13, chestYaw: 0.15, upperChestYaw: 0.13,
  spineRoll: 0.05, chestRoll: 0.04,
  neckYaw: 0.38, neckPitch: 0.24, headYaw: 0.55, headPitch: 0.36,
} as const;

/** Waffen, die auf dem Rücken (Socket `backWeapon`) stecken können; Länge der Klinge samt Griff (m) */
export type SheathKind = 'saebel' | 'langklinge' | 'zweihaender' | 'kurzklinge' | 'entermesser' | 'dolch';
export const SHEATH_LEN: Record<SheathKind, number> = { saebel: 0.78, langklinge: 1.0, zweihaender: 1.3, kurzklinge: 0.6, entermesser: 0.9, dolch: 0.45 };

/**
 * Rückenwaffen (4.6G): Raum des Sockets `backWeapon` (+Z zum Körper, +X zur linken Seite, Meter). Der Griff ragt über die rechte Schulter,
 * die Klinge läuft schräg nach unten links; Doppelklingen kreuzen sich. Unter einem Umhang oder Schultermantel liegt die Waffe verdeckt.
 */
export const SHEATH = {
  /** Griffpunkt (Mitte der Hand) über der rechten Schulter und Neigung der Klinge aus der Senkrechten (rad) */
  hiltX: -0.115, hiltY: 0.16, tilt: 0.5,
  /** Doppelklingen: beide Griffe über den Schultern, gekreuzt */
  doubleX: 0.11, doubleTilt: 0.52,
  /** Abstand der Klinge zum Rücken (m) je äußerster Kleidung (Klingendicke eingerechnet) */
  clear: { haut: 0.014, hemd: 0.018, ringel: 0.022, tunika: 0.022, weste: 0.026, jacke: 0.032, uniform: 0.03, mantelKurz: 0.04, mantelLang: 0.042, ruestung: 0.055 } as Record<string, number>,
  /** so viele Sekunden ohne Kampf, dann steckt die Spielfigur die Klinge weg */
  calmAfter: 6,
} as const;

/** Wo eine Rückenwaffe sitzt (rein): Griffpunkt, Drehung um die Socket-z-Achse (rad) und Spitze, Raum des Sockets */
export function sheathPose(len: number, side: 'r' | 'l', double: boolean, clear: number): { hx: number; hy: number; z: number; rotZ: number; tipX: number; tipY: number } {
  // lange Klingen steiler (ein Zweihänder ragt sonst einen halben Meter zur Seite)
  const tilt = (double ? SHEATH.doubleTilt : SHEATH.tilt) * Math.min(1, Math.max(0.6, Math.pow(0.9 / Math.max(0.3, len), 0.8)));
  // rechte Hand (Hauptwaffe): Griff über der rechten Schulter (−X), Klinge nach unten links (+X); links gespiegelt
  const s = side === 'r' ? 1 : -1;
  const hx = double ? -s * SHEATH.doubleX : SHEATH.hiltX * s;
  const hy = SHEATH.hiltY;
  // lange Klingen tiefer, damit der Griff nicht über den Kopf ragt
  const lift = Math.max(0, len - 0.9) * 0.18;
  const rotZ = Math.PI + s * tilt;
  // Klinge = lokale +Y-Achse der Waffe: nach der Drehung zeigt sie (s · sin tilt, −cos tilt)
  return { hx, hy: hy - lift, z: -clear, rotZ, tipX: hx + s * Math.sin(tilt) * len * 0.85, tipY: hy - lift - Math.cos(tilt) * len * 0.85 };
}

/**
 * Erlaubter Bereich angehängter Teile je Socket (Meter im Socket-Raum, Grundfigur): Teile, deren Hülle hinausragt, schweben oder stecken im
 * Körper. Die Grenzen gelten für Hut-Krempen und Kronen (Scheitel), Brillen samt Bügeln (Gesicht), Monokel und Augenklappe samt Band (Auge),
 * Bärte und Ohrring (Kiefer), Rückenwaffen bis 1,3 m (Rücken).
 */
export const SOCKET_BOUNDS: Record<CharacterSocketId, { min: [number, number, number]; max: [number, number, number] }> = {
  headTop: { min: [-0.34, -0.24, -0.34], max: [0.34, 0.34, 0.36] },
  faceFront: { min: [-0.16, -0.09, -0.28], max: [0.16, 0.12, 0.04] },
  eyeLeft: { min: [-0.15, -0.09, -0.24], max: [0.12, 0.1, 0.03] },
  eyeRight: { min: [-0.12, -0.09, -0.24], max: [0.15, 0.1, 0.03] },
  beardJaw: { min: [-0.11, -0.09, -0.12], max: [0.11, 0.12, 0.05] },
  neckScarf: { min: [-0.16, -0.36, -0.12], max: [0.16, 0.08, 0.1] },
  shouldersCoat: { min: [-0.36, -1.3, -0.4], max: [0.36, 0.12, 0.25] },
  backWeapon: { min: [-0.4, -1.3, -0.14], max: [0.42, 0.36, 0.03] },
  hipLeft: { min: [-0.12, -0.5, -0.2], max: [0.2, 0.15, 0.2] },
  hipRight: { min: [-0.2, -0.5, -0.2], max: [0.12, 0.15, 0.2] },
  handMain: { min: [-1.5, -1.5, -1.5], max: [1.5, 1.5, 1.5] },
  handOff: { min: [-1.5, -1.5, -1.5], max: [1.5, 1.5, 1.5] },
};

/** Welcher Socket trägt welches Zubehör (Editor, Prüfungen) */
export const ACCESSORY_SOCKET = {
  hut: 'headTop', krone: 'headTop', helm: 'headTop', stirnband: 'headTop',
  fliegerbrille: 'faceFront', brille: 'faceFront', narbe: 'faceFront',
  monokel: 'eyeRight', augenklappe: 'eyeRight',
  bart: 'beardJaw', ohrring: 'beardJaw',
  schal: 'neckScarf', umhang: 'shouldersCoat', schultermantel: 'shouldersCoat',
  rueckenwaffe: 'backWeapon', laterne: 'hipLeft', waffe: 'handMain', zweitwaffe: 'handOff',
} as const satisfies Record<string, CharacterSocketId>;
