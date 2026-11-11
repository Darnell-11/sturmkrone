import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  CustomBlending,
  HalfFloatType,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PCFShadowMap,
  SrcAlphaFactor,
  WebGLRenderer,
  MathUtils,
  ZeroFactor,
  type Camera,
  type Material,
  type Mesh,
  type PerspectiveCamera,
  type Scene,
  Vector3,
} from 'three';
import {
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  GodRaysEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  type Effect,
} from 'postprocessing';
import { budgetConfig } from './watchdog';
import { MOBILE_AO_LIMIT, QUALITY_TIERS, RENDER_LOOK, type QualityConfig, type QualityTier } from '../data/qualityTiers';
import { AoEffect, AoPass } from './gtao';
import { HeatEffect, heatShared } from './heat';
import { installAtmosphere } from './atmosphere';
import { ensureCsm } from './csm';
import { EdgeEffect, OpaqueEffect, WATER_ALPHA, setHullsVisible } from './outline';
import { GradeEffect } from './grade';
import { SsrEffect, SsrPass } from './ssr';
import { DynamicResolution } from './dynamicResolution';
import { installShaderLogFilter } from './shaderLog';

export class WebGLUnavailableError extends Error {}

/** Grundstärke der Sonnenstrahlen */
const GOD_WEIGHT = 0.26;

/**
 * Schutz vor „schwarzen Blöcken": Ein einziger ungültiger Bildpunkt (NaN/Unendlich aus irgendeinem Material) würde
 * vom Mipmap-Weichzeichner des Bloom über große Teile des Bildes verschmiert und als schwarzes Flackern sichtbar.
 * Der Helligkeits-Filter des Bloom verwirft solche Werte deshalb und begrenzt die Helligkeit.
 */
function guardBloom(bloom: BloomEffect) {
  const mat = bloom.luminanceMaterial;
  const read = 'vec4 texel=texture2D(inputBuffer,vUv);';
  if (!mat.fragmentShader.includes(read)) {
    if (import.meta.env.DEV) console.warn('Bloom-Schutz: Shader der Bibliothek hat sich geändert, Schutz nicht aktiv');
    return;
  }
  mat.fragmentShader = mat.fragmentShader.replace(read, read + 'if(!(dot(abs(texel.rgb),vec3(1.0))<1.0e6)){texel=vec4(0.0);}texel.rgb=clamp(texel.rgb,0.0,64.0);');
  mat.needsUpdate = true;
}

export class GameRenderer {
  readonly gl: WebGLRenderer;
  tier: QualityTier = 'mid';
  /** Dynamische Auflösung: senkt das Pixelverhältnis bei zu niedriger Bildrate (nie unter 0,75 ×) */
  readonly dynRes = new DynamicResolution();
  /** Handy/Tablet (setzt das Spiel nach der Geräteerkennung): teure Effekte sparsamer */
  mobile = false;
  config: QualityConfig = QUALITY_TIERS.mid;

  private composer: EffectComposer | null = null;
  private scene: Scene | null = null;
  private camera: Camera | null = null;
  private listeners: ((c: QualityConfig, tier: QualityTier) => void)[] = [];
  private sun: Mesh | null = null;
  private focus: Vector3 | null = null;
  private godRays: GodRaysEffect | null = null;
  private dof: DepthOfFieldEffect | null = null;
  private heat: HeatEffect | null = null;
  /** Tiefenunschärfe: weich nachgeführter Fokuspunkt und optionales Ziel (erfasster Gegner) */
  private dofFocus = new Vector3();
  private dofRange = 60;
  dofTarget: Vector3 | null = null;
  private time = 0;

  constructor(private canvas: HTMLCanvasElement) {
    try {
      this.gl = new WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
    } catch {
      throw new WebGLUnavailableError();
    }
    installShaderLogFilter();
    // Atmosphärischer Nebel ersetzt den linearen Nebel, bevor der erste Shader übersetzt wird
    installAtmosphere();
    // ACES Filmic mit ausgewogener Belichtung (gilt auch für den Tonemapping-Effekt der Nachbearbeitung)
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = RENDER_LOOK.exposure;
    addEventListener('resize', () => this.resize());
    screen.orientation?.addEventListener?.('change', () => setTimeout(() => this.resize(), 120));
  }

  setView(scene: Scene, camera: Camera) {
    this.scene = scene;
    this.camera = camera;
    this.rebuildComposer();
  }

  /** Wird nach jedem Stufenwechsel aufgerufen (Welt passt Schatten, Sichtweite, Partikel an). */
  onQualityChange(l: (c: QualityConfig, tier: QualityTier) => void) { this.listeners.push(l); }

  /** Sparstufe des Leistungs-Wächters (0 … 3) */
  budget = 0;

  /** Sparstufe wechseln: gleiche Grafikstufe, aber weniger Schatten-, AO- und Vegetationslast */
  setBudget(level: number) {
    if (level === this.budget) return;
    this.budget = level;
    this.applyQuality(this.tier, true);
  }

  applyQuality(tier: QualityTier, keepBudget = false) {
    this.tier = tier;
    if (!keepBudget) this.budget = 0;
    this.config = budgetConfig(QUALITY_TIERS[tier], this.budget);
    const c = this.config;
    const sm = this.gl.shadowMap;
    const enabledBefore = sm.enabled;
    sm.enabled = c.shadows.enabled;
    // Seit three r186 gibt es nur noch PCFShadowMap; die Weichheit steuert light.shadow.radius (siehe Welt).
    sm.type = PCFShadowMap;
    // Shader müssen neu übersetzt werden, wenn sich Schatten an- oder ausschalten
    if (enabledBefore !== sm.enabled && this.scene) {
      this.scene.traverse((o: any) => {
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) m.needsUpdate = true;
      });
    }
    this.rebuildComposer();
    this.dynRes.reset(this.basePixelRatio());
    this.resize();
    for (const l of this.listeners) l(c, tier);
  }

  /** Lichtquelle für Sonnenstrahlen und Fokuspunkt für Tiefenunschärfe */
  setEffectSources(sun: Mesh | null, focus: Vector3 | null) {
    this.sun = sun;
    this.focus = focus;
    this.rebuildComposer();
  }

  /**
   * Bild-Pipeline. Der Kern ist auf jeder Stufe derselbe und besteht nur aus Standard-Durchgängen:
   *
   *   RenderPass (Szene, HDR)  →  Bloom (Mipmap-Weichzeichner im Unreal-Stil, hohe Schwelle)  →  ACES-Filmic-Tonemapping
   *
   * Auf Hoch/Maximal/Ultra kommen davor zwei Hilfsbilder in reduzierter Auflösung (Umgebungsverdeckung, Spiegelungen)
   * und die Tiefenunschärfe dazu. Alles Übrige (Konturen, Farbkorrektur, Vignette, Hitzeflimmern) rechnet im selben
   * Abschluss-Durchgang wie Bloom und Tonemapping mit – es gibt keine weiteren Vollbild-Durchgänge.
   * Alle eigenen Shader folgen den Regeln in depthGlsl.ts (feste Schleifen, keine Ableitungen in Schleifen).
   */
  private rebuildComposer() {
    this.composer?.dispose();
    this.composer = null;
    this.heat = null;
    this.godRays = null;
    this.dof = null;
    const c = this.config;
    // Niedrig/Mittel: Konturen als Inverted Hull, Hoch/Maximal: Kantenerkennung als Post-Effekt
    setHullsVisible(!c.post.outlines);
    // Wasser-Markierung im Alpha nur mit Post-Effekten, die das Bild am Ende wieder undurchsichtig machen
    WATER_ALPHA.value = 1;
    if (!c.post.enabled || !this.scene || !this.camera) return;
    WATER_ALPHA.value = 0;
    const cam = this.camera as PerspectiveCamera;

    const samples = Math.min(c.multisampling, this.gl.capabilities.maxSamples ?? 0);
    const composer = new EffectComposer(this.gl, { frameBufferType: HalfFloatType, multisampling: samples });

    // 1. Szene
    composer.addPass(new RenderPass(this.scene, cam));

    // 2. Hilfsbilder in reduzierter Auflösung (lesen Tiefe und Wasser-Markierung, verändern das Bild selbst nicht)
    const aoBase = c.post.ambientOcclusion;
    const aoCfg = aoBase && this.mobile
      ? { ...aoBase, dirs: Math.min(aoBase.dirs, MOBILE_AO_LIMIT.dirs), steps: Math.min(aoBase.steps, MOBILE_AO_LIMIT.steps), scale: Math.min(aoBase.scale, MOBILE_AO_LIMIT.scale) }
      : aoBase;
    const aoPass = aoCfg ? new AoPass(cam, aoCfg) : null;
    if (aoPass) composer.addPass(aoPass);
    // Bildschirm-Spiegelungen (am Handy zu teuer)
    const ssrPass = c.post.ssr && !this.mobile ? new SsrPass(cam, c.post.ssr) : null;
    if (ssrPass) composer.addPass(ssrPass);

    // 3. Tiefenunschärfe (braucht als Weichzeichner einen eigenen Durchgang)
    if (c.post.depthOfField && this.focus && !(this.mobile && this.tier === 'high')) {
      // Nur der ferne Hintergrund wird weich: Vordergrund und alles bis zur Figur bleiben scharf.
      // (Vorher wurde in beide Richtungen unscharf gezeichnet, mit festem Bereich von 40 m – das traf Wellen,
      // Schiffsteile und Rauch vor der Figur.)
      const dof = new DepthOfFieldEffect(cam, { focusDistance: 25, focusRange: 120, bokehScale: 1.3, resolutionScale: c.detail > 1.4 ? 1 : 0.5 });
      // Fokus gleitet weich zum Ziel (Spielfigur oder erfasster Gegner)
      this.dofFocus.copy(this.focus);
      dof.target = this.dofFocus;
      const coc = dof.cocMaterial;
      coc.fragmentShader = coc.fragmentShader.replace('magnitude*vec2(step(signedDistance,0.0),step(0.0,signedDistance))', 'magnitude*vec2(0.0,step(0.0,signedDistance))');
      coc.needsUpdate = true;
      this.dof = dof;
      composer.addPass(new EffectPass(cam, dof));
    }

    // 4. Abschluss: ein einziger Durchgang für alles Übrige
    const effects: Effect[] = [];
    // Hitzeflimmern verschiebt nur die Leseposition dieses Durchgangs (früher ein eigener Vollbild-Durchgang am Ende)
    if (c.post.heat) {
      this.heat = new HeatEffect();
      effects.push(this.heat);
    }
    if (aoPass && aoCfg) effects.push(new AoEffect(aoPass, aoCfg.intensity));
    if (ssrPass) effects.push(new SsrEffect(ssrPass));
    if (c.post.godRays && this.sun) {
      // Lichtstreuung (Crepuscular Rays): Strahlen entstehen nur, wo die Sonne zwischen Kronen, Masten und Häusern hindurchscheint
      this.godRays = new GodRaysEffect(cam, this.sun, { density: 0.96, decay: 0.935, weight: GOD_WEIGHT, exposure: 0.5, samples: c.detail > 1.4 ? 120 : c.detail > 1 ? 90 : 60, clampMax: 1, resolutionScale: 0.5, blur: true });
      effects.push(this.godRays);
    }
    if (c.post.bloom) {
      // Bloom im Stil von Unreal (Mipmap-Weichzeichnen) mit hoher Schwelle: nur echte Lichtquellen und Magie leuchten
      const b = RENDER_LOOK.bloom;
      const bloom = new BloomEffect({ intensity: b.intensity, luminanceThreshold: b.threshold, luminanceSmoothing: b.smoothing, mipmapBlur: true, radius: b.radius });
      guardBloom(bloom);
      effects.push(bloom);
    }
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
    if (c.post.outlines) effects.push(new EdgeEffect({ thickness: Math.max(1, this.pixelRatio()), fadeFar: 320 }));
    if (c.post.colorGrading) {
      // ernster, düsterer Anime-Look: kühle Schatten, warme Lichter, ruhigere Farben, dezente Vignette
      effects.push(new GradeEffect());
      effects.push(new VignetteEffect(RENDER_LOOK.vignette));
    }
    // Immer zuletzt: fertiges Bild undurchsichtig (sonst schwarze Flächen auf Samsung-Handys)
    effects.push(new OpaqueEffect());
    composer.addPass(new EffectPass(cam, ...effects));
    this.composer = composer;
  }

  /** Pixelverhältnis inklusive dynamischer Auflösung (Untergrenze 0,75 bzw. das der Stufe, falls kleiner) */
  pixelRatio(): number {
    const base = this.basePixelRatio();
    return Math.max(Math.min(base, DynamicResolution.FLOOR), base * this.dynRes.scale);
  }

  /** Dynamische Auflösung zurück auf 100 % (Einstellung ausgeschaltet) */
  resetDynamicResolution() {
    if (this.dynRes.scale === 1) return;
    this.dynRes.reset(this.basePixelRatio());
    this.resize();
  }

  /** Pixelverhältnis nach Stufe, begrenzt auf die maximale Pixelzahl (4K bei Max). */
  basePixelRatio(): number {
    const c = this.config;
    const dpr = window.devicePixelRatio || 1;
    let r = c.pixelRatio ?? dpr;
    if (c.pixelRatio === null || c.pixelRatio > 1) r = Math.min(r, dpr);
    // Ultra: mehr Pixel als der Bildschirm (Supersampling) – gestochen scharfe Kanten und Details
    r *= c.supersample;
    r = Math.min(r, c.maxPixelRatio);
    const w = Math.max(1, innerWidth);
    const h = Math.max(1, innerHeight);
    if (w * h * r * r > c.maxPixels) r = Math.sqrt(c.maxPixels / (w * h));
    return r;
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.gl.setPixelRatio(this.pixelRatio());
    this.gl.setSize(w, h, false);
    this.composer?.setSize(w, h, false);
    const cam = this.camera as any;
    if (cam?.isPerspectiveCamera) {
      cam.aspect = w / h;
      // Im Hochformat etwas weiter, damit das Schiff ins Bild passt
      cam.fov = h > w ? 70 : 55;
      cam.updateProjectionMatrix();
    }
  }

  /** Tatsächliche Renderauflösung (für die Anzeige im Menü) */
  drawSize(): { w: number; h: number } {
    return { w: this.canvas.width, h: this.canvas.height };
  }

  private maskT = 0;
  /**
   * Transparente Effekte (Gischt, Funken, Ringe) dürfen den Alpha-Kanal nicht verändern:
   * Alpha 0 markiert Wasser, sonst zeichnen Konturen und Umgebungsverdeckung dunkle Höfe um jeden Schaum.
   */
  /**
   * Schatten-Detailstufe: kleine Dinge (Figuren, Kisten, Blumen) werfen nur in der Nähe Schatten –
   * weiter weg ist der Schatten ohnehin kaum sichtbar, kostet aber in jeder Kaskade einen Zeichenaufruf.
   * Unbeleuchtete Leucht-Materialien (Laternen, Effekte) werfen nie Schatten.
   */
  private shadowLod(m: Mesh, cam: Vector3, range: number) {
    const ud = m.userData as { skCast?: boolean; skR?: number };
    if (ud.skCast === undefined) {
      const mat = m.material as Material & { isMeshBasicMaterial?: boolean };
      ud.skCast = m.castShadow && !(mat && !Array.isArray(mat) && mat.isMeshBasicMaterial);
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const e = m.matrixWorld.elements;
      const sc = Math.sqrt(Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
      ud.skR = (m.geometry.boundingSphere?.radius ?? 0) * sc;
    }
    if (!ud.skCast) { if (m.castShadow) m.castShadow = false; return; }
    const r = ud.skR ?? 0;
    if (r >= 1.6 || range <= 0) { if (!m.castShadow) m.castShadow = true; return; }
    const e = m.matrixWorld.elements;
    const dx = e[12] - cam.x, dy = e[13] - cam.y, dz = e[14] - cam.z;
    const near = dx * dx + dy * dy + dz * dz < (range + r) * (range + r);
    if (m.castShadow !== near) m.castShadow = near;
  }

  private keepWaterMask(scene: Scene) {
    const cam = this.camera?.position;
    const range = this.config.shadows.smallRange;
    scene.traverse((o) => {
      if ((o as Mesh).isMesh && cam) this.shadowLod(o as Mesh, cam, range);
      const m = (o as Mesh).material as Material | Material[] | undefined;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        // Sicherheitsnetz: neu hinzugekommene beleuchtete Materialien zählen die Schatten-Kaskaden als ein Licht
        if (ensureCsm(mat)) mat.needsUpdate = true;
        if (!mat.transparent || mat.userData.maskKept) continue;
        mat.userData.maskKept = true;
        const additive = mat.blending === AdditiveBlending;
        if (mat.blending !== NormalBlending && !additive) continue;
        mat.blending = CustomBlending;
        mat.blendSrc = SrcAlphaFactor;
        mat.blendDst = additive ? OneFactor : OneMinusSrcAlphaFactor;
        mat.blendSrcAlpha = ZeroFactor;
        mat.blendDstAlpha = OneFactor;
        mat.needsUpdate = true;
      }
    });
  }

  render(dt: number) {
    if (!this.scene || !this.camera) return;
    // Sonnenstrahlen nur bei höherer Sonne: tief stehend werfen Schiffe sonst riesige Streifen übers Meer
    if (this.godRays && this.sun) {
      const cp = this.camera.position, sp = this.sun.position;
      const elev = (sp.y - cp.y) / (Math.hypot(sp.x - cp.x, sp.y - cp.y, sp.z - cp.z) || 1);
      // ab etwa 6° Sonnenhöhe einblenden (auch Abendlicht), sehr tief wären es Streifen übers ganze Meer
      const k = Math.min(1, Math.max(0, (elev - 0.1) / 0.25));
      this.godRays.godRaysMaterial.uniforms.weight.value = GOD_WEIGHT * k;
    }
    // Schärfebereich wächst mit dem Kameraabstand: zu Fuß ist die Stadt dahinter leicht weich, auf See erst der Horizont
    if (this.dof && this.focus) {
      // Ziel: erfasster Gegner (Lock-on) oder die Spielfigur; Fokus und Schärfebereich gleiten weich nach
      const want = this.dofTarget ?? this.focus;
      const k = Math.min(1, dt * 6);
      this.dofFocus.lerp(want, k);
      const d = this.camera.position.distanceTo(this.dofFocus);
      // Nahaufnahme (Kamera nah an der Figur, z. B. zu Fuß oder beim Lock-on): Hintergrund deutlich weicher;
      // weit weg (auf See): nur der Horizont wird weich
      const close = Math.min(1, Math.max(0, (14 - d) / 10));
      const range = MathUtils.lerp(Math.max(60, d * 6), Math.max(5, d * 1.6), Math.max(close, this.dofTarget ? 0.8 : 0));
      this.dofRange += (range - this.dofRange) * k;
      this.dof.cocMaterial.focusRange = this.dofRange;
      this.dof.bokehScale = MathUtils.lerp(1.3, 2.2, close);
    }
    this.time += dt;
    heatShared.update(dt);
    this.heat?.updateSources(this.camera, this.time);
    this.maskT -= dt;
    if (this.maskT <= 0) { this.maskT = 0.25; this.keepWaterMask(this.scene); }
    if (this.composer) this.composer.render(dt);
    else {
      // Ohne Nachbearbeitung selbst löschen (der Composer schaltet autoClear ab – sonst bleiben alte Bilder stehen)
      this.gl.autoClear = true;
      this.gl.render(this.scene, this.camera);
    }
  }
}
