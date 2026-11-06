import {
  Color,
  DataTexture,
  FrontSide,
  LinearFilter,
  MeshToonMaterial,
  NearestFilter,
  RGBAFormat,
  type ColorRepresentation,
  type Material,
  type Mesh,
  type Object3D,
  type Side,
  type Texture,
} from 'three';

/** Gemeinsame Werte für alle Toon-Materialien – die Umgebung passt sie an Tageszeit und Wetter an. */
export const toonShared = {
  rimColor: { value: new Color(1, 0.95, 0.85) },
  rimStrength: { value: 0.55 },
  /** Farbe der Schattenseiten (Anime: kühl, abends violett) */
  shadowTint: { value: new Color(0.74, 0.8, 1.12) },
};

function makeRamp(levels: number[]): DataTexture {
  const data = new Uint8Array(levels.length * 4);
  levels.forEach((l, i) => {
    const v = Math.round(l * 255);
    data.set([v, v, v, 255], i * 4);
  });
  const t = new DataTexture(data, levels.length, 1, RGBAFormat);
  t.minFilter = t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** 3-stufige Licht-Rampe mit sauberen, leicht weichen Kanten (Schatten, Halbton, Licht) */
export const TOON_RAMP = (() => {
  const n = 64;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const s = (a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
    // tiefere Schattenstufe für mehr Dramatik (vorher 0,46)
    const v = 0.4 + 0.3 * s(0.3, 0.36) + 0.3 * s(0.6, 0.66);
    const b = Math.round(v * 255);
    data.set([b, b, b, 255], i * 4);
  }
  const t = new DataTexture(data, n, 1, RGBAFormat);
  t.minFilter = t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();
/** Weichere Rampe für Wasser */
export const WATER_RAMP = makeRamp([0.62, 0.84, 1.0]);

export interface ToonOptions {
  color: ColorRepresentation;
  map?: Texture | null;
  /** Weiche Glanzflecken (Haare, Metall): 0 = aus, 1 = stark */
  spec?: number;
  /** Randlicht-Stärke relativ zum gemeinsamen Wert */
  rim?: number;
  emissive?: ColorRepresentation;
  side?: Side;
  transparent?: boolean;
  opacity?: number;
  vertexColors?: boolean;
  flatShading?: boolean;
  /** Prozedurale Oberfläche aus der Weltposition (scharf in jeder Auflösung): Sand, Gras oder Fels */
  detail?: 'sand' | 'grass' | 'rock';
}

const cache = new Map<string, MeshToonMaterial>();

const RIM_SPEC_GLSL = /* glsl */ `
  {
    // Anime-Schatten: Schattenseiten kühl einfärben statt nur abdunkeln
    float skLum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
    float skBase = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)) + 0.001;
    float skShade = 1.0 - smoothstep(0.5, 0.95, skLum / skBase);
    outgoingLight = mix(outgoingLight, outgoingLight * uShadowTint, skShade * 0.75);
    vec3 viewDir = normalize(vViewPosition);
    float ndv = clamp(dot(normal, viewDir), 0.0, 1.0);
    float rim = smoothstep(0.58, 0.74, 1.0 - ndv) * uRimStrength * uRimAmount;
    #if NUM_DIR_LIGHTS > 0
      vec3 L = directionalLights[0].direction;
      // Randlicht vor allem auf der Seite, die vom Licht abgewandt zur Kamera zeigt
      rim *= 0.55 + 0.45 * clamp(dot(-viewDir, L) * 0.5 + 0.5, 0.0, 1.0);
      if (uSpec > 0.0) {
        vec3 H = normalize(L + viewDir);
        float s = pow(max(dot(normal, H), 0.0), 48.0);
        outgoingLight += directionalLights[0].color * smoothstep(0.45, 0.55, s) * uSpec * 0.45;
      }
    #endif
    outgoingLight += mix(diffuseColor.rgb, vec3(1.0), 0.35) * uRimColor * rim;
  }
`;

/** Rauschfunktionen und Oberflächen für Sand, Gras und Fels (Weltkoordinaten, mit Entfernung weich ausgeblendet) */
const DETAIL_GLSL = /* glsl */ `
  varying vec3 vSkWorld;
  float skdH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float skdN(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(skdH(i), skdH(i + vec2(1.0, 0.0)), f.x), mix(skdH(i + vec2(0.0, 1.0)), skdH(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float skdF(vec2 p) { return skdN(p) * 0.5 + skdN(p * 2.03) * 0.3 + skdN(p * 4.1) * 0.2; }
`;
const DETAIL_FRAG: Record<'sand' | 'grass' | 'rock', string> = {
  sand: /* glsl */ `{
    vec2 p = vSkWorld.xz;
    float camD = distance(vSkWorld, cameraPosition);
    float nearK = 1.0 - smoothstep(25.0, 90.0, camD);
    // feines Korn aus weichem Rauschen (keine Pixelquadrate aus der Nähe)
    float fineK = 1.0 - smoothstep(8.0, 40.0, camD);
    float grain = (skdN(p * 34.0) - 0.5) * 0.2 * fineK + (skdN(p * 11.0) - 0.5) * 0.12 * nearK + (skdN(p * 5.0) - 0.5) * 0.14 * (1.0 - smoothstep(60.0, 160.0, camD));
    float rip = sin((p.x * 0.8 + p.y * 0.35) * 3.2 + skdN(p * 0.6) * 4.0) * 0.5 + 0.5;
    float macro = skdF(p * 0.04) - 0.5;
    float ripK = smoothstep(0.25, 0.75, rip);
    diffuseColor.rgb *= 1.0 + grain + (ripK - 0.5) * 0.16 * (1.0 - smoothstep(50.0, 140.0, camD)) + macro * 0.26;
    // Farbspiel: helle, trockene Flächen gegen goldbraune Senken
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 0.94, 0.8), smoothstep(0.45, 0.8, skdF(p * 0.07 + 3.1)) * 0.6);
    float wet = 1.0 - smoothstep(0.35, 1.15, vSkWorld.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.66, 0.66, 0.7), wet * 0.85);
    // Muschelsplitter / helle Körner
    diffuseColor.rgb += smoothstep(0.86, 0.93, skdN(p * 13.0 + 5.7)) * 0.1 * nearK;
  }`,
  grass: /* glsl */ `{
    vec2 p = vSkWorld.xz;
    float camD = distance(vSkWorld, cameraPosition);
    float nearK = 1.0 - smoothstep(20.0, 70.0, camD);
    float macro = skdF(p * 0.035);
    vec3 dry = diffuseColor.rgb * vec3(1.45, 1.28, 0.7);
    vec3 lush = diffuseColor.rgb * vec3(0.72, 0.92, 0.72);
    diffuseColor.rgb = mix(lush, dry, smoothstep(0.35, 0.75, macro));
    float mid = skdN(p * 0.45) - 0.5;
    // Halme: gestreckte weiche Rauschmuster in zwei Richtungen (wirkt wie dichter Rasen statt Pixel)
    float fineK = 1.0 - smoothstep(6.0, 34.0, camD);
    vec2 r1 = vec2(p.x * 0.8 + p.y * 0.6, -p.x * 0.6 + p.y * 0.8);
    float bl = skdN(vec2(r1.x * 46.0, r1.y * 9.0)) * 0.6 + skdN(vec2(p.x * 40.0, p.y * 11.0) + 3.3) * 0.4;
    float blades = (bl - 0.5) * 0.34 * fineK + (skdN(p * 6.0) - 0.5) * 0.18 * (1.0 - smoothstep(40.0, 130.0, camD));
    // Halmbüschel und dunkle Lücken dazwischen
    float tuft = (smoothstep(0.7, 0.9, skdN(vec2(p.x * 9.0, p.y * 2.2))) - smoothstep(0.75, 0.95, skdN(p * 3.1 + 9.1)) * 0.6) * nearK;
    diffuseColor.rgb *= 1.0 + mid * 0.24 + blades + tuft * 0.18;
    float dirt = smoothstep(0.78, 0.86, skdN(p * 0.09 + 7.3));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.33, 0.22) * (0.88 + skdN(p * 16.0) * 0.24), dirt * 0.7);
  }`,
  rock: /* glsl */ `{
    vec3 w = vSkWorld;
    float camD = distance(w, cameraPosition);
    float strata = sin(w.y * 3.1 + skdN(w.xz * 0.3) * 3.0) * 0.5 + 0.5;
    float speck = (skdN((w.xz + w.y) * 16.0) - 0.5) * 0.16 * (1.0 - smoothstep(20.0, 70.0, camD));
    diffuseColor.rgb *= 0.9 + strata * 0.16 + speck + (skdF(w.xz * 0.2 + w.y * 0.1) - 0.5) * 0.18;
  }`,
};

function patch(mat: MeshToonMaterial, spec: number, rim: number, detail?: 'sand' | 'grass' | 'rock') {
  const uSpec = { value: spec };
  const uRimAmount = { value: rim };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = toonShared.rimColor;
    shader.uniforms.uRimStrength = toonShared.rimStrength;
    shader.uniforms.uShadowTint = toonShared.shadowTint;
    shader.uniforms.uSpec = uSpec;
    shader.uniforms.uRimAmount = uRimAmount;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uShadowTint;\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uSpec;\nuniform float uRimAmount;')
      .replace('#include <opaque_fragment>', RIM_SPEC_GLSL + '\n#include <opaque_fragment>');
    if (detail) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSkWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + DETAIL_GLSL)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + DETAIL_FRAG[detail]);
    }
  };
  mat.customProgramCacheKey = () => `sk-toon-2${detail ? '-' + detail : ''}`;
}

/** Toon-Material im Anime-Stil (gecacht – gleiche Optionen ergeben dasselbe Material). */
export function toon(opts: ToonOptions | ColorRepresentation): MeshToonMaterial {
  const o: ToonOptions = typeof opts === 'object' && opts !== null && 'color' in (opts as object) ? (opts as ToonOptions) : { color: opts as ColorRepresentation };
  const key = JSON.stringify({ ...o, color: new Color(o.color).getHex(), emissive: o.emissive !== undefined ? new Color(o.emissive).getHex() : 0, map: o.map?.uuid ?? null });
  const hit = cache.get(key);
  if (hit) return hit;
  const mat = new MeshToonMaterial({
    color: o.color,
    map: o.map ?? null,
    gradientMap: TOON_RAMP,
    emissive: o.emissive ?? 0x000000,
    side: o.side ?? FrontSide,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    vertexColors: o.vertexColors ?? false,
  });
  if (o.flatShading) (mat as any).flatShading = true;
  patch(mat, o.spec ?? 0, o.rim ?? 1, o.detail);
  mat.userData.toon = true;
  cache.set(key, mat);
  return mat;
}

/** Ersetzt die Materialien fremder Modelle durch unser Toon-Material (Farbe und Textur bleiben). */
export function toonify(root: Object3D, extra: Partial<ToonOptions> = {}) {
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const conv = (mat: Material): Material => {
      const src = mat as any;
      if (src.userData?.toon || src.isShaderMaterial || src.isMeshBasicMaterial) return mat;
      return toon({
        color: src.color ?? 0xffffff,
        map: src.map ?? null,
        transparent: src.transparent,
        opacity: src.opacity,
        side: src.side,
        vertexColors: src.vertexColors,
        spec: src.metalness > 0.4 ? 0.8 : 0,
        ...extra,
      });
    };
    m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
  });
}
