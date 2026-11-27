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
// 4.91: volle Klassen-Leiste am Steuer – fünf Plätze im Bogen über den Kanonen; der Seiten-Knopf wechselt auf ihnen zwischen Formen
// 1 – 5, Formen 6 – 10 (`TOUCH_SEA_PAGE2`) und den vier Geistes-Faji (`TOUCH_SEA_PAGE3`, `helmGeist1–4`), daneben der Ultimate-Knopf. Die
// alten Faji-Techniken F1 – F3 lernt man seit 4.7B nicht mehr (zu Fuß gab es für sie schon keinen Knopf). Die Gruppe bleibt unter der
// Kontextplakette („Ruder verlassen“, Hochformat ab 264 px) und rechts vom Steuerkompass; kein Knopf überlappt (tests/phase491…).
export const TOUCH_SEA: TouchButtonDef[] = [
  { action: 'attack', label: 'Feuer', size: 88, right: 18, bottom: 26, color: 'seal' },
  { action: 'fireLeft', label: 'Links', size: 62, right: 118, bottom: 22, color: 'seal' },
  { action: 'fireRight', label: 'Rechts', size: 62, right: 26, bottom: 128, color: 'seal' },
  { action: 'dodge', label: 'Schub', size: 58, right: 112, bottom: 104, color: 'teal' },
  { action: 'heavy', label: 'Muni-\ntion', size: 50, right: 196, bottom: 26, color: 'brass' },
  { action: 'repair', label: 'Fli-\ncken', size: 48, right: 252, bottom: 30, color: 'ok' },
  // 4.6J: Ziel durchschalten (Breitseiten und Kräfte am Steuer richten sich auf das angewählte Feindschiff aus)
  { action: 'targetNext', label: 'Ziel', size: 40, right: 166, bottom: 80, color: 'brass' },
  { action: 'art1', label: '1', size: 48, right: 14, bottom: 200, color: 'seal' },
  { action: 'art2', label: '2', size: 48, right: 72, bottom: 188, color: 'seal' },
  { action: 'art3', label: '3', size: 48, right: 128, bottom: 170, color: 'seal' },
  { action: 'art4', label: '4', size: 48, right: 176, bottom: 134, color: 'seal' },
  { action: 'art5', label: '5', size: 46, right: 211, bottom: 87, color: 'seal' },
  { action: 'formPage', label: '6–10', size: 40, right: 10, bottom: 262, color: 'brass' },
  { action: 'awaken', label: 'Ulti-\nmate', size: 48, right: 56, bottom: 250, color: 'brass' },
];

// Touch-Buttons zu Fuß (4.6A): Angriff, Schwer, Dash und Sprung unter dem Daumen, darüber im Bogen die vier Kampfkünste des Stils,
// darüber die Faji-Fähigkeiten; Stilwechsel, Block, Ziel und Proviant am Rand. Kein Knopf überlappt einen anderen (tests/actionCombatEngine.test.ts).
export const TOUCH_FOOT: TouchButtonDef[] = [
  { action: 'attack', label: 'Angriff', size: 90, right: 16, bottom: 24, color: 'seal' },
  { action: 'heavy', label: 'Schwer', size: 60, right: 24, bottom: 126, color: 'seal' },
  { action: 'dodge', label: 'Dash', size: 60, right: 116, bottom: 18, color: 'teal' },
  { action: 'jump', label: 'Sprung', size: 58, right: 106, bottom: 92, color: 'teal' },
  { action: 'block', label: 'Block', size: 46, right: 188, bottom: 22, color: 'ok' },
  // 4.6J: der Ziel-Knopf schaltet durch die Ziele im Sichtfeld (antippen der Welt wählt direkt)
  { action: 'targetNext', label: 'Ziel', size: 42, right: 236, bottom: 74, color: 'brass' },
  // 4.7B: fünf Form-Knöpfe im Bogen; der Seiten-Knopf zeigt auf denselben Plätzen die Formen 6 – 10 (TOUCH_FOOT_PAGE2)
  { action: 'art1', label: '1', size: 50, right: 16, bottom: 200, color: 'seal' },
  { action: 'art2', label: '2', size: 50, right: 72, bottom: 176, color: 'seal' },
  { action: 'art3', label: '3', size: 50, right: 124, bottom: 152, color: 'seal' },
  { action: 'art4', label: '4', size: 50, right: 172, bottom: 118, color: 'seal' },
  { action: 'art5', label: '5', size: 46, right: 18, bottom: 264, color: 'seal' },
  { action: 'formPage', label: '6–10', size: 40, right: 70, bottom: 300, color: 'brass' },
  // 4.7B Geistes-Faji: Willens-Entfesselung, Lebensstrom, Erwachter Wille, Königsdruck
  { action: 'geist1', label: 'Wille', size: 44, right: 122, bottom: 214, color: 'brass' },
  { action: 'geist2', label: 'Leben', size: 44, right: 174, bottom: 182, color: 'ok' },
  { action: 'geist3', label: 'Erwacht', size: 40, right: 175, bottom: 75, color: 'teal' },
  { action: 'geist4', label: 'König', size: 42, right: 70, bottom: 240, color: 'brass' },
  { action: 'potion', label: 'Pro-\nviant', size: 42, right: 236, bottom: 22, color: 'ok' },
  // 4.6B: Sturm-Erwachen (füllt sich mit der Willenskraft, im Erwachen das Ultimate) und Aura reihum
  { action: 'awaken', label: 'Erwa-\nchen', size: 46, right: 228, bottom: 196, color: 'brass' },
  { action: 'aura', label: 'Aura', size: 40, right: 225, bottom: 140, color: 'teal' },
  // 4.6H: Offiziers-Kombo-Assists (Sperrfeuer, Orkan-Schildstoß, Sturmhorn) in einer Reihe – nur mit Landtrupp sichtbar
  { action: 'assist1', label: 'Salve', size: 44, right: 124, bottom: 270, color: 'brass' },
  { action: 'assist2', label: 'Orkan', size: 44, right: 176, bottom: 240, color: 'brass' },
  { action: 'assist3', label: 'Horn', size: 44, right: 228, bottom: 250, color: 'brass' },
];

/**
 * 4.7B: zweite Seite der Form-Knöpfe – auf denselben Plätzen wie Form 1 – 5; sichtbar ist immer nur eine Seite (`TouchControls.setButton`
 * mit `empty`), darum prüft der Überlappungs-Test nur `TOUCH_FOOT`.
 */
export const TOUCH_FOOT_PAGE2: TouchButtonDef[] = page2Of(TOUCH_FOOT);

/** 4.91: zweite Seite der Form-Knöpfe am Steuer (Formen 6 – 10 auf den Plätzen von 1 – 5) */
export const TOUCH_SEA_PAGE2: TouchButtonDef[] = page2Of(TOUCH_SEA);

/** 4.91: dritte Seite am Steuer – die vier Geistes-Faji auf den Plätzen der Formen 1 – 4 */
const HELM_GEIST_TOUCH = [
  { action: 'helmGeist1', label: 'Wille', color: 'brass' }, { action: 'helmGeist2', label: 'Leben', color: 'ok' },
  { action: 'helmGeist3', label: 'Erwacht', color: 'teal' }, { action: 'helmGeist4', label: 'König', color: 'brass' },
] as const;
export const TOUCH_SEA_PAGE3: TouchButtonDef[] = HELM_GEIST_TOUCH.map((g, i) => {
  const base = TOUCH_SEA.find((b) => b.action === `art${i + 1}`)!;
  return { ...base, action: g.action, label: g.label, color: g.color };
});

function page2Of(list: readonly TouchButtonDef[]): TouchButtonDef[] {
  return list.filter((b) => /^art[1-5]$/.test(b.action)).map((b) => ({ ...b, action: `art${Number(b.action.slice(3)) + 5}` as ActionId, label: String(Number(b.action.slice(3)) + 5) }));
}
