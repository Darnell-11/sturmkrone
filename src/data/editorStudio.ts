// Phase 4.6G – Studio des Charakter-Editors als reine Daten (ohne three.js): Kamera-Fokus, Haltungen und Lichtstimmungen.
// Lichtstimmungen wechseln nur Stärken und Farben – die Zahl der Lichter im Studio bleibt fest (kein Neuübersetzen der Shader).

/** Kamera-Fokus: Nahaufnahme, Kopf samt Hut, Oberkörper samt Mantel, ganze Figur; Beine und Rücken für die Anprobe */
export type StageFocus = 'gesicht' | 'kopf' | 'oberkoerper' | 'ganz' | 'beine' | 'ruecken';
/** Haltung auf dem Drehteller */
export type StagePose = 'hafen' | 'kampf' | 'erwachen';
/** Licht im Studio: helle Hafen-Sonne oder Nacht mit Laterne */
export type StageLight = 'sonne' | 'laterne';

/**
 * Kamera je Fokus: Abstand (Anteil der Ganzkörper-Entfernung), Blickhöhe (fest in m oder relativ zur Augenhöhe `fromHead`), Drehung zur Figur
 * und ob die Kamera dem Kopf nachgeht (Nahaufnahmen).
 */
export const STAGE_FOCUS: Record<StageFocus, { zoom: number; y: number; fromHead: number | null; yaw: number; follow: boolean }> = {
  gesicht: { zoom: 0.19, y: 1.58, fromHead: 0, yaw: 0.3, follow: true },
  kopf: { zoom: 0.27, y: 1.62, fromHead: 0.05, yaw: 0.4, follow: true },
  oberkoerper: { zoom: 0.46, y: 1.25, fromHead: -0.38, yaw: 0.55, follow: false },
  ganz: { zoom: 1, y: 0.95, fromHead: null, yaw: 0.5, follow: false },
  beine: { zoom: 0.52, y: 0.55, fromHead: null, yaw: 0.5, follow: false },
  ruecken: { zoom: 0.62, y: 1.1, fromHead: -0.5, yaw: Math.PI + 0.3, follow: false },
};

/** Lichtstimmungen: [Farbe, Stärke] je Licht, Himmelslicht [oben, unten, Stärke], Laterne, Hintergrund, Kantenlicht der Figur, Boden */
export const STAGE_LIGHTING: Record<StageLight, {
  key: [number, number]; back: [number, number]; fill: [number, number]; hemi: [number, number, number]; lantern: number;
  bgTop: number; bgBottom: number; rim: [number, number]; floor: number;
}> = {
  sonne: { key: [0xfff6e8, 2.5], back: [0xbfe0ff, 1.5], fill: [0xd8e4ff, 0.7], hemi: [0xe6efff, 0x3a3f4a, 1.0], lantern: 0, bgTop: 0x0d1624, bgBottom: 0x4a5568, rim: [0xffe8c8, 0.6], floor: 0x2a303c },
  laterne: { key: [0x9db4ff, 0.55], back: [0x7fa0ff, 1.1], fill: [0x8a9ad8, 0.22], hemi: [0x2a3a66, 0x120e14, 0.4], lantern: 5.5, bgTop: 0x05080f, bgBottom: 0x1a2238, rim: [0xa8c0ff, 0.75], floor: 0x1e2230 },
};
