import {
  BasicDepthPacking,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  NoBlending,
  RGBAFormat,
  ShaderMaterial,
  Uniform,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type DepthPackingStrategies,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { BlendFunction, Effect, EffectAttribute, Pass } from 'postprocessing';
import { CAMERA_PLANES } from '../data/qualityTiers';
import { DEPTH_PARS } from './depthGlsl';

/**
 * Bildschirm-Spiegelungen (Screen Space Reflections).
 *
 * Welche Flächen spiegeln, steht im Alpha-Kanal des Bildes:
 *  - Alpha < 0,5 = Wasser (Spiegelung nach Fresnel: flach über das Meer geschaut stark, von oben schwach)
 *  - Alpha 0,6 … 1 = spiegelnde Flächen (Toon-Option `reflect`, z. B. Pfützen, nasse Steine, lackiertes Deck)
 * Für jeden spiegelnden Bildpunkt wird ein Strahl im Bildschirmraum durch den Tiefenpuffer verfolgt;
 * trifft er Geometrie, wird deren Farbe gespiegelt (Figuren, Schiffe, Effekte, Inseln).
 * Halbe Auflösung, weich ausgeblendet an Bildrändern und mit der Entfernung.
 *
 * Stabilität: Die Strahlverfolgung läuft mit fester Schrittzahl ohne `break`, die Tiefe kommt über `texelFetch`
 * aus genau einem Bildpunkt (siehe depthGlsl.ts). Ungültige Zwischenwerte können nicht entstehen (keine Division
 * durch 0, kein `pow(0, x)`), das Ergebnis ist begrenzt.
 */
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }
`;

const FRAG = /* glsl */ `
  #include <common>
  #include <packing>
  ${DEPTH_PARS}
  uniform sampler2D tColor;
  uniform mat4 proj;
  uniform vec3 upView;
  uniform float maxDist;
  varying vec2 vUv;

  // Punkt im Kameraraum → Bildkoordinate (0 … 1); nur für Punkte vor der Kamera gültig
  vec2 skProject(vec3 q) {
    vec4 c = proj * vec4(q, 1.0);
    return c.xy / max(c.w, cameraNear) * 0.5 + 0.5;
  }
  float skDepthUv(vec2 uv, ivec2 size, vec2 fsize) {
    return skDepth(clamp(ivec2(floor(uv * fsize)), ivec2(0), size - 1));
  }

  void main() {
    ivec2 size = textureSize(tDepth, 0);
    vec2 fsize = vec2(size);
    ivec2 p = clamp(ivec2(vUv * fsize), ivec2(1), size - 2);
    vec4 src = textureLod(tColor, (vec2(p) + 0.5) / fsize, 0.0);
    float d = skDepth(p);
    bool water = src.a < 0.5;
    // Spiegelmarke 0,6 … 0,96; Werte knapp unter 1 (Kantenglättung, Vertexfarben) zählen nicht als spiegelnd
    float refl = water ? 1.0 : (src.a < 0.96 ? clamp((1.0 - src.a) / 0.4, 0.0, 1.0) : 0.0);
    if (refl <= 0.0 || d >= SK_SKY_DEPTH) { gl_FragColor = vec4(0.0); return; }

    vec3 P = skViewPos(p, d, fsize);
    vec3 N = skNormalAt(p, P, fsize);
    if (water) {
      // Wasser: Wellen-Normale aus dem Tiefenpuffer, zur Ruhe-Ebene hin geglättet (sonst zu unruhig)
      if (dot(N, upView) < 0.0) N = -N;
      N = normalize(mix(upView, N, 0.25));
    }
    vec3 V = normalize(P);
    vec3 R = reflect(V, N);
    // Strahlen zur Kamera hin sehen nichts, was im Bild ist
    float facing = 1.0 - smoothstep(-0.05, 0.35, R.z);
    if (facing <= 0.0) { gl_FragColor = vec4(0.0); return; }
    float ndv = clamp(dot(N, -V), 0.0, 1.0);
    float grazing = max(1.0 - ndv, 1e-4);
    float fres = water ? 0.04 + 0.96 * pow(grazing, 5.0) : mix(0.35, 1.0, pow(grazing, 3.0));

    // Strahl verfolgen: Schritte werden mit der Entfernung länger, zufälliger Versatz gegen Streifen.
    // Feste Schrittzahl ohne break: nach einem Treffer oder dem Verlassen des Bildes zählt der Rest nicht mehr.
    float jitter = skIgn(gl_FragCoord.xy);
    vec3 origin = P + N * 0.03;
    vec3 prev = origin;
    vec3 hitA = origin;
    vec3 hitB = origin;
    float hitT = 0.0;
    bool found = false;
    bool done = false;
    for (int i = 1; i <= STEPS; i++) {
      float t = (float(i) + jitter) / float(STEPS);
      t *= t;
      vec3 Q = origin + R * (t * maxDist);
      vec2 uv = skProject(Q);
      bool inside = Q.z < -cameraNear && uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
      if (!inside) done = true;
      if (!done) {
        float sd = skDepthUv(uv, size, fsize);
        float behind = skViewZ(sd) - Q.z;
        // Dicke passend zur Schrittweite: lange Schritte dürfen eine Fläche nicht überspringen
        float thick = 0.2 + length(Q - prev) * 1.3;
        if (sd < SK_SKY_DEPTH && behind > 0.0 && behind < thick) {
          found = true;
          done = true;
          hitA = prev;
          hitB = Q;
          hitT = t;
        }
        prev = Q;
      }
    }
    if (!found) { gl_FragColor = vec4(0.0); return; }
    // fein nachsuchen zwischen letztem und aktuellem Punkt (vier feste Halbierungen)
    for (int k = 0; k < 4; k++) {
      vec3 m = (hitA + hitB) * 0.5;
      bool behindM = skViewZ(skDepthUv(skProject(m), size, fsize)) > m.z;
      hitB = behindM ? m : hitB;
      hitA = behindM ? hitA : m;
    }
    vec2 hitUv = clamp(skProject(hitB), 0.0, 1.0);
    vec4 hit = textureLod(tColor, hitUv, 0.0);
    // keine Spiegelung von Wasser im Wasser (wäre doppelt)
    if (hit.a < 0.5) { gl_FragColor = vec4(0.0); return; }
    vec2 e = smoothstep(0.0, 0.12, hitUv) * smoothstep(0.0, 0.12, 1.0 - hitUv);
    float fade = e.x * e.y * (1.0 - hitT) * facing;
    gl_FragColor = vec4(clamp(hit.rgb, 0.0, 64.0), clamp(refl * fres * fade, 0.0, 1.0));
  }
`;

export interface SsrConfig { steps: number; scale: number }

export class SsrPass extends Pass {
  readonly target: WebGLRenderTarget;
  private mat: ShaderMaterial;
  private up = new Vector3();

  constructor(private cam: PerspectiveCamera, private cfg: SsrConfig) {
    super('SsrPass');
    this.needsSwap = false;
    this.needsDepthTexture = true;
    this.target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
    this.target.texture.name = 'SsrPass.Target';
    this.mat = new ShaderMaterial({
      name: 'SsrPassMaterial',
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: { STEPS: String(cfg.steps), DEPTH_PACKING: String(BasicDepthPacking) },
      uniforms: {
        tDepth: new Uniform(null),
        tColor: new Uniform(null),
        projScale: new Uniform(new Vector2(1, 1)),
        proj: new Uniform(new Matrix4()),
        upView: new Uniform(new Vector3(0, 1, 0)),
        cameraNear: new Uniform(CAMERA_PLANES.near),
        cameraFar: new Uniform(CAMERA_PLANES.far),
        maxDist: new Uniform(45),
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
    u.proj.value.copy(cam.projectionMatrix);
    // Weltachse „oben“ im Kameraraum (für ruhige Wasser-Normalen)
    this.up.set(0, 1, 0).transformDirection(cam.matrixWorldInverse);
    u.upView.value.copy(this.up);
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

/** Spiegelung ins Bild mischen (vor Bloom und Tonemapping, also in HDR) */
const COMPOSITE = /* glsl */ `
  uniform sampler2D tSsr;
  uniform vec2 ssrTexel;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // leicht weichgezeichnet (Kreuz aus 5 Proben, nach Gewicht gemittelt): ruhiger aus der halben Auflösung
    vec4 s0 = texture2D(tSsr, uv);
    vec4 s1 = texture2D(tSsr, uv + vec2(ssrTexel.x, 0.0));
    vec4 s2 = texture2D(tSsr, uv - vec2(ssrTexel.x, 0.0));
    vec4 s3 = texture2D(tSsr, uv + vec2(0.0, ssrTexel.y));
    vec4 s4 = texture2D(tSsr, uv - vec2(0.0, ssrTexel.y));
    float w = clamp(s0.a * 0.4 + (s1.a + s2.a + s3.a + s4.a) * 0.15, 0.0, 1.0);
    vec3 c = (s0.rgb * s0.a * 0.4 + (s1.rgb * s1.a + s2.rgb * s2.a + s3.rgb * s3.a + s4.rgb * s4.a) * 0.15) / max(w, 1e-4);
    outputColor = vec4(mix(inputColor.rgb, c, w), inputColor.a);
  }
`;

export class SsrEffect extends Effect {
  private pass: SsrPass;
  constructor(pass: SsrPass) {
    super('SsrEffect', COMPOSITE, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.NONE,
      uniforms: new Map<string, Uniform>([
        ['tSsr', new Uniform(pass.target.texture)],
        ['ssrTexel', new Uniform(new Vector2(1, 1))],
      ]),
    });
    this.pass = pass;
  }

  override setSize() {
    const t = this.pass.target;
    this.uniforms.get('ssrTexel')!.value.set(1 / t.width, 1 / t.height);
  }
}
