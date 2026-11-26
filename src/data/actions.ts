import type { CommandState } from './troops';

// Alle Spielaktionen. Das Spiel fragt nur Aktionen ab, nie konkrete Tasten.
export const ACTION_IDS = [
  'up', 'down', 'left', 'right',
  'attack', 'heavy', 'dodge', 'jump', 'interact', 'block', 'lockon',
  'targetNext', 'targetPrev',
  'fireLeft', 'fireRight',
  'skill1', 'skill2', 'skill3',
  'art1', 'art2', 'art3', 'art4', 'art5', 'art6', 'art7', 'art8', 'art9', 'art10',
  'formPage',
  'geist1', 'geist2', 'geist3', 'geist4',
  'awaken', 'aura',
  'potion', 'map', 'skills', 'talents', 'quests', 'talk', 'inventory',
  'item1', 'item2', 'item3', 'item4',
  'cmdSturm', 'cmdFollow', 'cmdHold',
  'assist1', 'assist2', 'assist3',
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
  lockon: 'Ziel erfassen / lösen (Kamera)',
  targetNext: 'Nächstes Ziel (Tab)',
  targetPrev: 'Voriges Ziel (Umschalt + Tab)',
  fireLeft: 'Breitseite links',
  fireRight: 'Breitseite rechts',
  skill1: 'Fähigkeit 1',
  skill2: 'Fähigkeit 2',
  skill3: 'Fähigkeit 3',
  art1: 'Form 1',
  art2: 'Form 2',
  art3: 'Form 3',
  art4: 'Form 4',
  art5: 'Form 5',
  art6: 'Form 6',
  art7: 'Form 7',
  art8: 'Form 8',
  art9: 'Form 9',
  art10: 'Form 10',
  formPage: 'Formen 1–5 ↔ 6–10 (Leiste umschalten)',
  geist1: 'Geistes-Faji: Willens-Entfesselung',
  geist2: 'Geistes-Faji: Lebensstrom-Fokus',
  geist3: 'Geistes-Faji: Erwachter Wille',
  geist4: 'Geistes-Faji: Königsdruck',
  awaken: 'Sturm-Erwachen / Ultimate',
  aura: 'Willenskraft-Aura wechseln',
  potion: 'Proviant essen',
  map: 'Karte & Logbuch',
  skills: 'Klassenbaum (Formen)',
  talents: 'Klassenbaum & Geistes-Faji',
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
  assist1: 'Offizier: Sperrfeuer-Salve',
  assist2: 'Offizier: Orkan-Schildstoß',
  assist3: 'Offizier: Sturmhorn-Sammeln',
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
  lockon: ['KeyF', 'Mouse1'],
  // 4.6J: MMO-Ziel-Erfassung – Tab schaltet durch die Ziele im Sichtfeld, Umschalt + Tab zurück (Input erkennt die Umschalttaste selbst)
  targetNext: ['Tab'],
  targetPrev: [],
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
  // 4.7B: zehn Formen des Klassenbaums – 1 – 5 und Umschalt + 1 – 5 (Umschalt allein bleibt Ausweichen)
  art5: ['Digit5'],
  art6: ['Shift+Digit1'],
  art7: ['Shift+Digit2'],
  art8: ['Shift+Digit3'],
  art9: ['Shift+Digit4'],
  art10: ['Shift+Digit5'],
  // Touch-Knopf und Gamepad: die Knöpfe 1 – 5 zeigen die Formen 6 – 10 (an der Tastatur liegen sie fest auf Umschalt + 1 – 5)
  formPage: [],
  // 4.7B Geistes-Faji: Q, R, T, G (R teilt sich die Taste mit „Aktion“ – steht eine Handlung an, gewinnt sie; Q und G gelten auf See den Breitseiten/dem Flicken)
  geist1: ['KeyQ'],
  geist2: ['KeyR'],
  geist3: ['KeyT'],
  geist4: ['KeyG'],
  // Sturm-Erwachen bei voller Willenskraft, im Erwachen das Ultimate des Stils (seit 4.6B); Aura reihum
  awaken: ['KeyV'],
  aura: ['KeyB'],
  potion: ['KeyH'],
  map: ['KeyM'],
  skills: ['KeyK'],
  talents: ['KeyN'],
  quests: ['KeyL'],
  talk: ['KeyE'],
  inventory: ['KeyI'],
  item1: ['Digit1'],
  item2: ['Digit2'],
  item3: ['Digit3'],
  item4: ['Digit4'],
  // Truppenbefehle zu Fuß auf 6, 7 und Z (4.7B: 1 – 5 gehören zu Fuß den Formen); auf See liegen auf 6/7 die Flottenbefehle
  cmdSturm: ['Digit6'],
  cmdFollow: ['Digit7'],
  cmdHold: ['KeyZ'],
  // 4.6H: Kombo-Assists der Offiziere an Land auf 8, 9, 0 (frei: 1–4 Kampfkünste, 5–7 Truppen- bzw. Flottenbefehle)
  assist1: ['Digit8'],
  assist2: ['Digit9'],
  assist3: ['Digit0'],
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
  // 4.6J: der rechte Stick-Klick schaltet durch die Ziele (allein gedrückt; mit Kreuz/Schultertasten bleibt er Haltetaste der Kombinationen)
  lockon: [],
  targetNext: [11],
  targetPrev: [],
  fireLeft: [4],
  fireRight: [5],
  skill1: [6],
  skill2: [7],
  skill3: [5],
  art1: [12],
  art2: [15],
  art3: [13],
  art4: [14],
  // 4.7B: Formen 5 – 10 am Gamepad über die Seite der Aktionsleiste; Geistes-Faji als Kombination R3 + RT / L3 / B / X (A bleibt Angriff)
  art5: [],
  art6: [],
  art7: [],
  art8: [],
  art9: [],
  art10: [],
  formPage: [],
  geist1: [],
  geist2: [],
  geist3: [],
  geist4: [],
  // Erwachen und Aura nur als Kombination (siehe PAD_CHORDS)
  awaken: [],
  aura: [],
  potion: [10],
  map: [8],
  skills: [],
  talents: [],
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
  // 4.6H: Offiziers-Assists nur als Kombination (siehe PAD_CHORDS)
  assist1: [],
  assist2: [],
  assist3: [],
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
 * (R3 allein erfasst zu Fuß weiter ein Ziel). 4.6H: R3 + LB / RB / LT = Offiziers-Assists (Sperrfeuer, Orkan-Schildstoß, Sturmhorn); A, B, X bleiben frei.
 */
export const PAD_CHORD_MOD = 11;
export const PAD_CHORDS: Partial<Record<ActionId, number>> = { fleetHold: 14, fleetAttack: 12, fleetRally: 15, awaken: 13, aura: 3, assist1: 4, assist2: 5, assist3: 6, geist1: 7, geist2: 10, geist3: 1, geist4: 2 };
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
export const PAD_CHORD_LABEL: Partial<Record<ActionId, string>> = { fleetHold: 'R3 + ◀', fleetAttack: 'R3 + ▲', fleetRally: 'R3 + ▶', awaken: 'R3 + ▼', aura: 'R3 + Y', assist1: 'R3 + LB', assist2: 'R3 + RB', assist3: 'R3 + LT', geist1: 'R3 + RT', geist2: 'R3 + L3', geist3: 'R3 + B', geist4: 'R3 + X' };

/** 4.6H: Kombo-Assists der Offiziere (Tasten zu Fuß; Reihenfolge wie `OFFICER_ASSISTS`) */
export const ASSIST_ACTIONS: readonly ActionId[] = ['assist1', 'assist2', 'assist3'];

/** Aktionen, die im Menü nicht umbelegt werden dürfen (Escape bleibt immer Pause/Zurück). */
export const FIXED_CODES = ['Escape'];

/** Teilen zwei Aktionen eine Taste (Schnellleiste 1–3 und die Truppenbefehle)? */
export const sharesKey = (a: readonly string[], b: readonly string[]): boolean => a.some((c) => b.includes(c));

/** Formen 1 – 10 des Klassenbaums (Tasten zu Fuß; 1 – 4 teilen sich die Tasten mit der Schnellleiste) */
export const ART_ACTIONS: readonly ActionId[] = ['art1', 'art2', 'art3', 'art4', 'art5', 'art6', 'art7', 'art8', 'art9', 'art10'];
/** 4.7B: die vier Geistes-Faji-Kräfte (Q, R, T, G) */
export const GEIST_ACTIONS: readonly ActionId[] = ['geist1', 'geist2', 'geist3', 'geist4'];

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
  { id: 'move', label: 'Bewegung und Aktion', actions: ['up', 'down', 'left', 'right', 'jump', 'dodge', 'interact', 'talk'] },
  { id: 'target', label: 'Ziel-Erfassung', actions: ['targetNext', 'targetPrev', 'lockon'] },
  // 4.7B: eine feste Klasse – kein Waffen- oder Stilwechsel mehr; zehn Formen und die Geistes-Faji
  { id: 'fight', label: 'Kampf', actions: ['attack', 'heavy', 'block', 'awaken', 'aura', 'skill1', 'skill2', 'skill3'] },
  { id: 'forms', label: 'Formen des Klassenbaums', actions: ['art1', 'art2', 'art3', 'art4', 'art5', 'art6', 'art7', 'art8', 'art9', 'art10', 'formPage'] },
  { id: 'geist', label: 'Geistes-Faji', actions: ['geist1', 'geist2', 'geist3', 'geist4'] },
  { id: 'sea', label: 'See', actions: ['fireLeft', 'fireRight', 'repair'] },
  { id: 'fleet', label: 'Flottenbefehle (See)', actions: ['fleetHold', 'fleetAttack', 'fleetRally'] },
  { id: 'troops', label: 'Truppenbefehle', actions: ['cmdSturm', 'cmdFollow', 'cmdHold'] },
  { id: 'assists', label: 'Offiziers-Assists (an Land)', actions: ['assist1', 'assist2', 'assist3'] },
  { id: 'quick', label: 'Schnellleiste', actions: ['potion', 'item1', 'item2', 'item3', 'item4'] },
  { id: 'menus', label: 'Menüs', actions: ['map', 'talents', 'skills', 'quests', 'inventory', 'pause'] },
];
