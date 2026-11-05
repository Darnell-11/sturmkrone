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
  type Scene,
} from 'three';

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
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
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
  puffTex = new CanvasTexture(c);
  return puffTex;
}

const VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iData; // Größe, Drehung, Deckkraft, Leuchten
  attribute vec3 iCol;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vGlow;
  varying vec3 vCol;
  varying float vRot;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
    float c = cos(iData.y), s = sin(iData.y);
    mvPosition.xy += mat2(c, -s, s, c) * position.xy * iData.x;
    vAlpha = iData.z;
    vGlow = iData.w;
    vCol = iCol;
    vRot = iData.y;
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

const BASE_MAX = 1400;

export class SmokeSystem {
  readonly mesh: Mesh;
  private max: number;
  private n = 0;
  // pro Wolke: Position, Geschwindigkeit, Alter …
  private px: Float32Array; private py: Float32Array; private pz: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private age: Float32Array; private life: Float32Array;
  private s0: Float32Array; private s1: Float32Array;
  private rot: Float32Array; private spin: Float32Array;
  private a0: Float32Array; private glow: Float32Array;
  private rise: Float32Array; private drag: Float32Array; private windK: Float32Array;
  private cr: Float32Array; private cg: Float32Array; private cb: Float32Array;
  private iPos: InstancedBufferAttribute;
  private iData: InstancedBufferAttribute;
  private iCol: InstancedBufferAttribute;
  private geo: InstancedBufferGeometry;
  /** Windvektor (m/s) – setzt die Welt */
  wind = { x: 0, z: 0 };
  /** Mengenfaktor nach Grafikstufe */
  scale = 1;
  private tmpCol = new Color();

  constructor(scene: Scene) {
    this.max = BASE_MAX;
    const M = this.max;
    const f = () => new Float32Array(M);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.age = f(); this.life = f();
    this.s0 = f(); this.s1 = f();
    this.rot = f(); this.spin = f();
    this.a0 = f(); this.glow = f();
    this.rise = f(); this.drag = f(); this.windK = f();
    this.cr = f(); this.cg = f(); this.cb = f();

    const base = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    this.iPos = new InstancedBufferAttribute(new Float32Array(M * 3), 3);
    this.iData = new InstancedBufferAttribute(new Float32Array(M * 4), 4);
    this.iCol = new InstancedBufferAttribute(new Float32Array(M * 3), 3);
    for (const a of [this.iPos, this.iData, this.iCol]) a.setUsage(35048 /* DynamicDrawUsage */);
    geo.setAttribute('iPos', this.iPos);
    geo.setAttribute('iData', this.iData);
    geo.setAttribute('iCol', this.iCol);
    geo.instanceCount = 0;
    this.geo = geo;

    const mat = new ShaderMaterial({
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uMap: { value: null } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    mat.uniforms.uMap.value = puffTexture();
    mat.uniforms.uLit = smokeShared.uLit;
    mat.uniforms.uShade = smokeShared.uShade;
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.userData.noOutline = true;
    scene.add(this.mesh);
  }

  /** Wolken ausstoßen */
  puff(x: number, y: number, z: number, o: PuffOpts) {
    const count = Math.max(1, Math.round((o.n ?? 1) * Math.min(1.4, this.scale)));
    const tone = o.tone ?? 0.85;
    const col = typeof tone === 'number' ? this.tmpCol.setRGB(tone, tone, tone) : this.tmpCol.copy(tone);
    const sp = o.spread ?? 0.5;
    const jit = o.jitter ?? 0;
    for (let k = 0; k < count; k++) {
      let i: number;
      if (this.n < this.max) i = this.n++;
      else {
        // voll: die älteste (relativ) ersetzen
        i = 0;
        let best = -1;
        for (let j = 0; j < this.n; j += 7) { const r = this.age[j] / this.life[j]; if (r > best) { best = r; i = j; } }
      }
      const a = Math.random() * Math.PI * 2, d = Math.random() * jit;
      this.px[i] = x + Math.cos(a) * d;
      this.py[i] = y + (Math.random() - 0.5) * jit * 0.5;
      this.pz[i] = z + Math.sin(a) * d;
      this.vx[i] = (o.vx ?? 0) * (0.7 + Math.random() * 0.5) + (Math.random() - 0.5) * sp * 2;
      this.vy[i] = (o.vy ?? 0) * (0.7 + Math.random() * 0.5) + (Math.random() - 0.5) * sp;
      this.vz[i] = (o.vz ?? 0) * (0.7 + Math.random() * 0.5) + (Math.random() - 0.5) * sp * 2;
      this.age[i] = 0;
      this.life[i] = o.life * (0.75 + Math.random() * 0.5);
      this.s0[i] = o.size * (0.8 + Math.random() * 0.4);
      this.s1[i] = o.grow * (0.8 + Math.random() * 0.45);
      this.rot[i] = Math.random() * Math.PI * 2;
      this.spin[i] = (Math.random() - 0.5) * 0.6;
      this.a0[i] = (o.alpha ?? 0.8) * (0.8 + Math.random() * 0.3);
      this.glow[i] = o.glow ?? 0;
      this.rise[i] = o.rise ?? 0.6;
      this.drag[i] = o.drag ?? 1.4;
      this.windK[i] = o.wind ?? 0.6;
      const v = 0.92 + Math.random() * 0.12;
      this.cr[i] = col.r * v; this.cg[i] = col.g * v; this.cb[i] = col.b * v;
    }
  }

  update(dt: number) {
    let w = 0;
    const P = this.iPos.array as Float32Array, D = this.iData.array as Float32Array, C = this.iCol.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) continue;
      const t = this.age[i] / this.life[i];
      const drag = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= drag; this.vz[i] *= drag; this.vy[i] = this.vy[i] * drag + this.rise[i] * dt;
      const wk = this.windK[i] * Math.min(1, t * 3 + 0.2);
      this.px[i] += (this.vx[i] + this.wind.x * wk) * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += (this.vz[i] + this.wind.z * wk) * dt;
      this.rot[i] += this.spin[i] * dt;
      // kompakt umsortieren, damit nur lebende Wolken gezeichnet werden
      if (w !== i) this.copy(i, w);
      // schnell aufquellen, dann langsam weiter ausbreiten
      const g = 1 - Math.pow(1 - t, 3.5);
      const size = this.s0[w] + (this.s1[w] - this.s0[w]) * g;
      const fade = Math.min(1, t / 0.06) * Math.pow(1 - t, 1.6);
      P[w * 3] = this.px[w]; P[w * 3 + 1] = this.py[w]; P[w * 3 + 2] = this.pz[w];
      D[w * 4] = size; D[w * 4 + 1] = this.rot[w]; D[w * 4 + 2] = this.a0[w] * fade; D[w * 4 + 3] = this.glow[w] * Math.max(0, 1 - t * 2.5);
      C[w * 3] = this.cr[w]; C[w * 3 + 1] = this.cg[w]; C[w * 3 + 2] = this.cb[w];
      w++;
    }
    this.n = w;
    this.geo.instanceCount = w;
    this.iPos.needsUpdate = true;
    this.iData.needsUpdate = true;
    this.iCol.needsUpdate = true;
  }

  private copy(a: number, b: number) {
    this.px[b] = this.px[a]; this.py[b] = this.py[a]; this.pz[b] = this.pz[a];
    this.vx[b] = this.vx[a]; this.vy[b] = this.vy[a]; this.vz[b] = this.vz[a];
    this.age[b] = this.age[a]; this.life[b] = this.life[a];
    this.s0[b] = this.s0[a]; this.s1[b] = this.s1[a];
    this.rot[b] = this.rot[a]; this.spin[b] = this.spin[a];
    this.a0[b] = this.a0[a]; this.glow[b] = this.glow[a];
    this.rise[b] = this.rise[a]; this.drag[b] = this.drag[a]; this.windK[b] = this.windK[a];
    this.cr[b] = this.cr[a]; this.cg[b] = this.cg[a]; this.cb[b] = this.cb[a];
  }

  clear() { this.n = 0; this.geo.instanceCount = 0; }
}
