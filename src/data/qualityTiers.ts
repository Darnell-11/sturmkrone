// Die fünf Grafikstufen. Werte hier ändern, nicht im Render-Code.
export const QUALITY_IDS = ['low', 'mid', 'high', 'max', 'ultra'] as const;
export type QualityTier = (typeof QUALITY_IDS)[number];

export interface QualityConfig {
  label: string;
  description: string;
  /** Renderauflösung relativ zu CSS-Pixeln; null = native Geräteauflösung */
  pixelRatio: number | null;
  /** Obergrenze für das Pixelverhältnis */
  maxPixelRatio: number;
  /** Höchstzahl gerenderter Pixel (Breite × Höhe), 4K = 3840 × 2160 */
  maxPixels: number;
  shadows: { enabled: boolean; mapSize: number; soft: boolean };
  post: {
    enabled: boolean;
    bloom: boolean;
    outlines: boolean;
    colorGrading: boolean;
    godRays: boolean;
    depthOfField: boolean;
    ambientOcclusion: boolean;
  };
  /** Kantenglättung im Post-Effekt-Puffer (0 = aus) */
  multisampling: number;
  /** Sichtweite in Metern (Nebel-Ende und Kamera-Fernebene) */
  viewDistance: number;
  /** Multiplikator für Partikelmengen */
  particles: number;
  /** Detailstufe für Geometrie (Wellenauflösung, Vegetation …) */
  detail: number;
  /** Auflösung der gemalten Texturen (1 = Standard, 4 = Ultra) und Texturfilterung */
  textureScale: number;
  anisotropy: number;
  /** Supersampling: mehr Pixel rendern als der Bildschirm hat (Ultra, begrenzt durch maxPixels) */
  supersample: number;
}

export const QUALITY_TIERS: Record<QualityTier, QualityConfig> = {
  low: {
    label: 'Niedrig',
    description: 'Für schwächere Handys. Keine Schatten, aber derselbe Farblook – flüssig auch auf älteren Geräten.',
    pixelRatio: 0.75,
    maxPixelRatio: 0.75,
    maxPixels: 1280 * 720,
    shadows: { enabled: false, mapSize: 0, soft: false },
    // nur ein günstiger Durchgang für Farbkorrektur, damit der Look derselbe bleibt
    post: { enabled: true, bloom: false, outlines: false, colorGrading: true, godRays: false, depthOfField: false, ambientOcclusion: false },
    multisampling: 0,
    viewDistance: 420,
    particles: 0.35,
    detail: 0.5,
    textureScale: 1,
    anisotropy: 2,
    supersample: 1,
  },
  mid: {
    label: 'Mittel',
    description: 'Für normale Handys. Einfache Schatten, Leuchten und Farbkorrektur.',
    pixelRatio: 1,
    maxPixelRatio: 1,
    maxPixels: 1920 * 1080,
    shadows: { enabled: true, mapSize: 1024, soft: false },
    // Farbkorrektur kostet kaum etwas (läuft im selben Durchgang) und gehört zum Look
    post: { enabled: true, bloom: true, outlines: false, colorGrading: true, godRays: false, depthOfField: false, ambientOcclusion: false },
    multisampling: 2,
    viewDistance: 560,
    particles: 0.6,
    detail: 0.75,
    textureScale: 1,
    anisotropy: 4,
    supersample: 1,
  },
  high: {
    label: 'Hoch',
    description: 'Für gute Handys und PCs. Weiche Schatten, Konturen, Farbkorrektur, Sonnenstrahlen.',
    pixelRatio: 1.5,
    maxPixelRatio: 1.5,
    maxPixels: 2560 * 1440,
    shadows: { enabled: true, mapSize: 2048, soft: true },
    post: { enabled: true, bloom: true, outlines: true, colorGrading: true, godRays: true, depthOfField: false, ambientOcclusion: false },
    multisampling: 4,
    viewDistance: 800,
    particles: 1,
    detail: 1,
    textureScale: 2,
    anisotropy: 8,
    supersample: 1,
  },
  max: {
    label: 'Maximal',
    description: 'Für starke PCs. Native Auflösung bis 4K, alle Effekte, größte Sichtweite.',
    pixelRatio: null,
    maxPixelRatio: 3,
    maxPixels: 3840 * 2160,
    shadows: { enabled: true, mapSize: 4096, soft: true },
    post: { enabled: true, bloom: true, outlines: true, colorGrading: true, godRays: true, depthOfField: true, ambientOcclusion: true },
    multisampling: 4,
    viewDistance: 1200,
    particles: 1.5,
    detail: 1.25,
    textureScale: 2,
    anisotropy: 16,
    supersample: 1,
  },
  ultra: {
    label: 'Ultra',
    description: 'Für sehr starke PCs. Bis 4K mit Supersampling, hochauflösende Texturen, Schatten in höchster Schärfe und Reichweite, weiteste Sicht.',
    pixelRatio: null,
    maxPixelRatio: 4,
    maxPixels: 3840 * 2160,
    shadows: { enabled: true, mapSize: 8192, soft: true },
    post: { enabled: true, bloom: true, outlines: true, colorGrading: true, godRays: true, depthOfField: true, ambientOcclusion: true },
    multisampling: 8,
    viewDistance: 1800,
    particles: 2,
    detail: 1.6,
    textureScale: 4,
    anisotropy: 16,
    supersample: 1.5,
  },
};

export function lowerTier(t: QualityTier): QualityTier | null {
  const i = QUALITY_IDS.indexOf(t);
  return i > 0 ? QUALITY_IDS[i - 1] : null;
}
