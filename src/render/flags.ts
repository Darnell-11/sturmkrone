import { BufferAttribute, BufferGeometry, Float32BufferAttribute, type Material, type Mesh, type WebGLProgramParametersWithUniforms } from 'three';
import { windShared } from './wind';

/**
 * Flaggen und Wimpel, die im Wind wehen. Das Tuch bekommt je Eckpunkt ein Gewicht `aFlag` (0 am Mast, 1 an der freien Kante); der
 * Vertex-Shader schiebt die Punkte entlang der Tuch-Normalen in einer wandernden Welle, stärker zur freien Kante und mit dem Wetter
 * (Wind aus `windShared`, derselbe wie bei Gras und Palmen). Kein CPU-Aufwand je Bild, auch viele Flaggen kosten nichts.
 * Das Tuch braucht genug Unterteilungen entlang seiner Länge (mindestens 6, besser 10).
 */
const patched = new WeakSet<Material>();

/** `aFlag` aus der Entfernung vom Mast (Achse 'x' oder 'z' des Tuchs im Objektraum, Mast bei 0, Länge `len`) */
export function addFlagWeights(geo: BufferGeometry, axis: 'x' | 'z', len: number, dir = 1) {
  const pos = geo.getAttribute('position');
  const w = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const v = (axis === 'x' ? pos.getX(i) : pos.getZ(i)) * dir / len;
    w[i] = Math.max(0, Math.min(1, v));
  }
  geo.setAttribute('aFlag', new BufferAttribute(w, 1));
}

/** Material weht (vor dem ersten Zeichnen aufrufen; verträgt Materialien mit eigenem onBeforeCompile wie das Toon-Material) */
export function waveMaterial<T extends Material>(m: T, strength = 1): T {
  if (patched.has(m)) return m;
  patched.add(m);
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (shader: WebGLProgramParametersWithUniforms, renderer) {
    prev.call(this, shader, renderer);
    shader.uniforms.uSkTime = windShared.uSkTime;
    shader.uniforms.uSkWindK = windShared.uSkWindK;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aFlag;
        uniform float uSkTime;
        uniform float uSkWindK;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float fk = aFlag;
          float wind = 0.28 + 0.62 * uSkWindK;
          // Wellen laufen vom Mast zur freien Kante, dazu ein langsames Mitschwingen und ein feines Flattern
          float ph = uSkTime * 4.2 - fk * 5.4 + position.y * 1.3;
          float wave = sin(ph) * 0.62 + sin(uSkTime * 7.3 - fk * 9.0) * 0.22 + sin(uSkTime * 1.7) * 0.35;
          // nur Eckpunkte mit Gewicht UND gültiger Normale: geteilte Materialien tragen auch Netze ohne aFlag/normal
          // (normalize(0) ergibt NaN, NaN * 0 bleibt NaN: Eckpunkte flogen als lange Streifen davon)
          float nl = length(normal);
          if (fk > 0.0001 && nl > 0.5) {
            transformed += (normal / nl) * wave * wind * fk * ${(0.27 * strength).toFixed(3)};
            // das Tuch hängt zur freien Kante etwas durch und verkürzt sich beim Schwingen leicht
            transformed.y -= fk * fk * 0.05 * (1.2 - wind);
          }
        }`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|flag' + strength;
  m.needsUpdate = true;
  return m;
}

/** Fertiges Fahnentuch: Gewichte setzen und Material wehen lassen */
export function waveFlag(mesh: Mesh, axis: 'x' | 'z', len: number, dir = 1, strength = 1) {
  addFlagWeights(mesh.geometry, axis, len, dir);
  const mat = mesh.material as Material | Material[];
  for (const m of Array.isArray(mat) ? mat : [mat]) waveMaterial(m, strength);
  return mesh;
}

/** Spitz zulaufender Wimpel (Dreieck) mit Unterteilungen, damit er sich verbiegen kann: Länge entlang +x, Höhe an der Mastseite */
export function pennantGeometry(length: number, height: number, segs = 8) {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, half = (1 - t) * height / 2;
    pos.push(t * length, half, 0, t * length, -half, 0);
    nor.push(0, 0, 1, 0, 0, 1);
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Gemeinsame Uniform-Sätze eines Segels (je Segel eigener Satz, das Material ist je Segel einmalig) */
export interface SailUniforms {
  uRip: { value: number };
  uGust: { value: number };
  uAmp: { value: number };
  uPh: { value: number };
  uSw: { value: number };
  uSh: { value: number };
}
export function makeSailUniforms(sw: number, sh: number, ph: number): SailUniforms {
  return { uRip: { value: 0 }, uGust: { value: 0.5 }, uAmp: { value: 0.1 }, uPh: { value: ph }, uSw: { value: sw }, uSh: { value: sh } };
}

/**
 * Segel wehen im Vertex-Shader (vorher bewegte die CPU jeden Eckpunkt jedes Segels in jedem Bild, bei Hero-Schiffen samt Normalen):
 * Böen blähen das Tuch (Tiefe), Wellen laufen übers Tuch, die Kanten flattern stärker als die Mitte, die Normale folgt dem Wellenverlauf.
 * Die Grundform (Bauch) steckt weiter in der Geometrie, damit Schatten und Hüllkugel stimmen.
 */
export function sailMaterial<T extends Material>(m: T, u: SailUniforms): T {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (shader: WebGLProgramParametersWithUniforms, renderer) {
    prev.call(this, shader, renderer);
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uRip; uniform float uGust; uniform float uAmp; uniform float uPh; uniform float uSw; uniform float uSh;
        float skSailDyn(vec3 p) {
          float ex = abs(p.x) / (uSw * 0.5), ey = 0.5 - p.y / uSh;
          float edge = 0.35 + 0.65 * max(ex * ex, ey * ey);
          float a = uRip + p.x * 0.9 + p.y * 0.5 + uPh;
          float b = uRip * 1.7 - p.y * 1.3 + p.x * 0.4 + uPh * 0.6;
          return (sin(a) + 0.35 * sin(b)) * uAmp * edge;
        }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        {
          // Normale folgt der Welle: Steigung der dynamischen Verschiebung in x und y (die Grundform steckt schon in objectNormal)
          float e = 0.1;
          float d0 = skSailDyn(position);
          float gx = (skSailDyn(vec3(position.x + e, position.yz)) - d0) / e;
          float gy = (skSailDyn(vec3(position.x, position.y + e, position.z)) - d0) / e;
          objectNormal = normalize(objectNormal + vec3(-gx, -gy, 0.0) * 0.9);
        }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float ey2 = 0.5 - position.y / uSh;
          transformed.z = position.z * (0.88 + 0.22 * uGust) + skSailDyn(position);
          transformed.x += sin(uRip * 0.8 + position.y * 0.7 + uPh) * uAmp * 0.25 * ey2;
        }`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|sail';
  m.needsUpdate = true;
  return m;
}
