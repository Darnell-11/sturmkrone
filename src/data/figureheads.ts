/**
 * Galionsfiguren (Daten): fünf skulpturierte Modelle aus Blender (`public/models/figureheads/<modell>.glb`, `tools/blender/build_figureheads.py`).
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
  /**
   * 4.9: obere Umrisslinie des Modells in der Seitenansicht, Maßstab 1 (m, [z, y] über dem Ursprung): obere konvexe Hülle aller Eckpunkte vom
   * höchsten Punkt nach vorn, gemessen aus der .glb (`qa_tmp/fhenv.mjs`) und um 2 cm nach vorn und oben aufgerundet. Die Bug-Rechnung
   * (`entities/ship/bowRig.ts`) führt den Vorstag über diese Linie. Neues Modell: Linie neu messen.
   */
  profile: readonly (readonly [number, number])[];
}

export const FIGUREHEAD_DEFS = {
  storm_dragon: { name: 'Gekrönter Sturmdrache', rarity: 'episch', desc: 'Ein gekrönter Drache, der den Sturm anruft: sein Maul speit Blitze, wenn das Schiff durch die Wellen schneidet.', halfW: 0.5, gemGlowFrom: 38, fallback: 'drache', profile: [[0.69, 1.84], [1.29, 1.84], [1.87, 1.26], [1.92, 1.19]] },
  valkyrie: { name: 'Meeres-Walküre', rarity: 'episch', desc: 'Die Meeres-Walküre breitet ihre Schwingen über den Bug und führt die Gefallenen sicher in den Hafen.', halfW: 1.15, gemGlowFrom: 46, fallback: 'meerfrau', profile: [[1.56, 2.12]] },
  leviathan_skull: { name: 'Leviathan-Schädel', rarity: 'selten', desc: 'Der Schädel eines erlegten Seeungeheuers: wer ihn am Bug trägt, hat dem Meer schon einmal getrotzt.', halfW: 0.62, gemGlowFrom: 30, fallback: 'kraken', profile: [[0.03, 1.5], [0.34, 1.45], [0.55, 1.36], [1.38, 0.95], [1.45, 0.82], [1.48, 0.08]] },
  royal_griffin: { name: 'Vergoldeter Greif', rarity: 'legendaer', desc: 'Ein vergoldeter Greif in Fürstengestalt: das Wappentier von Admiralen und Hofkapitänen.', halfW: 1.1, gemGlowFrom: 46, fallback: 'adler', profile: [[-0.18, 1.81], [0.63, 1.65], [0.96, 1.18], [1.01, 1.03], [1.14, 0.46], [1.15, 0.36]] },
  // 4.7D: nur am Bug der „Schwarzen Krone“ (Prolog) – nicht in der Werft (`STORY_FIGUREHEADS`)
  crowned_kraken: { name: 'Gekröntes Seeungeheuer', rarity: 'legendaer', desc: 'Ein rabenschwarzes Seeungeheuer mit eiserner Krone und Goldzähnen: Kapitän Schwarzbarts Zeichen.', halfW: 1.05, gemGlowFrom: 30, fallback: 'kraken', profile: [[0.68, 1.97], [1.29, 1.96], [1.85, 1.3]] },
} as const satisfies Record<string, FigureheadDef>;

export type FigureheadModelId = keyof typeof FIGUREHEAD_DEFS;
export const FIGUREHEAD_MODELS = Object.keys(FIGUREHEAD_DEFS) as FigureheadModelId[];
/** Figuren, die nur Story-Schiffe tragen (nie in Werft und Katalog) */
export const STORY_FIGUREHEADS: readonly FigureheadModelId[] = ['crowned_kraken'];

/** Kennungen aus der Zeit vor den Skulpturen */
export const LEGACY_FIGUREHEAD = { loewe: 'royal_griffin', drache: 'storm_dragon', adler: 'royal_griffin', meerfrau: 'valkyrie', kraken: 'leviathan_skull' } as const satisfies Record<string, FigureheadModelId>;
export type LegacyFigureheadId = keyof typeof LEGACY_FIGUREHEAD;

/** Auswahl in der Werft (Schlüssel = Kennung im Spielstand) */
export const FIGUREHEADS = { keine: 'Keine', ...Object.fromEntries(FIGUREHEAD_MODELS.filter((id) => !STORY_FIGUREHEADS.includes(id)).map((id) => [id, FIGUREHEAD_DEFS[id].name])) } as { keine: string } & Record<FigureheadModelId, string>;
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

/** Sitz der Figur am Vorsteven (m relativ zur Bug-Spitze `bowZ` und zur Reling am Bug `bowTop`) */
export const FIGUREHEAD_SEAT = { z: 0.15, y: -0.1 } as const;

/** 4.9: Umrisslinie, vorderste Spitze und höchster Punkt einer Figur in Schiffskoordinaten (Bug-Rechnung und Prüfungen) */
export function figureheadBounds(id: FigureheadModelId, L: number, W: number, bowZ: number, bowTop: number): { front: number; top: number; profile: { z: number; y: number }[] } {
  const s = figureheadScale(id, L, W);
  const profile = FIGUREHEAD_DEFS[id].profile.map(([z, y]) => ({ z: bowZ + FIGUREHEAD_SEAT.z + z * s, y: bowTop + FIGUREHEAD_SEAT.y + y * s }));
  let front = -Infinity, top = -Infinity;
  for (const p of profile) { if (p.z > front) front = p.z; if (p.y > top) top = p.y; }
  return { front, top, profile };
}
