// Alle Spielaktionen. Das Spiel fragt nur Aktionen ab, nie konkrete Tasten.
export const ACTION_IDS = [
  'up', 'down', 'left', 'right',
  'attack', 'heavy', 'dodge', 'interact', 'block', 'lockon',
  'fireLeft', 'fireRight',
  'skill1', 'skill2', 'skill3',
  'pause',
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

export const ACTION_LABELS: Record<ActionId, string> = {
  up: 'Vorwärts',
  down: 'Rückwärts',
  left: 'Links',
  right: 'Rechts',
  attack: 'Angriff',
  heavy: 'Schwerer Angriff',
  dodge: 'Ausweichen / Schub',
  interact: 'Aktion',
  block: 'Blocken / Parade',
  lockon: 'Ziel erfassen',
  fireLeft: 'Breitseite links',
  fireRight: 'Breitseite rechts',
  skill1: 'Fähigkeit 1',
  skill2: 'Fähigkeit 2',
  skill3: 'Fähigkeit 3',
  pause: 'Pause',
};

/** Tastatur- und Maus-Belegung (KeyboardEvent.code bzw. "Mouse0" … "Mouse2"). Frei änderbar im Menü. */
export const DEFAULT_KEYS: Record<ActionId, string[]> = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  attack: ['KeyJ', 'Mouse0'],
  heavy: ['KeyK'],
  dodge: ['Space', 'ShiftLeft'],
  interact: ['KeyR', 'Enter'],
  block: ['KeyL', 'KeyC'],
  lockon: ['KeyT', 'Tab'],
  fireLeft: ['KeyQ'],
  fireRight: ['KeyE'],
  skill1: ['Digit1'],
  skill2: ['Digit2'],
  skill3: ['Digit3'],
  pause: ['Escape', 'KeyP'],
};

/** Gamepad-Belegung nach dem Standard-Layout (A=0, B=1, X=2, Y=3, LB=4, RB=5, LT=6, RT=7, Start=9). */
export const DEFAULT_PAD: Record<ActionId, number[]> = {
  up: [12],
  down: [13],
  left: [14],
  right: [15],
  attack: [0],
  heavy: [3],
  dodge: [1],
  interact: [2],
  block: [4],
  lockon: [11],
  fireLeft: [4],
  fireRight: [5],
  skill1: [6],
  skill2: [7],
  skill3: [5],
  pause: [9],
};

/** Aktionen, die im Menü nicht umbelegt werden dürfen (Escape bleibt immer Pause/Zurück). */
export const FIXED_CODES = ['Escape'];
