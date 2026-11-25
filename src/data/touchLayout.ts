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
  { action: 'repair', label: 'Fli-\ncken', size: 48, right: 252, bottom: 30, color: 'ok' },
];

// Touch-Buttons zu Fuß (4.6A): Angriff, Schwer, Dash und Sprung unter dem Daumen, darüber im Bogen die vier Kampfkünste des Stils,
// darüber die Faji-Fähigkeiten; Stilwechsel, Block, Ziel und Proviant am Rand. Kein Knopf überlappt einen anderen (tests/actionCombatEngine.test.ts).
export const TOUCH_FOOT: TouchButtonDef[] = [
  { action: 'attack', label: 'Angriff', size: 90, right: 16, bottom: 24, color: 'seal' },
  { action: 'heavy', label: 'Schwer', size: 60, right: 24, bottom: 126, color: 'seal' },
  { action: 'dodge', label: 'Dash', size: 60, right: 116, bottom: 18, color: 'teal' },
  { action: 'jump', label: 'Sprung', size: 58, right: 106, bottom: 92, color: 'teal' },
  { action: 'block', label: 'Block', size: 46, right: 188, bottom: 22, color: 'ok' },
  { action: 'lockon', label: 'Ziel', size: 42, right: 236, bottom: 74, color: 'brass' },
  { action: 'art1', label: '1', size: 50, right: 16, bottom: 200, color: 'seal' },
  { action: 'art2', label: '2', size: 50, right: 72, bottom: 176, color: 'seal' },
  { action: 'art3', label: '3', size: 50, right: 124, bottom: 152, color: 'seal' },
  { action: 'art4', label: '4', size: 50, right: 172, bottom: 118, color: 'seal' },
  { action: 'skill1', label: 'F1', size: 46, right: 18, bottom: 264, color: 'brass' },
  { action: 'skill2', label: 'F2', size: 46, right: 70, bottom: 240, color: 'brass' },
  { action: 'skill3', label: 'F3', size: 46, right: 122, bottom: 214, color: 'brass' },
  { action: 'potion', label: 'Pro-\nviant', size: 42, right: 236, bottom: 22, color: 'ok' },
  { action: 'swap', label: 'Stil', size: 44, right: 174, bottom: 182, color: 'teal' },
  // 4.6B: Sturm-Erwachen (füllt sich mit der Willenskraft, im Erwachen das Ultimate) und Aura reihum
  { action: 'awaken', label: 'Erwa-\nchen', size: 46, right: 228, bottom: 196, color: 'brass' },
  { action: 'aura', label: 'Aura', size: 40, right: 225, bottom: 140, color: 'teal' },
  // 4.6H: Offiziers-Kombo-Assists (Sperrfeuer, Orkan-Schildstoß, Sturmhorn) in einer Reihe über F3, Stil und Erwachen – nur mit Landtrupp sichtbar
  { action: 'assist1', label: 'Salve', size: 44, right: 124, bottom: 270, color: 'brass' },
  { action: 'assist2', label: 'Orkan', size: 44, right: 176, bottom: 240, color: 'brass' },
  { action: 'assist3', label: 'Horn', size: 44, right: 228, bottom: 250, color: 'brass' },
];
