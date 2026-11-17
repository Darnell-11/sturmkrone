import { DoubleSide, ShaderMaterial, UniformsLib, UniformsUtils } from 'three';
import { markShared } from './dispose';

/**
 * Gemeinsame Materialien der Licht-Modelle (public/models/light, world/laterne.glb):
 *  - Laternenglas: durchscheinend mit Fresnel-Rand (Himmelsspiegelung am Rand, tagsüber matt, nachts von innen glühend). Echte
 *    Transmission (MeshPhysicalMaterial) rendert die ganze Szene ein zweites Mal – für eine Handy-Bildrate zu teuer; dieses Glas
 *    liefert denselben Eindruck mit einem Durchgang und lässt sich mit Instanzen und allen Schiffen teilen.
 *  - Kohle und Glut: Eckpunktfarbe aus Blender (Rot-Kanal = Hitze) wird zu Schwarzkörper-Farben von dunkelrot bis gelbweiß; die Nester
 *    pulsieren langsam gegeneinander, wie glimmende Glut.
 * Zeit und Nachtwert setzt das GlowSystem jedes Bild (`lampFx`).
 */
export const lampFx = {
  uTime: { value: 0 },
  /** Abend und Nacht 0 … 1 (Laternen glühen) */
  uNight: { value: 0 },
};

const GLASS_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vWp;
  #include <fog_pars_vertex>
  void main() {
    vec4 lp = vec4(position, 1.0);
    vec3 ln = normal;
    #ifdef USE_INSTANCING
      lp = instanceMatrix * lp;
      ln = mat3(instanceMatrix) * ln;
    #endif
    vec4 mvPosition = modelViewMatrix * lp;
    vN = normalize(normalMatrix * ln);
    vV = -mvPosition.xyz;
    vWp = (modelMatrix * lp).xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const GLASS_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uNight;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vWp;
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    float ndv = abs(dot(n, normalize(vV)));
    float fres = pow(max(1.0 - ndv, 0.0), 2.6);
    // leises Flackern des Kerns, je Laterne verschoben (Weltposition als Phase)
    float ph = vWp.x * 1.7 + vWp.z * 2.3;
    float fl = 0.9 + 0.07 * sin(uTime * 7.3 + ph) + 0.05 * sin(uTime * 17.0 + ph * 2.1);
    float on = uNight * fl;
    // Spiegelung am Rand: Himmel (tagsüber hell, nachts dunkelblau), dazu eine schmale helle Kante
    vec3 sky = mix(vec3(0.62, 0.74, 0.9), vec3(0.07, 0.1, 0.2), uNight);
    vec3 refl = sky * (0.2 + 0.8 * fres) + vec3(0.9, 0.95, 1.0) * pow(fres, 6.0) * 0.5;
    // Innenglühen: warm, in der Mitte der Scheibe am hellsten, am Rand vom Fresnel gedämpft
    vec3 inner = vec3(1.5, 0.74, 0.2) * on * (1.0 - fres * 0.7);
    // tagsüber ein Hauch Bernstein im Glas
    vec3 amber = vec3(0.55, 0.36, 0.12) * (1.0 - uNight) * 0.5 + vec3(0.32, 0.16, 0.04) * uNight;
    vec3 col = refl * (1.0 - on * 0.6) + inner + amber;
    float a = clamp(mix(0.2, 0.62, fres) + on * 0.55, 0.0, 0.92);
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }`;

/**
 * Zeit und Nachtwert gemeinsam nutzen: `UniformsUtils.merge` KLONT die übergebenen Uniform-Objekte, das Material bekam also eigene Kopien
 * (`uNight` blieb für immer 0, `uTime` stand still) und das Laternenglas leuchtete nachts nie, obwohl das GlowSystem `lampFx` jedes Bild
 * setzte. Hier werden die Kopien nach dem Anlegen wieder durch die gemeinsamen Objekte ersetzt (vor dem ersten Übersetzen des Programms).
 */
function linkShared<M extends ShaderMaterial>(m: M): M {
  if ('uTime' in m.uniforms) m.uniforms.uTime = lampFx.uTime;
  if ('uNight' in m.uniforms) m.uniforms.uNight = lampFx.uNight;
  return m;
}

/** Laternenglas (alle Laternen teilen es) */
export const lanternGlass = markShared(linkShared(new ShaderMaterial({
  uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: lampFx.uTime, uNight: lampFx.uNight }]),
  vertexShader: GLASS_VERT,
  fragmentShader: GLASS_FRAG,
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
  fog: true,
})));
lanternGlass.userData.glow = true;

const COAL_VERT = /* glsl */ `
  varying float vHeat;
  varying vec3 vWp;
  #include <fog_pars_vertex>
  void main() {
    vHeat = color.r;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vWp = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const COAL_FRAG = /* glsl */ `
  uniform float uTime;
  varying float vHeat;
  varying vec3 vWp;
  #include <fog_pars_fragment>
  void main() {
    // Nester pulsieren gegeneinander (Phase aus Hitze und Weltposition), nie ganz aus
    float ph = vHeat * 41.0 + vWp.x * 3.1 + vWp.z * 2.7;
    float pulse = 0.5 + 0.5 * sin(uTime * (1.1 + vHeat * 1.9) + ph);
    float t = clamp(vHeat * (0.68 + 0.4 * pulse), 0.0, 1.0);
    // Schwarzkörper: dunkelrot → orange → gelb → fast weiß
    vec3 col = mix(vec3(0.3, 0.035, 0.0), vec3(1.0, 0.3, 0.04), smoothstep(0.15, 0.55, t));
    col = mix(col, vec3(1.0, 0.72, 0.26), smoothstep(0.5, 0.85, t));
    col = mix(col, vec3(1.0, 0.93, 0.7), smoothstep(0.85, 1.05, t) * 0.7);
    gl_FragColor = vec4(col * (1.0 + 1.5 * t), 1.0);
    #include <fog_fragment>
  }`;

/** Glut und Kohlenester (Eckpunktfarbe = Hitze) */
export const coalMaterial = markShared(linkShared(new ShaderMaterial({
  uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: lampFx.uTime }]),
  vertexShader: COAL_VERT,
  fragmentShader: COAL_FRAG,
  vertexColors: true,
  fog: true,
})));
coalMaterial.userData.glow = true;

/**
 * Flammenkern in Laternen (Straßen-, Wege- und Hafenlaternen): wie die Glut, aber nur ab der Dämmerung hell. Am Tag ist die Laterne aus
 * (Kern auf 10 %), nachts brennt sie voll. Feuerstellen, Feuerkörbe und Fackeln behalten die Glut (`coalMaterial`): sie brennen auch am Tag.
 */
export const lanternCoal = markShared(linkShared(new ShaderMaterial({
  uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: lampFx.uTime, uNight: lampFx.uNight }]),
  vertexShader: COAL_VERT,
  fragmentShader: COAL_FRAG
    .replace('uniform float uTime;', 'uniform float uTime;\n  uniform float uNight;')
    .replace('gl_FragColor = vec4(col * (1.0 + 1.5 * t), 1.0);', 'gl_FragColor = vec4(col * (1.0 + 1.5 * t) * mix(0.1, 1.0, clamp(uNight, 0.0, 1.0)), 1.0);'),
  vertexColors: true,
  fog: true,
})));
lanternCoal.userData.glow = true;
