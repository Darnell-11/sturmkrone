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
  Vector3,
  Vector4,
} from 'three';
import { markShared } from './dispose';
import { ensureCsm } from './csm';
import { cubeUvDefines, envShared } from './ibl';
import { fogUniforms } from './atmosphere';
import { isWind, windShared, WIND_PARS, WIND_VERTEX } from './wind';
import { WATER_ALPHA } from './outline';
import { WET_PARS, wetShared } from './wetness';

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

/** Prozedurale Oberflächen aus der Weltposition; stone, tile und plaster werfen zusätzlich Relief (Bump) aufs Licht */
export type DetailKind = 'sand' | 'grass' | 'rock' | 'stone' | 'tile' | 'plaster';

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
  detail?: DetailKind;
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
  /** Pfützen bei Regen auf flachen Stellen (0 = keine … 1 = viele), nur für Böden: Sand, Gras, Pflaster, Planken */
  puddles?: number;
  /** Ringelstreifen: Streifenhöhe in Modelleinheiten; gilt für Punkte mit Attribut stripe = 1 (Ringelhemd) */
  ringel?: number;
  /**
   * Ausrüstungs-Verzierung (nur mit `surface`): Borte am Saum (Attribut rimD = Abstand zum Rand in Metern), Muster (Kettenhemd,
   * Platten, Schuppen, Brokat, Nieten, Steppung) und Farben je Stück aus den Attributen trimC, patC und gset (Muster, Maß, Bortenbreite, Bortenart).
   */
  trim?: boolean;
  /**
   * Bodenschicht, die knapp über einer anderen liegt (Wiese auf Strand, Weg auf Wiese): Tiefenverschiebung, damit die
   * Schichten in der Ferne nicht flimmern. Höhere Zahl = liegt weiter oben.
   */
  layer?: number;
  // ---------- Figuren: Anime-Formen mit PBR-Oberflächen (Stylized Realism) ----------
  /**
   * Figuren-Material: Fresnel-Randlicht aus dem Himmelslicht statt Tusche-Kontur, dazu die Oberfläche:
   * skin (Streuung unter der Haut), cloth/leather/steel (Feinrelief + passender Glanz), hair (Lichtband), eye (Glanzpunkte).
   */
  surface?: Surface;
  /** Welt-Materialien: Feinrelief ohne Figuren-Effekte (Randlicht, Haut, Haare …), z. B. 'cloth' für Segel; Metall bekommt automatisch 'steel' */
  micro?: Surface;
  /**
   * Augen: Lage der Iris in der Textur, für die Glanzpunkte. Die Textur enthält beide Augen nebeneinander:
   * Abstand der Iris-Mitten von u = 0,5, Mitte v, halbe Breite (u) und halbe Höhe (v).
   */
  eyeUv?: [number, number, number, number];
  /** Haare: Kopfmitte im Raum des Haar-Netzes. Das Lichtband folgt der Kopfrundung statt jeder einzelnen Strähne. */
  hairC?: [number, number, number];
}
export type Surface = 'skin' | 'cloth' | 'leather' | 'steel' | 'hair' | 'eye' | 'plain';
const SURF_ID: Record<Surface, number> = { plain: 0, skin: 1, cloth: 2, leather: 3, steel: 4, hair: 5, eye: 6 };

/** Figuren zeichnen ihre Ränder mit Licht statt mit Tusche (Konturen an Figuren aus) */
export const CHARACTER_INK = false;
/** Alpha, das Figuren schreiben: die Kantenerkennung (render/outline.ts) lässt diese Pixel aus; für Spiegelungen und AO zählt es als 1 */
export const CHAR_ALPHA = 0.98;

/**
 * Figuren-Fassung eines Toon-Materials (gleiche Optionen plus Oberfläche). Ohne Angabe: Metall wird Stahl, alles andere Stoff.
 * Materialien, die schon eine Figuren-Oberfläche haben, bleiben unverändert.
 */
export function toonChar(src: Material, surface?: Surface): Material {
  const o = optsOf.get(src);
  if (!o || o.surface || o.unique) return src;
  const metal = o.metalness ?? ((o.spec ?? 0) >= 0.8 ? 1 : 0);
  return inheritState(toon({ ...o, surface: surface ?? (metal > 0 ? 'steel' : 'cloth') }), src);
}

/**
 * Einstellungen, die nach dem Anlegen eines Toon-Materials gesetzt wurden (alphaTest, depthWrite, Tiefenverschiebung),
 * stehen nicht in den Optionen und gehen bei jeder Kopie verloren. Ohne sie sortieren sich durchscheinende Gesichtsteile
 * (Wimpern, Augenglanz) nach dem ersten Treffer falsch: sie schreiben wieder Tiefe und verdecken sich gegenseitig.
 */
function inheritState<T extends Material>(mat: T, src: Material): T {
  const a = src as MeshToonMaterial;
  mat.alphaTest = a.alphaTest; mat.depthWrite = a.depthWrite; mat.depthTest = a.depthTest;
  mat.polygonOffset = a.polygonOffset; mat.polygonOffsetFactor = a.polygonOffsetFactor; mat.polygonOffsetUnits = a.polygonOffsetUnits;
  return mat;
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
  const mat = inheritState(toon({ ...o, unique: true, fx: true }), src);
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

/**
 * Nässe (render/wetness.ts): nach oben zeigende Flächen werden zuerst nass. Auf Böden mit Pfützen-Option
 * entstehen in Senken des Rauschens flache Wasserflächen mit Regenringen.
 */
const WET_PRE_GLSL = /* glsl */ `
  float skPud = 0.0;
  vec3 skUpV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float skUp = clamp(dot(normal, skUpV), 0.0, 1.0);
  float skWetK = uWet * (0.35 + 0.65 * skUp);
  vec3 skWN = normal;
  #ifdef SK_PUDDLE
  if (uPuddle > 0.002) {
    vec2 pp = vSkWorld.xz;
    // Ebenheit aus der echten Fläche (nicht aus der Reliefkarte, sonst bekäme Pflaster nie Pfützen)
    vec3 skCr = cross(dFdx(vSkWorld), dFdy(vSkWorld));
    float flatK = smoothstep(0.9, 0.975, abs(skCr.y) * inversesqrt(max(dot(skCr, skCr), 1e-14))) * smoothstep(0.5, 0.8, skUp);
    float n = skWetN(pp * 0.16) * 0.6 + skWetN(pp * 0.5 + 4.7) * 0.28 + skWetN(pp * 1.7 + 1.3) * 0.12;
    float thr = 1.0 - uPuddle * uPuddleAmt * 0.6;
    skPud = smoothstep(thr, thr + 0.05, n) * flatK;
    if (skPud > 0.01 && uRain > 0.05) {
      // Regenringe kippen die Normale der Wasserfläche
      float camD = distance(vSkWorld, cameraPosition);
      float e = 0.04;
      float r0 = skRipple(pp), rx = skRipple(pp + vec2(e, 0.0)), rz = skRipple(pp + vec2(0.0, e));
      vec2 g = vec2(rx - r0, rz - r0) * (0.35 * min(1.0, uRain * 1.5) * (1.0 - smoothstep(15.0, 45.0, camD)));
      vec3 vX = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
      vec3 vZ = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
      skWN = normalize(mix(normal, skUpV, skPud) - (vX * g.x + vZ * g.y));
    } else {
      skWN = normalize(mix(normal, skUpV, skPud));
    }
  }
  #endif
`;

/** Nasser Glanz und Himmelsspiegelung (für Materialien ohne eigene Umgebungskarte) und die Pfützen */
const WET_POST_GLSL = /* glsl */ `
  if (skWetK > 0.002 || skPud > 0.002) {
    vec3 skV = normalize(vViewPosition);
    float skNdv = clamp(dot(skWN, skV), 0.0, 1.0);
    vec3 skRW = inverseTransformDirection(reflect(-skV, skWN), viewMatrix);
    vec3 skSky = mix(uEnvLow, uEnvHigh, clamp(skRW.y * 0.5 + 0.5, 0.0, 1.0)) * uEnvI;
    float skFres = pow(1.0 - skNdv, 5.0);
    #ifndef SK_ENV
      outgoingLight += skSky * (0.025 + 0.55 * skFres) * skWetK * (1.0 - skPud);
    #endif
    // Pfütze: dunkles Wasser, das den Himmel spiegelt (die Umgebung kommt über die Bildschirm-Spiegelungen dazu)
    outgoingLight = mix(outgoingLight, outgoingLight * 0.32 + skSky * (0.26 + 0.7 * skFres), skPud * 0.92);
    #if NUM_DIR_LIGHTS > 0
      vec3 skL = directionalLights[0].direction;
      float skS = pow(max(dot(skWN, normalize(skL + skV)), 1e-4), mix(90.0, 600.0, skPud));
      outgoingLight += directionalLights[0].color * smoothstep(0.35, 0.65, skS) * (skWetK * 0.22 + skPud * 0.9);
    #endif
  }
`;


/**
 * PBR-Beleuchtung statt der harten 3-Stufen-Rampe: weiche Hell-Dunkel-Kurve (Schatten bleiben wie im Anime angehoben,
 * aber ohne Kante), Metall nimmt der Grundfarbe das Diffuse, dazu echter GGX-Glanz der Sonne mit Rauheit und
 * Fresnel (Cook-Torrance). Rauheit und Metall kommen aus den Uniforms und den Karten, Nässe glättet die Fläche.
 */
const LIGHTS_GLSL = /* glsl */ `
varying vec3 vViewPosition;
struct ToonMaterial { vec3 diffuseColor; };
float skRoughL() {
  float r = uRough;
  #ifdef SK_ROUGHMAP
    r *= texture2D(uRoughMap, SK_PBR_UV).g;
  #endif
  return clamp(mix(r, 0.1, uWet * 0.7), 0.05, 1.0);
}
float skMetalL() {
  float m = uMetal;
  #ifdef SK_METALMAP
    m *= texture2D(uMetalMap, SK_PBR_UV).b;
  #endif
  return m;
}
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 N = geometryNormal, L = directLight.direction, V = geometryViewDir;
  float nl = dot(N, L);
  float metal = skMetalL();
  // weicher Übergang von Schatten zu Licht (keine Stufen): Schattenseite auf 32 % angehoben, wie zuvor die unterste Stufe
  float lit = mix(0.32, 1.0, smoothstep(-0.3, 0.95, nl));
  vec3 albedo = material.diffuseColor * (1.0 - metal * 0.8);
  reflectedLight.directDiffuse += directLight.color * lit * BRDF_Lambert(albedo);
  #if defined(SK_SURF) && defined(SK_CHAR)
    // Haare und Augen haben eigenen Glanz (anisotrop bzw. Glanzpunkte)
    #if SK_SURF == 5 || SK_SURF == 6
      return;
    #endif
  #endif
  float nlc = clamp(nl, 0.0, 1.0);
  if (nlc <= 0.0) return;
  float rough = skRoughL();
  float a = rough * rough, a2 = a * a;
  vec3 H = normalize(L + V);
  float nh = clamp(dot(N, H), 0.0, 1.0), nv = clamp(dot(N, V), 0.0, 1.0) + 1e-4, lh = clamp(dot(L, H), 0.0, 1.0);
  float d = nh * nh * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * d * d);
  float vis = 0.5 / (nlc * sqrt(nv * nv * (1.0 - a2) + a2) + nv * sqrt(nlc * nlc * (1.0 - a2) + a2) + 1e-4);
  vec3 F0 = mix(vec3(0.04), material.diffuseColor, metal);
  // Fresnel, bei rauen Flächen gedämpft (sonst überzieht der Streifwinkel-Glanz Stoff und Leder im Gegenlicht mit Dunst)
  vec3 F = F0 + (vec3(1.0) - F0) * pow(1.0 - lh, 5.0) * (1.0 - rough * 0.88);
  // der Toon-Shader zählt reflectedLight.directSpecular nicht mit: Glanz in den diffuse-Anteil
  reflectedLight.directDiffuse += directLight.color * nlc * F * (D * vis) * 0.9;
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert(material.diffuseColor * (1.0 - skMetalL() * 0.8));
}
#define RE_Direct RE_Direct_Toon
#define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
`;

/**
 * Muster und Borten der Ausrüstung. Muster-Nummer in vGSet.x: 1 Platten (Lamellen), 2 Kettenhemd, 3 Schuppen, 4 Brokat (Rauten),
 * 5 Nieten, 6 Steppung, 7 Streifen. vGSet.y = Maß in Metern (Größe einer Masche, Lamelle, Raute), vGSet.z = Bortenbreite in Metern,
 * vGSet.w = Bortenart (0 schlicht, 1 mit Zierlinie, 2 Zickzack).
 */
const GEAR_FRAG_GLSL = /* glsl */ `
  {
    vec3 skGp = vSkObj;
    float skGpat = vGSet.x;
    float skGm = max(vGSet.y, 0.002);
    if (skGpat > 0.5) {
      // in der Ferne ausblenden, bevor das Muster kleiner als ein Bildpunkt wird
      float skGpx = (length(dFdx(skGp)) + length(dFdy(skGp))) / skGm;
      float skGfade = 1.0 - smoothstep(0.35, 0.9, skGpx);
      vec2 skGuv = vec2(atan(skGp.x, skGp.z) * 0.13 / skGm, skGp.y / skGm);
      if (skGpat < 1.5) {
        // Platten: waagrechte Lamellen, jede heller zur Oberkante und mit dunkler Fuge unten
        float f = fract(skGuv.y);
        float lame = mix(0.66, 1.08, pow(f, 0.75));
        float edge = smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.93, 1.0, f));
        diffuseColor.rgb *= mix(1.0, lame * (0.55 + 0.45 * edge), skGfade);
      } else if (skGpat < 2.5) {
        // Kettenhemd: versetzte Ringreihen, Ringe hell, Mitte dunkel
        vec2 q = skGuv;
        q.x += 0.5 * mod(floor(q.y), 2.0);
        vec2 c = fract(q) - 0.5;
        float l = length(c * vec2(1.0, 1.4));
        float ring = smoothstep(0.16, 0.26, l) * (1.0 - smoothstep(0.36, 0.5, l));
        diffuseColor.rgb *= mix(1.0, 0.5 + 0.65 * ring, skGfade);
      } else if (skGpat < 3.5) {
        // Schuppen: dachziegelartig versetzte Halbkreise, Unterkante heller abgesetzt
        vec2 q = skGuv;
        q.x += 0.5 * mod(floor(q.y), 2.0);
        vec2 c = vec2(fract(q.x) - 0.5, fract(q.y) * 1.25 - 0.45);
        float d = length(c);
        float sc = 1.0 - smoothstep(0.44, 0.52, d);
        float rim = smoothstep(0.34, 0.5, d) * sc;
        float shade = mix(0.6, 1.08, sc) + rim * 0.2;
        diffuseColor.rgb = mix(diffuseColor.rgb, vGPat, rim * 0.35 * skGfade) * mix(1.0, shade, skGfade);
      } else if (skGpat < 4.5) {
        // Brokat: Rauten mit Zierfarbe und feiner Linie
        vec2 d = abs(fract(skGuv * vec2(1.0, 0.85)) - 0.5);
        float dia = d.x + d.y;
        float inner = 1.0 - smoothstep(0.2, 0.24, dia);
        float line = smoothstep(0.36, 0.38, dia) * (1.0 - smoothstep(0.4, 0.43, dia));
        diffuseColor.rgb = mix(diffuseColor.rgb, vGPat, (inner * 0.55 + line * 0.8) * skGfade);
      } else if (skGpat < 5.5) {
        // Nieten: Gitter runder Metallköpfe
        vec2 c = fract(skGuv * 0.5) - 0.5;
        float dot0 = 1.0 - smoothstep(0.1, 0.16, length(c));
        diffuseColor.rgb = mix(diffuseColor.rgb, vGPat, dot0 * skGfade);
      } else if (skGpat < 6.5) {
        // Steppung: dunkle Nähte in zwei diagonalen Richtungen
        vec2 q = skGuv * 0.7;
        float a = abs(fract(q.x + q.y) - 0.5), b = abs(fract(q.x - q.y) - 0.5);
        float seam = 1.0 - smoothstep(0.0, 0.07, min(a, b));
        diffuseColor.rgb *= 1.0 - seam * 0.42 * skGfade;
      } else {
        // Streifen: senkrechte Bahnen in der Zierfarbe
        float s = smoothstep(0.42, 0.5, abs(fract(skGuv.x * 0.5) - 0.5));
        diffuseColor.rgb = mix(diffuseColor.rgb, vGPat, s * 0.9 * skGfade);
      }
    }
    // Borte am Rand des Stücks
    float skGw = vGSet.z;
    if (skGw > 0.0005) {
      float aa = fwidth(vGRim) * 0.8 + 1e-5;
      float rimD = vGRim;
      if (vGSet.w > 1.5) rimD += (abs(fract(skGp.x * 90.0 + skGp.z * 90.0) - 0.5) - 0.25) * skGw * 0.9;
      float band = 1.0 - smoothstep(skGw - aa, skGw + aa, rimD);
      diffuseColor.rgb = mix(diffuseColor.rgb, vGTrim, band);
      // dunkle Kante an der Borte und, bei Art 1, eine feine Zierlinie knapp darüber
      float edge = smoothstep(skGw - aa * 2.0, skGw, rimD) * (1.0 - smoothstep(skGw, skGw + aa * 2.5, rimD));
      diffuseColor.rgb *= 1.0 - edge * 0.35;
      if (vGSet.w > 0.5 && vGSet.w < 1.5) {
        float li = abs(rimD - (skGw + 0.0075));
        float line = 1.0 - smoothstep(0.0012 - aa, 0.0012 + aa, li);
        diffuseColor.rgb = mix(diffuseColor.rgb, vGTrim, line);
      }
    }
  }
`;

/** Feinrelief (Micro-Normals) aus der Körperposition in Metern: klebt an der Figur, braucht weder UV noch Tangenten */
const MICRO_PARS_GLSL = /* glsl */ `
  varying vec3 vSkObj;
  float skMH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float skMN(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(skMH(i), skMH(i + vec3(1, 0, 0)), f.x), mix(skMH(i + vec3(0, 1, 0)), skMH(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(skMH(i + vec3(0, 0, 1)), skMH(i + vec3(1, 0, 1)), f.x), mix(skMH(i + vec3(0, 1, 1)), skMH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  /** x = Höhe in Metern, y = Höhe 0 … 1 (für die Vertiefungen), z = Wellen je Meter (zum Ausblenden in der Ferne) */
  vec3 skMicroH(vec3 p) {
    #if SK_SURF == 2
      // Stoff: Köperbindung aus zwei schrägen Fadenrichtungen
      float a = sin(dot(p, vec3(1.0, 1.0, 0.35)) * 1257.0), b = sin(dot(p, vec3(-1.0, 1.0, 0.6)) * 1257.0);
      float h = a * b * 0.5 + 0.5;
      return vec3(h * 0.00042, h, 200.0);
    #elif SK_SURF == 3
      // Leder: Narbung aus zwei Rauschgrößen mit feinen Falten
      float n = skMN(p * 240.0) * 0.65 + skMN(p * 610.0) * 0.35;
      float h = 1.0 - abs(n - 0.5) * 2.0;
      return vec3(h * 0.0011, h, 130.0);
    #elif SK_SURF == 4
      // Stahl: gebürstete Riefen längs, dazu einzelne Kratzer
      float n = skMN(vec3(p.x * 1100.0, p.y * 45.0, p.z * 1100.0));
      float sc = smoothstep(0.82, 0.9, skMN(vec3(p.x * 300.0 + p.y * 90.0, p.y * 14.0, p.z * 300.0)));
      float h = n * 0.8 + sc * 0.2;
      return vec3(h * 0.00016, h, 520.0);
    #elif SK_SURF == 1
      // Haut: sehr feine Poren (wirken nur im Glanz)
      float h = skMN(p * 820.0) * 0.6 + skMN(p * 2100.0) * 0.4;
      return vec3(h * 0.00009, h, 520.0);
    #else
      return vec3(0.0);
    #endif
  }
`;
const MICRO_FRAG_GLSL = /* glsl */ `
  vec3 skMicroN = normal;
  #if SK_SURF >= 1 && SK_SURF <= 4
  {
    // in der Ferne ausblenden, bevor das Muster kleiner als ein Bildpunkt wird (kein Flimmern)
    float skPx = length(dFdx(vSkObj)) + length(dFdy(vSkObj));
    vec3 skMh = skMicroH(vSkObj);
    float skFade = 1.0 - smoothstep(0.1, 0.3, skPx * skMh.z);
    if (skFade > 0.01) {
      vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
      vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
      float det = dot(sx, r1);
      vec3 g = sign(det) * (dFdx(skMh.x) * r1 + dFdy(skMh.x) * r2);
      vec3 skMn = abs(det) * normal - g * skFade;
      skMicroN = skMn * inversesqrt(max(dot(skMn, skMn), 1e-20));
      // das Relief wirkt auch auf das diffuse Licht (Stoff, Leder und Stahl werden plastisch), nicht nur auf den Glanz
      normal = normalize(mix(normal, skMicroN, SK_RELIEF));
      // Vertiefungen etwas dunkler (Fäden, Narben, Riefen)
      diffuseColor.rgb *= 1.0 - (0.5 - skMh.y) * SK_CAVITY * skFade;
    }
  }
  #endif
`;

/** Oberflächen der Figuren: Glanz und Streuung je Material, Lichtband im Haar, Glanzpunkte im Auge, Randlicht aus dem Himmel */
const CHAR_GLSL = /* glsl */ `
  {
    vec3 skNW = inverseTransformDirection(normal, viewMatrix);
    vec3 skUpC = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    float skLit = 1.0 - skShade;
    #if NUM_DIR_LIGHTS > 0
      vec3 skL = directionalLights[0].direction;
      vec3 skLC = directionalLights[0].color;
    #else
      vec3 skL = skUpC;
      vec3 skLC = vec3(0.0);
    #endif
    vec3 skSkyC = mix(uEnvLow, uEnvHigh, clamp(skNW.y * 0.5 + 0.5, 0.0, 1.0));
    float skNH = max(dot(skN2, normalize(skL + viewDir)), 1e-4);
    #if SK_SURF == 1
      // Haut: Licht streut unter der Oberfläche. Rötlicher Saum an der Schattengrenze, warme statt kühle Schatten,
      // Durchleuchten an dünnen Rändern (Ohren, Finger) im Gegenlicht, dazu ein weicher, breiter Glanz
      float skBand = skShade * skLit * 4.0;
      outgoingLight += diffuseColor.rgb * vec3(0.9, 0.24, 0.14) * skBand * 0.3;
      outgoingLight += diffuseColor.rgb * vec3(0.3, 0.06, 0.03) * skShade * 0.22;
      float skBack = pow(clamp(dot(viewDir, -skL), 0.0, 1.0), 3.0) * (1.0 - ndv) * (1.0 - ndv);
      outgoingLight += diffuseColor.rgb * vec3(1.0, 0.3, 0.18) * skLC * skBack * 0.5;
      outgoingLight += skLC * (pow(skNH, 42.0) * 0.07 + pow(skNH, 9.0) * 0.03) * skLit;
    #elif SK_SURF == 2
      // Stoff: matter Schimmer zu den Rändern hin (Fasern stehen ab)
      float skSheen = pow(1.0 - clamp(dot(skN2, viewDir), 0.0, 1.0), 3.0);
      outgoingLight += mix(diffuseColor.rgb, vec3(1.0), 0.25) * (skLC * (0.25 + 0.75 * skLit) + skSkyC * 0.5) * skSheen * 0.16;
    #elif SK_SURF == 3
      // Leder: weicher, mittelgroßer Glanz, an der Narbung gebrochen
      outgoingLight += skLC * mix(vec3(1.0), diffuseColor.rgb, 0.3) * pow(skNH, 46.0) * 0.3 * skLit;
    #elif SK_SURF == 4
      // Stahl: enger Glanzkern über dem Anime-Glanzfleck
      outgoingLight += skLC * mix(vec3(1.0), diffuseColor.rgb, 0.5) * pow(skNH, 160.0) * 0.9 * skLit;
    #elif SK_SURF == 5
    {
      // Haar: anisotroper Glanz (Kajiya-Kay). Die Strähnen laufen am Kopf entlang nach unten; das Lichtband liegt quer dazu
      // und wandert mit Blickwinkel und Licht. Zwei Bänder: schmal und hell, darunter breiter in der Haarfarbe.
      // Kopfrundung statt Strähnen-Normale: sonst zerfällt das Band an jeder Strähne in Splitter
      vec3 skHN = normalize(mix(normal, normalize(vSkSph), 0.8));
      vec3 skT = skUpC - skHN * dot(skUpC, skHN);
      float skTl = dot(skT, skT);
      if (skTl > 0.003) {
        skT *= inversesqrt(skTl);
        // Licht von schräg oben, damit das Band auch im Schatten und nachts lesbar bleibt
        vec3 skHh = normalize(normalize(skL + skUpC * 0.9) + viewDir);
        // jede Strähne verschiebt das Band etwas: gezackter Rand wie gezeichnet
        float skJit = skMN(vec3(atan(vSkObj.x, vSkObj.z) * 22.0, vSkObj.y * 6.0, 0.5)) - 0.5;
        vec3 skT1 = normalize(skT + skHN * (-0.42 + skJit * 0.2));
        vec3 skT2 = normalize(skT + skHN * (-0.75 + skJit * 0.45));
        float skD1 = dot(skT1, skHh), skD2 = dot(skT2, skHh);
        float skB1 = pow(sqrt(max(1.0 - skD1 * skD1, 1e-4)), 260.0);
        float skB2 = pow(sqrt(max(1.0 - skD2 * skD2, 1e-4)), 36.0);
        float skFace = smoothstep(0.0, 0.45, clamp(dot(skHN, viewDir), 0.0, 1.0)) * smoothstep(0.003, 0.08, skTl);
        float skLum = clamp(dot(skLC, vec3(0.3, 0.6, 0.1)), 0.18, 1.2) * (0.45 + 0.55 * skLit);
        outgoingLight += mix(diffuseColor.rgb * 1.6, vec3(1.0), 0.34) * smoothstep(0.22, 0.7, skB1) * skLum * skFace * 0.5;
        outgoingLight += diffuseColor.rgb * skB2 * skLum * skFace * 0.5;
      }
    }
    #elif SK_SURF == 6
    {
      // Auge: zwei scharfe Glanzpunkte auf der Iris. Sie wandern ein Stück mit dem Licht und überstrahlen leicht (Bloom).
      #ifdef USE_MAP
        // beide Augen liegen nebeneinander in einer Textur; v läuft nach unten
        vec2 skE = (vMapUv - vec2(0.5 + sign(vMapUv.x - 0.5) * uEyeUv.x, uEyeUv.y)) / uEyeUv.zw;
        skE.y = -skE.y;
        vec2 skO = vec2(clamp(dot(skL, cross(skUpC, viewDir)), -1.0, 1.0), 0.0) * 0.14;
        float skA = fwidth(skE.x) + fwidth(skE.y) + 0.02;
        float skD1 = length((skE - vec2(0.24, 0.3) - skO) * vec2(1.0, 0.8));
        float skD2 = length(skE - vec2(-0.26, -0.3) + skO * 0.5);
        float skG = (1.0 - smoothstep(0.2 - skA, 0.2, skD1)) + (1.0 - smoothstep(0.085 - skA, 0.085, skD2)) * 0.8;
        // feuchter Schimmer: die Iris spiegelt den Himmel leicht
        outgoingLight += skSkyC * 0.1;
        outgoingLight = mix(outgoingLight, vec3(1.9) * (0.35 + 0.65 * clamp(dot(skLC, vec3(0.3, 0.6, 0.1)) + 0.25, 0.0, 1.0)), clamp(skG, 0.0, 1.0));
      #endif
    }
    #endif
    // Randlicht: Fresnel statt Tusche. Die Ränder nehmen das Himmelslicht ihrer Seite an, zur Sonne hin deren Farbe.
    float skFr = pow(1.0 - ndv, 3.4);
    float skSun = clamp(dot(-viewDir, skL) * 0.5 + 0.5, 0.0, 1.0);
    vec3 skRimC = skSkyC * (0.55 + 0.45 * clamp(skNW.y + 0.6, 0.0, 1.0)) + uRimColor * skLC * skSun * skSun * 0.55;
    outgoingLight += mix(diffuseColor.rgb, vec3(1.0), 0.55) * skRimC * skFr * uRimAmount * 1.35;
  }
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
    // Nässe: Wasserfilm macht die Fläche glatt (Rauheit sinkt), die Pfütze spiegelt wie ein Spiegel (Spiegelanteil steigt);
    // nasse Stoffe, Holz und Erde werden dunkler und satter
    skRough = mix(skRough, 0.06, max(skWetK * 0.8, skPud));
    skMetal = mix(skMetal, max(skMetal, 0.3), skPud);
    outgoingLight *= 1.0 - skWetK * 0.26 * (1.0 - skMetal);
    // Anime-Schatten: Schattenseiten kühl einfärben statt nur abdunkeln
    float skLum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
    float skBase = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)) + 0.001;
    float skShade = 1.0 - smoothstep(0.5, 0.95, skLum / skBase);
    outgoingLight = mix(outgoingLight, outgoingLight * uShadowTint, skShade * 0.75);
    vec3 viewDir = normalize(vViewPosition);
    float ndv = clamp(dot(normal, viewDir), 0.0, 1.0);
    #ifdef SK_MICRO
      // Glanz und Spiegelung folgen dem Feinrelief (die Beleuchtung hat es schon in der Normale)
      vec3 skN2 = skMicroN;
    #else
      vec3 skN2 = normal;
    #endif
    #ifdef SK_CHAR
      // Figuren: das Randlicht kommt weiter unten aus dem Himmel
      float rim = 0.0;
    #else
      float rim = smoothstep(0.58, 0.74, 1.0 - ndv) * uRimStrength * uRimAmount;
    #endif
    #if NUM_DIR_LIGHTS > 0
      vec3 L = directionalLights[0].direction;
      // Randlicht vor allem auf der Seite, die vom Licht abgewandt zur Kamera zeigt
      rim *= 0.55 + 0.45 * clamp(dot(-viewDir, L) * 0.5 + 0.5, 0.0, 1.0);
      // Der Glanz der Sonne kommt jetzt aus dem PBR-Lichtmodell (RE_Direct_Toon: GGX mit Rauheit und Metall), nicht mehr
      // aus einem harten Glanzfleck. Hier bleibt nur der nasse Glanz (WET_POST).
    #endif
    outgoingLight += mix(diffuseColor.rgb, vec3(1.0), 0.35) * uRimColor * rim;
    #ifdef SK_ENV
    {
      // Bildbasierte Spiegelung (IBL): Himmel, Sonne und Abendrot aus der vorgefilterten Umgebungskarte
      vec3 rW = inverseTransformDirection(reflect(-viewDir, skN2), viewMatrix);
      vec3 envC = uEnvOn > 0.5 ? textureCubeUV(uSkEnv, rW, skRough).rgb : mix(uEnvLow, uEnvHigh, clamp(rW.y * 0.5 + 0.5, 0.0, 1.0));
      float fres = pow(1.0 - ndv, 5.0);
      vec3 F0 = mix(vec3(0.04), diffuseColor.rgb, skMetal);
      vec3 F = F0 + (vec3(1.0) - F0) * fres * (1.0 - skRough * 0.8);
      // Metall: die Farbe kommt aus der Spiegelung, die matte Grundfarbe tritt zurück
      outgoingLight = outgoingLight * (1.0 - skMetal * 0.55) + envC * F * uEnvI;
    }
    #endif
    #ifdef SK_CHAR
${CHAR_GLSL}
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
  float skdH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float skdN(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(skdH(i), skdH(i + vec2(1.0, 0.0)), f.x), mix(skdH(i + vec2(0.0, 1.0)), skdH(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float skdF(vec2 p) { return skdN(p) * 0.5 + skdN(p * 2.03) * 0.3 + skdN(p * 4.1) * 0.2; }
`;
const DETAIL_FRAG: Record<DetailKind, string> = {
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
    float peb = smoothstep(0.86, 0.93, skdN(p * 13.0 + 5.7));
    diffuseColor.rgb += peb * 0.1 * nearK;
    // Kiesel und dunkle Treibgutkörner, Rippelkämme etwas heller: mehr Tiefe im Nahbereich
    float dark = smoothstep(0.9, 0.96, skdN(p * 21.0 + 1.3));
    diffuseColor.rgb *= 1.0 - dark * 0.22 * nearK;
    diffuseColor.rgb *= 0.92 + ripK * 0.14 * (1.0 - smoothstep(30.0, 110.0, camD));
    // Relief fürs Licht: Windrippel, Korn und Kiesel
    skDetH = ripK * 0.8 + (skdN(p * 34.0) - 0.5) * 0.5 * fineK + peb * 0.9 + dark * 0.5;
    skDetA = 0.05 * (1.0 - smoothstep(10.0, 52.0, camD));
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
    // Erdflecken nie heller als der Boden drumherum (auf Asche und Schlundgras leuchteten sie wie Sandinseln)
    // und nur auf grünem Gras erdbraun: auf Asche, Moos und Schlundgras ist die kahle Stelle ein dunklerer Ton des Bodens
    float skDirtK = clamp(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)) / 0.17, 0.3, 1.0);
    float skGreen = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) * 9.0, 0.0, 1.0);
    vec3 skDirt = mix(diffuseColor.rgb * vec3(0.72, 0.66, 0.6), vec3(0.42, 0.33, 0.22) * skDirtK, skGreen);
    diffuseColor.rgb = mix(diffuseColor.rgb, skDirt * (0.88 + skdN(p * 16.0) * 0.24), dirt * 0.7);
    // Klee- und Blütentupfer, dunkle Rillen zwischen den Büscheln, feine Lichtkanten: Tiefe wie bei den Pflanzen darüber
    float clover = smoothstep(0.62, 0.9, skdN(p * 4.2 + 2.2)) * nearK;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8, 1.12, 0.8), clover * 0.5);
    float bloom = step(0.992, skdN(p * 26.0 + 8.4)) * nearK;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.88, 0.45), bloom * 0.7);
    float gap = smoothstep(0.7, 0.15, skdN(vec2(p.x * 6.0, p.y * 6.0) + 4.0)) * nearK;
    diffuseColor.rgb *= 1.0 - gap * 0.12;
    skDetH = bl * 0.9 + tuft * 0.5;
    skDetA = 0.045 * (1.0 - smoothstep(8.0, 36.0, camD));
  }`,
  rock: /* glsl */ `{
    vec3 w = vSkWorld;
    float camD = distance(w, cameraPosition);
    float strata = sin(w.y * 3.1 + skdN(w.xz * 0.3) * 3.0) * 0.5 + 0.5;
    float speck = (skdN((w.xz + w.y) * 16.0) - 0.5) * 0.16 * (1.0 - smoothstep(20.0, 70.0, camD));
    diffuseColor.rgb *= 0.9 + strata * 0.16 + speck + (skdF(w.xz * 0.2 + w.y * 0.1) - 0.5) * 0.18;
    // Risse und Schichtkanten: dunkle Fugen, die im Licht Tiefe geben
    float cr = 1.0 - smoothstep(0.0, 0.035, abs(skdN((w.xz + w.y * 0.7) * 2.6) - 0.5));
    diffuseColor.rgb *= 1.0 - cr * 0.28 * (1.0 - smoothstep(20.0, 80.0, camD));
    skDetH = strata * 0.6 + (skdN((w.xz + w.y) * 9.0) - 0.5) * 0.7 - cr * 0.8;
    skDetA = 0.07 * (1.0 - smoothstep(14.0, 70.0, camD));
  }`,
  stone: /* glsl */ `{
    // Mauerwerk: Quader im Läuferverband, Mörtelfugen, Moos auf Oberseiten und in feuchten Flecken
    vec3 wn = normalize(cross(dFdx(vSkWorld), dFdy(vSkWorld)));
    vec3 t3 = vec3(-wn.z, 0.0, wn.x); float tl = length(t3); t3 = tl > 0.05 ? t3 / tl : vec3(1.0, 0.0, 0.0);
    vec3 s3 = cross(wn, t3);
    float u = dot(vSkWorld, t3), v = dot(vSkWorld, s3);
    float camD = distance(vSkWorld, cameraPosition);
    float row = floor(v / 0.34);
    float uu = u / 0.62 + skdH(vec2(row, 3.7)) * 4.0 + mod(row, 2.0) * 0.5;
    vec2 cell = vec2(floor(uu), row);
    vec2 f = vec2(fract(uu), fract(v / 0.34));
    float ed = min(min(f.x, 1.0 - f.x) * 0.62, min(f.y, 1.0 - f.y) * 0.34);
    float aa = fwidth(ed) * 1.2 + 0.001;
    float mortar = 1.0 - smoothstep(0.012 - aa, 0.03 + aa, ed);
    float rnd = skdH(cell + 11.0);
    float fadeD = 1.0 - smoothstep(14.0, 55.0, camD);
    diffuseColor.rgb *= 1.12 + rnd * 0.3 + (skdN(vec2(u, v) * 9.0) - 0.5) * 0.18 * fadeD;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.75, 0.7), mortar * fadeD);
    float up = clamp(wn.y, 0.0, 1.0);
    float mossN = skdF(vSkWorld.xz * 0.55 + vSkWorld.y * 0.3 + 7.0);
    float moss = smoothstep(0.52, 0.82, mossN + up * 0.3) * 0.6;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.26, 0.4, 0.17) * (0.8 + rnd * 0.4), moss);
    skDetH = (1.0 - mortar) * (0.7 + rnd * 0.3); skDetA = 0.05 * fadeD;
  }`,
  tile: /* glsl */ `{
    // Dachziegel: überlappende Reihen entlang des Gefälles, gerundete Kanten, versetzt je Reihe
    vec3 wn = normalize(cross(dFdx(vSkWorld), dFdy(vSkWorld)));
    vec3 t3 = vec3(-wn.z, 0.0, wn.x); float tl = length(t3); t3 = tl > 0.05 ? t3 / tl : vec3(1.0, 0.0, 0.0);
    vec3 s3 = cross(wn, t3);
    float u = dot(vSkWorld, t3), v = dot(vSkWorld, s3);
    float camD = distance(vSkWorld, cameraPosition);
    float row = floor(v / 0.3);
    float uu = u / 0.24 + mod(row, 2.0) * 0.5;
    float cu = fract(uu), cv = fract(v / 0.3);
    float rnd = skdH(vec2(floor(uu), row));
    float fadeD = 1.0 - smoothstep(14.0, 60.0, camD);
    // Ziegelhöhe: runde Wölbung quer, Kante unten überlappt
    float prof = (1.0 - pow(abs(cu - 0.5) * 2.0, 2.0)) * 0.5 + cv * 0.5;
    float gap = smoothstep(0.0, 0.1, cv) * smoothstep(0.0, 0.07, min(cu, 1.0 - cu));
    diffuseColor.rgb *= (0.78 + rnd * 0.4 + (skdN(vec2(u, v) * 7.0) - 0.5) * 0.2) * mix(1.0, 0.62 + 0.38 * gap, fadeD);
    float moss = smoothstep(0.7, 0.9, skdF(vSkWorld.xz * 0.4 + 2.0)) * 0.4 * clamp(wn.y * 1.5, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.28, 0.12), moss);
    skDetH = prof; skDetA = 0.06 * fadeD;
  }`,
  plaster: /* glsl */ `{
    // Putz: feine Körnung, Flecken und etwas Schmutz
    vec3 wn = normalize(cross(dFdx(vSkWorld), dFdy(vSkWorld)));
    vec3 t3 = vec3(-wn.z, 0.0, wn.x); float tl = length(t3); t3 = tl > 0.05 ? t3 / tl : vec3(1.0, 0.0, 0.0);
    float u = dot(vSkWorld, t3), v = vSkWorld.y;
    float camD = distance(vSkWorld, cameraPosition);
    float fadeD = 1.0 - smoothstep(10.0, 40.0, camD);
    float g = skdN(vec2(u, v) * 26.0) * 0.6 + skdN(vec2(u, v) * 7.0) * 0.4;
    diffuseColor.rgb *= 0.93 + (skdF(vec2(u, v) * 0.9) - 0.5) * 0.22 + (g - 0.5) * 0.1 * fadeD;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.74, 0.66), smoothstep(0.55, 0.9, skdN(vec2(u * 0.7, v * 1.6) + 4.0)) * 0.5);
    skDetH = g; skDetA = 0.012 * fadeD;
  }`,
};

interface PbrPatch { rough: number; metal: number; roughMap: Texture | null; metalMap: Texture | null; env: boolean; fx?: ToonFxUniforms; reflect: number; puddles: number; ringel: number; trim: boolean; surf: number; char: boolean; eyeUv: [number, number, number, number] | null; hairC: [number, number, number] | null; mask: boolean }

function patch(mat: MeshToonMaterial, spec: number, rim: number, detail: DetailKind | undefined, pbr: PbrPatch) {
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
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_VERTEX);
    }
    // Spiegelungsmaske im Alpha-Kanal (nur mit Nachbearbeitung, die das Bild danach undurchsichtig macht)
    if (pbr.reflect > 0) shader.uniforms.uReflect = { value: pbr.reflect };
    if (pbr.reflect > 0 || pbr.puddles > 0) shader.uniforms.uSkMaskOff = WATER_ALPHA;
    // Nässe bei Regen (alle Toon-Materialien), Pfützen nur auf Böden
    shader.uniforms.uWet = wetShared.uWet;
    shader.uniforms.uPuddle = wetShared.uPuddle;
    shader.uniforms.uRain = wetShared.uRain;
    shader.uniforms.uSkWetTime = windShared.uSkTime;
    if (pbr.puddles > 0) shader.uniforms.uPuddleAmt = { value: pbr.puddles };
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
    const cav = [0, 0.05, 0.2, 0.26, 0.12, 0, 0][Math.max(0, pbr.surf)];
    const relief = [0, 0.35, 0.7, 0.7, 0.5, 0, 0][Math.max(0, pbr.surf)];
    const defs = (pbr.surf >= 0 ? `#define SK_MICRO\n#define SK_SURF ${pbr.surf}\n#define SK_CAVITY ${cav.toFixed(2)}\n#define SK_RELIEF ${relief.toFixed(2)}\n` : '') + (pbr.char ? '#define SK_CHAR\n' : '') + (pbr.puddles > 0 ? '#define SK_PUDDLE\n' : '') + (pbr.roughMap ? '#define SK_ROUGHMAP\n' : '') + (pbr.metalMap ? '#define SK_METALMAP\n' : '') + (pbr.env ? '#define SK_ENV\n' + cubeUvDefines() : '') + (pbr.fx ? '#define SK_FX\n' : '');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', defs + '#include <common>\nuniform vec3 uShadowTint;\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uSpec;\nuniform float uRimAmount;\n' + PBR_PARS_GLSL + WET_PARS + (pbr.puddles > 0 ? 'uniform float uPuddleAmt;\n' : '') + (pbr.fx ? FX_PARS_GLSL : '') + (pbr.surf >= 0 ? (pbr.char ? 'uniform vec4 uEyeUv;\n' + (pbr.surf === 5 ? 'varying vec3 vSkSph;\n' : '') + (pbr.mask && !(pbr.reflect > 0 || pbr.puddles > 0) ? 'uniform float uSkMaskOff;\n' : '') : '') + MICRO_PARS_GLSL : '') + (pbr.env ? '#include <cube_uv_reflection_fragment>\n' : ''))
      .replace('#include <lights_toon_pars_fragment>', LIGHTS_GLSL)
      .replace('#include <opaque_fragment>', WET_PRE_GLSL + RIM_SPEC_GLSL + WET_POST_GLSL + '\n#include <opaque_fragment>'
        + (pbr.reflect > 0 ? '\ngl_FragColor.a = mix(1.0 - 0.4 * clamp(uReflect, 0.0, 1.0), 1.0, uSkMaskOff);' : '')
        // Pfützen in die Spiegelungsmaske (0,6 … 0,96 = spiegelnde Toon-Fläche)
        + (pbr.puddles > 0 ? '\nif (skPud > 0.05) gl_FragColor.a = min(gl_FragColor.a, mix(1.0 - 0.38 * skPud, 1.0, uSkMaskOff));' : ''))
      .replace('#include <common>', '#include <common>\n' + (pbr.reflect > 0 ? 'uniform float uReflect;\n' : '') + (pbr.reflect > 0 || pbr.puddles > 0 ? 'uniform float uSkMaskOff;' : ''));
    if (detail || pbr.puddles > 0) {
      // Weltposition je Pixel (auch für instanzierte Netze)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSkWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec4 skWp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nskWp = instanceMatrix * skWp;\n#endif\nvSkWorld = (modelMatrix * skWp).xyz; }');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSkWorld;\n');
    }
    if (pbr.surf >= 0) {
      // Figuren-Oberfläche: Körperposition in Metern (vor dem Skinning – das Muster klebt an der Figur)
      if (pbr.char) shader.uniforms.uEyeUv = { value: new Vector4(...(pbr.eyeUv ?? [0.25, 0.5, 0.15, 0.3])) };
      if (pbr.char && pbr.surf === 5) {
        // Haare: Richtung von der Kopfmitte zum Punkt, mit dem Skelett mitgedreht (für das Lichtband)
        shader.uniforms.uHairC = { value: new Vector3(...(pbr.hairC ?? [0, 0, 0])) };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uHairC;\nvarying vec3 vSkSph;')
          .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n{ vec3 skSph = position - uHairC;\n#ifdef USE_SKINNING\nskSph = (skinMatrix * vec4(skSph, 0.0)).xyz;\n#endif\nvSkSph = normalMatrix * skSph; }');
      }
      if (pbr.mask) shader.uniforms.uSkMaskOff = WATER_ALPHA;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSkObj;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkObj = position * length(modelMatrix[1].xyz);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + MICRO_FRAG_GLSL)
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>' + (pbr.mask ? `\ngl_FragColor.a = mix(${CHAR_ALPHA.toFixed(2)}, 1.0, uSkMaskOff);` : ''));
    }
    if (pbr.ringel > 0) {
      // Ringelhemd: scharfe waagrechte Streifen aus der Höhe im Modell (vor dem Skinning – kleben am Körper)
      shader.uniforms.uRingel = { value: pbr.ringel };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float stripe;\nvarying float vSkRingel;\nvarying float vSkRingY;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkRingel = stripe;\nvSkRingY = position.y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uRingel;\nvarying float vSkRingel;\nvarying float vSkRingY;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (vSkRingel > 0.5) { float q = vSkRingY / uRingel; float aa = fwidth(q) * 0.7; float s = smoothstep(0.5 - aa, 0.5 + aa, fract(q)) - smoothstep(1.0 - aa, 1.0, fract(q)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.91, 0.86), s); }');
    }
    if (pbr.trim && pbr.surf >= 0) {
      // Borte und Muster der Ausrüstung: scharf aus Randabstand und Körperposition (vor dem Skinning – klebt am Körper)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float rimD;\nattribute vec3 trimC;\nattribute vec3 patC;\nattribute vec4 gset;\nvarying float vGRim;\nvarying vec3 vGTrim;\nvarying vec3 vGPat;\nvarying vec4 vGSet;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGRim = rimD;\nvGTrim = trimC;\nvGPat = patC;\nvGSet = gset;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGRim;\nvarying vec3 vGTrim;\nvarying vec3 vGPat;\nvarying vec4 vGSet;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + GEAR_FRAG_GLSL);
    }
    if (detail) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + DETAIL_GLSL + 'float skDetH = 0.0;\nfloat skDetA = 0.0;\n')
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + DETAIL_FRAG[detail]);
      if (detail !== undefined) {
        // Relief aus der Höhe des Musters: die Normale kippt nach dem Gefälle von skDetH (Bump per Bildschirm-Ableitung)
        shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    vec3 skSx = dFdx(-vViewPosition), skSy = dFdy(-vViewPosition);
    vec3 skR1 = cross(skSy, normal), skR2 = cross(normal, skSx);
    float skDet = dot(skSx, skR1);
    vec3 skG = sign(skDet) * (dFdx(skDetH) * skR1 + dFdy(skDetH) * skR2) * skDetA;
    normal = normalize(abs(skDet) * normal - skG);
  }`);
      }
    }
  };
  const progKey = `sk-toon-7${pbr.surf >= 0 ? (pbr.char ? 'c' : 'u') + pbr.surf + (pbr.mask ? 'k' : '') : ''}${detail ? '-' + detail : ''}-${pbr.env ? 'e' : ''}${pbr.roughMap ? 'r' : ''}${pbr.metalMap ? 'm' : ''}${pbr.fx ? 'f' : ''}${pbr.reflect > 0 ? 's' : ''}${pbr.puddles > 0 ? 'p' : ''}${pbr.ringel > 0 ? 'g' : ''}${pbr.trim ? 't' : ''}-wet`;
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
  if (o.layer) { mat.polygonOffset = true; mat.polygonOffsetFactor = -o.layer; mat.polygonOffsetUnits = -4 * o.layer; }
  // Metall und Rauheit: bisherige Glanz-Materialien (spec ≥ 0,8: Klingen, Rüstung, Gold, Kanonen) werden zu Metall
  const spec = o.spec ?? 0;
  const metal = o.metalness ?? (spec >= 0.8 ? 1 : 0);
  const surfRough: Partial<Record<Surface, number>> = { skin: 0.55, cloth: 0.9, leather: 0.5, hair: 0.6, eye: 0.2 };
  const rough = o.roughness ?? (o.surface && metal === 0 && surfRough[o.surface] !== undefined ? surfRough[o.surface]! : metal > 0 ? (spec >= 1 ? 0.3 : 0.42) : 0.85);
  const fx: ToonFxUniforms | undefined = o.fx
    ? { hit: { value: 0 }, hitCol: { value: new Color(1, 1, 1) }, dissolve: { value: 0 }, dissolveCol: { value: new Color(1.0, 0.45, 0.12) } }
    : undefined;
  patch(mat, spec, o.rim ?? 1, o.detail, {
    rough, metal, roughMap: o.roughnessMap ?? null, metalMap: o.metalnessMap ?? null,
    // Spiegelungen nur, wo sie sichtbar sind: Metall oder glatte Flächen (Eis, Lack)
    env: metal > 0 || rough < 0.75 || !!o.metalnessMap,
    fx,
    reflect: o.reflect ?? 0,
    puddles: o.puddles ?? 0,
    ringel: o.ringel ?? 0,
    trim: !!o.trim,
    // Feinrelief: Figuren-Oberfläche, ausdrücklich gewählt (micro) oder bei Metall ohne eigene Reliefkarte gekratzter Stahl
    surf: o.surface ? SURF_ID[o.surface] : o.micro ? SURF_ID[o.micro] : metal > 0 && !o.normalMap ? SURF_ID.steel : -1,
    char: !!o.surface,
    eyeUv: o.eyeUv ?? null,
    hairC: o.hairC ?? null,
    // undurchsichtige Figurenteile melden sich bei der Kantenerkennung ab (durchscheinende mischen ihr Alpha)
    mask: !!o.surface && !o.transparent && !(o.reflect ?? 0) && !(o.puddles ?? 0),
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
