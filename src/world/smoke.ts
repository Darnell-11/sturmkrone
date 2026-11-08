import {
  CanvasTexture,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  type Scene,
} from 'three';
import { detailCanvas } from '../render/texDetail';
import { markShared } from '../render/dispose';

/**
 * Pulverdampf, Rauchsäulen und Nebelschwaden als weiche, sich drehende Wolken-Billboards.
 * Anders als die Punkt-Partikel quellen sie zu großen Schwaden auf, treiben mit dem Wind
 * und werden wie die Wolken je nach Tageszeit und Wetter beleuchtet.
 */

/** Gemeinsame Beleuchtung – die Umgebung setzt sie jeden Frame (Farben der Wolken) */
export const smokeShared = {
  uLit: { value: new Color(1, 1, 1) },
  uShade: { value: new Color(0.6, 0.66, 0.78) },
};

let puffTex: CanvasTexture | null = null;
/** Weiche, unregelmäßige Wolke aus vielen überlagerten Blasen */
function puffTexture(): CanvasTexture {
  if (puffTex) return puffTex;
  const s = 128;
  const { c, g } = detailCanvas(s, s);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // große, klumpige Ballen am Rand, kleine Wirbel innen; Grauwerte ergeben Licht und Schatten in der Wolke
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2;
    const d = (0.08 + Math.pow(rnd(), 0.6) * 0.26) * s;
    const x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d * 0.9;
    const r = s * (0.06 + rnd() * 0.13);
    const v = Math.round(150 + rnd() * 105);
    const gr = g.createRadialGradient(x, y - r * 0.25, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,0.6)`);
    gr.addColorStop(0.55, `rgba(${v},${v},${v},0.35)`);
    gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // Rand weich ausblenden, damit nie eine Kante sichtbar wird
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(s / 2, s / 2, s * 0.18, s / 2, s / 2, s * 0.5);
  m.addColorStop(0, 'rgba(0,0,0,1)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m;
  g.fillRect(0, 0, s, s);
  puffTex = markShared(new CanvasTexture(c));
  return puffTex;
}

const VERT = /* glsl */ `
  // Startwerte je Wolke; Bahn, Größe, Drehung und Ausblenden rechnet die Grafikkarte geschlossen aus
  attribute vec3 iP0;
  attribute vec3 iV0;
  attribute vec4 iA;   // Startzeit, Lebensdauer, Startgröße, Endgröße
  attribute vec4 iB;   // Drehung, Drall, Deckkraft, Glut
  attribute vec4 iC;   // Auftrieb, Luftwiderstand, Windanteil, –
  attribute vec3 iCol;
  uniform float uTime;
  uniform float uClear;
  uniform vec2 uWind;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vGlow;
  varying vec3 vCol;
  varying float vRot;
  #include <fog_pars_vertex>
  void main() {
    float age = uTime - iA.x;
    float L = iA.y;
    if (age < 0.0 || age >= L || iA.x < uClear) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; }
    float t = age / L;
    float k = max(iC.y, 1e-3);
    float e = exp(-k * age);
    float hor = (1.0 - e) / k;
    float r = iC.x / k;
    // Wind wirkt erst nach und nach (Anteil steigt im ersten Viertel des Lebens auf 1)
    float s1 = 0.26667 * L;
    float wi = age <= s1 ? 0.2 * age + 1.5 * age * age / L : 0.2 * s1 + 1.5 * s1 * s1 / L + (age - s1);
    vec3 p = iP0 + vec3(iV0.x * hor + uWind.x * iC.z * wi, r * age + (iV0.y - r) * hor, iV0.z * hor + uWind.y * iC.z * wi);
    float g = 1.0 - pow(1.0 - t, 3.5);
    float size = iA.z + (iA.w - iA.z) * g;
    float fade = min(1.0, t / 0.06) * pow(1.0 - t, 1.6);
    float rot = iB.x + iB.y * age;
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    float c = cos(rot), sn = sin(rot);
    mvPosition.xy += mat2(c, -sn, sn, c) * position.xy * size;
    vAlpha = iB.z * fade;
    vGlow = iB.w * max(0.0, 1.0 - t * 2.5);
    vCol = iCol;
    vRot = rot;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uLit;
  uniform vec3 uShade;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vGlow;
  varying vec3 vCol;
  varying float vRot;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D(uMap, vUv);
    vec2 q = vUv - 0.5;
    // Licht von oben (im Bild), unabhängig von der Drehung der Wolke
    float up = -sin(vRot) * q.x + cos(vRot) * q.y;
    float lit = smoothstep(-0.35, 0.4, up * 1.8 + (t.r - 0.75) * 1.2);
    vec3 col = mix(uShade, uLit, lit) * vCol * (0.7 + 0.3 * t.r);
    // Glut von unten (brennende Schiffe, Mündungsfeuer)
    col += vec3(1.5, 0.55, 0.12) * vGlow * (1.0 - lit) * (1.0 - lit);
    float a = t.a * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }`;

export interface PuffOpts {
  /** Anzahl Wolken */
  n?: number;
  /** Startgröße und Endgröße (Meter) */
  size: number;
  grow: number;
  life: number;
  /** Helligkeit 0 (schwarz) … 1 (weiß) oder Farbe */
  tone?: number | Color;
  /** Anfangsgeschwindigkeit (Richtung) und Streuung */
  vx?: number; vy?: number; vz?: number;
  spread?: number;
  /** Auftrieb (m/s²) und Luftwiderstand */
  rise?: number;
  drag?: number;
  alpha?: number;
  /** Glut von unten 0 … 1 (klingt mit dem Alter ab) */
  glow?: number;
  /** Wie stark der Wind die Wolke mitnimmt */
  wind?: number;
  /** Zufällige Startposition (Radius) */
  jitter?: number;
}

const BASE_MAX = 2000;

export class SmokeSystem {
  readonly mesh: Mesh;
  private max: number;
  private next = 0;
  private time = 0;
  private p0: InstancedBufferAttribute;
  private v0: InstancedBufferAttribute;
  private iA: InstancedBufferAttribute;
  private iB: InstancedBufferAttribute;
  private iC: InstancedBufferAttribute;
  private iCol: InstancedBufferAttribute;
  private geo: InstancedBufferGeometry;
  private mat: ShaderMaterial;
  private dirtyFrom = -1;
  private dirtyTo = -1;
  /** Windvektor (m/s) – setzt die Welt */
  wind = { x: 0, z: 0 };
  /** Mengenfaktor nach Grafikstufe */
  scale = 1;
  private tmpCol = new Color();

  constructor(scene: Scene) {
    const M = this.max = BASE_MAX;
    const base = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const mk = (n: number) => { const a = new InstancedBufferAttribute(new Float32Array(M * n), n); a.setUsage(35048 /* DynamicDrawUsage */); return a; };
    this.p0 = mk(3); this.v0 = mk(3); this.iA = mk(4); this.iB = mk(4); this.iC = mk(4); this.iCol = mk(3);
    const A = this.iA.array as Float32Array;
    for (let i = 0; i < M; i++) { A[i * 4] = -1e6; A[i * 4 + 1] = 1; }
    geo.setAttribute('iP0', this.p0);
    geo.setAttribute('iV0', this.v0);
    geo.setAttribute('iA', this.iA);
    geo.setAttribute('iB', this.iB);
    geo.setAttribute('iC', this.iC);
    geo.setAttribute('iCol', this.iCol);
    geo.instanceCount = 0;
    this.geo = geo;

    const mat = new ShaderMaterial({
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uMap: { value: null }, uTime: { value: 0 }, uClear: { value: -1e9 }, uWind: { value: new Vector2() } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    mat.uniforms.uMap.value = puffTexture();
    mat.uniforms.uLit = smokeShared.uLit;
    mat.uniforms.uShade = smokeShared.uShade;
    this.mat = mat;
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.userData.noOutline = true;
    scene.add(this.mesh);
  }

  /** Wolken ausstoßen: nur die Startwerte werden geschrieben */
  puff(x: number, y: number, z: number, o: PuffOpts) {
    const count = Math.max(1, Math.round((o.n ?? 1) * Math.min(1.4, this.scale)));
    const tone = o.tone ?? 0.85;
    const col = typeof tone === 'number' ? this.tmpCol.setRGB(tone, tone, tone) : this.tmpCol.copy(tone);
    const sp = o.spread ?? 0.5;
    const jit = o.jitter ?? 0;
    const P = this.p0.array as Float32Array, V = this.v0.array as Float32Array, A = this.iA.array as Float32Array;
    const B = this.iB.array as Float32Array, C = this.iC.array as Float32Array, K = this.iCol.array as Float32Array;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2, d = Math.random() * jit;
      P[i * 3] = x + Math.cos(a) * d;
      P[i * 3 + 1] = y + (Math.random() - 0.5) * jit * 0.5;
      P[i * 3 + 2] = z + Math.sin(a) * d;
      V[i * 3] = (o.vx ?? 0) * (0.7 + Math.random() * 0.5) + (Math.random() - 0.5) * sp * 2;
      V[i * 3 + 1] = (o.vy ?? 0) * (0.7 + Math.random() * 0.5) + (Math.random() - 0.5) * sp;
      V[i * 3 + 2] = (o.vz ?? 0) * (0.7 + Math.random() * 0.5) + (Math.random() - 0.5) * sp * 2;
      A[i * 4] = this.time;
      A[i * 4 + 1] = o.life * (0.75 + Math.random() * 0.5);
      A[i * 4 + 2] = o.size * (0.8 + Math.random() * 0.4);
      A[i * 4 + 3] = o.grow * (0.8 + Math.random() * 0.45);
      B[i * 4] = Math.random() * Math.PI * 2;
      B[i * 4 + 1] = (Math.random() - 0.5) * 0.6;
      B[i * 4 + 2] = (o.alpha ?? 0.8) * (0.8 + Math.random() * 0.3);
      B[i * 4 + 3] = o.glow ?? 0;
      C[i * 4] = o.rise ?? 0.6;
      C[i * 4 + 1] = o.drag ?? 1.4;
      C[i * 4 + 2] = o.wind ?? 0.6;
      const v = 0.92 + Math.random() * 0.12;
      K[i * 3] = col.r * v; K[i * 3 + 1] = col.g * v; K[i * 3 + 2] = col.b * v;
      if (this.dirtyFrom < 0 || i < this.dirtyFrom) this.dirtyFrom = i;
      if (i > this.dirtyTo) this.dirtyTo = i;
      if (i + 1 > this.geo.instanceCount) this.geo.instanceCount = i + 1;
    }
  }

  /** Fester Logikschritt: Uhr und Wind, den Rest rechnet die Grafikkarte */
  update(dt: number) {
    this.time += dt;
    const u = this.mat.uniforms;
    u.uTime.value = this.time;
    u.uWind.value.set(this.wind.x, this.wind.z);
    if (this.dirtyFrom < 0) return;
    const from = this.dirtyFrom, to = this.dirtyTo;
    for (const [a, n] of [[this.p0, 3], [this.v0, 3], [this.iA, 4], [this.iB, 4], [this.iC, 4], [this.iCol, 3]] as const) {
      a.clearUpdateRanges();
      a.addUpdateRange(from * n, (to - from + 1) * n);
      a.needsUpdate = true;
    }
    this.dirtyFrom = this.dirtyTo = -1;
  }

  /** Alle Wolken auf einmal entfernen */
  clear() { this.mat.uniforms.uClear.value = this.time + 1e-4; }
}
