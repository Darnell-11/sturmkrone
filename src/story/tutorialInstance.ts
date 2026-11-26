// Phase 4.7A – Instanz-Regeln als reine Daten: Prolog → private Einführung „Ankerglück“ (Stufe 1 → 3) → geteilte MMO-Welt.
//
// Der Spielstand trägt seit Version 24 `progress.instance` (JSON). Solange die Instanz privat ist (Prolog oder Einführung), ruht der offene
// Verkehr: keine zufälligen Schiffe, keine Welt-Ereignisse und Konvois, kein Krieg der Mächte, keine Raids, keine Mitspieler. Erst wenn der
// Kurogane-Überfall abgewehrt ist und der Bürgermeister gedankt hat, löst sich die Instanz in die geteilte Welt auf – ab dann sind andere
// Kapitäne sichtbar (bis zum Netz in Phase 4.8 lokale Stellvertreter) und die Welt steht der Kampagne (4.7B) und Gruppen (4.8) offen.
// Ein Server kann dieselben Übergänge später je Spieler führen (`InstanceSave` ist die Wahrheit, die Welt zeigt nur).
import { TUTORIAL, TUTORIAL_QUESTS } from '../data/prologue';

export type InstanceMode = 'prolog' | 'tutorial' | 'shared';
export const INSTANCE_MODES: readonly InstanceMode[] = ['prolog', 'tutorial', 'shared'];

export interface InstanceSave {
  v: 1;
  mode: InstanceMode;
  /** Prolog und Einführung wurden übersprungen (Schnelltest) bzw. der Stand stammt aus der Zeit vor 4.7A */
  skipped: boolean;
  /** die ranzige Schaluppe ist übergeben (vorher hat man in der Einführung kein Schiff) */
  ship: boolean;
  /** Spielzeit (s), zu der sich die Instanz in die geteilte Welt aufgelöst hat; −1 = noch privat */
  sharedAt: number;
  /** Kurogane-Überfall läuft bzw. ist abgewehrt */
  raid: 'none' | 'running' | 'repelled';
}

/** Neues Spiel: beginnt im Prolog */
export function newInstance(): InstanceSave {
  return { v: 1, mode: 'prolog', skipped: false, ship: false, sharedAt: -1, raid: 'none' };
}

/** Bestehende Spielstände (vor Version 24): direkt in der offenen Welt, nichts geht verloren */
export function legacyInstance(): InstanceSave {
  return { v: 1, mode: 'shared', skipped: true, ship: true, sharedAt: 0, raid: 'repelled' };
}

/** Säubern beim Laden: fehlt das Feld oder ist es kaputt, gilt der Stand als offen (lieber offene Welt als ein Neustart der Einführung) */
export function cleanInstance(raw: unknown): InstanceSave {
  if (!raw || typeof raw !== 'object') return legacyInstance();
  const r = raw as Record<string, unknown>;
  const mode = (INSTANCE_MODES as readonly unknown[]).includes(r.mode) ? (r.mode as InstanceMode) : 'shared';
  const s: InstanceSave = {
    v: 1, mode,
    skipped: r.skipped === true,
    ship: r.ship === true || mode === 'shared',
    sharedAt: typeof r.sharedAt === 'number' && Number.isFinite(r.sharedAt) ? r.sharedAt : mode === 'shared' ? 0 : -1,
    raid: r.raid === 'running' || r.raid === 'repelled' ? r.raid : mode === 'shared' ? 'repelled' : 'none',
  };
  // ein unterbrochener Überfall beginnt beim Laden neu (die Angreifer sind nicht gespeichert)
  if (s.raid === 'running') s.raid = 'none';
  return s;
}

export const isPrivate = (s: InstanceSave): boolean => s.mode !== 'shared';

/** Der Prolog ist vorbei: Erwachen am Strand von Ankerglück (private Instanz) */
export function enterTutorial(s: InstanceSave): InstanceSave {
  if (s.mode === 'prolog') s.mode = 'tutorial';
  return s;
}

/** Der Bürgermeister hat gedankt: die private Instanz löst sich in die geteilte Welt auf */
export function dissolve(s: InstanceSave, playTime: number): InstanceSave {
  if (s.mode === 'shared') return s;
  s.mode = 'shared';
  s.sharedAt = Math.max(0, playTime);
  s.ship = true;
  s.raid = 'repelled';
  return s;
}

/** Prolog (und Einführung) überspringen: direkt in die offene Welt mit dem Endstand der Einführung */
export function skipIntro(s: InstanceSave, playTime: number): InstanceSave {
  s.skipped = true;
  return dissolve(s, playTime);
}

/** Was in der Welt gerade läuft (die Seewelt schaltet danach): offener Verkehr, Mitspieler, Leine um Ankerglück */
export interface WorldGates {
  /** zufällige Schiffe, Welt-Ereignisse, Konvois, Krieg der Mächte, Raids, Kaiser */
  traffic: boolean;
  /** andere Kapitäne sichtbar */
  presence: boolean;
  /** das Schiff darf sich höchstens `TUTORIAL.leash` m von Ankerglück entfernen */
  leash: boolean;
  /** Prolog-Bühne (eigenes Wetter, eigenes Schiff, keine Speicherung des Schiffs) */
  stage: boolean;
}

export function worldGates(s: InstanceSave): WorldGates {
  switch (s.mode) {
    case 'prolog': return { traffic: false, presence: false, leash: false, stage: true };
    case 'tutorial': return { traffic: false, presence: false, leash: true, stage: false };
    default: return { traffic: true, presence: true, leash: false, stage: false };
  }
}

/** Liegt (x, z) außerhalb der Leine um Ankerglück (Mitte cx, cz)? */
export const beyondLeash = (x: number, z: number, cx: number, cz: number): boolean => Math.hypot(x - cx, z - cz) > TUTORIAL.leash;

/** Ist ein Auftrag einer aus der Einführung? */
export const isTutorialQuest = (id: string): boolean => (TUTORIAL_QUESTS as readonly string[]).includes(id);

/**
 * Endstand der Einführung, den „Überspringen“ und alte Stände brauchen: Stufe, erste Waffe, Schaluppe, Start-Crew. Liefert nur Zahlen –
 * das Spiel wendet sie an (Erfahrung, Ausrüstung, Schiff, Crew).
 */
export const TUTORIAL_END = { level: TUTORIAL.level3, crew: TUTORIAL.starterCrew, gold: TUTORIAL.thanksGold } as const;
