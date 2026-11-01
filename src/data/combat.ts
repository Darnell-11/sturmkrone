// Kampfwerte. Alles hier ist Balancing – im Code steht nur die Logik.
import type { NpcRole } from './characterParts';
import type { StyleId } from './animations';

export type FxKind = 'slash' | 'punch' | 'heavy' | 'magic' | 'spin' | 'stab';

export interface AttackDef {
  clip: string;
  speed: number;
  /** Trefferfenster als Anteil der Animation (0 … 1) */
  hitStart: number;
  hitEnd: number;
  /** Reichweite in Metern und Öffnungswinkel (Bogenmaß, Gesamtbreite) */
  range: number;
  arc: number;
  /** Schadens-Multiplikator auf den Grundangriff */
  dmg: number;
  /** Druck auf die Haltung (Poise) */
  poise: number;
  /** Rückstoß in m/s; launch = Gegner in die Luft (Luftkombos) */
  knock: number;
  launch?: number;
  /** Trefferpause in Sekunden und Kamerawackeln */
  hitstop: number;
  shake: number;
  fx: FxKind;
  /** Schritt nach vorn während des Angriffs (m/s) */
  lunge?: number;
  /** Fernangriff: Geschoss statt Nahkampf */
  projectile?: { speed: number; radius: number; color: string; pierce?: boolean };
  /** Schmier-Bogen: Neigung der Ebene (0 = waagrecht, π/2 = senkrecht) */
  smearTilt?: number;
}

const A = (o: Partial<AttackDef> & Pick<AttackDef, 'clip'>): AttackDef => ({
  speed: 1, hitStart: 0.3, hitEnd: 0.5, range: 2.2, arc: 2.2, dmg: 1, poise: 10, knock: 3, hitstop: 0.06, shake: 0.15, fx: 'slash', lunge: 2, ...o,
});

export interface StyleAttacks { combo: AttackDef[]; heavy: AttackDef; charge: AttackDef }

export const STYLE_ATTACKS: Record<StyleId, StyleAttacks> = {
  faust: {
    combo: [
      A({ clip: 'Melee_Unarmed_Attack_Punch_A', speed: 1.6, hitStart: 0.25, hitEnd: 0.45, range: 1.8, arc: 1.6, dmg: 0.7, poise: 8, knock: 1.5, fx: 'punch', hitstop: 0.045 }),
      A({ clip: 'Melee_Unarmed_Attack_Punch_A', speed: 1.8, hitStart: 0.25, hitEnd: 0.45, range: 1.8, arc: 1.6, dmg: 0.75, poise: 9, knock: 1.5, fx: 'punch', hitstop: 0.045 }),
      A({ clip: 'Melee_Unarmed_Attack_Kick', speed: 1.4, hitStart: 0.3, hitEnd: 0.5, range: 2.1, arc: 1.8, dmg: 1.0, poise: 14, knock: 2, launch: 7, fx: 'heavy', hitstop: 0.08, shake: 0.25 }),
      A({ clip: 'Melee_2H_Attack_Spinning', speed: 1.1, hitStart: 0.15, hitEnd: 0.8, range: 2.3, arc: 6.3, dmg: 0.9, poise: 12, knock: 6, fx: 'spin', hitstop: 0.06, shake: 0.2, lunge: 1 }),
    ],
    heavy: A({ clip: 'Melee_1H_Attack_Jump_Chop', speed: 1.25, hitStart: 0.45, hitEnd: 0.62, range: 2.6, arc: 3.2, dmg: 2.0, poise: 35, knock: 8, fx: 'heavy', hitstop: 0.13, shake: 0.6, lunge: 4 }),
    charge: A({ clip: 'Ranged_Magic_Raise', speed: 1.3, hitStart: 0.5, hitEnd: 0.65, range: 4.5, arc: 6.3, dmg: 2.4, poise: 50, knock: 12, launch: 6, fx: 'heavy', hitstop: 0.15, shake: 0.8, lunge: 0 }),
  },
  saebel: {
    combo: [
      A({ clip: 'Melee_1H_Attack_Slice_Diagonal', speed: 1.55, hitStart: 0.3, hitEnd: 0.5, range: 2.4, arc: 2.4, dmg: 0.9, poise: 10, smearTilt: 0.6 }),
      A({ clip: 'Melee_1H_Attack_Slice_Horizontal', speed: 1.65, hitStart: 0.3, hitEnd: 0.52, range: 2.5, arc: 2.8, dmg: 0.95, poise: 10, smearTilt: 0 }),
      A({ clip: 'Melee_1H_Attack_Stab', speed: 1.7, hitStart: 0.35, hitEnd: 0.5, range: 2.9, arc: 0.9, dmg: 1.4, poise: 18, knock: 5, fx: 'stab', hitstop: 0.09, shake: 0.3, lunge: 4 }),
    ],
    heavy: A({ clip: 'Melee_1H_Attack_Jump_Chop', speed: 1.2, hitStart: 0.45, hitEnd: 0.62, range: 2.8, arc: 2.2, dmg: 2.1, poise: 35, knock: 7, fx: 'heavy', hitstop: 0.13, shake: 0.6, lunge: 4, smearTilt: 1.5 }),
    charge: A({ clip: 'Melee_2H_Attack_Spin', speed: 1.4, hitStart: 0.2, hitEnd: 0.75, range: 3.0, arc: 6.3, dmg: 2.2, poise: 30, knock: 9, fx: 'spin', hitstop: 0.08, shake: 0.4, smearTilt: 0 }),
  },
  langklinge: {
    combo: [
      A({ clip: 'Melee_1H_Attack_Slice_Horizontal', speed: 1.4, hitStart: 0.3, hitEnd: 0.52, range: 3.0, arc: 2.8, dmg: 1.0, poise: 12, smearTilt: 0 }),
      A({ clip: 'Melee_1H_Attack_Chop', speed: 1.4, hitStart: 0.32, hitEnd: 0.5, range: 3.0, arc: 1.6, dmg: 1.05, poise: 14, smearTilt: 1.4 }),
      A({ clip: 'Melee_2H_Attack_Slice', speed: 1.4, hitStart: 0.3, hitEnd: 0.5, range: 3.1, arc: 2.8, dmg: 1.1, poise: 14, smearTilt: 0.3 }),
      A({ clip: 'Melee_2H_Attack_Stab', speed: 1.6, hitStart: 0.35, hitEnd: 0.5, range: 3.6, arc: 0.8, dmg: 1.6, poise: 22, knock: 6, fx: 'stab', hitstop: 0.1, shake: 0.35, lunge: 5 }),
    ],
    heavy: A({ clip: 'Melee_2H_Attack_Chop', speed: 1.2, hitStart: 0.42, hitEnd: 0.58, range: 3.4, arc: 1.8, dmg: 2.2, poise: 38, knock: 7, fx: 'heavy', hitstop: 0.13, shake: 0.6, smearTilt: 1.5 }),
    charge: A({ clip: 'Melee_2H_Attack_Spin', speed: 1.3, hitStart: 0.2, hitEnd: 0.75, range: 3.6, arc: 6.3, dmg: 2.3, poise: 32, knock: 9, fx: 'spin', hitstop: 0.08, shake: 0.4, smearTilt: 0 }),
  },
  zweihaender: {
    combo: [
      A({ clip: 'Melee_2H_Attack_Slice', speed: 1.15, hitStart: 0.32, hitEnd: 0.55, range: 3.2, arc: 3.0, dmg: 1.5, poise: 22, knock: 5, hitstop: 0.09, shake: 0.3, smearTilt: 0.2 }),
      A({ clip: 'Melee_2H_Attack_Chop', speed: 1.15, hitStart: 0.38, hitEnd: 0.55, range: 3.2, arc: 1.8, dmg: 1.7, poise: 28, knock: 6, fx: 'heavy', hitstop: 0.11, shake: 0.45, smearTilt: 1.5 }),
      A({ clip: 'Melee_2H_Attack_Spin', speed: 1.3, hitStart: 0.2, hitEnd: 0.75, range: 3.4, arc: 6.3, dmg: 1.6, poise: 26, knock: 9, fx: 'spin', hitstop: 0.08, shake: 0.4, smearTilt: 0 }),
    ],
    heavy: A({ clip: 'Melee_2H_Attack_Chop', speed: 0.95, hitStart: 0.42, hitEnd: 0.58, range: 3.6, arc: 2.2, dmg: 3.0, poise: 60, knock: 10, fx: 'heavy', hitstop: 0.16, shake: 0.9, smearTilt: 1.5 }),
    charge: A({ clip: 'Melee_2H_Attack_Spinning', speed: 0.9, hitStart: 0.05, hitEnd: 0.95, range: 3.5, arc: 6.3, dmg: 1.1, poise: 18, knock: 5, fx: 'spin', hitstop: 0.04, shake: 0.2, smearTilt: 0 }),
  },
  doppel: {
    combo: [
      A({ clip: 'Melee_Dualwield_Attack_Slice', speed: 1.6, hitStart: 0.25, hitEnd: 0.55, range: 2.3, arc: 2.8, dmg: 0.75, poise: 8, smearTilt: 0.2 }),
      A({ clip: 'Melee_Dualwield_Attack_Chop', speed: 1.6, hitStart: 0.3, hitEnd: 0.55, range: 2.3, arc: 2.0, dmg: 0.8, poise: 9, smearTilt: 1.3 }),
      A({ clip: 'Melee_Dualwield_Attack_Stab', speed: 1.8, hitStart: 0.3, hitEnd: 0.5, range: 2.7, arc: 1.0, dmg: 1.0, poise: 12, knock: 4, fx: 'stab', lunge: 4 }),
      A({ clip: 'Melee_2H_Attack_Spinning', speed: 1.3, hitStart: 0.1, hitEnd: 0.85, range: 2.6, arc: 6.3, dmg: 0.9, poise: 10, knock: 6, fx: 'spin', smearTilt: 0 }),
    ],
    heavy: A({ clip: 'Melee_2H_Attack_Spin', speed: 1.4, hitStart: 0.2, hitEnd: 0.75, range: 2.9, arc: 6.3, dmg: 1.9, poise: 26, knock: 8, fx: 'spin', hitstop: 0.09, shake: 0.4, smearTilt: 0 }),
    charge: A({ clip: 'Melee_2H_Attack_Spinning', speed: 1.0, hitStart: 0.05, hitEnd: 0.95, range: 2.8, arc: 6.3, dmg: 1.0, poise: 12, knock: 4, fx: 'spin', smearTilt: 0 }),
  },
  effekt: {
    combo: [
      A({ clip: 'Ranged_Magic_Shoot', speed: 1.45, hitStart: 0.35, hitEnd: 0.36, range: 22, arc: 0.3, dmg: 0.9, poise: 8, knock: 2, fx: 'magic', lunge: 0, projectile: { speed: 28, radius: 0.6, color: '#C77DFF' } }),
      A({ clip: 'Ranged_Magic_Spellcasting', speed: 1.25, hitStart: 0.4, hitEnd: 0.41, range: 22, arc: 0.3, dmg: 0.9, poise: 8, knock: 2, fx: 'magic', lunge: 0, projectile: { speed: 28, radius: 0.6, color: '#9F7DFF' } }),
      A({ clip: 'Ranged_Magic_Shoot', speed: 1.6, hitStart: 0.35, hitEnd: 0.36, range: 24, arc: 0.3, dmg: 1.3, poise: 14, knock: 5, fx: 'magic', lunge: 0, projectile: { speed: 34, radius: 0.9, color: '#E0A0FF', pierce: true } }),
    ],
    heavy: A({ clip: 'Ranged_Magic_Raise', speed: 1.4, hitStart: 0.5, hitEnd: 0.62, range: 5, arc: 6.3, dmg: 2.0, poise: 40, knock: 10, launch: 5, fx: 'magic', hitstop: 0.12, shake: 0.6, lunge: 0 }),
    charge: A({ clip: 'Ranged_Magic_Shoot', speed: 1.0, hitStart: 0.35, hitEnd: 0.36, range: 30, arc: 0.3, dmg: 3.2, poise: 50, knock: 10, fx: 'magic', hitstop: 0.14, shake: 0.6, lunge: 0, projectile: { speed: 40, radius: 1.6, color: '#FF8AFF', pierce: true } }),
  },
};

/** Grundwerte der Spielfigur (aus 1.0) */
export const PLAYER_BASE = {
  hp: (lvl: number) => 100 + (lvl - 1) * 14,
  atk: (lvl: number) => 12 + (lvl - 1) * 2.4,
  xpNeed: (lvl: number) => 60 + lvl * 45,
  /** Unverwundbarkeit während der Rolle (s) */
  rollIframes: 0.32,
  /** Zeitfenster für die perfekte Parade nach Drücken von Blocken (s) */
  parryWindow: 0.22,
  blockReduce: 0.7,
};

export type EnemyKind = 'matrose' | 'schildtraeger' | 'musketier' | 'schlaeger' | 'fajiwirker' | 'hauptmann' | 'legende';

export interface EnemyAttack {
  clip: string;
  speed: number;
  /** Ausholen (Warnzeichen) vor dem Treffer in Sekunden */
  windup: number;
  hitAt: number;
  range: number;
  arc: number;
  dmg: number;
  knock: number;
  /** Fernangriff */
  projectile?: { speed: number; radius: number; color: string };
  /** Flächenangriff (Kreis am Boden) */
  aoe?: { radius: number; delay: number };
  fx: FxKind;
}

export interface EnemyDef {
  label: string;
  hp: number;
  dmg: number;
  poise: number;
  speed: number;
  /** Bevorzugter Abstand zum Spieler */
  keep: number;
  radius: number;
  scale: number;
  role: NpcRole;
  weapon: StyleId | 'muskete' | 'schild';
  attacks: EnemyAttack[];
  /** Blockt Angriffe von vorn (außer schweren) */
  frontBlock?: boolean;
  xp: number;
  gold: [number, number];
  elite?: boolean;
  boss?: boolean;
}

const EA = (o: Partial<EnemyAttack> & Pick<EnemyAttack, 'clip'>): EnemyAttack => ({
  speed: 1, windup: 0.45, hitAt: 0.42, range: 2.2, arc: 1.8, dmg: 1, knock: 4, fx: 'slash', ...o,
});

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  matrose: {
    label: 'Matrose', hp: 55, dmg: 8, poise: 18, speed: 3.6, keep: 1.6, radius: 0.45, scale: 1, role: 'pirat', weapon: 'saebel', xp: 14, gold: [4, 10],
    attacks: [EA({ clip: 'Melee_1H_Attack_Slice_Diagonal', speed: 1.1 }), EA({ clip: 'Melee_1H_Attack_Slice_Horizontal', speed: 1.1, arc: 2.4 })],
  },
  schildtraeger: {
    label: 'Schildträger', hp: 85, dmg: 9, poise: 45, speed: 2.8, keep: 1.6, radius: 0.55, scale: 1.05, role: 'pirat', weapon: 'schild', frontBlock: true, xp: 22, gold: [6, 14],
    attacks: [EA({ clip: 'Melee_Block_Attack', speed: 1.0, windup: 0.5, range: 2.0, knock: 7, fx: 'heavy' }), EA({ clip: 'Melee_1H_Attack_Chop', speed: 1.0 })],
  },
  musketier: {
    label: 'Musketier', hp: 45, dmg: 12, poise: 15, speed: 3.2, keep: 11, radius: 0.45, scale: 1, role: 'pirat', weapon: 'muskete', xp: 18, gold: [6, 12],
    attacks: [EA({ clip: 'Ranged_2H_Shoot', speed: 1, windup: 1.0, hitAt: 0.1, range: 26, arc: 0.4, projectile: { speed: 36, radius: 0.3, color: '#FFD08A' }, fx: 'punch' })],
  },
  schlaeger: {
    label: 'Schläger', hp: 170, dmg: 18, poise: 90, speed: 2.6, keep: 2.2, radius: 0.75, scale: 1.3, role: 'wirt', weapon: 'faust', xp: 40, gold: [10, 22],
    attacks: [
      EA({ clip: 'Melee_2H_Attack_Chop', speed: 0.85, windup: 0.8, hitAt: 0.5, range: 3.0, arc: 2.0, knock: 9, fx: 'heavy', aoe: { radius: 3.2, delay: 0 } }),
      EA({ clip: 'Melee_Unarmed_Attack_Punch_A', speed: 1.1, windup: 0.4, range: 2.4, knock: 6, fx: 'punch' }),
    ],
  },
  fajiwirker: {
    label: 'Faji-Wirker', hp: 60, dmg: 11, poise: 20, speed: 3.0, keep: 9, radius: 0.45, scale: 1, role: 'buerger', weapon: 'effekt', xp: 26, gold: [8, 16],
    attacks: [
      EA({ clip: 'Ranged_Magic_Shoot', speed: 1, windup: 0.7, hitAt: 0.35, range: 22, arc: 0.4, projectile: { speed: 18, radius: 0.55, color: '#7FD6FF' }, fx: 'magic' }),
      EA({ clip: 'Ranged_Magic_Raise', speed: 1.1, windup: 0.6, hitAt: 0.5, range: 16, arc: 6.3, aoe: { radius: 3.5, delay: 1.1 }, knock: 6, fx: 'magic' }),
    ],
  },
  hauptmann: {
    label: 'Hauptmann', hp: 240, dmg: 14, poise: 70, speed: 3.8, keep: 1.8, radius: 0.55, scale: 1.12, role: 'haendler', weapon: 'langklinge', elite: true, xp: 70, gold: [30, 60],
    attacks: [
      EA({ clip: 'Melee_2H_Attack_Slice', speed: 1.15, windup: 0.4, range: 3.0, arc: 2.6 }),
      EA({ clip: 'Melee_2H_Attack_Stab', speed: 1.2, windup: 0.55, range: 3.4, arc: 0.8, knock: 6, fx: 'stab' }),
      EA({ clip: 'Melee_2H_Attack_Spin', speed: 1.2, windup: 0.6, range: 3.2, arc: 6.3, knock: 8, fx: 'spin' }),
    ],
  },
  legende: {
    label: 'Legende', hp: 900, dmg: 18, poise: 160, speed: 4.2, keep: 2.0, radius: 0.65, scale: 1.2, role: 'offizier', weapon: 'zweihaender', elite: true, boss: true, xp: 400, gold: [250, 400],
    attacks: [
      EA({ clip: 'Melee_2H_Attack_Slice', speed: 1.2, windup: 0.4, range: 3.4, arc: 2.8 }),
      EA({ clip: 'Melee_2H_Attack_Chop', speed: 1.0, windup: 0.7, hitAt: 0.5, range: 3.6, arc: 2.0, knock: 10, fx: 'heavy', aoe: { radius: 4, delay: 0 } }),
      EA({ clip: 'Melee_2H_Attack_Spin', speed: 1.3, windup: 0.6, range: 3.6, arc: 6.3, knock: 9, fx: 'spin' }),
      EA({ clip: 'Ranged_Magic_Raise', speed: 1.2, windup: 0.8, hitAt: 0.5, range: 22, arc: 6.3, aoe: { radius: 5, delay: 1.2 }, knock: 10, fx: 'magic' }),
    ],
  },
};

/** Gegnerwerte wachsen mit der Stufe */
export const enemyScale = (lvl: number) => ({ hp: 1 + 0.28 * (lvl - 1), dmg: 1 + 0.16 * (lvl - 1) });
