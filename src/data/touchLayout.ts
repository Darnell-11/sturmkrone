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
];

// Touch-Buttons zu Fuß
export const TOUCH_FOOT: TouchButtonDef[] = [
  { action: 'attack', label: 'Angriff', size: 92, right: 18, bottom: 26, color: 'seal' },
  { action: 'heavy', label: 'Schwer', size: 62, right: 28, bottom: 132, color: 'seal' },
  { action: 'dodge', label: 'Rolle', size: 64, right: 124, bottom: 22, color: 'teal' },
  { action: 'block', label: 'Block', size: 58, right: 118, bottom: 104, color: 'ok' },
  { action: 'lockon', label: 'Ziel', size: 48, right: 200, bottom: 34, color: 'brass' },
];
