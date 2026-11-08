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
  /**
   * Schatten. cascades ≥ 2: Kaskadierte Schattenkarten (CSM) – mehrere Karten hintereinander,
   * nah gestochen scharf, in der Ferne weich auslaufend bis `far` Meter. 1 = eine Karte um die Figur.
   */
  /** smallRange: kleine Dinge (< 1,6 m: Figuren, Kisten, Pflanzen) werfen nur bis zu dieser Entfernung Schatten */
  shadows: { enabled: boolean; mapSize: number; soft: boolean; cascades: number; far: number; smallRange: number };
  post: {
    enabled: boolean;
    bloom: boolean;
    outlines: boolean;
    colorGrading: boolean;
    godRays: boolean;
    depthOfField: boolean;
    /** Umgebungsverdeckung (Kontaktschatten in Ecken und an Übergängen); null = aus */
    ambientOcclusion: AoConfig | null;
    /** Hitzeflimmern um Feuer, Explosionen und aufladende Kämpfer */
    heat?: boolean;
    /** Bildschirm-Spiegelungen (Wasser, Pfützen, spiegelnde Böden): Strahlschritte und Auflösung; null = aus */
    ssr?: { steps: number; scale: number } | null;
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
  /** Spiegelungen (IBL): Sekunden zwischen zwei Aufnahmen des Himmels; 0 = aus (einfacher Himmelsverlauf) */
  ibl: number;
}

/** Horizont-basierte Umgebungsverdeckung (GTAO-Art), in halber Auflösung berechnet */
export interface AoConfig {
  /** Suchrichtungen und Schritte je Richtung (Qualität gegen Kosten) */
  dirs: number;
  steps: number;
  /** Auflösung der Berechnung relativ zum Bild */
  scale: number;
  /** Reichweite in Metern und Stärke */
  radius: number;
  intensity: number;
}

/** Handy-Grafikchips sind viel schwächer: dort rechnet die Umgebungsverdeckung mit weniger Proben */
export const MOBILE_AO_LIMIT = { dirs: 3, steps: 3, scale: 0.5 };

/** Gemeinsamer Bild-Look aller Stufen */
export const RENDER_LOOK = {
  /** Belichtung vor dem ACES-Filmic-Tonemapping: hellt um ~5 % auf, nichts brennt weiß aus (gemessen Mittag/Abend/Nacht/Sturm/Stadt) */
  exposure: 1.1,
  /** Leuchten nur über Helligkeit 1: Sonne, Laternen, Magie – normale Flächen bleiben im Mittag unter 0,8 */
  bloom: { threshold: 1.0, smoothing: 0.12, intensity: 1.0, radius: 0.7 },
  /** dezente Vignette an den Bildrändern */
  vignette: { offset: 0.38, darkness: 0.42 },
};

export const QUALITY_TIERS: Record<QualityTier, QualityConfig> = {
  low: {
    label: 'Niedrig',
    description: 'Für schwächere Handys. Keine Schatten, aber derselbe Farblook – flüssig auch auf älteren Geräten.',
    pixelRatio: 0.75,
    maxPixelRatio: 0.75,
    maxPixels: 1280 * 720,
    shadows: { enabled: false, mapSize: 0, soft: false, cascades: 0, far: 0, smallRange: 0 },
    // nur ein günstiger Durchgang für Farbkorrektur, damit der Look derselbe bleibt
    post: { enabled: true, bloom: false, outlines: false, colorGrading: true, godRays: false, depthOfField: false, ambientOcclusion: null },
    multisampling: 0,
    viewDistance: 420,
    particles: 0.35,
    detail: 0.5,
    textureScale: 1,
    anisotropy: 2,
    supersample: 1,
    ibl: 0,
  },
  mid: {
    label: 'Mittel',
    description: 'Für normale Handys. Einfache Schatten, Leuchten und Farbkorrektur.',
    pixelRatio: 1,
    maxPixelRatio: 1,
    maxPixels: 1920 * 1080,
    shadows: { enabled: true, mapSize: 1024, soft: false, cascades: 1, far: 0, smallRange: 32 },
    // Farbkorrektur kostet kaum etwas (läuft im selben Durchgang) und gehört zum Look
    post: { enabled: true, bloom: true, outlines: false, colorGrading: true, godRays: false, depthOfField: false, ambientOcclusion: null },
    multisampling: 2,
    viewDistance: 560,
    particles: 0.6,
    detail: 0.75,
    textureScale: 1,
    anisotropy: 4,
    supersample: 1,
    ibl: 20,
  },
  high: {
    label: 'Hoch',
    description: 'Für gute Handys und PCs. Gestaffelte weiche Schatten, Kontaktschatten, Konturen, Farbkorrektur, Sonnenstrahlen.',
    pixelRatio: 1.5,
    maxPixelRatio: 1.5,
    maxPixels: 2560 * 1440,
    shadows: { enabled: true, mapSize: 2048, soft: true, cascades: 2, far: 180, smallRange: 45 },
    post: { enabled: true, bloom: true, outlines: true, colorGrading: true, godRays: true, depthOfField: true, ambientOcclusion: { dirs: 4, steps: 3, scale: 0.5, radius: 1.1, intensity: 0.85 }, heat: true, ssr: { steps: 14, scale: 0.5 } },
    multisampling: 4,
    viewDistance: 800,
    particles: 1,
    detail: 1,
    textureScale: 2,
    anisotropy: 8,
    supersample: 1,
    ibl: 8,
  },
  max: {
    label: 'Maximal',
    description: 'Für starke PCs. Native Auflösung bis 4K, alle Effekte, größte Sichtweite.',
    pixelRatio: null,
    maxPixelRatio: 3,
    maxPixels: 3840 * 2160,
    shadows: { enabled: true, mapSize: 2048, soft: true, cascades: 3, far: 320, smallRange: 70 },
    post: { enabled: true, bloom: true, outlines: true, colorGrading: true, godRays: true, depthOfField: true, ambientOcclusion: { dirs: 6, steps: 4, scale: 0.5, radius: 1.3, intensity: 0.95 }, heat: true, ssr: { steps: 20, scale: 0.5 } },
    multisampling: 4,
    viewDistance: 1200,
    particles: 1.5,
    detail: 1.25,
    textureScale: 2,
    anisotropy: 16,
    supersample: 1,
    ibl: 6,
  },
  ultra: {
    label: 'Ultra',
    description: 'Für sehr starke PCs. Bis 4K mit Supersampling, hochauflösende Texturen, Schatten in höchster Schärfe und Reichweite, weiteste Sicht.',
    pixelRatio: null,
    maxPixelRatio: 4,
    maxPixels: 3840 * 2160,
    shadows: { enabled: true, mapSize: 4096, soft: true, cascades: 4, far: 520, smallRange: 110 },
    post: { enabled: true, bloom: true, outlines: true, colorGrading: true, godRays: true, depthOfField: true, ambientOcclusion: { dirs: 8, steps: 5, scale: 0.75, radius: 1.4, intensity: 1 }, heat: true, ssr: { steps: 28, scale: 0.6 } },
    multisampling: 8,
    viewDistance: 1800,
    particles: 2,
    detail: 1.6,
    textureScale: 4,
    anisotropy: 16,
    supersample: 1.5,
    ibl: 4,
  },
};

export function lowerTier(t: QualityTier): QualityTier | null {
  const i = QUALITY_IDS.indexOf(t);
  return i > 0 ? QUALITY_IDS[i - 1] : null;
}
