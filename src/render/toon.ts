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
import { markShared } from './dispose';
import { ensureCsm } from './csm';
import { cubeUvDefines, envShared } from './ibl';
import { fogUniforms } from './atmosphere';
import { isWind, windShared, WIND_PARS } from './wind';
import { WATER_ALPHA } from './outline';

/** Gemeinsame Werte für alle Toon-Materialien – die Umgebung passt sie an Tageszeit und Wetter an. */
export const toonShared = {
  rimColor: { value: new Color(1, 0.95, 0.85) },
  rimStrength: { value: 0.55 },
  /** Farbe der Schattenseiten (Anime: kühl, abends violett) */
  shadowTint: { value: new Color(0.74, 0.8, 1.12) },
  /** 1 = Umgebungskarte (IBL) vorhanden; sonst spiegeln Metalle einen einfachen Himmelsverlauf */
  envOn: { value: 0 },
  envLow: { value: new Color(0.5, 0.55, 0.6) },
  envHigh: { value: new Color(0.7, 0.8, 0.95) },
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
  return markShared(t);
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
  return markShared(t);
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
  /** Eigenes Material statt Cache (für Texturen, die nur einem Objekt gehören – wird mit ihm freigegeben) */
  unique?: boolean;
  // ---------- PBR (fließt ins Anime-Shading ein, ersetzt es nicht) ----------
  /** Reliefkarte (Tangentenraum) und ihre Stärke */
  normalMap?: Texture | null;
  normalScale?: number;
  /** Umgebungsverdeckung aus der Textur (Kanal R) */
  aoMap?: Texture | null;
  aoMapIntensity?: number;
  /** Rauheit 0 (Spiegel) … 1 (matt); Standard: Metall 0,3–0,42, sonst 0,85 */
  roughness?: number;
  /** Metall 0 … 1; Standard: 1 bei spec ≥ 0,8 (Klingen, Rüstung, Gold), sonst 0 */
  metalness?: number;
  /** Rauheit (Kanal G) und Metall (Kanal B) aus einer Textur – glTF-Anordnung, darf dieselbe ORM-Textur sein */
  roughnessMap?: Texture | null;
  metalnessMap?: Texture | null;
  /** Treffer-Randlicht und Auflösen (nur eigene Material-Kopien je Figur, siehe toonFx) */
  fx?: boolean;
  /** Spiegelnde Fläche für die Bildschirm-Spiegelungen (SSR): 0 = matt … 1 = Pfütze/Spiegel */
  reflect?: number;
}

/** Steuerwerte des Treffer-/Auflöse-Effekts eines Materials */
export interface ToonFxUniforms {
  hit: { value: number };
  hitCol: { value: Color };
  dissolve: { value: number };
  dissolveCol: { value: Color };
}
const optsOf = new WeakMap<Material, ToonOptions>();
const fxOf = new WeakMap<Material, ToonFxUniforms>();

/**
 * Eigene Kopie eines Toon-Materials mit Treffer-Randlicht (Fresnel) und Auflösen – je Figur, damit nur der
 * getroffene Gegner aufleuchtet. Gleiches Shader-Programm für alle Figuren; wird mit der Figur freigegeben.
 */
export function toonFx(src: Material): { mat: MeshToonMaterial; u: ToonFxUniforms } | null {
  const o = optsOf.get(src);
  if (!o) return null;
  const mat = toon({ ...o, unique: true, fx: true });
  return { mat, u: fxOf.get(mat)! };
}

const cache = new Map<string, MeshToonMaterial>();

/** PBR- und Umgebungs-Uniforms; die Karten-UV folgt der vorhandenen Textur */
const PBR_PARS_GLSL = /* glsl */ `
  uniform float uRough;
  uniform float uMetal;
  uniform float uEnvOn;
  uniform float uEnvI;
  uniform vec3 uEnvLow;
  uniform vec3 uEnvHigh;
  #if defined(SK_ROUGHMAP) || defined(SK_METALMAP)
    #if defined(USE_MAP)
      #define SK_PBR_UV vMapUv
    #elif defined(USE_AOMAP)
      #define SK_PBR_UV vAoMapUv
    #else
      #define SK_PBR_UV vNormalMapUv
    #endif
  #endif
  #ifdef SK_ROUGHMAP
    uniform sampler2D uRoughMap;
  #endif
  #ifdef SK_METALMAP
    uniform sampler2D uMetalMap;
  #endif
  #ifdef SK_ENV
    uniform sampler2D uSkEnv;
  #endif
`;

/** Auflösen: Rauschen im Objektraum (klebt am Körper), Pixel unter der Schwelle verschwinden */
const FX_PARS_GLSL = /* glsl */ `
  uniform float uHit;
  uniform vec3 uHitCol;
  uniform float uDissolve;
  uniform vec3 uDissolveCol;
  varying vec3 vSkFxPos;
  float skFxH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float skFxN(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(skFxH(i), skFxH(i + vec3(1, 0, 0)), f.x), mix(skFxH(i + vec3(0, 1, 0)), skFxH(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(skFxH(i + vec3(0, 0, 1)), skFxH(i + vec3(1, 0, 1)), f.x), mix(skFxH(i + vec3(0, 1, 1)), skFxH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float skFxNoise() { return skFxN(vSkFxPos * 9.0) * 0.65 + skFxN(vSkFxPos * 23.0) * 0.35; }
`;

const RIM_SPEC_GLSL = /* glsl */ `
  {
    float skRough = uRough;
    float skMetal = uMetal;
    #ifdef SK_ROUGHMAP
      skRough *= texture2D(uRoughMap, SK_PBR_UV).g;
    #endif
    #ifdef SK_METALMAP
      skMetal *= texture2D(uMetalMap, SK_PBR_UV).b;
    #endif
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
        // Glanzfleck: glatte Flächen klein und scharf, raue groß und weich (Anime-Kante bleibt)
        vec3 H = normalize(L + viewDir);
        float s = pow(max(dot(normal, H), 1e-4), mix(128.0, 14.0, skRough));
        vec3 specTint = mix(vec3(1.0), diffuseColor.rgb, skMetal * 0.6);
        outgoingLight += directionalLights[0].color * specTint * smoothstep(0.45, 0.55, s) * uSpec * 0.45;
      }
    #endif
    outgoingLight += mix(diffuseColor.rgb, vec3(1.0), 0.35) * uRimColor * rim;
    #ifdef SK_ENV
    {
      // Bildbasierte Spiegelung (IBL): Himmel, Sonne und Abendrot aus der vorgefilterten Umgebungskarte
      vec3 rW = inverseTransformDirection(reflect(-viewDir, normal), viewMatrix);
      vec3 envC = uEnvOn > 0.5 ? textureCubeUV(uSkEnv, rW, skRough).rgb : mix(uEnvLow, uEnvHigh, clamp(rW.y * 0.5 + 0.5, 0.0, 1.0));
      float fres = pow(1.0 - ndv, 5.0);
      vec3 F0 = mix(vec3(0.04), diffuseColor.rgb, skMetal);
      vec3 F = F0 + (vec3(1.0) - F0) * fres * (1.0 - skRough * 0.8);
      // Metall: die Farbe kommt aus der Spiegelung, die matte Grundfarbe tritt zurück
      outgoingLight = outgoingLight * (1.0 - skMetal * 0.55) + envC * F * uEnvI;
    }
    #endif
    #ifdef SK_FX
      // Treffer: Fresnel-Randlicht leuchtet kurz auf (Kanten zur Kamera hin hell, Mitte bleibt lesbar)
      float skFres = pow(1.0 - ndv, 3.0);
      outgoingLight += uHitCol * (skFres * 2.4 + 0.1) * uHit;
      // Auflösen: glühender Rand an der Schwelle
      if (uDissolve > 0.0) {
        float skEdge = 1.0 - smoothstep(0.0, 0.07, skFxNoise() - uDissolve);
        outgoingLight = mix(outgoingLight, uDissolveCol * 3.0, skEdge);
      }
    #endif
  }
`;

/** Rauschfunktionen und Oberflächen für Sand, Gras und Fels (Weltkoordinaten, mit Entfernung weich ausgeblendet) */
const DETAIL_GLSL = /* glsl */ `
  varying vec3 vSkWorld;
  float skdH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
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

interface PbrPatch { rough: number; metal: number; roughMap: Texture | null; metalMap: Texture | null; env: boolean; fx?: ToonFxUniforms; reflect: number }

function patch(mat: MeshToonMaterial, spec: number, rim: number, detail: 'sand' | 'grass' | 'rock' | undefined, pbr: PbrPatch) {
  const uSpec = { value: spec };
  const uRimAmount = { value: rim };
  const uRough = { value: pbr.rough };
  const uMetal = { value: pbr.metal };
  const uRoughMap = { value: pbr.roughMap };
  const uMetalMap = { value: pbr.metalMap };
  mat.onBeforeCompile = (shader) => {
    // Pflanzen wiegen sich im Wind (Gewicht je Eckpunkt in aWind, siehe render/wind.ts)
    if (isWind(mat)) {
      Object.assign(shader.uniforms, windShared);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + WIND_PARS)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec4 skWw = modelMatrix * vec4(transformed, 1.0); transformed += skWind(transformed, skWw.xyz, aWind); }');
    }
    // Spiegelungsmaske im Alpha-Kanal (nur mit Nachbearbeitung, die das Bild danach undurchsichtig macht)
    if (pbr.reflect > 0) {
      shader.uniforms.uReflect = { value: pbr.reflect };
      shader.uniforms.uSkMaskOff = WATER_ALPHA;
    }
    shader.uniforms.uRimColor = toonShared.rimColor;
    shader.uniforms.uRimStrength = toonShared.rimStrength;
    shader.uniforms.uShadowTint = toonShared.shadowTint;
    shader.uniforms.uSpec = uSpec;
    shader.uniforms.uRimAmount = uRimAmount;
    shader.uniforms.uRough = uRough;
    shader.uniforms.uMetal = uMetal;
    shader.uniforms.uRoughMap = uRoughMap;
    shader.uniforms.uMetalMap = uMetalMap;
    shader.uniforms.uSkEnv = envShared.map;
    shader.uniforms.uEnvOn = toonShared.envOn;
    shader.uniforms.uEnvI = envShared.intensity;
    shader.uniforms.uEnvLow = toonShared.envLow;
    shader.uniforms.uEnvHigh = toonShared.envHigh;
    fogUniforms(shader);
    if (pbr.fx) {
      shader.uniforms.uHit = pbr.fx.hit;
      shader.uniforms.uHitCol = pbr.fx.hitCol;
      shader.uniforms.uDissolve = pbr.fx.dissolve;
      shader.uniforms.uDissolveCol = pbr.fx.dissolveCol;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSkFxPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkFxPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (uDissolve > 0.0 && skFxNoise() < uDissolve) discard;');
    }
    const defs = (pbr.roughMap ? '#define SK_ROUGHMAP\n' : '') + (pbr.metalMap ? '#define SK_METALMAP\n' : '') + (pbr.env ? '#define SK_ENV\n' + cubeUvDefines() : '') + (pbr.fx ? '#define SK_FX\n' : '');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', defs + '#include <common>\nuniform vec3 uShadowTint;\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uSpec;\nuniform float uRimAmount;\n' + PBR_PARS_GLSL + (pbr.fx ? FX_PARS_GLSL : '') + (pbr.env ? '#include <cube_uv_reflection_fragment>\n' : ''))
      .replace('#include <opaque_fragment>', RIM_SPEC_GLSL + '\n#include <opaque_fragment>' + (pbr.reflect > 0 ? '\ngl_FragColor.a = mix(1.0 - 0.4 * clamp(uReflect, 0.0, 1.0), 1.0, uSkMaskOff);' : ''))
      .replace('#include <common>', '#include <common>\n' + (pbr.reflect > 0 ? 'uniform float uReflect;\nuniform float uSkMaskOff;' : ''));
    if (detail) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSkWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + DETAIL_GLSL)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + DETAIL_FRAG[detail]);
    }
  };
  const progKey = `sk-toon-3${detail ? '-' + detail : ''}-${pbr.env ? 'e' : ''}${pbr.roughMap ? 'r' : ''}${pbr.metalMap ? 'm' : ''}${pbr.fx ? 'f' : ''}${pbr.reflect > 0 ? 's' : ''}`;
  mat.customProgramCacheKey = () => progKey + (isWind(mat) ? 'w' : '');
}

/** Toon-Material im Anime-Stil (gecacht – gleiche Optionen ergeben dasselbe Material). */
export function toon(opts: ToonOptions | ColorRepresentation): MeshToonMaterial {
  const o: ToonOptions = typeof opts === 'object' && opts !== null && 'color' in (opts as object) ? (opts as ToonOptions) : { color: opts as ColorRepresentation };
  const unique = !!o.unique;
  const tex = (t: Texture | null | undefined) => t?.uuid ?? null;
  const key = unique ? '' : JSON.stringify({
    ...o, color: new Color(o.color).getHex(), emissive: o.emissive !== undefined ? new Color(o.emissive).getHex() : 0,
    map: tex(o.map), normalMap: tex(o.normalMap), aoMap: tex(o.aoMap), roughnessMap: tex(o.roughnessMap), metalnessMap: tex(o.metalnessMap),
  });
  const hit = unique ? undefined : cache.get(key);
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
    normalMap: o.normalMap ?? null,
    aoMap: o.aoMap ?? null,
    aoMapIntensity: o.aoMapIntensity ?? 1,
  });
  if (o.normalMap) mat.normalScale.setScalar(o.normalScale ?? 1);
  if (o.flatShading) (mat as any).flatShading = true;
  // Metall und Rauheit: bisherige Glanz-Materialien (spec ≥ 0,8: Klingen, Rüstung, Gold, Kanonen) werden zu Metall
  const spec = o.spec ?? 0;
  const metal = o.metalness ?? (spec >= 0.8 ? 1 : 0);
  const rough = o.roughness ?? (metal > 0 ? (spec >= 1 ? 0.3 : 0.42) : 0.85);
  const fx: ToonFxUniforms | undefined = o.fx
    ? { hit: { value: 0 }, hitCol: { value: new Color(1, 1, 1) }, dissolve: { value: 0 }, dissolveCol: { value: new Color(1.0, 0.45, 0.12) } }
    : undefined;
  patch(mat, spec, o.rim ?? 1, o.detail, {
    rough, metal, roughMap: o.roughnessMap ?? null, metalMap: o.metalnessMap ?? null,
    // Spiegelungen nur, wo sie sichtbar sind: Metall oder glatte Flächen (Eis, Lack)
    env: metal > 0 || rough < 0.35 || !!o.metalnessMap,
    fx,
    reflect: o.reflect ?? 0,
  });
  optsOf.set(mat, o);
  if (fx) fxOf.set(mat, fx);
  mat.userData.toon = true;
  ensureCsm(mat);
  if (unique) return mat;
  cache.set(key, mat);
  return markShared(mat);
}

/** Alle zwischengespeicherten Toon-Materialien (z. B. um Schatten-Schalter umzustellen) */
export function forEachToon(fn: (m: MeshToonMaterial) => void) {
  for (const m of cache.values()) fn(m);
}

/** Kopie eines Toon-Materials, die Anime-Shading und Schatten-Schalter behält (clone() verliert beides) */
export function cloneToon<T extends Material>(src: T): T {
  const c = src.clone() as T;
  c.onBeforeCompile = src.onBeforeCompile;
  c.customProgramCacheKey = src.customProgramCacheKey;
  c.defines = { ...(src.defines ?? {}) };
  ensureCsm(c);
  return c;
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
