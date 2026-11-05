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

function patch(mat: MeshToonMaterial, spec: number, rim: number) {
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
  };
  mat.customProgramCacheKey = () => 'sk-toon-2';
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
  patch(mat, o.spec ?? 0, o.rim ?? 1);
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
