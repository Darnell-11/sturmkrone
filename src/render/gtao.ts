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
import type { AoConfig } from '../data/qualityTiers';

/**
 * Umgebungsverdeckung nach dem Horizont-Verfahren (GTAO/HBAO-Art).
 *
 * 1. AoPass (halbe Auflösung): Für jeden Bildpunkt wird aus dem Tiefenpuffer die Position und die
 *    Flächennormale rekonstruiert. In mehreren Richtungen wird nach dem höchsten „Horizont“ gesucht –
 *    je höher die Nachbargeometrie über die Fläche ragt, desto weniger Umgebungslicht kommt an.
 *    Ergebnis: R = Verdeckung (1 = frei), G = Abstand zur Kamera (für das kantenbewahrende Weichzeichnen).
 * 2. AoEffect (volle Auflösung, im gemeinsamen Effekt-Durchgang): weichzeichnen ohne über Kanten zu
 *    bluten (3×3, nach Tiefe gewichtet), dann das Bild abdunkeln. Wasser und Himmel bleiben frei.
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
  uniform highp sampler2D tDepth;
  uniform sampler2D tColor;
  uniform vec2 depthTexel;
  uniform vec2 projScale;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float radius;
  uniform float fadeFar;
  varying vec2 vUv;

  float readDepth(vec2 uv) {
    #if DEPTH_PACKING == 3201
      return unpackRGBAToDepth(texture2D(tDepth, uv));
    #else
      return texture2D(tDepth, uv).r;
    #endif
  }
  vec3 viewPos(vec2 uv, float d) {
    float z = perspectiveDepthToViewZ(d, cameraNear, cameraFar);
    vec2 ndc = uv * 2.0 - 1.0;
    return vec3(ndc.x * -z / projScale.x, ndc.y * -z / projScale.y, z);
  }
  // Interleaved Gradient Noise: verteilt die Suchrichtungen je Pixel, das 3×3-Weichzeichnen glättet es
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

  void main() {
    float d = readDepth(vUv);
    // Himmel und Wasser (Alpha-Markierung) bekommen keine Verdeckung
    if (d >= 0.9999 || texture2D(tColor, vUv).a < 0.5) { gl_FragColor = vec4(1.0, 1e4, 0.0, 1.0); return; }
    vec3 P = viewPos(vUv, d);
    float dist = -P.z;

    // Normale aus den Nachbarn – je Achse die Seite mit dem kleineren Tiefensprung (saubere Kanten)
    vec2 tx = depthTexel;
    vec3 Pr = viewPos(vUv + vec2(tx.x, 0.0), readDepth(vUv + vec2(tx.x, 0.0)));
    vec3 Pl = viewPos(vUv - vec2(tx.x, 0.0), readDepth(vUv - vec2(tx.x, 0.0)));
    vec3 Pu = viewPos(vUv + vec2(0.0, tx.y), readDepth(vUv + vec2(0.0, tx.y)));
    vec3 Pd = viewPos(vUv - vec2(0.0, tx.y), readDepth(vUv - vec2(0.0, tx.y)));
    vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
    vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
    vec3 N = normalize(cross(dx, dy));
    if (dot(N, -P) < 0.0) N = -N;

    // Suchradius in Bildkoordinaten (nah begrenzt, sonst wird es teuer und fleckig)
    vec2 rUv = radius * projScale * 0.5 / dist;
    rUv *= min(1.0, 0.12 / max(rUv.y, 1e-5));
    float noise = ign(gl_FragCoord.xy);
    float jitter = fract(noise * 7.13 + 0.37);
    float occ = 0.0;
    for (int i = 0; i < DIRS; i++) {
      float a = (float(i) + noise) * (PI2 / float(DIRS));
      vec2 dir = vec2(cos(a), sin(a));
      float horizon = 0.0;
      // erster Schritt mindestens zwei Bildpunkte entfernt (sonst verdeckt sich die Fläche durch Rundungsfehler selbst)
      vec2 start = dir * depthTexel * 2.5;
      for (int j = 0; j < STEPS; j++) {
        float t = (float(j) + jitter) / float(STEPS);
        vec2 suv = vUv + start + dir * rUv * t;
        float sd = readDepth(suv);
        if (sd >= 0.9999) continue;
        vec3 v = viewPos(suv, sd) - P;
        float l = length(v);
        // Anstieg über der Fläche (mit kleinem Versatz gegen Selbstverdeckung), weich ausgeblendet mit der Entfernung
        float h = clamp((dot(N, v) / max(l, 1e-4) - 0.2) / 0.8, 0.0, 1.0);
        float fall = 1.0 - smoothstep(radius * 0.45, radius, l);
        horizon = max(horizon, h * fall);
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
        depthTexel: new Uniform(new Vector2(1, 1)),
        projScale: new Uniform(new Vector2(1, 1)),
        cameraNear: new Uniform(0.1),
        cameraFar: new Uniform(1000),
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
    this.mat.uniforms.depthTexel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
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
  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    if (depth >= 0.9999 || inputColor.a < 0.5) { outputColor = inputColor; return; }
    float dist = -getViewZ(depth);
    // 3×3 weichzeichnen, nur über ähnliche Tiefe (keine dunklen Höfe an Silhouetten)
    float sum = 0.0, wsum = 0.0;
    float tol = 0.06 * dist + 0.05;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 s = texture2D(tAo, uv + vec2(float(x), float(y)) * aoTexel).rg;
        float w = exp(-abs(s.g - dist) / tol);
        sum += s.r * w;
        wsum += w;
      }
    }
    float ao = wsum > 1e-4 ? sum / wsum : 1.0;
    outputColor = vec4(inputColor.rgb * mix(1.0, ao, intensity), inputColor.a);
  }
`;

export class AoEffect extends Effect {
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
  }

  private pass: AoPass;

  override setSize() {
    const t = this.pass.target;
    this.uniforms.get('aoTexel')!.value.set(1 / t.width, 1 / t.height);
  }
}
