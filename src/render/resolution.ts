// Phase 4.6J – Monitor-Auflösung getrennt von den Grafikstufen (rein, ohne DOM).
//
// Bis 4.6I setzte jede Grafikstufe ihr eigenes Pixelverhältnis (Niedrig 0,75 ×, Mittel 1 ×, Hoch bis 1,5 ×, Ultra mit Supersampling): wer die
// Stufe senkte, bekam ein unscharfes Bild mit treppigen Konturen. Jetzt gilt:
// - **Auflösung / Bildschärfe** wählt allein, mit wie vielen Pixeln gerechnet wird: `auto` = native Pixeldichte des Monitors (100 %, gedeckelt auf
//   DPR 2), feste Zielauflösungen 1080p / 1440p / 4K (auf kleineren Bildschirmen Supersampling, auf größeren hochskaliert) und `perf85`.
// - **Grafikstufen** (Niedrig … Ultra) behalten diese Auflösung und steuern nur noch Schatten, Bloom/Umgebungsverdeckung, Wasser-Spiegelungen,
//   Sichtweite von Bewuchs und Figuren und die Entfernung, bis zu der Stoff und Haare simuliert werden (`tierFeatures` in data/qualityTiers.ts).
// - Die dynamische Auflösung (Einstellung „Dynamische Auflösung“) senkt bei Rucklern weiter nur kurzzeitig und nie unter 0,75 × DPR.

export const RESOLUTION_MODES = ['auto', '1080p', '1440p', '4k', 'perf85'] as const;
export type ResolutionMode = (typeof RESOLUTION_MODES)[number];

export const RESOLUTION_LABEL: Readonly<Record<ResolutionMode, string>> = {
  auto: 'Automatisch (Monitor)',
  '1080p': '1080p (Full HD)',
  '1440p': '1440p (WQHD)',
  '4k': '4K (UHD)',
  perf85: 'Leistung (85 %)',
};

export const RESOLUTION_HINT: Readonly<Record<ResolutionMode, string>> = {
  auto: 'Rechnet mit der vollen Pixeldichte deines Bildschirms (bis zur doppelten Dichte) – gestochen scharfe Konturen auf jeder Grafikstufe.',
  '1080p': 'Feste Full-HD-Auflösung: auf kleineren Fenstern schärfer (Supersampling), auf großen Monitoren hochskaliert und schneller.',
  '1440p': 'Feste WQHD-Auflösung: sehr scharf, für starke Grafikkarten.',
  '4k': 'Feste UHD-Auflösung: höchste Bildschärfe (Supersampling auf kleineren Monitoren) – braucht eine sehr starke Grafikkarte.',
  perf85: 'Wie „Automatisch“, aber mit 85 % der Pixel: spürbar schneller, kaum weicher.',
};

export const RESOLUTION = {
  /** Automatisch: höchstens doppelte Pixeldichte (Handys mit DPR 3 rechnen mit 2) */
  autoDprCap: 2,
  /** Leistung: Anteil der automatischen Pixeldichte */
  perf: 0.85,
  /** Untergrenze und Obergrenze des Pixelverhältnisses, höchstens 4K-Pixel insgesamt */
  minRatio: 0.5,
  maxRatio: 3,
  maxPixels: 3840 * 2160,
  /** Zielhöhen der festen Auflösungen (Querformat; im Hochformat gilt die kürzere Seite), Seitenverhältnis 16 : 9 */
  target: { '1080p': 1080, '1440p': 1440, '4k': 2160 } as Readonly<Record<'1080p' | '1440p' | '4k', number>>,
} as const;

export const isResolutionMode = (v: unknown): v is ResolutionMode => typeof v === 'string' && (RESOLUTION_MODES as readonly string[]).includes(v);

/**
 * Pixelverhältnis (Renderpixel je CSS-Pixel) für ein Fenster von `cssW` × `cssH` CSS-Pixeln bei Geräte-Pixeldichte `dpr`. Hängt NICHT von der
 * Grafikstufe ab. Feste Auflösungen: die kürzere Bildseite bekommt die Zielhöhe (bzw. die längere 16/9 davon, was kleiner ist).
 */
export function renderPixelRatio(mode: ResolutionMode, cssW: number, cssH: number, dpr: number): number {
  const w = Math.max(1, cssW), h = Math.max(1, cssH);
  const nat = Math.min(Math.max(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, RESOLUTION.minRatio), RESOLUTION.autoDprCap);
  let r: number;
  if (mode === 'auto') r = nat;
  else if (mode === 'perf85') r = nat * RESOLUTION.perf;
  else {
    const th = RESOLUTION.target[mode];
    const short = Math.min(w, h), long = Math.max(w, h);
    r = Math.min(th / short, (th * 16) / 9 / long);
  }
  r = Math.min(RESOLUTION.maxRatio, Math.max(RESOLUTION.minRatio, r));
  if (w * h * r * r > RESOLUTION.maxPixels) r = Math.sqrt(RESOLUTION.maxPixels / (w * h));
  return r;
}

/** Renderauflösung in Pixeln (Anzeige im Menü, Prüfungen) */
export function renderSize(mode: ResolutionMode, cssW: number, cssH: number, dpr: number): { w: number; h: number } {
  const r = renderPixelRatio(mode, cssW, cssH, dpr);
  return { w: Math.round(Math.max(1, cssW) * r), h: Math.round(Math.max(1, cssH) * r) };
}
