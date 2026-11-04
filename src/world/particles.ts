import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, NormalBlending, Points, PointsMaterial, type Scene } from 'three';

const BASE_MAX = 900;

let dotTexture: CanvasTexture | null = null;
/** Weicher runder Punkt, damit Partikel nicht eckig aussehen */
function dot(): CanvasTexture {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dotTexture = new CanvasTexture(c);
  return dotTexture;
}

/**
 * Einfaches Partikelsystem (Gischt, Funken, Staub). Menge richtet sich nach der Grafikstufe.
 * Jedes Teilchen altert sichtbar: Funken (additiv) schrumpfen und verglühen,
 * Staub und Gischt quellen auf und werden durchsichtig – statt als feste Scheiben stehen zu bleiben.
 */
export class ParticleSystem {
  readonly points: Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private age: Float32Array;
  private gravity: Float32Array;
  private next = 0;
  private max: number;
  scale = 1;

  constructor(scene: Scene, additive = false, size = 0.7) {
    this.max = BASE_MAX;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    this.age = new Float32Array(this.max);
    this.gravity = new Float32Array(this.max);
    for (let i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -9999;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new BufferAttribute(this.col, 3));
    geo.setAttribute('aLife', new BufferAttribute(this.age, 1));
    const mat = new PointsMaterial({
      size,
      map: dot(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    // aLife: 1 = gerade entstanden, 0 = vergeht
    const sizeCurve = additive ? 'mix(0.15, 1.0, aLife)' : 'mix(1.6, 0.7, aLife)';
    const alphaCurve = additive ? 'vLife' : 'smoothstep(0.0, 0.6, vLife) * 0.75';
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aLife;\nvarying float vLife;')
        .replace('gl_PointSize = size;', `gl_PointSize = size * ${sizeCurve};\n\tvLife = aLife;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLife;')
        .replace('#include <color_fragment>', `#include <color_fragment>\n\tdiffuseColor.a *= ${alphaCurve};`);
    };
    mat.customProgramCacheKey = () => (additive ? 'particles-spark' : 'particles-puff');
    this.points = new Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(count: number, x: number, y: number, z: number, opts: { speed: number; up: number; life: number; color: Color; gravity?: number; spread?: number }) {
    const n = Math.max(1, Math.round(count * this.scale));
    const limit = Math.round(this.max * Math.min(1, this.scale));
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % Math.max(1, limit);
      const a = Math.random() * Math.PI * 2;
      const s = opts.speed * (0.4 + Math.random() * 0.6);
      const sp = opts.spread ?? 0.3;
      this.pos[i * 3] = x + (Math.random() - 0.5) * sp;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * sp;
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = opts.up * (0.6 + Math.random() * 0.6);
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.col[i * 3] = opts.color.r;
      this.col[i * 3 + 1] = opts.color.g;
      this.col[i * 3 + 2] = opts.color.b;
      this.life[i] = this.maxLife[i] = opts.life * (0.6 + Math.random() * 0.6);
      this.age[i] = 1;
      this.gravity[i] = opts.gravity ?? 14;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; this.age[i] = 0; continue; }
      this.age[i] = this.life[i] / this.maxLife[i];
      // Luftwiderstand: Teilchen werden langsamer statt gleichförmig wegzufliegen
      const drag = Math.pow(0.25, dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.vel[i * 3 + 1] -= this.gravity[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    const attrs = this.points.geometry.attributes;
    attrs.position.needsUpdate = true;
    attrs.color.needsUpdate = true;
    attrs.aLife.needsUpdate = true;
  }
}
