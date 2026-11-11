import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Scene,
} from 'three';
import { markShared } from '../render/dispose';

const BASE_MAX = 1600;

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
  dotTexture = markShared(new CanvasTexture(c));
  return dotTexture;
}

/*
 * Die Grafikkarte rechnet jedes Teilchen selbst: aus Startpunkt, Startgeschwindigkeit, Startzeit, Lebensdauer
 * und Schwerkraft ergibt sich die Position zu jedem Zeitpunkt geschlossen (Luftwiderstand 0,25^t waagrecht).
 * Der Prozessor schreibt nur beim Ausstoßen die Startwerte der neuen Teilchen – keine Schleife pro Bild.
 */
const VERT = /* glsl */ `
  attribute vec3 iP0;
  attribute vec3 iV0;
  attribute vec4 iT;   // Startzeit, Lebensdauer, Schwerkraft, Größenfaktor (0 = 1)
  attribute vec3 iCol;
  uniform float uTime;
  uniform float uSize;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vLife;
  #include <fog_pars_vertex>
  void main() {
    float age = uTime - iT.x;
    if (age < 0.0 || age >= iT.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vLife = 0.0; return; }
    vLife = 1.0 - age / iT.y;
    float dr = (pow(0.25, age) - 1.0) / -1.3862944;
    vec3 p = iP0 + vec3(iV0.x * dr, iV0.y * age - 0.5 * iT.z * age * age, iV0.z * dr);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    mvPosition.xy += position.xy * uSize * SIZE_CURVE * (iT.w > 0.0 ? iT.w : 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vUv = uv;
    vCol = iCol;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vLife;
  #include <fog_pars_fragment>
  void main() {
    float a = texture2D(uMap, vUv).a * ALPHA_CURVE;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vCol, a);
    #include <fog_fragment>
  }`;

export interface EmitOpts { speed: number; up: number; life: number; color: Color; gravity?: number; spread?: number;
  /** Größenfaktor (Tröpfchen < 1) und zusätzliche Anfangsgeschwindigkeit, z. B. seitlich vom Rumpf weg */
  size?: number; vx?: number; vz?: number }

/**
 * GPU-instanziertes Partikelsystem (Gischt, Funken, Staub, Trefferfunken, Magie).
 * Jedes Teilchen altert sichtbar: Funken (additiv) schrumpfen und verglühen,
 * Staub und Gischt quellen auf und werden durchsichtig.
 */
export class ParticleSystem {
  readonly mesh: Mesh;
  private geo: InstancedBufferGeometry;
  private p0: InstancedBufferAttribute;
  private v0: InstancedBufferAttribute;
  private tt: InstancedBufferAttribute;
  private col: InstancedBufferAttribute;
  private mat: ShaderMaterial;
  private next = 0;
  private max: number;
  private time = 0;
  private dirtyFrom = -1;
  private dirtyTo = -1;
  private wrapped = false;
  scale = 1;

  constructor(scene: Scene, additive = false, size = 0.7) {
    const M = this.max = BASE_MAX;
    const base = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const mk = (n: number) => { const a = new InstancedBufferAttribute(new Float32Array(M * n), n); a.setUsage(35048 /* DynamicDrawUsage */); return a; };
    this.p0 = mk(3); this.v0 = mk(3); this.tt = mk(4); this.col = mk(3);
    // noch nie ausgestoßene Plätze gelten als längst vergangen
    const T = this.tt.array as Float32Array;
    for (let i = 0; i < M; i++) T[i * 4] = -1e6;
    geo.setAttribute('iP0', this.p0);
    geo.setAttribute('iV0', this.v0);
    geo.setAttribute('iT', this.tt);
    geo.setAttribute('iCol', this.col);
    geo.instanceCount = 0;
    this.geo = geo;
    // Größenkurve wie bisher: Funken schrumpfen, Staub quillt auf (Punktgröße → Weltgröße umgerechnet)
    const sizeCurve = additive ? 'mix(0.15, 1.0, vLife)' : 'mix(1.6, 0.7, vLife)';
    const alphaCurve = additive ? 'vLife' : 'smoothstep(0.0, 0.6, vLife) * 0.75';
    this.mat = new ShaderMaterial({
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 }, uSize: { value: size * 0.55 }, uMap: { value: null } }]),
      defines: { SIZE_CURVE: sizeCurve, ALPHA_CURVE: alphaCurve },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      fog: true,
    });
    this.mat.uniforms.uMap.value = dot();
    this.mesh = new Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 8 : 6;
    this.mesh.userData.noOutline = true;
    scene.add(this.mesh);
  }

  emit(count: number, x: number, y: number, z: number, opts: EmitOpts) {
    const n = Math.max(1, Math.round(count * this.scale));
    const limit = Math.max(1, Math.round(this.max * Math.min(1, this.scale)));
    const P = this.p0.array as Float32Array, V = this.v0.array as Float32Array, T = this.tt.array as Float32Array, C = this.col.array as Float32Array;
    const sp = opts.spread ?? 0.3;
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % limit;
      if (this.next === 0) this.wrapped = true;
      const a = Math.random() * Math.PI * 2;
      const s = opts.speed * (0.4 + Math.random() * 0.6);
      P[i * 3] = x + (Math.random() - 0.5) * sp;
      P[i * 3 + 1] = y;
      P[i * 3 + 2] = z + (Math.random() - 0.5) * sp;
      V[i * 3] = Math.cos(a) * s + (opts.vx ?? 0) * (0.6 + Math.random() * 0.8);
      V[i * 3 + 1] = opts.up * (0.6 + Math.random() * 0.6);
      V[i * 3 + 2] = Math.sin(a) * s + (opts.vz ?? 0) * (0.6 + Math.random() * 0.8);
      T[i * 4] = this.time;
      T[i * 4 + 1] = opts.life * (0.6 + Math.random() * 0.6);
      T[i * 4 + 2] = opts.gravity ?? 14;
      T[i * 4 + 3] = opts.size ?? 0;
      C[i * 3] = opts.color.r; C[i * 3 + 1] = opts.color.g; C[i * 3 + 2] = opts.color.b;
      if (this.dirtyFrom < 0 || i < this.dirtyFrom) this.dirtyFrom = i;
      if (i > this.dirtyTo) this.dirtyTo = i;
      if (i + 1 > this.geo.instanceCount) this.geo.instanceCount = i + 1;
    }
  }

  /** Fester Logikschritt: nur die Uhr läuft, den Rest rechnet die Grafikkarte */
  update(dt: number) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    if (this.dirtyFrom < 0) return;
    // nur die neu beschriebenen Plätze hochladen
    const from = this.wrapped ? 0 : this.dirtyFrom, to = this.wrapped ? this.geo.instanceCount - 1 : this.dirtyTo;
    for (const [a, n] of [[this.p0, 3], [this.v0, 3], [this.tt, 4], [this.col, 3]] as const) {
      a.clearUpdateRanges();
      a.addUpdateRange(from * n, (to - from + 1) * n);
      a.needsUpdate = true;
    }
    this.dirtyFrom = this.dirtyTo = -1;
    this.wrapped = false;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
