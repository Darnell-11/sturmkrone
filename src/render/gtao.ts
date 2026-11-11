import {
  BasicDepthPacking,
  HalfFloatType,
  LinearFilter,
  NoBlending,
  RGBAFormat,
  ShaderMaterial,
  Uniform,
  Vector2,
  WebGLRenderTarget,
  type DepthPackingStrategies,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { BlendFunction, Effect, EffectAttribute, Pass } from 'postprocessing';
import { CAMERA_PLANES, type AoConfig } from '../data/qualityTiers';
import { DEPTH_PARS, SKY_DEPTH } from './depthGlsl';

/**
 * Umgebungsverdeckung nach dem Horizont-Verfahren (GTAO/HBAO-Art).
 *
 * 1. AoPass (halbe Auflösung): Für jeden Bildpunkt wird aus dem Tiefenpuffer die Position und die
 *    Flächennormale rekonstruiert. In mehreren Richtungen wird nach dem höchsten „Horizont“ gesucht –
 *    je höher die Nachbargeometrie über die Fläche ragt, desto weniger Umgebungslicht kommt an.
 *    Ergebnis: R = Verdeckung (1 = frei), G = Abstand zur Kamera (für das kantenbewahrende Weichzeichnen).
 * 2. AoEffect (volle Auflösung, im gemeinsamen Effekt-Durchgang): weichzeichnen ohne über Kanten zu
 *    bluten (nach Tiefe gewichtet), dann das Bild abdunkeln. Wasser und Himmel bleiben frei.
 *
 * Ruhiges Bild: Suchrichtungen und Schrittversatz wechseln in einem festen 2×2-Muster. Der Weichzeichner mittelt
 * immer genau ein solches 2×2-Feld (eine Probe auf der Ecke zwischen vier Bildpunkten) und blendet zwischen den
 * vier umliegenden Feldern. Das Muster hebt sich dadurch vollständig auf – die Verdeckung hängt nur noch von der
 * Geometrie ab und wandert bei Kamerabewegung nicht mehr als Schraffur über Wände und Böden.
 */

const AO_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const AO_FRAG = /* glsl */ `
  #include <common>
  #include <packing>
  ${DEPTH_PARS}
  uniform sampler2D tColor;
  uniform float radius;
  uniform float fadeFar;
  varying vec2 vUv;

  void main() {
    ivec2 size = textureSize(tDepth, 0);
    vec2 fsize = vec2(size);
    // Bildpunkt des Tiefenpuffers unter diesem Pixel; ein Bildpunkt Rand bleibt frei, damit alle vier Nachbarn existieren
    ivec2 p = clamp(ivec2(vUv * fsize), ivec2(1), size - 2);
    float d = skDepth(p);
    // Himmel und Wasser (Alpha-Markierung) bekommen keine Verdeckung
    if (d >= SK_SKY_DEPTH || textureLod(tColor, (vec2(p) + 0.5) / fsize, 0.0).a < 0.5) { gl_FragColor = vec4(1.0, 1e4, 0.0, 1.0); return; }
    vec3 P = skViewPos(p, d, fsize);
    float dist = max(-P.z, cameraNear);
    vec3 N = skNormalAt(p, P, fsize);

    // Suchradius in Bildpunkten (nah begrenzt, sonst wird es teuer und fleckig)
    vec2 rUv = radius * projScale * 0.5 / dist;
    rUv *= min(1.0, 0.12 / max(rUv.y, 1e-5));
    vec2 rPx = rUv * fsize;
    vec2 pc = vec2(p) + 0.5;
    // festes 2×2-Muster (Bayer): vier Drehungen der Suchrichtungen, vier Schrittversätze – der Weichzeichner hebt es auf
    ivec2 cell = ivec2(gl_FragCoord.xy) & 1;
    float noise = (float((cell.x * 2 + cell.y * 3) & 3) + 0.5) * 0.25;
    float jitter = fract(noise * 3.0);
    float occ = 0.0;
    // feste Durchlaufzahl, kein break/continue; Tiefe nur über texelFetch (keine Ableitungen in der Schleife)
    for (int i = 0; i < DIRS; i++) {
      float a = (float(i) + noise) * (PI2 / float(DIRS));
      vec2 dir = vec2(cos(a), sin(a));
      float horizon = 0.0;
      for (int j = 0; j < STEPS; j++) {
        float t = (float(j) + jitter) / float(STEPS);
        // erster Schritt mindestens zweieinhalb Bildpunkte entfernt (sonst verdeckt sich die Fläche durch Rundungsfehler selbst)
        ivec2 q = clamp(ivec2(floor(pc + dir * (2.5 + rPx * t))), ivec2(0), size - 1);
        float sd = skDepth(q);
        vec3 v = skViewPos(q, sd, fsize) - P;
        float l = length(v);
        // Anstieg über der Fläche (mit kleinem Versatz gegen Selbstverdeckung), weich ausgeblendet mit der Entfernung
        float h = clamp((dot(N, v) / max(l, 1e-4) - 0.2) / 0.8, 0.0, 1.0);
        float fall = 1.0 - smoothstep(radius * 0.45, radius, l);
        // Himmel hinter einer Kante verdeckt nichts
        horizon = max(horizon, h * fall * step(sd, SK_SKY_DEPTH));
      }
      occ += horizon;
    }
    occ = clamp(occ / float(DIRS) * 1.8, 0.0, 1.0);
    occ *= 1.0 - smoothstep(fadeFar * 0.55, fadeFar, dist);
    gl_FragColor = vec4(1.0 - occ, dist, 0.0, 1.0);
  }
`;

export class AoPass extends Pass {
  readonly target: WebGLRenderTarget;
  private mat: ShaderMaterial;

  constructor(private cam: PerspectiveCamera, private cfg: AoConfig) {
    super('AoPass');
    this.needsSwap = false;
    this.needsDepthTexture = true;
    this.target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
    this.target.texture.name = 'AoPass.Target';
    this.mat = new ShaderMaterial({
      name: 'AoPassMaterial',
      vertexShader: AO_VERT,
      fragmentShader: AO_FRAG,
      defines: { DIRS: String(cfg.dirs), STEPS: String(cfg.steps), DEPTH_PACKING: String(BasicDepthPacking) },
      uniforms: {
        tDepth: new Uniform(null),
        tColor: new Uniform(null),
        projScale: new Uniform(new Vector2(1, 1)),
        cameraNear: new Uniform(CAMERA_PLANES.near),
        cameraFar: new Uniform(CAMERA_PLANES.far),
        radius: new Uniform(cfg.radius),
        fadeFar: new Uniform(140),
      },
      blending: NoBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.fullscreenMaterial = this.mat;
  }

  override setDepthTexture(depthTexture: Texture, depthPacking: DepthPackingStrategies = BasicDepthPacking) {
    this.mat.uniforms.tDepth.value = depthTexture;
    if (this.mat.defines.DEPTH_PACKING !== String(depthPacking)) {
      this.mat.defines.DEPTH_PACKING = String(depthPacking);
      this.mat.needsUpdate = true;
    }
  }

  override render(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget | null) {
    const u = this.mat.uniforms;
    const cam = this.cam;
    u.tColor.value = inputBuffer?.texture ?? null;
    u.projScale.value.set(cam.projectionMatrix.elements[0], cam.projectionMatrix.elements[5]);
    u.cameraNear.value = cam.near;
    u.cameraFar.value = cam.far;
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
  }

  override setSize(width: number, height: number) {
    this.target.setSize(Math.max(1, Math.ceil(width * this.cfg.scale)), Math.max(1, Math.ceil(height * this.cfg.scale)));
  }

  override dispose() {
    this.target.dispose();
    this.mat.dispose();
    super.dispose();
  }
}

const COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D tAo;
  uniform vec2 aoTexel;
  uniform float intensity;
  // eine Probe genau auf der Ecke zwischen vier Bildpunkten des Verdeckungsbildes (bilinear = Mittel dieser vier);
  // nur ähnliche Tiefe zählt (keine dunklen Höfe an Silhouetten)
  void aoTap(const in vec2 corner, const in float weight, const in float dist, const in float tol, inout float sum, inout float wsum) {
    vec2 s = textureLod(tAo, corner * aoTexel, 0.0).rg;
    float w = weight * exp(-abs(s.g - dist) / tol);
    sum += s.r * w;
    wsum += w;
  }
  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    if (depth >= ${SKY_DEPTH} || inputColor.a < 0.5) { outputColor = inputColor; return; }
    float dist = -getViewZ(depth);
    float tol = 0.06 * dist + 0.05;
    float sum = 0.0, wsum = 0.0;
    // Vier feste Proben ohne Schleife und mit festem Mip-Level (texture2D in einer Schleife ergab unter
    // ANGLE/Direct3D die Warnung X3595 und undefinierte Ableitungen): zwischen den vier umliegenden Ecken blenden
    vec2 c = uv / aoTexel;
    vec2 k = floor(c);
    vec2 t = c - k;
    aoTap(k, (1.0 - t.x) * (1.0 - t.y), dist, tol, sum, wsum);
    aoTap(k + vec2(1.0, 0.0), t.x * (1.0 - t.y), dist, tol, sum, wsum);
    aoTap(k + vec2(0.0, 1.0), (1.0 - t.x) * t.y, dist, tol, sum, wsum);
    aoTap(k + vec2(1.0, 1.0), t.x * t.y, dist, tol, sum, wsum);
    float ao = wsum > 1e-4 ? clamp(sum / wsum, 0.0, 1.0) : 1.0;
    outputColor = vec4(inputColor.rgb * mix(1.0, ao, intensity), inputColor.a);
  }
`;

/** Mittags (steile Sonne, kurze harte Schatten) braucht es mehr Kontaktschatten: Faktor auf die Stärke, von der Umgebung gesetzt */
export const aoShared = { boost: 1 };

export class AoEffect extends Effect {
  private base: number;

  constructor(pass: AoPass, intensity: number) {
    super('AoEffect', COMPOSITE_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['tAo', new Uniform(pass.target.texture)],
        ['aoTexel', new Uniform(new Vector2(1, 1))],
        ['intensity', new Uniform(intensity)],
      ]),
    });
    this.pass = pass;
    this.base = intensity;
  }

  override update() {
    this.uniforms.get('intensity')!.value = Math.min(1.25, this.base * aoShared.boost);
  }

  private pass: AoPass;

  override setSize() {
    const t = this.pass.target;
    this.uniforms.get('aoTexel')!.value.set(1 / t.width, 1 / t.height);
  }
}
