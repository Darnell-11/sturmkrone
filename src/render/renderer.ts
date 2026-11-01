import {
  ACESFilmicToneMapping,
  HalfFloatType,
  PCFShadowMap,
  WebGLRenderer,
  type Camera,
  type Mesh,
  type PerspectiveCamera,
  type Scene,
  type Vector3,
} from 'three';
import {
  BloomEffect,
  BrightnessContrastEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  GodRaysEffect,
  HueSaturationEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  type Effect,
} from 'postprocessing';
import { QUALITY_TIERS, type QualityConfig, type QualityTier } from '../data/qualityTiers';
import { DepthAOEffect } from './ao';
import { EdgeEffect, setHullsVisible } from './outline';

export class WebGLUnavailableError extends Error {}

export class GameRenderer {
  readonly gl: WebGLRenderer;
  tier: QualityTier = 'mid';
  config: QualityConfig = QUALITY_TIERS.mid;

  private composer: EffectComposer | null = null;
  private scene: Scene | null = null;
  private camera: Camera | null = null;
  private listeners: ((c: QualityConfig, tier: QualityTier) => void)[] = [];
  private sun: Mesh | null = null;
  private focus: Vector3 | null = null;
  private ao: DepthAOEffect | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    try {
      this.gl = new WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
    } catch {
      throw new WebGLUnavailableError();
    }
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1;
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

  applyQuality(tier: QualityTier) {
    this.tier = tier;
    this.config = QUALITY_TIERS[tier];
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
    this.resize();
    for (const l of this.listeners) l(c, tier);
  }

  /** Lichtquelle für Sonnenstrahlen und Fokuspunkt für Tiefenunschärfe */
  setEffectSources(sun: Mesh, focus: Vector3) {
    this.sun = sun;
    this.focus = focus;
    this.rebuildComposer();
  }

  private rebuildComposer() {
    this.composer?.dispose();
    this.composer = null;
    this.ao = null;
    const c = this.config;
    // Niedrig/Mittel: Konturen als Inverted Hull, Hoch/Maximal: Kantenerkennung als Post-Effekt
    setHullsVisible(!c.post.outlines);
    if (!c.post.enabled || !this.scene || !this.camera) return;
    const cam = this.camera as PerspectiveCamera;

    const samples = Math.min(c.multisampling, this.gl.capabilities.maxSamples ?? 0);
    const composer = new EffectComposer(this.gl, { frameBufferType: HalfFloatType, multisampling: samples });
    composer.addPass(new RenderPass(this.scene, cam));

    if (c.post.depthOfField && this.focus) {
      const dof = new DepthOfFieldEffect(cam, { focusDistance: 25, focusRange: 40, bokehScale: 2.2, resolutionScale: 0.5 });
      dof.target = this.focus;
      composer.addPass(new EffectPass(cam, dof));
    }

    const effects: Effect[] = [];
    if (c.post.ambientOcclusion) {
      this.ao = new DepthAOEffect(cam);
      effects.push(this.ao);
    }
    if (c.post.godRays && this.sun) {
      effects.push(new GodRaysEffect(cam, this.sun, { density: 0.94, decay: 0.92, weight: 0.35, exposure: 0.5, samples: c.detail > 1 ? 80 : 48, clampMax: 1, resolutionScale: 0.5, blur: true }));
    }
    if (c.post.bloom) {
      effects.push(new BloomEffect({ intensity: 1.0, luminanceThreshold: 0.85, luminanceSmoothing: 0.18, mipmapBlur: true, radius: 0.7 }));
    }
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
    if (c.post.outlines) effects.push(new EdgeEffect({ thickness: Math.max(1, this.pixelRatio()), fadeFar: 320 }));
    if (c.post.colorGrading) {
      effects.push(new HueSaturationEffect({ saturation: 0.14 }));
      effects.push(new BrightnessContrastEffect({ contrast: 0.07 }));
      effects.push(new VignetteEffect({ offset: 0.35, darkness: 0.42 }));
    }
    composer.addPass(new EffectPass(cam, ...effects));
    this.composer = composer;
  }

  /** Pixelverhältnis nach Stufe, begrenzt auf die maximale Pixelzahl (4K bei Max). */
  pixelRatio(): number {
    const c = this.config;
    const dpr = window.devicePixelRatio || 1;
    let r = c.pixelRatio ?? dpr;
    if (c.pixelRatio === null || c.pixelRatio > 1) r = Math.min(r, dpr);
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

  render(dt: number) {
    if (!this.scene || !this.camera) return;
    this.ao?.update();
    if (this.composer) this.composer.render(dt);
    else this.gl.render(this.scene, this.camera);
  }
}
