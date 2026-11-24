// Rammsporn und Deck-Drehbassen: reine Regeln ohne three.js (JSON-tauglich, testbar, ein Server kann sie ebenso rechnen). Die Zahlen stehen in
// data/balanceConfig.ts (`RAM`, `SWIVEL`), die Ausbaustufen in data/shipEvolution.ts; `NavalSystem` ruft die Regeln je Bild auf.
import { RAM, RAM_MIN_TIER, SWIVEL, SWIVEL_MIN_TIER } from '../data/balanceConfig';
import type { AmmoDef } from '../data/ships';

/** Schadensart des Aufpralls (für `applyDamage`): voller Rumpf, etwas Tuch, kräftiger Crew-Schock */
export const RAM_AMMO: AmmoDef = { n: 'Rammstoß', d: 'Aufprall mit dem Bug', hull: 1, sail: 0.15, crew: RAM.crewK, fire: 0, range: 1, speed: 1, color: '#6A5A4A' };

/** Lage und Bewegung eines Schiffs für die Kollision (Meter, Bogenmaß, m/s); `course` = Fahrtrichtung (folgt dem Bug mit Verzögerung) */
export interface Kin { x: number; z: number; heading: number; course: number; speed: number; L: number; W: number }

export interface RamContact {
  /** Bug des Angreifers trifft den Rumpf des Ziels, im Kegel, schnell genug */
  hit: boolean;
  /** Skalarprodukt Bugrichtung / Richtung zum Ziel */
  dot: number;
  /** Annäherungsgeschwindigkeit entlang des Bugs (m/s) */
  relSpeed: number;
  /** Eigene Fahrt des Angreifers entlang seines Bugs (m/s): wer stillsteht, rammt nicht, auch wenn ein anderer auf ihn zufährt */
  ownSpeed: number;
  /** Treffpunkt (Bugspitze) in Weltkoordinaten */
  x: number;
  z: number;
}

/**
 * Bug-Kegel-Kollision: der Angreifer rammt, wenn (1) das Ziel im Kegel vor seinem Bug liegt (`dot(Bug, Richtung zum Ziel) > RAM.cone`),
 * (2) seine Bugspitze in der Hüllkurve des Ziels (Ellipse aus Länge und Breite, +1 m) liegt und (3) die Annäherung entlang des Bugs über
 * `RAM.minSpeed` liegt und (4) der Angreifer selbst mindestens die halbe Mindestgeschwindigkeit fährt (ein stehendes Schiff rammt nicht, nur weil ein anderes auf es zufährt).
 */
export function ramContact(a: Kin, b: Kin): RamContact {
  const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-6;
  const dot = (fx * dx + fz * dz) / d;
  const bx = a.x + fx * a.L * 0.5, bz = a.z + fz * a.L * 0.5;
  // Bugspitze in den Achsen des Ziels
  const tfx = Math.sin(b.heading), tfz = Math.cos(b.heading);
  const ex = bx - b.x, ez = bz - b.z;
  const along = ex * tfx + ez * tfz, across = ex * tfz - ez * tfx;
  const inside = (along / (b.L * 0.5 + 1)) ** 2 + (across / (b.W * 0.5 + 1)) ** 2 <= 1;
  const vax = Math.sin(a.course) * a.speed, vaz = Math.cos(a.course) * a.speed;
  const vbx = Math.sin(b.course) * b.speed, vbz = Math.cos(b.course) * b.speed;
  const relSpeed = (vax - vbx) * fx + (vaz - vbz) * fz;
  const ownSpeed = vax * fx + vaz * fz;
  return { hit: dot > RAM.cone && inside && relSpeed > RAM.minSpeed && ownSpeed > RAM.minSpeed * 0.5, dot, relSpeed, ownSpeed, x: bx, z: bz };
}

export interface RamDamage {
  /** Rumpfschaden-Basis am Ziel (vor Panzerung) und am Angreifer (Eigenschaden, ohne Panzerung) */
  target: number;
  self: number;
  /** Durchschlag gegen die Rumpf-Panzerung des Ziels: Stufe 5 `Infinity` (panzerbrechend), Stufe 4 `RAM.penTier`, ohne Rammsporn 1 */
  pen: number;
  /** Hat der Angreifer einen Rammsporn (Rumpf-Stufe ≥ 4)? */
  ram: boolean;
}

/**
 * Schaden eines Aufpralls. Basis = Rumpfpunkte des Angreifers · min(RAM.maxK, RAM.dmgPerHp · (relSpeed − minSpeed)): schwere Schiffe rammen härter,
 * schnelle Annäherung wirkt stärker. Mit Rammsporn (Stufe ≥ 4) trifft das Ziel die volle Basis und der Rammer nimmt nur `RAM.selfRam` davon (−70 % gegen
 * einen Rammer ohne Sporn); ohne Sporn ist es nur ein Streifstoß (`RAM.glancing`) und das eigene Schiff leidet `RAM.selfPlain`.
 */
export function ramDamage(relSpeed: number, attackerMaxHull: number, hullTier: number): RamDamage {
  const over = Math.max(0, relSpeed - RAM.minSpeed);
  const base = attackerMaxHull * Math.min(RAM.maxK, RAM.dmgPerHp * over);
  const ram = hullTier >= RAM_MIN_TIER;
  return {
    target: ram ? base : base * RAM.glancing,
    self: base * (ram ? RAM.selfRam : RAM.selfPlain),
    pen: ram ? (hullTier >= RAM.pierceTier ? Infinity : RAM.penTier) : 1,
    ram,
  };
}

/** Tempo nach dem Stoß: der Rammer verliert viel Fahrt, das Ziel etwas */
export const ramSlow = (ram: boolean) => ({ rammer: RAM.rammerSlow, target: RAM.targetSlow, ram });

// ---------- Deck-Drehbassen ----------

/** Gibt es Drehbassen? (Kanonen-Stufe ≥ 4) */
export const hasSwivels = (cannonTier: number): boolean => cannonTier >= SWIVEL_MIN_TIER;
/** Pause zwischen zwei Salven (s): Stufe 5 etwas schneller */
export const swivelCooldown = (cannonTier: number): number => SWIVEL.cooldown[cannonTier >= 5 ? 1 : 0];
/** Kartätschen-Basisschaden einer Salve aus dem Kugelschaden der Kanonen */
export const swivelDamage = (cannonDmg: number): number => cannonDmg * SWIVEL.dmgK;

/**
 * Das nächste Ziel in Reichweite (`SWIVEL.range` = 45 m) oder −1. Drehbassen drehen sich frei: jeder Winkel zählt, entscheidend ist der Abstand der
 * Hüllen (Näherung: Mittelpunktabstand minus ein Viertel der Längensumme, mindestens 0).
 */
export function swivelTarget(me: { x: number; z: number; L: number }, foes: readonly { x: number; z: number; L: number }[]): number {
  let best = -1, bd: number = SWIVEL.range;
  for (let i = 0; i < foes.length; i++) {
    const f = foes[i];
    const d = Math.max(0, Math.hypot(f.x - me.x, f.z - me.z) - (me.L + f.L) * 0.25);
    if (d <= bd) { bd = d; best = i; }
  }
  return best;
}
