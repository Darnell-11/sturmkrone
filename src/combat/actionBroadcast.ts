// Phase 4.93A – Kampf-Übertragung (CombatActionBroadcast): was eine übertragene Aktion bedeutet. Rein (ohne three.js, ohne DOM) – Absender
// (`SeaWorld`) und Empfänger (`world/remoteActionStage.ts`) lesen dieselben Tabellen, damit beide Seiten denselben Angriff meinen.
//
// Jede Aktion geht EINMAL beim Start hinaus (nicht mehr je Trefferfenster): der Empfänger kennt aus Stil und Kennzahl den Angriff, spielt
// dessen Clip an der Figur des Mitspielers ab und lässt die Wirkung im Treffermoment folgen.
//   swing  – Standard-Angriff; Feld `n` = Kennzahl der Stufe (`swingCode`): Kette 1 … 8, Verzweigung 11 … 14, Schwer 20, Luft 21 …, Meteor 30,
//            Haltungsbruch-Finisher 31
//   art    – Form I … X (`slot` 1 … 10); Feld `side` = 1, wenn sie vom Steuerrad ausging (Sprung auf die Bugreling)
//   geist  – Geistes-Faji 1 … 4 (`slot`), `side` = 1 am Steuerrad
//   heal   – Heilung (`slot` = Radius in m)
//   ult    – Ultimate: Feld `el` = Art des Kataklysmus (`skyfall` = Stufe 101 „Himmelssturz“), `side` = 1 vom Steuerrad
import { ACTION_STYLES } from '../data/actionStyles';
import type { ActionMove, ActionStyleDef } from '../data/actionKit';
import { SKYFALL_ULTIMATE, ULTIMATES } from '../data/cataclysms';

/** Kennzahlen der Standard-Angriffe im Feld `n` einer `swing`-Aktion (0 = unbekannt: ältere Darstellung ohne Clip) */
export const SWING_CODE = { light: 1, branch: 11, heavy: 20, air: 21, meteor: 30, finisher: 31, max: 48 } as const;

/** Kennung des Wirkens vom Steuerrad im Feld `side` (Formen, Geistes-Faji, Ultimates) */
export const HELM_SIDE = 1;

const styleOf = (style: string): ActionStyleDef | null => (Object.prototype.hasOwnProperty.call(ACTION_STYLES, style) ? (ACTION_STYLES as Record<string, ActionStyleDef>)[style] : null);

/**
 * Kennzahl eines Standard-Angriffs (Kennung des Angriffs in der Engine): jede Stufe der Leicht-Kette, Verzweigungen, Schwer, Luft-Kette,
 * Meteor und Finisher. Verglichen wird die Kennung – die Talent-Kopien der Angriffe tragen dieselbe.
 */
export function swingCode(style: string, moveId: string): number {
  const st = styleOf(style);
  if (!st || !moveId) return 0;
  for (let i = 0; i < st.light.length && i < 8; i++) if (st.light[i].id === moveId) return SWING_CODE.light + i;
  for (let i = 0; i < st.branch.length; i++) if (st.branch[i].id === moveId) return SWING_CODE.branch + i;
  if (st.heavy.id === moveId) return SWING_CODE.heavy;
  for (let i = 0; i < st.air.length && i < 8; i++) if (st.air[i].id === moveId) return SWING_CODE.air + i;
  if (st.meteor.id === moveId) return SWING_CODE.meteor;
  if (st.finisher.id === moveId) return SWING_CODE.finisher;
  return 0;
}

/** Standard-Angriff zu einer Kennzahl (null = unbekannt) */
export function swingMove(style: string, n: number): ActionMove | null {
  const st = styleOf(style);
  if (!st) return null;
  const k = Math.round(n);
  if (k >= SWING_CODE.light && k < SWING_CODE.light + 8) return st.light[k - SWING_CODE.light] ?? null;
  if (k >= SWING_CODE.branch && k < SWING_CODE.branch + 4) return st.branch[k - SWING_CODE.branch] ?? null;
  if (k === SWING_CODE.heavy) return st.heavy;
  if (k >= SWING_CODE.air && k < SWING_CODE.air + 8) return st.air[k - SWING_CODE.air] ?? null;
  if (k === SWING_CODE.meteor) return st.meteor;
  if (k === SWING_CODE.finisher) return st.finisher;
  return null;
}

/** Stufe der Leicht-Kette (1 … 8) einer Kennzahl, sonst 0 */
export const chainStage = (n: number): number => (n >= SWING_CODE.light && n < SWING_CODE.light + 8 ? Math.round(n) - SWING_CODE.light + 1 : 0);

/** Form I … X eines Stils (null = unbekannt) */
export function formMove(style: string, slot: number): ActionMove | null {
  const st = styleOf(style);
  const s = Math.round(slot);
  return st && s >= 1 && s <= st.skills.length ? st.skills[s - 1] : null;
}

/** Ultimate eines Stils bzw. – für die Art `skyfall` – das Stufe-101-Ultimate aller Klassen */
export function ultimateMove(style: string, kind: string): ActionMove | null {
  if (kind === 'skyfall') return SKYFALL_ULTIMATE;
  return Object.prototype.hasOwnProperty.call(ULTIMATES, style) ? (ULTIMATES as Record<string, ActionMove | undefined>)[style] ?? null : null;
}

/** Treffermoment eines Angriffs (s ab Start): Beginn des Fensters seines stärksten Treffers (bei Gleichstand der spätere) */
export function hitMoment(mv: ActionMove): number {
  let best = -1, bd = -Infinity;
  for (let i = 0; i < mv.hits.length; i++) if (mv.hits[i].dmg >= bd) { bd = mv.hits[i].dmg; best = i; }
  return best >= 0 ? mv.hits[best].t0 : mv.dur * 0.4;
}
