// Phase 4.6F: Zuordnung eines (auch alten) Aussehens auf das neue Figuren-Rig – rein, ohne three.js.
// Spielstände bis Version 22 tragen nur `CharacterLook` (Körperbau, Augen, Brauen, Mund, Kleidung); daraus entsteht hier, was das Rig braucht:
// Statur, Grundzüge der Mimik, welche Federketten schwingen. Unbekannte oder fehlende Werte fallen auf sichere Vorgaben zurück – ein Spielstand
// lädt immer, und nichts davon wird gespeichert (das Rig leitet es bei jedem Laden neu ab).
import { BUILD_OF_BODY, BUILDS, FACE_TRAITS, type BuildId } from '../../../data/characterRig';
import type { CharacterLook } from '../../../data/characterParts';
import { loadoutFromLook, resolveLoadout } from '../../../data/equipment';

export interface RigProfile {
  build: BuildId;
  /** Grundzüge der Mimik (gültige Schlüssel aus FACE_TRAITS, sonst neutral) */
  eyes: string; brows: string; mouth: string;
  /** Welche Federketten die Figur trägt */
  chains: { tails: boolean; cape: boolean; drape: boolean; hair: boolean; scarf: boolean; sash: boolean };
  /** Körpergröße (begrenzt wie im Editor) */
  height: number;
}

const pick = (v: unknown, keys: Record<string, unknown>, fallback: string) => (typeof v === 'string' && v in keys ? v : fallback);

/** Rig-Profil aus einem Aussehen (alte Spielstände, Editor, Stadtleute) */
export function rigProfile(look: Partial<CharacterLook> | null | undefined): RigProfile {
  const l = (look ?? {}) as Partial<CharacterLook>;
  const build = (BUILD_OF_BODY[l.body as string] ?? 'athletisch') as BuildId;
  const h = typeof l.height === 'number' && Number.isFinite(l.height) ? Math.min(1.1, Math.max(0.9, l.height)) : 1;
  const chains = { tails: false, cape: false, drape: false, hair: true, scarf: false, sash: false };
  try {
    const R = resolveLoadout(loadoutFromLook(l as CharacterLook));
    const worn = R.shells.map((s) => s.kind);
    chains.tails = worn.includes('mantelLang') || worn.includes('kilt');
    chains.cape = !!R.cape;
    chains.drape = !!R.cape?.drape;
    chains.scarf = worn.includes('schal');
    chains.sash = R.rigid.some((r) => r.build === 'knoten');
    chains.hair = !R.glb.some((g) => g.hidesHair);
  } catch {
    // unvollständiges Aussehen: Kleidung bleibt ohne Ketten, die Figur lädt trotzdem
  }
  return {
    build: build in BUILDS ? build : 'athletisch',
    eyes: pick(l.eyes, FACE_TRAITS.eyes, 'gross'),
    brows: pick(l.brows, FACE_TRAITS.brows, 'normal'),
    mouth: pick(l.mouth, FACE_TRAITS.mouth, 'laecheln'),
    chains,
    height: h,
  };
}
