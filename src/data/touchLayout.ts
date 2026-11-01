import type { ActionId } from './actions';

export interface TouchButtonDef {
  action: ActionId;
  label: string;
  /** Größe in px */
  size: number;
  /** Abstand vom rechten / unteren Rand in px (Safe Area kommt automatisch dazu) */
  right: number;
  bottom: number;
  color: 'seal' | 'teal' | 'brass' | 'ok';
}

// Touch-Buttons auf See
export const TOUCH_SEA: TouchButtonDef[] = [
  { action: 'attack', label: 'Feuer', size: 88, right: 18, bottom: 26, color: 'seal' },
  { action: 'fireLeft', label: 'Links', size: 62, right: 118, bottom: 22, color: 'seal' },
  { action: 'fireRight', label: 'Rechts', size: 62, right: 26, bottom: 128, color: 'seal' },
  { action: 'dodge', label: 'Schub', size: 58, right: 112, bottom: 104, color: 'teal' },
  { action: 'heavy', label: 'Muni-\ntion', size: 50, right: 196, bottom: 26, color: 'brass' },
  { action: 'skill1', label: 'F1', size: 52, right: 30, bottom: 206, color: 'brass' },
  { action: 'skill2', label: 'F2', size: 52, right: 96, bottom: 180, color: 'brass' },
  { action: 'skill3', label: 'F3', size: 52, right: 180, bottom: 96, color: 'brass' },
];

// Touch-Buttons zu Fuß
export const TOUCH_FOOT: TouchButtonDef[] = [
  { action: 'attack', label: 'Angriff', size: 92, right: 18, bottom: 26, color: 'seal' },
  { action: 'heavy', label: 'Schwer', size: 62, right: 28, bottom: 132, color: 'seal' },
  { action: 'dodge', label: 'Rolle', size: 64, right: 124, bottom: 22, color: 'teal' },
  { action: 'block', label: 'Block', size: 58, right: 118, bottom: 104, color: 'ok' },
  { action: 'lockon', label: 'Ziel', size: 48, right: 200, bottom: 34, color: 'brass' },
  { action: 'skill1', label: 'F1', size: 56, right: 20, bottom: 206, color: 'brass' },
  { action: 'skill2', label: 'F2', size: 56, right: 84, bottom: 186, color: 'brass' },
  { action: 'skill3', label: 'F3', size: 56, right: 190, bottom: 104, color: 'brass' },
];
