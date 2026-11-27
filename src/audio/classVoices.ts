// Phase 4.9 – Klang je Klasse, Form und Element (rein: nur die Zuordnung; die Stimmen selbst erzeugt `AudioEngine` prozedural).
// Jede der 15 Spezialisierungen hat eine eigene Signatur für ihre Formen (Faust: dumpfe Druckwelle, Klingen: scharfes Zischen, Faji: Element),
// ab Form 6 klingt dieselbe Signatur schwerer (eine zweite, tiefere Schicht über `formVoiceLayer`).
import type { Sfx } from './audio';

/** Grundstimme der Formen je Kampfstil (Darstellungs-Stil der Engine) */
// 4.93A: die Faustkämpfer (`sturmfaust`, `erdspalter`) haben hier keine Einzelton-Signatur mehr – ihre Formen klingen über die vier Schichten der
// Kino-DSP (`kinoCues.ts`); die Seewelt ruft `elementVoice` für Regie-Aktionen gar nicht erst auf
export const STYLE_VOICE: Readonly<Record<string, Sfx>> = {
  doppel: 'bladeHiss', saebel: 'bladeHiss', langklinge: 'bladeWave', zweihaender: 'impactCrack',
  feuer: 'fireHiss', eis: 'iceShatter', wasser: 'tidalRoar', wind: 'windHowl', blitz: 'whipCrack', sonne: 'sunChoir', mond: 'moonChime', schwarzloch: 'voidRumble',
  priester: 'choirBell',
};

/** Stimme eines Elements (Faji-Geschosse, Geistes-Faji, Einschläge) */
export const ELEMENT_VOICE: Readonly<Record<string, Sfx>> = {
  feuer: 'fireHiss', eis: 'iceShatter', wasser: 'tidalRoar', wind: 'windHowl', blitz: 'whipCrack', sonne: 'sunChoir', mond: 'moonChime', schwarzloch: 'voidRumble',
  licht: 'choirBell', priester: 'choirBell', erde: 'fistQuake', stahl: 'bladeHiss',
};

/** Stimme einer Form: das Element, sonst die Signatur des Stils, sonst ein Klingenbogen */
export function elementVoice(style: string, el: string, slot: number): Sfx {
  void slot;
  return ELEMENT_VOICE[el] ?? STYLE_VOICE[style] ?? 'bladeWave';
}

/** Ab Form 6 liegt unter der Stimme eine tiefe Schicht (Gewicht der hohen Formen); null = keine */
export function formVoiceLayer(slot: number): Sfx | null {
  return slot >= 9 ? 'quakeRumble' : slot >= 6 ? 'impactCrack' : null;
}
