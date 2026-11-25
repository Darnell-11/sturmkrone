// Phase 4.6H – Kombo-Assists der Offiziere im Landkampf (Koop-Gefühl auch allein).
//
// Drei taktische Befehle, die ein angeheuerter Offizier des Landtrupps auf Knopfdruck ausführt (Tasten 8 / 9 / 0, Gamepad R3 + LB / RB / LT,
// Touch-Knöpfe neben den Kampfkünsten):
//  1. Sperrfeuer-Salve (Kanonier / Schütze): Leuchtspur-Granaten decken den Zielbereich ein, brechen die Haltung und halten Hochgeschleuderte in
//     der Luft (längere Luft-Kombos);
//  2. Orkan-Schildstoß (Krieger / Erste Maat): stürmt vor und schleudert Gegnergruppen hoch – öffnet das Fenster der Sturm-Verfolgung;
//  3. Sturmhorn-Sammeln (Steuermann / Schiffsarzt): goldene Schallwelle heilt dich, füllt Willenskraft auf und stärkt die eigenen Trupps.
// Rein: Daten, Abklingzeiten, Wahl des Offiziers, Zielpunkte und Schaden – ohne three.js, ohne Zufall, ohne Speicheranforderung je Bild.
// Die Ausführung (Figuren, Effekte über die AnimeVfxForge, Treffer über das Kampfsystem) steht in `world/officerAssistDirector.ts`.
import type { CrewRole } from '../data/crew';

export type AssistId = 'sperrfeuer' | 'orkan' | 'sturmhorn';
export const ASSIST_IDS: readonly AssistId[] = ['sperrfeuer', 'orkan', 'sturmhorn'];

/** Stärkung der eigenen Trupps (Sturmhorn): Dauer, Schaden, erlittener Schaden, Tempo, Heilung (Anteil) */
export interface RallySpec { dur: number; dmg: number; taken: number; speed: number; heal: number }

export interface AssistDef {
  id: AssistId;
  /** Platz 1 … 3 (Taste, Knopf) */
  slot: 1 | 2 | 3;
  label: string;
  /** Kurzname für Knöpfe */
  short: string;
  icon: string;
  /** Wer ihn ausführt (Anzeige) */
  who: string;
  desc: string;
  color: string;
  accent: string;
  /** Abklingzeit (s) */
  cd: number;
  /** bevorzugte Offiziere (Crew-Kennungen, in dieser Reihenfolge), sonst diese Rollen, sonst jeder Offizier im Landtrupp */
  crew: readonly string[];
  roles: readonly CrewRole[];
  /** Ausholen bis zur Wirkung (s) */
  windup: number;
  /** Zielbereich: so weit voraus (ohne Ziel), höchstens so weit entfernt (mit Ziel), Radius der Fläche */
  ahead: number;
  reach: number;
  radius: number;
  /** Treffer: Zahl, Abstand (s), Schaden je Treffer (× Angriffswert der Spielfigur), Haltung, Rückstoß, Hochschleudern, In-der-Luft-Halten */
  hits: number;
  every: number;
  dmg: number;
  poise: number;
  knock: number;
  launch: number;
  juggle: number;
  /** Getroffene in der Luft fallen so lange langsamer (s) – längere Luft-Kombos */
  airHold: number;
  /** Verbände: Wegschleudern */
  fling: number;
  /** Sturmhorn: Heilung (Anteil der Lebenspunkte), Willenskraft, Trupp-Stärkung, Offiziere (Heilung, Schadensbonus s) */
  heal: number;
  will: number;
  rally: RallySpec | null;
  allyHeal: number;
  allyBuff: number;
  /** Orkan: öffnet das Fenster der Sturm-Verfolgung (die Spielfigur kann hinterher teleportieren) */
  chase: boolean;
}

/** Die drei Kombo-Assists (Reihenfolge = Tasten 8, 9, 0) */
export const OFFICER_ASSISTS: readonly AssistDef[] = [
  {
    id: 'sperrfeuer', slot: 1, label: 'Sperrfeuer-Salve', short: 'Salve', icon: '✷', who: 'Kanonier / Schütze',
    desc: 'Explodierende Leuchtspur-Granaten decken den Zielbereich ein: brechen die gegnerische Haltung und halten hochgeschleuderte Gegner länger in der Luft.',
    color: '#FF9A3A', accent: '#FFE08A', cd: 24,
    crew: ['bruno', 'gun', 'look', 'lehrer'], roles: ['schaden'],
    windup: 0.3, ahead: 8, reach: 18, radius: 4.2,
    hits: 6, every: 0.11, dmg: 0.3, poise: 34, knock: 4, launch: 0, juggle: 6.2, airHold: 1.3, fling: 7,
    heal: 0, will: 0, rally: null, allyHeal: 0, allyBuff: 0, chase: false,
  },
  {
    id: 'orkan', slot: 2, label: 'Orkan-Schildstoß', short: 'Orkan', icon: '⛨', who: 'Krieger / Erste Maat',
    desc: 'Der Offizier stürmt vor und schleudert ganze Gegnergruppen hoch in die Luft – der perfekte Einstieg für deine Sturm-Verfolgung und eine Luft-Kombo.',
    color: '#7AD8FF', accent: '#E8FFF4', cd: 20,
    crew: ['ram', 'carp', 'schmied', 'tomo', 'helm'], roles: ['tank'],
    windup: 0.12, ahead: 6, reach: 15, radius: 4.8,
    hits: 1, every: 0, dmg: 0.85, poise: 60, knock: 3, launch: 10.6, juggle: 0, airHold: 0.6, fling: 16,
    heal: 0, will: 0, rally: null, allyHeal: 0, allyBuff: 0, chase: true,
  },
  {
    id: 'sturmhorn', slot: 3, label: 'Sturmhorn-Sammeln', short: 'Horn', icon: '♫', who: 'Steuermann / Schiffsarzt',
    desc: 'Eine goldene Schallwelle sammelt alle: heilt einen Teil deiner Lebenspunkte, füllt Willenskraft auf und stärkt deine Trupp-Soldaten und Offiziere.',
    color: '#FFD27A', accent: '#FFF4C8', cd: 45,
    crew: ['helm', 'arzt', 'musik', 'cook', 'esra'], roles: ['heiler', 'unterstuetzung'],
    windup: 0.45, ahead: 0, reach: 0, radius: 16,
    hits: 0, every: 0, dmg: 0, poise: 0, knock: 0, launch: 0, juggle: 0, airHold: 0, fling: 0,
    heal: 0.24, will: 35, rally: { dur: 12, dmg: 1.35, taken: 0.7, speed: 1.15, heal: 0.15 }, allyHeal: 0.3, allyBuff: 8, chase: false,
  },
];

export const ASSIST_BY_ID: Readonly<Record<AssistId, AssistDef>> = Object.fromEntries(OFFICER_ASSISTS.map((a) => [a.id, a])) as Record<AssistId, AssistDef>;

/** Was die Regeln über einen Offizier wissen müssen */
export interface AssistOfficer { readonly id: string; readonly role: CrewRole; readonly alive: boolean }

/** Laufzeit-Zustand (JSON-tauglich, nicht im Spielstand): Abklingzeit je Assist (s) */
export interface AssistState { cd: number[] }
export const newAssistState = (): AssistState => ({ cd: OFFICER_ASSISTS.map(() => 0) });

/** Abklingzeiten weiterzählen (Spielzeit) */
export function stepAssists(st: AssistState, dt: number) {
  for (let i = 0; i < st.cd.length; i++) if (st.cd[i] > 0) st.cd[i] = Math.max(0, st.cd[i] - dt);
}

/**
 * Wer führt den Assist aus? Zuerst die bevorzugten Offiziere in ihrer Reihenfolge, dann die passenden Rollen, dann jeder einsatzbereite
 * Offizier des Landtrupps (die Schiffskatze nie). −1 = niemand bereit.
 */
export function pickOfficer(def: AssistDef, officers: readonly AssistOfficer[]): number {
  for (const id of def.crew) for (let i = 0; i < officers.length; i++) if (officers[i].alive && officers[i].id === id) return i;
  for (let i = 0; i < officers.length; i++) if (officers[i].alive && def.roles.includes(officers[i].role)) return i;
  for (let i = 0; i < officers.length; i++) if (officers[i].alive && officers[i].role !== 'keine') return i;
  return -1;
}

/** Lage des Kampfes für die Prüfung */
export interface AssistContext { onFoot: boolean; busy: boolean }

/** Warum geht der Assist gerade nicht? null = bereit. Deutsche Texte für Meldung und Knopf. */
export function assistBlock(st: AssistState, i: number, officers: readonly AssistOfficer[], ctx: AssistContext): string | null {
  const def = OFFICER_ASSISTS[i];
  if (!def) return 'Unbekannter Befehl.';
  if (!ctx.onFoot) return 'Nur an Land mit deinem Landtrupp.';
  if (!officers.length) return 'Kein Offizier im Landtrupp.';
  if (pickOfficer(def, officers) < 0) return 'Alle Offiziere sind außer Gefecht.';
  if (ctx.busy) return 'Gerade nicht möglich.';
  if (st.cd[i] > 0) return `Noch ${Math.ceil(st.cd[i])} s.`;
  return null;
}

/** Abklingzeit als Anteil 0 (bereit) … 1 */
export const assistCdFrac = (st: AssistState, i: number): number => (OFFICER_ASSISTS[i] ? Math.min(1, st.cd[i] / OFFICER_ASSISTS[i].cd) : 0);

/**
 * Zielpunkt eines Assists: das erfasste Ziel (wenn nicht weiter als `reach`), sonst die dichteste Gruppe vor der Figur (Punkte `fx/fz`, je
 * Gegner, Anzahl n), sonst `ahead` Meter voraus. Schreibt in `out`.
 */
export function assistCenter(def: AssistDef, px: number, pz: number, yaw: number, lock: { x: number; z: number } | null, fx: ArrayLike<number>, fz: ArrayLike<number>, n: number, out: { x: number; z: number }) {
  if (lock && Math.hypot(lock.x - px, lock.z - pz) <= def.reach) { out.x = lock.x; out.z = lock.z; return out; }
  const sx = Math.sin(yaw), sz = Math.cos(yaw);
  let best = -1, bs = 0;
  for (let i = 0; i < n; i++) {
    const dx = fx[i] - px, dz = fz[i] - pz;
    const d = Math.hypot(dx, dz);
    if (d > def.reach || d < 0.5) continue;
    // vorn bevorzugt: hinter der Figur zählt ein Gegner halb
    const front = (dx * sx + dz * sz) / d > -0.2 ? 1 : 0.5;
    let score = 0;
    for (let k = 0; k < n; k++) if (Math.hypot(fx[k] - fx[i], fz[k] - fz[i]) <= def.radius) score++;
    score *= front;
    if (score > bs) { bs = score; best = i; }
  }
  if (best >= 0) { out.x = fx[best]; out.z = fz[best]; return out; }
  out.x = px + sx * def.ahead; out.z = pz + sz * def.ahead;
  return out;
}

/** Einschlagpunkt k (0 … hits−1) der Salve um die Mitte: Sonnenblumen-Muster (goldener Winkel), deterministisch */
export function salvoPoint(def: AssistDef, cx: number, cz: number, k: number, out: { x: number; z: number }) {
  const n = Math.max(1, def.hits);
  const r = def.radius * 0.78 * Math.sqrt((k + 0.5) / n);
  const a = k * 2.39996323 + 0.6;
  out.x = cx + Math.cos(a) * r; out.z = cz + Math.sin(a) * r;
  return out;
}

/** Schaden eines Treffers (Angriffswert der Spielfigur × Faktor; mit dem Treue-Bonus des Offiziers bis +20 %) */
export const assistDamage = (def: AssistDef, atk: number, loyal = 0): number => Math.round(Math.max(1, atk) * def.dmg * (1 + 0.2 * Math.max(0, Math.min(1, loyal))));

/** Gesamtschaden eines Assists in Angriffswerten (für die Balance: höchstens ein kleiner Zusatz zur eigenen Kette) */
export const assistBurst = (def: AssistDef): number => def.dmg * def.hits;
