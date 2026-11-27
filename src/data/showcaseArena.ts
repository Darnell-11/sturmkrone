// Phase 4.91 – Klassen-Vorschau in der echten Welt (rein, ohne three.js; getestet).
//
// Die Vorschau der Charaktererstellung läuft nicht mehr auf einer Studio-Bühne mit vereinfachten Ersatz-Effekten, sondern in der Spielwelt
// mit der echten Kampf-Engine, der Effekt-Schmiede und der 3-Akt-Kino-Regie:
//   An Land – die eigene Figur auf dem Übungsplatz von Ankerglück vor den Übungspuppen.
//   Auf See – die Figur am Steuer des voll aufgetakelten Schiffs auf offener See, ein angewähltes Zielschiff mit zwei Begleitern in rund
//   140 m, eine weite Seegefechts-Kamera zeigt beide Schiffe; Formen, Geistes-Faji und Ultimate schlagen am Zielschiff ein.
// Hier stehen Maße, Kamera und Vorführung; den Ablauf führt `SeaWorld` (`startArena`, `arenaPlay`, `stepArena`, `arenaCamera`).
import { ROMAN } from './classShowcase';

/** 4.92: Anzeige des legendären Ultimates (Kosmos-Krone der Stufe 101, für jede Klasse) */
export const LEGEND_LABEL = 'Himmelssturz – Meteoriten-Kataklysmus';
/** 4.93A: Aufschrift des Vorschau-Knopfs für das Stufe-101-Ultimate */
export const LEGEND_BUTTON = '✦ Legendär (Himmelssturz)';
/** 4.93A: die vier Stufen des Himmelssturzes in Worten (Karte der Klassenvorschau) */
export const LEGEND_STAGES: readonly (readonly [string, string])[] = [
  ['Stufe 1 – Schwerkraft-Umkehr', 'Lila Gravitations-Ringe breiten sich aus, Kiesel und Meerwasser-Tropfen schweben nach oben, der Blick geht steil in den aufreißenden Himmel'],
  ['Stufe 2 – Vorhut-Bombardement', 'Der Himmel färbt sich glutrot-violett: fünf brennende Vorhut-Meteoriten durchschlagen die Wolkendecke und treffen Umgebung bzw. Begleitschiffe'],
  ['Stufe 3 – Der Koloss-Meteorit', 'Ein 45 m großer, tief gefurchter Meteorit rast mit brennender Plasma-Bugwelle herab, die Kamera begleitet den Sturzflug'],
  ['Stufe 4 – Impact-Frame & Kataklysmus', 'Stille, invertierter Manga-Impact-Frame, 120 m hohe Wasser- bzw. Lava-Fontäne, aufgerissener Krater – die getroffenen Kriegsschiffe zerbrechen'],
];
/** 4.93A: Anzeige im Vorschaufenster – vier Phasen der Kino-Endgame-Regie (Stufe-60-Ultimates der Faustkämpfer) bzw. vier Stufen des Himmelssturzes */
export const KINO_PHASE_CHIPS: readonly string[] = ['Phase 1 · Aufbau', 'Phase 2 · Entladung', 'Phase 3 · Einschlag', 'Phase 4 · Nachbeben'];
export const LEGEND_STAGE_CHIPS: readonly string[] = ['Stufe 1 · Schwerkraft-Umkehr', 'Stufe 2 · Vorhut', 'Stufe 3 · Koloss-Meteorit', 'Stufe 4 · Kataklysmus'];

export const ARENA = {
  /** Zielschiff in Peilung querab (Steuerbord) in `targetDist` m, Begleiter in Kiellinie vor und hinter ihm, etwas weiter weg (m) */
  targetDist: 140, escortAlong: 52, escortOut: 16,
  /** Klassen der drei Schiffe (Zielschiff Fregatte, Begleiter Korvetten) und Name */
  tiers: [3, 2, 2] as readonly number[],
  /** neue Zielschiffe nach dem Untergang (s) */
  respawn: 3.5,
  /** freie See für die Vorführung: Mindestabstand zu Inseln (m) und Abstand vom Heimathafen (m) */
  clear: 320, fromHome: 900,
  /** Seegefechts-Kamera: hinter dem eigenen Schiff (× Schiffslänge), seitlich, Höhe; Blick auf den Punkt `lookK` zwischen Ziel und Schiff */
  seaBack: 1.5, seaSide: 0.9, seaUp: 0.85, lookK: 0.55, seaFov: 50,
  /** an Land: Abstand Figur → Puppen (m), Kamera seitlich und hoch (m), Sichtfeld */
  landDist: 5.5, landSide: 7, landUp: 2.4, landFov: 46,
  /** ohne Klick beginnt nach `idle` s die Vorführung (Abstand der Teile in s) */
  idle: 8, demoGap: 4.2,
  /** Ultimate: Erwachen, dann nach `chain` s das Ultimate */
  chain: 0.35,
  /** Standardangriff an Land: Schläge der Kette und ihr Abstand (s) */
  lightHits: 4, lightGap: 0.3,
  /**
   * Handy: decken die Knöpfe unten mehr als `coverMax` der Fensterhöhe ab, zielt die Kamera in den freien Teil darüber (mindestens
   * `freeMin` px hoch, `playGap` px Luft über den Knöpfen) – sonst stünde das eigene Schiff bzw. die Figur hinter den Knöpfen
   */
  coverMax: 0.25, freeMin: 70, playGap: 6,
} as const;

/** 4.91: Höhe des Vorschaufensters, in die die Kamera zielt (Fenster oben `top`, Höhe `height`, Oberkante der Knopfleiste `playTop`; px) */
export function freeWindowHeight(top: number, height: number, playTop: number): number {
  if (!(height > 0) || !Number.isFinite(playTop)) return height;
  const covered = top + height - playTop, free = playTop - top - ARENA.playGap;
  return covered > height * ARENA.coverMax && free >= ARENA.freeMin ? free : height;
}

/** 4.92: `legend` = das legendäre Ultimate der Stufe 101 (Himmelssturz: Meteoriten-Kataklysmus) – in der Vorschau für jede Klasse */
export type ArenaKind = 'attack' | 'form' | 'ult' | 'geist' | 'legend';
/** Anzeige im Vorschaufenster: läuft gerade nichts, die Kombo (Standardangriff), eine Form bzw. ein Geistes-Faji oder das Ultimate */
export type ArenaPhase = 'idle' | 'combo' | 'form' | 'ult' | 'legend' | 'rest';
export interface ArenaPart { kind: ArenaKind; slot: number }

/** Vorführung ohne Klick: Standardangriff, Formen I, V und X, Ultimate */
export const ARENA_DEMO: readonly ArenaPart[] = [
  { kind: 'attack', slot: 0 }, { kind: 'form', slot: 1 }, { kind: 'form', slot: 5 }, { kind: 'form', slot: 10 }, { kind: 'ult', slot: 0 },
];

export interface ArenaShipSpot { x: number; z: number; heading: number; tier: number; target: boolean }

/** Lage der drei Gegnerschiffe zum eigenen Schiff (Ort, Kurs): Zielschiff querab an Steuerbord, Begleiter vor und hinter ihm */
export function arenaTargets(sx: number, sz: number, heading: number): ArenaShipSpot[] {
  const fx = Math.sin(heading), fz = Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
  const d = ARENA.targetDist, out = d + ARENA.escortOut, al = ARENA.escortAlong;
  return [
    { x: sx + rx * d, z: sz + rz * d, heading, tier: ARENA.tiers[0], target: true },
    { x: sx + rx * out + fx * al, z: sz + rz * out + fz * al, heading, tier: ARENA.tiers[1], target: false },
    { x: sx + rx * out - fx * al, z: sz + rz * out - fz * al, heading, tier: ARENA.tiers[2], target: false },
  ];
}

export interface ArenaCam { px: number; py: number; pz: number; lx: number; ly: number; lz: number; fov: number }

/** Hochformat: die Kamera rückt weiter weg, damit beide Schiffe bzw. Figur und Puppen ins schmale Fenster passen */
export function aspectPull(aspect: number): number {
  return Math.min(2, Math.max(1, 1.1 / Math.max(0.3, Number.isFinite(aspect) ? aspect : 1)));
}

/**
 * Weite Seegefechts-Kamera: hinter und neben dem eigenen Schiff (gegenüber dem Ziel) und darüber, Blick auf einen Punkt zwischen Schiff und
 * Ziel – das eigene Schiff mit der Figur am Steuer vorn, das Zielschiff samt Begleitern dahinter, beide ganz im Bild.
 */
export function seaCameraPose(sx: number, sz: number, L: number, tx: number, tz: number, aspect: number, out: ArenaCam): ArenaCam {
  const dx = tx - sx, dz = tz - sz, d = Math.hypot(dx, dz) || 1;
  const ux = dx / d, uz = dz / d, nx = uz, nz = -ux;
  const k = aspectPull(aspect), back = L * ARENA.seaBack * k, side = L * ARENA.seaSide * k;
  out.px = sx - ux * back + nx * side;
  out.pz = sz - uz * back + nz * side;
  out.py = Math.max(14, L * ARENA.seaUp * k);
  out.lx = sx + dx * ARENA.lookK; out.lz = sz + dz * ARENA.lookK; out.ly = 4;
  out.fov = ARENA.seaFov;
  return out;
}

/** Kamera an Land: seitlich der Linie Figur → Puppen, etwas erhöht, Blick auf die Mitte */
export function landCameraPose(fx: number, fy: number, fz: number, dx: number, dz: number, aspect: number, out: ArenaCam): ArenaCam {
  const d = Math.hypot(dx - fx, dz - fz) || 1;
  const ux = (dx - fx) / d, uz = (dz - fz) / d, nx = -uz, nz = ux;
  const mx = (fx + dx) / 2, mz = (fz + dz) / 2, k = aspectPull(aspect);
  out.px = mx + nx * ARENA.landSide * k; out.pz = mz + nz * ARENA.landSide * k; out.py = fy + ARENA.landUp * Math.sqrt(k);
  out.lx = mx; out.lz = mz; out.ly = fy + 1.15;
  out.fov = ARENA.landFov;
  return out;
}


/** Anzeige des laufenden Vorschau-Teils */
export function arenaLabel(p: ArenaPart, formName = '', ultName = '', sea = false): string {
  switch (p.kind) {
    case 'attack': return sea ? 'Standardangriff: Breitseite' : 'Standardangriff: Kampf-Kombo';
    case 'form': return `Form ${ROMAN[Math.max(0, Math.min(9, p.slot - 1))]}${formName ? `: ${formName}` : ''}${sea ? ' (auf See)' : ''}`;
    case 'geist': return `Geistes-Faji ${p.slot}${sea ? ' (am Steuer)' : ''}`;
    case 'legend': return `Legendär · Stufe 101: ${LEGEND_LABEL}${sea ? ' (vom Steuer)' : ''}`;
    default: return `Level-60-Ultimate${ultName ? `: ${ultName}` : ''}${sea ? ' (vom Steuer)' : ''}`;
  }
}
