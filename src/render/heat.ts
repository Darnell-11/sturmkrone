import { Uniform, Vector3, Vector4, type Camera } from 'three';
import { BlendFunction, Effect } from 'postprocessing';

/**
 * Hitzeflimmern (Refraction/Distortion): Um heiße Stellen (Feuer, Explosionen, Meteore, aufladende Kämpfer)
 * wird das Bild leicht verzerrt – wie flirrende Luft. Kein zusätzlicher Render-Durchgang:
 * bis zu 6 Hitzequellen werden auf den Bildschirm projiziert und verschieben die Leseposition (mainUv)
 * des gemeinsamen Effekt-Durchgangs (siehe renderer.ts).
 */
const MAX = 6;

interface HeatSource { x: number; y: number; z: number; r: number; k: number; t: number; life: number; held: boolean }

export const heatShared = {
  sources: [] as HeatSource[],
  /** Hitzequelle hinzufügen: r = Radius (m), k = Stärke 0 … 1, life = Dauer (s) */
  add(x: number, y: number, z: number, r: number, k: number, life: number): HeatSource {
    const s: HeatSource = { x, y, z, r, k, t: 0, life, held: false };
    this.sources.push(s);
    if (this.sources.length > 24) this.sources.shift();
    return s;
  },
  update(dt: number) {
    let n = 0;
    for (const s of this.sources) { s.t += dt; if (s.held || s.t < s.life) this.sources[n++] = s; }
    this.sources.length = n;
  },
  clear() { this.sources.length = 0; },
};

const FRAG = /* glsl */ `
  uniform vec4 uHeat[${MAX}];
  uniform float uTime;
  void mainUv(inout vec2 uv) {
    vec2 off = vec2(0.0);
    // feste Durchlaufzahl ohne continue: leere Quellen (Stärke 0) und Punkte außerhalb des Radius wiegen 0
    for (int i = 0; i < ${MAX}; i++) {
      vec4 h = uHeat[i];
      vec2 d = (uv - h.xy) * vec2(aspect, 1.0);
      float r = length(d) / max(h.z, 1e-4);
      float fall = max(1.0 - r, 0.0);
      fall *= fall * step(1e-5, h.w);
      // aufsteigendes Flirren: Wellen, die nach oben wandern, quer etwas schwächer
      float w = sin(uv.y * 140.0 - uTime * 11.0 + float(i) * 1.7) + 0.6 * sin(uv.x * 95.0 + uTime * 6.0 + uv.y * 30.0);
      off += vec2(w * 0.55, w) * fall * h.w;
    }
    uv += off * 0.0035;
  }
`;

export class HeatEffect extends Effect {
  private tmp = new Vector3();
  constructor() {
    super('HeatEffect', FRAG, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['uHeat', new Uniform(Array.from({ length: MAX }, () => new Vector4()))],
        ['uTime', new Uniform(0)],
      ]),
    });
  }

  /** Jedes Bild: stärkste sichtbare Quellen auf den Bildschirm projizieren */
  updateSources(camera: Camera, time: number) {
    this.uniforms.get('uTime')!.value = time;
    const out = this.uniforms.get('uHeat')!.value as Vector4[];
    let n = 0;
    const cam = camera as Camera & { projectionMatrix: { elements: number[] } };
    for (const s of heatShared.sources) {
      if (n >= MAX) break;
      const a = s.held ? 1 : Math.min(1, s.t / 0.15) * Math.max(0, 1 - s.t / s.life);
      if (a <= 0.01) continue;
      // Abstand zuerst (derselbe Hilfsvektor wird danach für die Bildschirmposition gebraucht)
      const dist = camera.position.distanceTo(this.tmp.set(s.x, s.y, s.z));
      const p = this.tmp.project(camera);
      if (p.z > 1 || Math.abs(p.x) > 1.4 || Math.abs(p.y) > 1.4) continue;
      // Radius in Bildschirmhöhe: r · Brennweite / Abstand
      const rs = (s.r * cam.projectionMatrix.elements[5] * 0.5) / Math.max(0.5, dist);
      out[n++].set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5, Math.min(0.6, rs), s.k * a);
    }
    for (let i = n; i < MAX; i++) out[i].set(0, 0, 0, 0);
  }
}
