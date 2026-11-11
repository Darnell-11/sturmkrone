import { BufferAttribute, Matrix4, Vector2, Vector3, type Material, type Mesh, type Object3D } from 'three';

/**
 * Wind für Pflanzen (Gras, Büsche, Baumkronen, Palmwedel): Verschiebung im Vertex-Shader aus Rauschen
 * und Böen in Windrichtung. Weil die Pflanzen einer Insel zu wenigen Netzen zusammengefasst werden,
 * trägt jeder Eckpunkt sein Windgewicht selbst (Attribut aWind: 0 an der Wurzel, zur Spitze hin größer).
 * Netze ohne aWind (Häuser, Felsen) bewegen sich nicht – ein fehlendes Attribut liest der Shader als 0.
 */
export const windShared = {
  uSkTime: { value: 0 },
  /** Windrichtung (Einheitsvektor in xz) und Stärke 0 … 1,5 (Wetter) */
  uSkWindDir: { value: new Vector2(1, 0) },
  uSkWindK: { value: 0.4 },
};

const windMats = new WeakSet<Material>();

/** Material bewegt sich im Wind (vor dem ersten Zeichnen setzen) */
export function markWind(m: Material) { windMats.add(m); return m; }
export function isWind(m: Material) { return windMats.has(m); }

/** Gemeinsamer GLSL-Baustein: verschiebt `transformed` (Objektraum ≈ Weltachsen der Inselgruppe) */
export const WIND_PARS = /* glsl */ `
  attribute float aWind;
  uniform float uSkTime;
  uniform vec2 uSkWindDir;
  uniform float uSkWindK;
  float skWH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float skWN(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(skWH(i), skWH(i + vec2(1.0, 0.0)), f.x), mix(skWH(i + vec2(0.0, 1.0)), skWH(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  vec3 skWind(vec3 objPos, vec3 worldPos, float w) {
    if (w <= 0.0) return vec3(0.0);
    vec2 p = worldPos.xz;
    // Böen wandern mit dem Wind übers Land (Rauschen in Windrichtung verschoben)
    float gust = skWN(p * 0.045 - uSkWindDir * uSkTime * 0.6);
    float sway = sin(uSkTime * 1.9 + dot(p, vec2(0.31, 0.27))) * 0.55 + (skWN(p * 0.18 + uSkTime * 0.4) - 0.5) * 0.9;
    float k = uSkWindK * (0.35 + 1.1 * gust);
    vec3 off = vec3(uSkWindDir.x, 0.0, uSkWindDir.y) * (0.6 + sway) * k;
    // feines Flattern quer zum Wind (Blätter, Halme)
    off += vec3(-uSkWindDir.y, 0.0, uSkWindDir.x) * sin(uSkTime * 6.3 + p.x * 2.1 + p.y * 1.7) * 0.25 * k;
    // Spitzen biegen sich leicht nach unten (Länge bleibt ungefähr gleich)
    off.y = -length(off.xz) * 0.25;
    return off * w;
  }
`;

/**
 * Verschiebung im Vertex-Shader (nach <begin_vertex>). Instanzierte Netze (InstancedMesh): die Weltposition kommt aus der
 * Instanzmatrix, und die Verschiebung wird aus dem Weltraum in den Raum der Instanz zurückgerechnet – so weht der Wind
 * für alle Instanzen in dieselbe Richtung, egal wie sie gedreht oder skaliert sind.
 */
export const WIND_VERTEX = /* glsl */ `
  {
    vec4 skWl = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      skWl = instanceMatrix * skWl;
    #endif
    vec3 skWo = skWind(transformed, (modelMatrix * skWl).xyz, aWind);
    #ifdef USE_INSTANCING
      mat3 skWm = mat3(instanceMatrix);
      skWo = (skWo * skWm) / max(vec3(dot(skWm[0], skWm[0]), dot(skWm[1], skWm[1]), dot(skWm[2], skWm[2])), vec3(1e-6));
    #endif
    transformed += skWo;
  }
`;

const _m = new Matrix4();
const _v = new Vector3();

/**
 * Windgewichte für alle Netze einer Pflanze setzen (vor dem Zusammenfassen).
 * amp = Ausschlag an der Spitze (Meter bei voller Windstärke), height = Höhe der Pflanze.
 */
export function windify(plant: Object3D, amp: number, height: number) {
  plant.updateMatrixWorld(true);
  const inv = _m.copy(plant.matrixWorld).invert();
  plant.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position as BufferAttribute;
    const w = new Float32Array(pos.count);
    const rel = new Matrix4().multiplyMatrices(inv, m.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(rel);
      const t = Math.min(1, Math.max(0, _v.y / Math.max(0.01, height)));
      w[i] = amp * Math.pow(t, 1.6);
    }
    m.geometry.setAttribute('aWind', new BufferAttribute(w, 1));
  });
}
