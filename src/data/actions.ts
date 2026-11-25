import type { CommandState } from './troops';

// Alle Spielaktionen. Das Spiel fragt nur Aktionen ab, nie konkrete Tasten.
export const ACTION_IDS = [
  'up', 'down', 'left', 'right',
  'attack', 'heavy', 'dodge', 'jump', 'interact', 'block', 'lockon',
  'fireLeft', 'fireRight',
  'skill1', 'skill2', 'skill3',
  'art1', 'art2', 'art3', 'art4',
  'awaken', 'aura',
  'potion', 'map', 'skills', 'quests', 'talk', 'inventory',
  'item1', 'item2', 'item3', 'item4',
  'cmdSturm', 'cmdFollow', 'cmdHold',
  'swap', 'weapon1', 'weapon2',
  'repair',
  'fleetHold', 'fleetAttack', 'fleetRally',
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
  dodge: 'Ausweichen (Dash) / Schub',
  jump: 'Springen (Doppelsprung)',
  interact: 'Aktion',
  block: 'Blocken / Parade',
  lockon: 'Ziel erfassen',
  fireLeft: 'Breitseite links',
  fireRight: 'Breitseite rechts',
  skill1: 'Fähigkeit 1',
  skill2: 'Fähigkeit 2',
  skill3: 'Fähigkeit 3',
  art1: 'Kampfkunst 1',
  art2: 'Kampfkunst 2',
  art3: 'Kampfkunst 3',
  art4: 'Kampfkunst 4',
  awaken: 'Sturm-Erwachen / Ultimate',
  aura: 'Willenskraft-Aura wechseln',
  potion: 'Proviant essen',
  map: 'Karte & Logbuch',
  skills: 'Talentbaum (Faji)',
  quests: 'Auftragsbuch',
  talk: 'Sprechen (zu Fuß)',
  inventory: 'Inventar',
  item1: 'Schnellleiste 1',
  item2: 'Schnellleiste 2',
  item3: 'Schnellleiste 3',
  item4: 'Schnellleiste 4',
  cmdSturm: 'Befehl: Sturmangriff',
  cmdFollow: 'Befehl: Folgen',
  cmdHold: 'Befehl: Position halten',
  swap: 'Waffe wechseln',
  weapon1: 'Waffenplatz 1',
  weapon2: 'Waffenplatz 2',
  repair: 'Segel flicken (See)',
  fleetHold: 'Flotte: Formation halten',
  fleetAttack: 'Flotte: Feuer frei / Angreifen',
  fleetRally: 'Flotte: Sammeln / Rückzug',
  pause: 'Pause',
};

/** Tastatur- und Maus-Belegung (KeyboardEvent.code bzw. "Mouse0" … "Mouse2"). Frei änderbar im Menü. */
export const DEFAULT_KEYS: Record<ActionId, string[]> = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  attack: ['KeyJ', 'Mouse0'],
  heavy: ['KeyU'],
  // Leertaste springt (seit 4.6A), Umschalt weicht aus; auf See gibt die Leertaste weiter Schub (siehe SeaWorld)
  dodge: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  interact: ['KeyR', 'Enter'],
  block: ['KeyC'],
  lockon: ['KeyF', 'Mouse1', 'KeyT', 'Tab'],
  fireLeft: ['KeyQ'],
  fireRight: ['KeyE'],
  skill1: ['F1'],
  skill2: ['F2'],
  skill3: ['F3'],
  // Kampfkünste des Stils zu Fuß; die Güter der Schnellleiste auf denselben Tasten ruhen dann (an Bord gelten sie wie immer)
  art1: ['Digit1'],
  art2: ['Digit2'],
  art3: ['Digit3'],
  art4: ['Digit4'],
  // Sturm-Erwachen bei voller Willenskraft, im Erwachen das Ultimate des Stils (seit 4.6B); Aura reihum
  awaken: ['KeyV'],
  aura: ['KeyB'],
  potion: ['KeyH'],
  map: ['KeyM'],
  skills: ['KeyK'],
  quests: ['KeyL'],
  talk: ['KeyE'],
  inventory: ['KeyI'],
  item1: ['Digit1'],
  item2: ['Digit2'],
  item3: ['Digit3'],
  item4: ['Digit4'],
  // Truppenbefehle zu Fuß auf 5–7 (die Tasten 1–4 gehören zu Fuß den Kampfkünsten); auf See liegen dort die Flottenbefehle
  cmdSturm: ['Digit5'],
  cmdFollow: ['Digit6'],
  cmdHold: ['Digit7'],
  swap: ['KeyQ'],
  weapon1: ['KeyZ'],
  weapon2: ['KeyX'],
  repair: ['KeyG'],
  // Flottenbefehle auf See: 5, 6, 7 neben den Gütern 1–4 (die Truppenbefehle teilen sich 1–3 nur an Land)
  fleetHold: ['Digit5'],
  fleetAttack: ['Digit6'],
  fleetRally: ['Digit7'],
  pause: ['Escape', 'KeyP'],
};

/** Gamepad-Belegung nach dem Standard-Layout (A=0, B=1, X=2, Y=3, LB=4, RB=5, LT=6, RT=7, Start=9). */
export const DEFAULT_PAD: Record<ActionId, number[]> = {
  // Steuerkreuz: lenkt wie bisher und löst zu Fuß zugleich die Kampfkünste 1–4 aus (oben, rechts, unten, links; der Angriff übernimmt
  // die Richtung als Zielhilfe, laufen tut man mit dem linken Stick)
  up: [12],
  down: [13],
  left: [14],
  right: [15],
  attack: [0],
  heavy: [3],
  dodge: [1],
  // Springen liegt mit „Aktion“ auf X: steht eine Handlung an (Kontextplakette), gewinnt die Handlung (PlayerFoot.jumpBlocked)
  jump: [2],
  interact: [2],
  block: [4],
  lockon: [11],
  fireLeft: [4],
  fireRight: [5],
  skill1: [6],
  skill2: [7],
  skill3: [5],
  art1: [12],
  art2: [15],
  art3: [13],
  art4: [14],
  // Erwachen und Aura nur als Kombination (siehe PAD_CHORDS)
  awaken: [],
  aura: [],
  potion: [10],
  map: [8],
  skills: [],
  quests: [],
  talk: [],
  inventory: [],
  item1: [],
  item2: [],
  item3: [],
  item4: [],
  cmdSturm: [],
  cmdFollow: [],
  cmdHold: [],
  swap: [],
  weapon1: [],
  weapon2: [],
  repair: [],
  fleetHold: [],
  fleetAttack: [],
  fleetRally: [],
  pause: [9],
};

/**
 * Gamepad-Kombinationen für die Flottenbefehle: Haltetaste R3 (Stick-Druck rechts, Standard-Layout 11) plus Steuerkreuz. Alle Tasten des Controllers sind
 * schon belegt; auf See tut R3 allein nichts, und solange R3 gehalten wird, steuert das Kreuz nicht (die Kombination gehört dem Befehl).
 * Links = Formation halten, oben = Feuer frei, rechts = Sammeln. Zu Fuß (4.6B): R3 + ▼ = Sturm-Erwachen / Ultimate, R3 + Y = Aura wechseln
 * (R3 allein erfasst zu Fuß weiter ein Ziel).
 */
export const PAD_CHORD_MOD = 11;
export const PAD_CHORDS: Partial<Record<ActionId, number>> = { fleetHold: 14, fleetAttack: 12, fleetRally: 15, awaken: 13, aura: 3 };
const CHORD_BUTTONS = Object.values(PAD_CHORDS) as number[];
/** Gehört die Taste zu einer Kombination (und wird bei gehaltener Haltetaste nicht als einzelne Taste gewertet)? */
export const isChordButton = (i: number): boolean => CHORD_BUTTONS.includes(i);
/**
 * Ist die Gamepad-Belegung einer Aktion gerade gedrückt? `buttons` = Zustand der Tasten (Standard-Layout). Kombinationen brauchen die Haltetaste; solange sie
 * gehalten wird, zählen die Kreuz-Tasten nicht einzeln (sonst würde das Schiff beim Befehl mitsteuern).
 */
export function padActionDown(a: ActionId, buttons: ArrayLike<boolean | undefined>): boolean {
  const mod = !!buttons[PAD_CHORD_MOD];
  const chord = PAD_CHORDS[a];
  if (chord !== undefined) return mod && !!buttons[chord];
  return DEFAULT_PAD[a].some((i) => !!buttons[i] && !(mod && isChordButton(i)));
}

/** Anzeige der Kombination am Gamepad, z. B. „R3 + ◀“ */
export const PAD_CHORD_LABEL: Partial<Record<ActionId, string>> = { fleetHold: 'R3 + ◀', fleetAttack: 'R3 + ▲', fleetRally: 'R3 + ▶', awaken: 'R3 + ▼', aura: 'R3 + Y' };

/** Aktionen, die im Menü nicht umbelegt werden dürfen (Escape bleibt immer Pause/Zurück). */
export const FIXED_CODES = ['Escape'];

/** Teilen zwei Aktionen eine Taste (Schnellleiste 1–3 und die Truppenbefehle)? */
export const sharesKey = (a: readonly string[], b: readonly string[]): boolean => a.some((c) => b.includes(c));

/** Kampfkünste 1–4 des Stils (Tasten zu Fuß) */
export const ART_ACTIONS: readonly ActionId[] = ['art1', 'art2', 'art3', 'art4'];

/**
 * Belegt eine Kampfkunst die Taste einer Schnellleisten-Aktion? Zu Fuß ruht das Gut dann (die Kampfkunst gewinnt); null = frei.
 * Eingabe und Anzeige fragen hier dasselbe.
 */
export function artOnKey(binds: Record<ActionId, string[]>, item: ActionId): number | null {
  for (let i = 0; i < ART_ACTIONS.length; i++) if (sharesKey(binds[item], binds[ART_ACTIONS[i]])) return i + 1;
  return null;
}

/** Aktion je Truppenbefehl (Anzeige und Auswertung nutzen dieselbe Zuordnung) */
export const COMMAND_ACTIONS: Record<CommandState, ActionId> = { sturm: 'cmdSturm', folgen: 'cmdFollow', halten: 'cmdHold' };

/**
 * Welcher Truppenbefehl belegt die Taste einer Schnellleisten-Aktion? Solange Trupps im Einsatz sind, gehört eine gemeinsame Taste dem Befehl
 * (das Gut ruht); null = die Aktion teilt keine Taste mit einem Befehl und gilt immer. Eingabe und Anzeige fragen hier dasselbe.
 */
export function commandOnKey(binds: Record<ActionId, string[]>, item: ActionId): CommandState | null {
  for (const c of Object.keys(COMMAND_ACTIONS) as CommandState[]) if (sharesKey(binds[item], binds[COMMAND_ACTIONS[c]])) return c;
  return null;
}

/** Bereiche der Tastenbelegung im Einstellungsmenü; jede Aktion steht in genau einem Bereich (ein Test prüft das) */
export const ACTION_GROUPS: { id: string; label: string; actions: ActionId[] }[] = [
  { id: 'move', label: 'Bewegung und Aktion', actions: ['up', 'down', 'left', 'right', 'jump', 'dodge', 'interact', 'talk', 'lockon'] },
  { id: 'fight', label: 'Kampf', actions: ['attack', 'heavy', 'block', 'art1', 'art2', 'art3', 'art4', 'awaken', 'aura', 'skill1', 'skill2', 'skill3', 'swap', 'weapon1', 'weapon2'] },
  { id: 'sea', label: 'See', actions: ['fireLeft', 'fireRight', 'repair'] },
  { id: 'fleet', label: 'Flottenbefehle (See)', actions: ['fleetHold', 'fleetAttack', 'fleetRally'] },
  { id: 'troops', label: 'Truppenbefehle', actions: ['cmdSturm', 'cmdFollow', 'cmdHold'] },
  { id: 'quick', label: 'Schnellleiste', actions: ['potion', 'item1', 'item2', 'item3', 'item4'] },
  { id: 'menus', label: 'Menüs', actions: ['map', 'skills', 'quests', 'inventory', 'pause'] },
];
