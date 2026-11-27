// Phase 4.91 – 3-Akt-Regie der Formen I – X und der vier Geistes-Faji (rein, ohne three.js; getestet).
//
// Die 15 Ultimates haben seit 4.6I ihre große Kino-Regie (`graphics/ultimateCinematics.ts`, Kamera, Posen, Zeitlupe). Die Formen und die
// Geistes-Faji folgen jetzt demselben Aufbau – ohne der Spielerin die Kamera wegzunehmen (Formen kommen alle paar Sekunden):
//   Akt 1 – Aufladung beim Start der Form: der Himmel verdunkelt sich, eine Energiesäule steigt auf, Aura-Wirbel, die Kamera rückt heran
//           (Fokus-Puls auf das Sichtfeld).
//   Akt 2 – exakt im Treffermoment (stärkster Treffer der Form, bei Geschossen beim Einschlag): Hit-Stop und Anime-Impact-Frames.
//   Akt 3 – Explosion: gestaffelte radiale Druckwellen, Risse im Boden bzw. Gischt-Risse im Wasser, Element-Eruption, Nachbeben-Funken.
// Drei Stufen nach der Form: I – IV knapp (weiche Tusche-Bilder), V – VII stärker, VIII – X monumental (invertiertes Impact-Bild). Auf See
// (Kräfte am Steuer) wächst alles mit dem Maßstab der Schiffe (`SEA_CINE_SCALE`).

export type FormTier = 1 | 2 | 3;

export interface FormCinema {
  tier: FormTier;
  /** Akt 1 – Himmel verdunkeln (0 … 1), Energiesäule (Höhe in m, 0 = keine), Aura-Wirbel (Anzahl), Kamera-Annäherung (Fokus-Puls 0 … 1) */
  darken: number; pillar: number; swirls: number; focus: number;
  /** Akt 2 – Hit-Stop (s Echtzeit), Zeitmaß währenddessen, Impact-Bilder (0 = keine, sonst 2 – 4), weich = ohne invertiertes erstes Bild */
  hitstop: number; stopScale: number; frames: number; soft: boolean;
  /** Akt 3 – Radius der Druckwellen (m), gestaffelte Ringe, Risse, Nachbeben-Funken, Erschütterung (0 … 1,5) */
  shock: number; rings: number; cracks: number; after: number; shake: number;
}

/** Grundwerte der drei Stufen */
export const FORM_TIERS: Readonly<Record<FormTier, FormCinema>> = {
  1: { tier: 1, darken: 0.14, pillar: 4, swirls: 1, focus: 0.35, hitstop: 0.07, stopScale: 0.06, frames: 2, soft: true, shock: 3.6, rings: 2, cracks: 3, after: 10, shake: 0.35 },
  2: { tier: 2, darken: 0.28, pillar: 9, swirls: 2, focus: 0.6, hitstop: 0.1, stopScale: 0.05, frames: 2, soft: true, shock: 6, rings: 3, cracks: 5, after: 16, shake: 0.6 },
  3: { tier: 3, darken: 0.45, pillar: 22, swirls: 3, focus: 1, hitstop: 0.14, stopScale: 0.04, frames: 2, soft: false, shock: 9.5, rings: 4, cracks: 7, after: 24, shake: 0.95 },
};

/** Maßstab der Effekte auf See (Schiffe sind 20 – 70 m lang) */
export const SEA_CINE_SCALE = 2.4;

/** Stufe einer Form (Platz 1 … 10) */
export function formTier(slot: number): FormTier {
  const s = Math.max(1, Math.min(10, Math.round(Number.isFinite(slot) ? slot : 1)));
  return s >= 8 ? 3 : s >= 5 ? 2 : 1;
}

const FORMS: readonly FormCinema[] = Array.from({ length: 10 }, (_, i) => {
  const slot = i + 1, base = FORM_TIERS[formTier(slot)];
  // innerhalb der Stufe wächst die Wucht leicht mit; Form X (Finale) bekommt drei Impact-Bilder
  const step = slot >= 8 ? slot - 8 : slot >= 5 ? slot - 5 : slot - 1;
  const k = 1 + step * 0.08;
  return Object.freeze({ ...base, shock: +(base.shock * k).toFixed(2), after: Math.round(base.after * k), frames: slot === 10 ? 3 : base.frames });
});

/** Regie einer Form (Platz 1 … 10) */
export function formCinema(slot: number): FormCinema {
  const s = Math.max(1, Math.min(10, Math.round(Number.isFinite(slot) ? slot : 1)));
  return FORMS[s - 1];
}

/**
 * Regie der vier Geistes-Faji: 1 Willens-Entfesselung (Stufe 2), 2 Lebensstrom-Fokus (Heilung – Akt 2 ist ein Aufleuchten ohne Einschlag:
 * kein Hit-Stop, keine Impact-Bilder), 3 Erwachter Wille (Stufe 3), 4 Königsdruck (Stufe 3, drei Impact-Bilder).
 */
const GEIST: readonly FormCinema[] = [
  Object.freeze({ ...FORM_TIERS[2] }),
  Object.freeze({ ...FORM_TIERS[2], hitstop: 0, frames: 0, shake: 0.2, after: 20, cracks: 0 }),
  Object.freeze({ ...FORM_TIERS[3] }),
  Object.freeze({ ...FORM_TIERS[3], frames: 3, shock: 11, rings: 5, after: 30, shake: 1.1 }),
];

export function geistCinema(kind: number): FormCinema {
  const k = Math.max(1, Math.min(4, Math.round(Number.isFinite(kind) ? kind : 1)));
  return GEIST[k - 1];
}

/** Treffermoment einer Form: Index ihres stärksten Treffers (bei Gleichstand der spätere); −1 ohne Treffer */
export function decisiveHit(hits: readonly { dmg: number }[]): number {
  let best = -1, bd = -Infinity;
  for (let i = 0; i < hits.length; i++) if (hits[i].dmg >= bd) { bd = hits[i].dmg; best = i; }
  return best;
}

/**
 * Wo trifft ein Treffer (m vor der Figur)? Linien in ihrer Mitte, Kreise an ihrem Versatz, Bögen etwas vor der Figur. Für Geschosse zählt
 * der Einschlag (`projectileReach`).
 */
export function hitReach(h: { shape?: string; range: number; offset?: number }): number {
  if (h.shape === 'line') return h.range * 0.55;
  if (h.shape === 'circle') return h.offset ?? 0;
  return (h.offset ?? 0) + h.range * 0.4;
}

/** Flugzeit eines Geschosses bis zum Einschlag (s): Weg ÷ Tempo, höchstens 1,6 s */
export function projectileTime(dist: number, speed: number): number {
  return Math.min(1.6, Math.max(0.04, dist / Math.max(1, speed)));
}
