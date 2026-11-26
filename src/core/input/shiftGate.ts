// Phase 4.7C – Umschalt ist zugleich „Ausweichen“ und der Vorsatz der Formen 6 – 10 (Umschalt + 1 … 5). Damit eine Form im Laufen keinen
// ungewollten Dash auslöst, wartet ein gedrücktes Umschalt kurz: kommt in dieser Zeit eine Umschalt-Kombination, verfällt der Dash; läuft
// die Figur und die Zeit ist um (oder Umschalt wird losgelassen), weicht sie aus. Steht sie still, wartet Umschalt bis zum Loslassen
// (Umschalt + Tab = voriges Ziel, seit 4.6J). Reine Entscheidung ohne DOM – `Input` fragt sie je Logikschritt.

/** Wartezeit (ms), in der aus Umschalt noch eine Kombination werden kann (kürzer als jedes Fenster des perfekten Ausweichens danach) */
export const SHIFT_COMBO_MS = 90;

export type ShiftVerdict = 'wait' | 'dash' | 'drop';

export interface ShiftState {
  /** so lange ist Umschalt schon gedrückt (ms) */
  heldMs: number;
  /** eine Laufrichtung ist gehalten */
  moving: boolean;
  /** Umschalt wurde losgelassen */
  released: boolean;
  /** eine Umschalt-Kombination (Form 6 – 10, voriges Ziel) wurde gedrückt */
  combo: boolean;
  /** gibt es überhaupt belegte Umschalt-Kombinationen? (sonst weicht die Figur im Laufen sofort aus wie bisher) */
  hasCombos: boolean;
}

/** Was mit einem wartenden Umschalt geschieht */
export function shiftVerdict(s: ShiftState): ShiftVerdict {
  if (s.combo) return 'drop';
  if (s.released) return 'dash';
  if (s.moving && (!s.hasCombos || s.heldMs >= SHIFT_COMBO_MS)) return 'dash';
  return 'wait';
}
