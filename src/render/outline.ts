import {
  BackSide,
  BufferAttribute,
  Color,
  InstancedMesh,
  Mesh,
  ShaderMaterial,
  SkinnedMesh,
  Uniform,
  UniformsLib,
  UniformsUtils,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { markShared, onForget } from './dispose';
import { WIND_PARS, WIND_VERTEX, windShared } from './wind';
import { SKY_DEPTH } from './depthGlsl';

export const INK = new Color(0x1b1410);

/**
 * Alpha, das das Wasser schreibt. 0 markiert Wasser für Kantenerkennung und Umgebungsverdeckung – aber nur, solange
 * Post-Effekte laufen, die das Bild danach wieder undurchsichtig machen (OpaqueEffect). Ohne Post-Effekte bleibt es 1:
 * manche Handys (z. B. Samsung) zeigen sonst den Seitenhintergrund durch das Wasser (schwarze Flächen).
 */
export const WATER_ALPHA = { value: 1 };

/**
 * Letzter Schritt der Post-Effekte: macht das fertige Bild vollständig undurchsichtig. Samsung-Browser und manche
 * Android-Grafiktreiber beachten sonst das Alpha im Bild und lassen den dunklen Seitenhintergrund durchscheinen.
 */
export class OpaqueEffect extends Effect {
  constructor() {
    super('OpaqueEffect', /* glsl */ `
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        outputColor = vec4(inputColor.rgb, 1.0);
      }`, { blendFunction: BlendFunction.SET });
  }
}

// ---------- Inverted Hull (Niedrig / Mittel) ----------

const hullMaterial = new ShaderMaterial({
  side: BackSide,
  fog: true,
  uniforms: UniformsUtils.merge([UniformsLib.fog, { uColor: { value: INK.clone() }, uWidth: { value: 1 } }]),
  vertexShader: /* glsl */ `
    attribute vec3 outlineNormal;
    uniform float uWidth;
    ${WIND_PARS}
    #include <common>
    #include <skinning_pars_vertex>
    #include <fog_pars_vertex>
    void main() {
      vec3 objectNormal = outlineNormal;
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      vec3 transformed = position;
      #include <skinning_vertex>
      ${WIND_VERTEX}
      vec4 skHullPos = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        skHullPos = instanceMatrix * skHullPos;
        objectNormal = mat3(instanceMatrix) * objectNormal;
      #endif
      vec4 mvPosition = modelViewMatrix * skHullPos;
      vec3 n = normalize(normalMatrix * objectNormal);
      // Konstante Linienbreite auf dem Bildschirm, nah begrenzt
      float w = uWidth * clamp(-mvPosition.z * 0.0032, 0.012, 0.6);
      mvPosition.xyz += n * w;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    #include <fog_pars_fragment>
    void main() {
      gl_FragColor = vec4(uColor, 1.0);
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
});
hullMaterial.userData.outline = true;
Object.assign(hullMaterial.uniforms, windShared);
markShared(hullMaterial);

const hulls = new Set<Mesh>();
const hullByWidth = new Map<number, ShaderMaterial>([[1, hullMaterial]]);
let hullsVisible = true;
// Konturen entfernter Objekte nicht festhalten (sonst bleibt das ganze Objekt im Speicher)
onForget((o) => hulls.delete(o as Mesh));
const smoothed = new WeakSet<BufferGeometry>();

/** Gemittelte Normalen pro Position, damit die Kontur an harten Kanten nicht aufreißt. */
function ensureOutlineNormals(geo: BufferGeometry) {
  if (smoothed.has(geo) || geo.getAttribute('outlineNormal')) return;
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const map = new Map<string, [number, number, number]>();
  const key = (i: number) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const a = map.get(k) ?? [0, 0, 0];
    a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i);
    map.set(k, a);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = map.get(key(i))!;
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  geo.setAttribute('outlineNormal', new BufferAttribute(out, 3));
  smoothed.add(geo);
}

/** Fügt allen Meshes unter root eine Tusche-Kontur hinzu. width: 1 = normal */
export function addOutlines(root: Object3D, width = 1) {
  const targets: Mesh[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && !(m.material as any).userData?.outline && !m.userData.noOutline) targets.push(m);
  });
  for (const m of targets) {
    ensureOutlineNormals(m.geometry);
    let mat = hullByWidth.get(width);
    if (!mat) {
      mat = hullMaterial.clone();
      mat.uniforms.uWidth.value = width;
      Object.assign(mat.uniforms, windShared);
      mat.userData.outline = true;
      markShared(mat);
      hullByWidth.set(width, mat);
    }
    let h: Mesh;
    if ((m as SkinnedMesh).isSkinnedMesh) {
      const sm = new SkinnedMesh(m.geometry, mat);
      sm.bind((m as SkinnedMesh).skeleton, (m as SkinnedMesh).bindMatrix);
      sm.frustumCulled = m.frustumCulled;
      h = sm;
    } else if ((m as InstancedMesh).isInstancedMesh) {
      // instanzierter Bewuchs: die Kontur teilt sich die Instanzmatrizen mit dem Netz
      const im = new InstancedMesh(m.geometry, mat, (m as InstancedMesh).count);
      im.instanceMatrix = (m as InstancedMesh).instanceMatrix;
      im.boundingSphere = (m as InstancedMesh).boundingSphere;
      h = im;
    } else h = new Mesh(m.geometry, mat);
    h.userData.noOutline = true;
    h.castShadow = false;
    h.receiveShadow = false;
    h.visible = hullsVisible;
    h.raycast = () => {};
    m.add(h);
    hulls.add(h);
    h.addEventListener('removed', () => hulls.delete(h));
  }
}

export function setHullsVisible(v: boolean) {
  hullsVisible = v;
  for (const h of hulls) h.visible = v;
}

// ---------- Kantenerkennung als Post-Effekt (Hoch / Maximal) ----------

const EDGE_FRAG = /* glsl */ `
  uniform vec3 edgeColor;
  uniform float thickness;
  uniform float fadeNear;
  uniform float fadeFar;
  uniform float strength;

  float lin(vec2 uv) { return -getViewZ(readDepth(uv)); }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    float d = -getViewZ(depth);
    vec2 o = texelSize * thickness;
    float l = lin(uv - vec2(o.x, 0.0));
    float r = lin(uv + vec2(o.x, 0.0));
    float t = lin(uv + vec2(0.0, o.y));
    float b = lin(uv - vec2(0.0, o.y));
    // Silhouetten: ein Nachbar deutlich weiter weg
    float far = max(max(l, r), max(t, b));
    // Schwelle wächst mit der Entfernung, damit ferne Wellenkämme keine Linien ziehen
    float k = 1.0 + d * 0.02;
    float sil = smoothstep(0.05 * k, 0.12 * k, (far - d) / max(d, 0.001));
    // Knicke: zweite Ableitung der Tiefe (nur in der Nähe)
    float lap = abs(l + r + t + b - 4.0 * d) / max(d, 0.001);
    float crease = smoothstep(0.035 * k, 0.08 * k, lap) * (1.0 - smoothstep(40.0, 120.0, d));
    float edge = max(sil, crease * 0.8);
    edge *= 1.0 - smoothstep(fadeNear, fadeFar, d);
    // Wasser (Alpha 0, siehe ocean.ts) bekommt keine Linien – sonst zeichnen Wellenkämme Striche
    // Alpha aus dem unbearbeiteten Szenenbild lesen: Bloom/Tonemapping im selben Durchgang verändern inputColor.a
    float srcA = texture2D(inputBuffer, uv).a;
    if (depth >= ${SKY_DEPTH} || srcA < 0.5 || inputColor.a < 0.5) edge = 0.0;
    // Figuren (Alpha 0,98, siehe toon.ts) zeichnen ihre Ränder mit Licht statt mit Tusche
    if (abs(srcA - 0.98) < 0.012) edge = 0.0;
    outputColor = vec4(mix(inputColor.rgb, edgeColor, edge * strength), inputColor.a);
  }
`;

export class EdgeEffect extends Effect {
  constructor({ thickness = 1, fadeFar = 300 }: { thickness?: number; fadeFar?: number } = {}) {
    super('EdgeEffect', EDGE_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['edgeColor', new Uniform(INK.clone())],
        ['thickness', new Uniform(thickness)],
        ['fadeNear', new Uniform(fadeFar * 0.45)],
        ['fadeFar', new Uniform(fadeFar)],
        ['strength', new Uniform(0.9)],
      ]),
    });
  }

  setFade(far: number) {
    this.uniforms.get('fadeNear')!.value = far * 0.45;
    this.uniforms.get('fadeFar')!.value = far;
  }
}
