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
          transformed += normalize(normal) * wave * wind * fk * ${(0.27 * strength).toFixed(3)};
          // das Tuch hängt zur freien Kante etwas durch und verkürzt sich beim Schwingen leicht
          transformed.y -= fk * fk * 0.05 * (1.2 - wind);
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
