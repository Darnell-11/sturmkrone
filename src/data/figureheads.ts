/**
 * Galionsfiguren (Daten): vier skulpturierte Modelle aus Blender (`public/models/figureheads/<modell>.glb`, `tools/blender/build_figureheads.py`).
 * Alte Kennungen aus früheren Spielständen und den Weltmächten (`loewe`, `drache`, `adler`, `meerfrau`, `kraken`) zeigen auf die neuen Figuren
 * (`LEGACY_FIGUREHEAD`), so bleiben alle Spielstände gültig. Neue Figuren: Eintrag hier, Modell nach `public/models/figureheads/`,
 * Name in `FIGUREHEAD_MODELS` (Ladeliste) – die Werft zeigt sie automatisch.
 */
import type { Rarity } from './rarity';

export interface FigureheadDef {
  name: string;
  /** Seltenheit für Katalog und Werft */
  rarity: Rarity;
  /** Beschreibung für Werft und Katalog */
  desc: string;
  /** Halbe Breite (m) der Figur in Maßstab 1: begrenzt den Maßstab auf schmalen Schiffen */
  halfW: number;
  /** Seltene Variante: Edelstein-Augen glimmen ab dieser Schiffsklasse (Länge in m) */
  gemGlowFrom: number;
  /** Ersatz aus Grundformen, falls das Modell nicht geladen werden konnte */
  fallback: 'drache' | 'adler' | 'meerfrau' | 'kraken';
}

export const FIGUREHEAD_DEFS = {
  storm_dragon: { name: 'Gekrönter Sturmdrache', rarity: 'episch', desc: 'Ein gekrönter Drache, der den Sturm anruft: sein Maul speit Blitze, wenn das Schiff durch die Wellen schneidet.', halfW: 0.5, gemGlowFrom: 38, fallback: 'drache' },
  valkyrie: { name: 'Meeres-Walküre', rarity: 'episch', desc: 'Die Meeres-Walküre breitet ihre Schwingen über den Bug und führt die Gefallenen sicher in den Hafen.', halfW: 1.15, gemGlowFrom: 46, fallback: 'meerfrau' },
  leviathan_skull: { name: 'Leviathan-Schädel', rarity: 'selten', desc: 'Der Schädel eines erlegten Seeungeheuers: wer ihn am Bug trägt, hat dem Meer schon einmal getrotzt.', halfW: 0.62, gemGlowFrom: 30, fallback: 'kraken' },
  royal_griffin: { name: 'Vergoldeter Greif', rarity: 'legendaer', desc: 'Ein vergoldeter Greif in Fürstengestalt: das Wappentier von Admiralen und Hofkapitänen.', halfW: 1.1, gemGlowFrom: 46, fallback: 'adler' },
} as const satisfies Record<string, FigureheadDef>;

export type FigureheadModelId = keyof typeof FIGUREHEAD_DEFS;
export const FIGUREHEAD_MODELS = Object.keys(FIGUREHEAD_DEFS) as FigureheadModelId[];

/** Kennungen aus der Zeit vor den Skulpturen */
export const LEGACY_FIGUREHEAD = { loewe: 'royal_griffin', drache: 'storm_dragon', adler: 'royal_griffin', meerfrau: 'valkyrie', kraken: 'leviathan_skull' } as const satisfies Record<string, FigureheadModelId>;
export type LegacyFigureheadId = keyof typeof LEGACY_FIGUREHEAD;

/** Auswahl in der Werft (Schlüssel = Kennung im Spielstand) */
export const FIGUREHEADS = { keine: 'Keine', ...Object.fromEntries(FIGUREHEAD_MODELS.map((id) => [id, FIGUREHEAD_DEFS[id].name])) } as { keine: string } & Record<FigureheadModelId, string>;
export type FigureheadId = 'keine' | FigureheadModelId | LegacyFigureheadId;

/** Modell zu einer Kennung (null = keine Figur oder unbekannt) */
export function figureheadModel(id: string | undefined): FigureheadModelId | null {
  if (!id || id === 'keine') return null;
  if (id in FIGUREHEAD_DEFS) return id as FigureheadModelId;
  return (LEGACY_FIGUREHEAD as Record<string, FigureheadModelId>)[id] ?? null;
}

/**
 * Maßstab einer Figur auf einem Schiff: wächst mit der Länge (`sc = L / 15`), höchstens 2,2, und die Flügel bleiben höchstens halb so breit wie
 * der Rumpf (Breite W), damit sie auf Schaluppen nicht über die Bordwand ragen.
 */
export function figureheadScale(id: FigureheadModelId, L: number, W: number): number {
  const sc = L / 15;
  return Math.max(0.55, Math.min(2.2, 0.8 * sc, (W * 0.55) / FIGUREHEAD_DEFS[id].halfW));
}
