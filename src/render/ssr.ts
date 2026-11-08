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

/**
 * Bildschirm-Spiegelungen (Screen Space Reflections).
 *
 * Welche Flächen spiegeln, steht im Alpha-Kanal des Bildes:
 *  - Alpha < 0,5 = Wasser (Spiegelung nach Fresnel: flach über das Meer geschaut stark, von oben schwach)
 *  - Alpha 0,6 … 1 = spiegelnde Flächen (Toon-Option `reflect`, z. B. Pfützen, nasse Steine, lackiertes Deck)
 * Für jeden spiegelnden Bildpunkt wird ein Strahl im Bildschirmraum durch den Tiefenpuffer verfolgt;
 * trifft er Geometrie, wird deren Farbe gespiegelt (Figuren, Schiffe, Effekte, Inseln).
 * Halbe Auflösung, weich ausgeblendet an Bildrändern und mit der Entfernung.
 */
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }
`;

const FRAG = /* glsl */ `
  #include <common>
  #include <packing>
  uniform highp sampler2D tDepth;
  uniform sampler2D tColor;
  uniform vec2 depthTexel;
  uniform vec2 projScale;
  uniform mat4 proj;
  uniform vec3 upView;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float maxDist;
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
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

  void main() {
    vec4 src = texture2D(tColor, vUv);
    float d = readDepth(vUv);
    bool water = src.a < 0.5;
    // Spiegelmarke 0,6 … 0,96; Werte knapp unter 1 (Kantenglättung, Vertexfarben) zählen nicht als spiegelnd
    float refl = water ? 1.0 : (src.a < 0.96 ? clamp((1.0 - src.a) / 0.4, 0.0, 1.0) : 0.0);
    if (refl <= 0.0 || d >= 0.9999) { gl_FragColor = vec4(0.0); return; }

    vec3 P = viewPos(vUv, d);
    vec3 N;
    if (water) {
      // Wasser: Wellen-Normale aus dem Tiefenpuffer, zur Ruhe-Ebene hin geglättet (sonst zu unruhig)
      vec3 Pr = viewPos(vUv + vec2(depthTexel.x, 0.0), readDepth(vUv + vec2(depthTexel.x, 0.0)));
      vec3 Pu = viewPos(vUv + vec2(0.0, depthTexel.y), readDepth(vUv + vec2(0.0, depthTexel.y)));
      vec3 n = normalize(cross(Pr - P, Pu - P));
      if (dot(n, upView) < 0.0) n = -n;
      N = normalize(mix(upView, n, 0.25));
    } else {
      vec3 Pr = viewPos(vUv + vec2(depthTexel.x, 0.0), readDepth(vUv + vec2(depthTexel.x, 0.0)));
      vec3 Pl = viewPos(vUv - vec2(depthTexel.x, 0.0), readDepth(vUv - vec2(depthTexel.x, 0.0)));
      vec3 Pu = viewPos(vUv + vec2(0.0, depthTexel.y), readDepth(vUv + vec2(0.0, depthTexel.y)));
      vec3 Pd = viewPos(vUv - vec2(0.0, depthTexel.y), readDepth(vUv - vec2(0.0, depthTexel.y)));
      vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
      vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
      N = normalize(cross(dx, dy));
      if (dot(N, -P) < 0.0) N = -N;
    }
    vec3 V = normalize(P);
    vec3 R = reflect(V, N);
    // Strahlen zur Kamera hin sehen nichts, was im Bild ist
    float facing = 1.0 - smoothstep(-0.05, 0.35, R.z);
    if (facing <= 0.0) { gl_FragColor = vec4(0.0); return; }
    float ndv = clamp(dot(N, -V), 0.0, 1.0);
    float fres = water ? 0.04 + 0.96 * pow(1.0 - ndv, 5.0) : mix(0.35, 1.0, pow(1.0 - ndv, 3.0));

    // Strahl verfolgen: Schritte werden mit der Entfernung länger, zufälliger Versatz gegen Streifen
    float jitter = ign(gl_FragCoord.xy);
    vec3 prev = P + N * 0.03;
    vec2 hitUv = vec2(-1.0);
    float hitT = 0.0;
    for (int i = 1; i <= STEPS; i++) {
      float t = (float(i) + jitter) / float(STEPS);
      t *= t;
      vec3 Q = P + N * 0.03 + R * (t * maxDist);
      vec4 c = proj * vec4(Q, 1.0);
      vec2 uv = c.xy / c.w * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || Q.z > -cameraNear) break;
      float sd = readDepth(uv);
      if (sd < 0.9999) {
        float sz = perspectiveDepthToViewZ(sd, cameraNear, cameraFar);
        float behind = sz - Q.z;
        // Dicke passend zur Schrittweite: lange Schritte dürfen eine Fläche nicht überspringen
        float thick = 0.2 + length(Q - prev) * 1.3;
        if (behind > 0.0 && behind < thick) {
          // fein nachsuchen zwischen letztem und aktuellem Punkt
          vec3 a = prev, b = Q;
          for (int k = 0; k < 4; k++) {
            vec3 m = (a + b) * 0.5;
            vec4 cm = proj * vec4(m, 1.0);
            vec2 um = cm.xy / cm.w * 0.5 + 0.5;
            float zm = perspectiveDepthToViewZ(readDepth(um), cameraNear, cameraFar);
            if (zm - m.z > 0.0) b = m; else a = m;
          }
          vec4 cb = proj * vec4(b, 1.0);
          hitUv = cb.xy / cb.w * 0.5 + 0.5;
          hitT = t;
          break;
        }
      }
      prev = Q;
    }
    if (hitUv.x < 0.0) { gl_FragColor = vec4(0.0); return; }
    vec4 hit = texture2D(tColor, hitUv);
    // keine Spiegelung von Wasser im Wasser (wäre doppelt)
    if (hit.a < 0.5) { gl_FragColor = vec4(0.0); return; }
    vec2 e = smoothstep(0.0, 0.12, hitUv) * smoothstep(0.0, 0.12, 1.0 - hitUv);
    float fade = e.x * e.y * (1.0 - hitT) * facing;
    gl_FragColor = vec4(hit.rgb, clamp(refl * fres * fade, 0.0, 1.0));
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
        depthTexel: new Uniform(new Vector2(1, 1)),
        projScale: new Uniform(new Vector2(1, 1)),
        proj: new Uniform(new Matrix4()),
        upView: new Uniform(new Vector3(0, 1, 0)),
        cameraNear: new Uniform(0.1),
        cameraFar: new Uniform(1000),
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
    this.mat.uniforms.depthTexel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
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
    float w = s0.a * 0.4 + (s1.a + s2.a + s3.a + s4.a) * 0.15;
    vec3 c = (s0.rgb * s0.a * 0.4 + (s1.rgb * s1.a + s2.rgb * s2.a + s3.rgb * s3.a + s4.rgb * s4.a) * 0.15) / max(w, 1e-4);
    outputColor = vec4(mix(inputColor.rgb, c, clamp(w, 0.0, 1.0)), inputColor.a);
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
