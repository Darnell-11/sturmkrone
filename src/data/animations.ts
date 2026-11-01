// Zuordnung von Spielaktionen zu KayKit-Animationen (Clip-Namen aus den Rig_Medium-Dateien).

export const ANIM_FILES = [
  'Rig_Medium_General', 'Rig_Medium_MovementBasic', 'Rig_Medium_MovementAdvanced', 'Rig_Medium_CombatMelee',
  'Rig_Medium_CombatRanged', 'Rig_Medium_Simulation', 'Rig_Medium_Tools', 'Rig_Medium_Special',
] as const;

export interface ClipRef {
  clip: string;
  loop?: boolean;
  /** Abspielgeschwindigkeit */
  speed?: number;
}

export const ROLES = {
  idle: { clip: 'Idle_A', loop: true },
  idleLong: { clip: 'Idle_B', loop: true },
  walk: { clip: 'Walking_A', loop: true },
  run: { clip: 'Running_A', loop: true, speed: 1.05 },
  sprint: { clip: 'Running_B', loop: true, speed: 1.15 },
  roll: { clip: 'Dodge_Forward', loop: false, speed: 0.8 },
  dodgeBack: { clip: 'Dodge_Backward', loop: false, speed: 0.8 },
  jump: { clip: 'Jump_Full_Short', loop: false },
  hit: { clip: 'Hit_A', loop: false, speed: 1.2 },
  hitHeavy: { clip: 'Hit_B', loop: false },
  stun: { clip: 'Hit_B', loop: true, speed: 0.6 },
  death: { clip: 'Death_A', loop: false },
  deathLong: { clip: 'Death_B', loop: false },
  cheer: { clip: 'Cheering', loop: true },
  wave: { clip: 'Waving', loop: false },
  sit: { clip: 'Sit_Chair_Idle', loop: true },
  sitFloor: { clip: 'Sit_Floor_Idle', loop: true },
  lie: { clip: 'Lie_Idle', loop: true },
  steer: { clip: 'Holding_B', loop: true },
  talk: { clip: 'Interact', loop: false },
  interact: { clip: 'Interact', loop: false },
  pickup: { clip: 'PickUp', loop: false },
  throw: { clip: 'Throw', loop: false },
  block: { clip: 'Melee_Blocking', loop: true },
  blockHit: { clip: 'Melee_Block_Hit', loop: false },
  parry: { clip: 'Melee_Block_Attack', loop: false, speed: 1.3 },
  work: { clip: 'Working_A', loop: true },
  hammer: { clip: 'Hammering', loop: true },
  fishIdle: { clip: 'Fishing_Idle', loop: true },
  fishCast: { clip: 'Fishing_Cast', loop: false },
  fishReel: { clip: 'Fishing_Reeling', loop: true },
  fishCatch: { clip: 'Fishing_Catch', loop: false },
  lockpick: { clip: 'Lockpicking', loop: true },
  pushups: { clip: 'Push_Ups', loop: true },
  spawn: { clip: 'Spawn_Ground', loop: false },
  taunt: { clip: 'Skeletons_Taunt', loop: false },
  skeletonWalk: { clip: 'Skeletons_Walking', loop: true },
  skeletonIdle: { clip: 'Skeletons_Idle', loop: true },
  castLong: { clip: 'Ranged_Magic_Spellcasting_Long', loop: true },
  summon: { clip: 'Ranged_Magic_Summon', loop: false, speed: 1.6 },
  raise: { clip: 'Ranged_Magic_Raise', loop: false, speed: 1.3 },
  shoot: { clip: 'Ranged_1H_Shoot', loop: false },
  aim: { clip: 'Ranged_1H_Aiming', loop: true },
  reload: { clip: 'Ranged_1H_Reload', loop: false },
} satisfies Record<string, ClipRef>;

export type AnimRole = keyof typeof ROLES;

export type StyleId = 'faust' | 'saebel' | 'langklinge' | 'zweihaender' | 'doppel' | 'effekt';

export interface StyleAnims {
  label: string;
  idle: ClipRef;
  /** Leichte Kombo (der Reihe nach) */
  combo: ClipRef[];
  /** Schwerer Angriff */
  heavy: ClipRef;
  /** Aufladeangriff (gedrückt halten) */
  charge: ClipRef;
}

export const STYLE_ANIMS: Record<StyleId, StyleAnims> = {
  faust: {
    label: 'Faustkampf',
    idle: { clip: 'Melee_Unarmed_Idle', loop: true },
    combo: [{ clip: 'Melee_Unarmed_Attack_Punch_A', speed: 1.5 }, { clip: 'Melee_Unarmed_Attack_Punch_A', speed: 1.7 }, { clip: 'Melee_Unarmed_Attack_Kick', speed: 1.35 }, { clip: 'Melee_2H_Attack_Spinning', speed: 1.1 }],
    heavy: { clip: 'Melee_1H_Attack_Jump_Chop', speed: 1.2 },
    charge: { clip: 'Ranged_Magic_Raise', speed: 1.2 },
  },
  saebel: {
    label: 'Säbel',
    idle: { clip: 'Idle_A', loop: true },
    combo: [{ clip: 'Melee_1H_Attack_Slice_Diagonal', speed: 1.5 }, { clip: 'Melee_1H_Attack_Slice_Horizontal', speed: 1.6 }, { clip: 'Melee_1H_Attack_Stab', speed: 1.7 }],
    heavy: { clip: 'Melee_1H_Attack_Jump_Chop', speed: 1.2 },
    charge: { clip: 'Melee_2H_Attack_Spin', speed: 1.4 },
  },
  langklinge: {
    label: 'Langklinge',
    idle: { clip: 'Melee_2H_Idle', loop: true },
    combo: [{ clip: 'Melee_1H_Attack_Slice_Horizontal', speed: 1.4 }, { clip: 'Melee_1H_Attack_Chop', speed: 1.4 }, { clip: 'Melee_2H_Attack_Slice', speed: 1.4 }, { clip: 'Melee_2H_Attack_Stab', speed: 1.6 }],
    heavy: { clip: 'Melee_2H_Attack_Chop', speed: 1.2 },
    charge: { clip: 'Melee_2H_Attack_Spin', speed: 1.3 },
  },
  zweihaender: {
    label: 'Zweihänder',
    idle: { clip: 'Melee_2H_Idle', loop: true },
    combo: [{ clip: 'Melee_2H_Attack_Slice', speed: 1.15 }, { clip: 'Melee_2H_Attack_Chop', speed: 1.15 }, { clip: 'Melee_2H_Attack_Spin', speed: 1.3 }],
    heavy: { clip: 'Melee_2H_Attack_Chop', speed: 0.95 },
    charge: { clip: 'Melee_2H_Attack_Spinning', speed: 0.9 },
  },
  doppel: {
    label: 'Doppelklingen',
    idle: { clip: 'Idle_A', loop: true },
    combo: [{ clip: 'Melee_Dualwield_Attack_Slice', speed: 1.6 }, { clip: 'Melee_Dualwield_Attack_Chop', speed: 1.6 }, { clip: 'Melee_Dualwield_Attack_Stab', speed: 1.8 }, { clip: 'Melee_2H_Attack_Spinning', speed: 1.3 }],
    heavy: { clip: 'Melee_2H_Attack_Spin', speed: 1.4 },
    charge: { clip: 'Melee_2H_Attack_Spinning', speed: 1 },
  },
  effekt: {
    label: 'Faji-Wirken',
    idle: { clip: 'Idle_B', loop: true },
    combo: [{ clip: 'Ranged_Magic_Shoot', speed: 1.4 }, { clip: 'Ranged_Magic_Spellcasting', speed: 1.2 }, { clip: 'Ranged_Magic_Shoot', speed: 1.6 }],
    heavy: { clip: 'Ranged_Magic_Raise', speed: 1.4 },
    charge: { clip: 'Ranged_Magic_Spellcasting_Long', loop: true },
  },
};
