// Die fünf Grafikstufen. Werte hier ändern, nicht im Render-Code.
export const QUALITY_IDS = ['low', 'mid', 'high', 'max', 'ultra'] as const;
export type QualityTier = (typeof QUALITY_IDS)[number];

export interface QualityConfig {
  label: string;
  description: string;
  // 4.6J: keine Renderauflösung mehr je Stufe – die wählt allein „Auflösung / Bildschärfe“ (render/resolution.ts)
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
  /** Bezugs-Sichtweite in Metern für dichtes Wetter (Nebel, Sturm) und für Bewuchs-Sichtweiten */
  viewDistance: number;
  /**
   * Dunstweite bei klarem Wetter (Meter, 4.4.1): bis hierher löst sich alles in Luftperspektive auf (Inseln, Schiffe, Silhouetten). Muss unter der
   * Kamera-Fernebene bleiben (CAMERA_PLANES.far). Früher endete der Nebel auch bei klarem Wetter schon nach 420 – 960 m.
   */
  hazeRange: number;
  /** Bis zu dieser Entfernung werden Figuren (Bewohner, Gegner, Crew) gezeichnet */
  figureDistance: number;
  /** Echte Laternenlichter, die den nächsten Figuren folgen (0 = nur sichtbar leuchtende Laternen) */
  lamps: number;
  /** Multiplikator für Partikelmengen */
  particles: number;
  /** Detailstufe für Geometrie (Wellenauflösung, Vegetation …) */
  detail: number;
  /** Auflösung der gemalten Texturen (1 = Standard, 4 = Ultra) und Texturfilterung */
  textureScale: number;
  anisotropy: number;
  /**
   * Zusatzfaktor nur für die kleinen gemalten Texturen (Basis ≤ 256 px: Rumpfplanken, Pflaster, Erde, Rauch): Max malt sie in 1024 px,
   * Ultra in 2048 px (Basis 256 × textureScale × textureBoost). Große Basen (Deck 1024 px) bleiben bei Basis × textureScale.
   */
  textureBoost: number;
  /** Spiegelungen (IBL): Sekunden zwischen zwei Aufnahmen des Himmels; 0 = aus (einfacher Himmelsverlauf) */
  ibl: number;
  /** Sparstufe des Leistungs-Wächters (0 = keine), siehe render/watchdog.ts */
  budget?: number;
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

/**
 * Feste Schnittebenen der Spielkamera (Meter): nah 0,1 – nichts wird direkt vor der Kamera abgeschnitten;
 * fern 4800 – alles dahinter liegt im Nebel. Seit 4.3A reicht sie über die Horizont-Stufe der Inseln (HORIZON_LOD bis 4 500 m seit 4.3B, siehe
 * world/worldStreamer.ts): deren Silhouetten stehen nebelfrei am Horizont. Himmel (Kuppel 1000 m, Sonne 900 m, ohne Tiefe) und das Meer
 * bis zum Horizont werden auf die Fernebene gelegt statt abgeschnitten (sky.ts, ocean.ts). Tiefen-Effekte lesen die Werte von der Kamera.
 */
export const CAMERA_PLANES = { near: 0.1, far: 4800 };

/** Gemeinsamer Bild-Look aller Stufen */
export const RENDER_LOOK = {
  /** Belichtung vor dem ACES-Filmic-Tonemapping: hellt um ~5 % auf, nichts brennt weiß aus (gemessen Mittag/Abend/Nacht/Sturm/Stadt) */
  exposure: 1.1,
  /**
   * Selektiver HDR-Bloom (4.4C, nur ab Hoch): Schwelle über allem, was nur beleuchtet ist – gemessen im HDR-Puffer: Segel und Kreide mittags
   * höchstens 0,95, Schaum 1,0, der Himmel ist auf 0,9 begrenzt (sky.ts). Darüber liegen nur echte Lichtquellen: Laternenflammen ~2,6,
   * Mündungsfeuer ~2,2, Leuchtspuren ~2,3, Brandkugeln ~2,0, Lava ~1,25, Boss-Augen und Edelsteine ~1,5, Sonnen- und Mondscheibe, Sonnenglitzern.
   * Geringe Stärke, weicher Radius.
   */
  bloom: { threshold: 1.12, smoothing: 0.22, intensity: 0.95, radius: 0.85 },
  /** dezente Vignette an den Bildrändern */
  vignette: { offset: 0.4, darkness: 0.3 },
  /**
   * Belichtung je Tagesphase als Faktor (4.4C, weich gemischt über world/timeOfDay.ts `phaseWeights`): im Hochmittag etwas knapper, damit
   * Kreideklippen und Segel nicht ausbrennen, nachts etwas offener für silbriges Mondlicht und tiefe, lesbare Schatten.
   */
  phaseExposure: { morgengrauen: 1.06, mittag: 0.94, goldeneStunde: 1.0, nacht: 1.12 },
};

export const QUALITY_TIERS: Record<QualityTier, QualityConfig> = {
  low: {
    label: 'Niedrig',
    description: 'Für schwächere Handys. Keine Schatten, keine Nachbearbeitung, kurze Sichtweite für Bewuchs und Figuren, Stoff nur in der Nähe – flüssig auch auf älteren Geräten. Die Bildschärfe bleibt die gewählte Auflösung.',
    shadows: { enabled: false, mapSize: 0, soft: false, cascades: 0, far: 0, smallRange: 0 },
    // 4.4C: ohne Nachbearbeitung (ein Vollbild-Durchgang weniger, 60 Bilder je Sekunde); ACES-Tonemapping rechnet dann jedes Material selbst
    post: { enabled: false, bloom: false, outlines: false, colorGrading: false, godRays: false, depthOfField: false, ambientOcclusion: null },
    multisampling: 0,
    viewDistance: 420,
    hazeRange: 1500,
    figureDistance: 59,
    lamps: 0,
    particles: 0.35,
    detail: 0.5,
    textureScale: 1,
    anisotropy: 2,
    textureBoost: 1,
    ibl: 0,
  },
  mid: {
    label: 'Mittel',
    description: 'Für normale Handys. Einfache Schatten, Wasser mit Kleinwellen, keine Nachbearbeitung, mittlere Sichtweite – flüssige 60 Bilder je Sekunde.',
    shadows: { enabled: true, mapSize: 1024, soft: false, cascades: 1, far: 0, smallRange: 32 },
    // 4.4C: ohne Nachbearbeitung (HDR-Puffer, Bloom und Farbkorrektur kosteten am Handy die meiste Füllrate); Kantenglättung übernimmt der Bildpuffer
    post: { enabled: false, bloom: false, outlines: false, colorGrading: false, godRays: false, depthOfField: false, ambientOcclusion: null },
    multisampling: 2,
    viewDistance: 560,
    hazeRange: 2200,
    figureDistance: 78,
    lamps: 3,
    particles: 0.6,
    detail: 0.75,
    textureScale: 1,
    anisotropy: 4,
    textureBoost: 1,
    ibl: 20,
  },
  high: {
    label: 'Hoch',
    description: 'Für gute Handys und PCs. Gestaffelte weiche Schatten, Bloom und Kontaktschatten, Wasser-Spiegelungen, Konturen, Farbkorrektur, Sonnenstrahlen.',
    shadows: { enabled: true, mapSize: 2048, soft: true, cascades: 2, far: 180, smallRange: 45 },
    post: { enabled: true, bloom: true, outlines: true, colorGrading: true, godRays: true, depthOfField: true, ambientOcclusion: { dirs: 4, steps: 3, scale: 0.5, radius: 1.1, intensity: 0.85 }, heat: true, ssr: { steps: 14, scale: 0.5 } },
    multisampling: 4,
    viewDistance: 800,
    hazeRange: 3300,
    figureDistance: 112,
    lamps: 5,
    particles: 1,
    detail: 1,
    textureScale: 2,
    anisotropy: 8,
    textureBoost: 1,
    ibl: 8,
  },
  max: {
    label: 'Maximal',
    description: 'Für starke PCs. Drei Schattenkaskaden, alle Effekte, weite Sicht für Bewuchs und Figuren, Stoff und Haare weit hinaus simuliert.',
    shadows: { enabled: true, mapSize: 2048, soft: true, cascades: 3, far: 320, smallRange: 70 },
    post: { enabled: true, bloom: true, outlines: true, colorGrading: true, godRays: true, depthOfField: true, ambientOcclusion: { dirs: 6, steps: 4, scale: 0.5, radius: 1.3, intensity: 0.95 }, heat: true, ssr: { steps: 20, scale: 0.5 } },
    multisampling: 4,
    viewDistance: 900,
    hazeRange: 3900,
    figureDistance: 168,
    lamps: 6,
    particles: 1.5,
    detail: 1.25,
    textureScale: 2,
    anisotropy: 16,
    textureBoost: 2,
    ibl: 6,
  },
  ultra: {
    label: 'Ultra',
    description: 'Für sehr starke PCs. Hochauflösende Texturen, Schatten in höchster Schärfe und Reichweite, feinste Spiegelungen und Umgebungsverdeckung, weiteste Sicht.',
    shadows: { enabled: true, mapSize: 4096, soft: true, cascades: 4, far: 520, smallRange: 110 },
    post: { enabled: true, bloom: true, outlines: true, colorGrading: true, godRays: true, depthOfField: true, ambientOcclusion: { dirs: 8, steps: 5, scale: 0.75, radius: 1.4, intensity: 1 }, heat: true, ssr: { steps: 28, scale: 0.6 } },
    multisampling: 8,
    viewDistance: 960,
    hazeRange: 4300,
    figureDistance: 252,
    lamps: 6,
    particles: 2,
    detail: 1.6,
    textureScale: 4,
    anisotropy: 16,
    textureBoost: 2,
    ibl: 4,
  },
};

export function lowerTier(t: QualityTier): QualityTier | null {
  const i = QUALITY_IDS.indexOf(t);
  return i > 0 ? QUALITY_IDS[i - 1] : null;
}

/**
 * 4.6J: Was eine Grafikstufe steuert (rein, für Anzeige und Prüfung) – nie die Auflösung. Schatten (Kartengröße × Kaskaden, Reichweite), Bloom
 * und Umgebungsverdeckung, Wasser-Spiegelungen (0 keine, 1 Himmel und Kleinwellen, 2 zusätzlich Bildschirm-Spiegelungen), Sichtweite von
 * Bewuchs und Figuren (m) und die Entfernung, bis zu der Stoff, Haare und Ketten jedes Bild simuliert werden (m; Rig-Detailstufe „voll“).
 */
export interface TierFeatures { shadowTexels: number; shadowFar: number; bloom: boolean; ao: number; waterReflections: 0 | 1 | 2; vegetation: number; figures: number; cloth: number }

export function tierFeatures(tier: QualityTier): TierFeatures {
  const c = QUALITY_TIERS[tier];
  const ao = c.post.ambientOcclusion;
  // Rig: volle Stoff-Simulation bis 22 m × Detailfaktor (Figuren-Sichtweite / 112, gedeckelt wie Character.setRigDetail)
  const rig = Math.max(0.45, Math.min(1.3, c.figureDistance / 112));
  return {
    shadowTexels: c.shadows.enabled ? c.shadows.mapSize * Math.max(1, c.shadows.cascades) : 0,
    shadowFar: c.shadows.enabled ? c.shadows.far || c.shadows.smallRange : 0,
    bloom: c.post.enabled && c.post.bloom,
    ao: ao ? ao.dirs * ao.steps * ao.scale : 0,
    waterReflections: c.post.enabled && c.post.ssr ? 2 : c.detail > 0.5 ? 1 : 0,
    vegetation: c.viewDistance,
    figures: c.figureDistance,
    cloth: Math.round(22 * rig * 10) / 10,
  };
}
