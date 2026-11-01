import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  MeshToonMaterial,
  RedFormat,
  Vector3,
  Vector4,
} from 'three';
import { WAVES, WORLD_RADIUS } from '../data/world';
import { WATER_RAMP } from '../render/toon';

const G = 9.81;
const SHORE_SIZE = WORLD_RADIUS * 2.1;
const SHORE_RES = 1024;
const MAX_WAKE = 32;

interface WaveConst { k: number; c: number; dx: number; dz: number; amp: number; h: number; len: number }

const WAVE_CONST: WaveConst[] = WAVES.map((w) => {
  const k = (Math.PI * 2) / w.length;
  const a = (w.dir * Math.PI) / 180;
  return { k, c: Math.sqrt(G / k), dx: Math.cos(a), dz: Math.sin(a), amp: w.amp, h: w.steep / (k * WAVES.length), len: w.length };
});

const f = (n: number) => n.toFixed(6);

/** GLSL-Funktion mit fest eingesetzten Wellen – identisch mit der CPU-Version unten. */
const GERSTNER_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uWaveScale;
  uniform vec3 uCamPos;
  vec3 skGerstner(vec2 p, out vec3 nrm, out float crest) {
    vec3 disp = vec3(0.0);
    vec3 n = vec3(0.0, 1.0, 0.0);
    crest = 0.0;
    float dist = length(p - uCamPos.xz);
    float hs = min(uWaveScale, 1.0);
    ${WAVE_CONST.map((w) => `{
      float fd = 1.0 - smoothstep(${f(w.len * 7)}, ${f(w.len * 16)}, dist);
      float A = ${f(w.amp)} * uWaveScale * fd;
      float H = ${f(w.h)} * hs * fd;
      float ph = ${f(w.k)} * (${f(w.dx)} * p.x + ${f(w.dz)} * p.y - ${f(w.c)} * uTime);
      float cf = cos(ph); float sf = sin(ph);
      disp += vec3(${f(w.dx)} * H * cf, A * sf, ${f(w.dz)} * H * cf);
      n.x -= ${f(w.dx * w.k)} * A * cf;
      n.z -= ${f(w.dz * w.k)} * A * cf;
      n.y -= ${f(w.k)} * H * sf;
      crest += ${f(w.k)} * H * sf;
    }`).join('\n')}
    nrm = normalize(n);
    return disp;
  }
`;

function gerstnerCPU(x: number, z: number, t: number, scale: number, out: { x: number; y: number; z: number }) {
  const hs = Math.min(scale, 1);
  out.x = 0; out.y = 0; out.z = 0;
  for (const w of WAVE_CONST) {
    const ph = w.k * (w.dx * x + w.dz * z - w.c * t);
    const cf = Math.cos(ph);
    out.x += w.dx * w.h * hs * cf;
    out.z += w.dz * w.h * hs * cf;
    out.y += w.amp * scale * Math.sin(ph);
  }
}

/** Polargitter: dicht um die Kamera, nach außen gröber. */
function buildGrid(segs: number): BufferGeometry {
  const inner = 1.2;
  const outer = 6000;
  const ratio = 1 + (Math.PI * 2) / segs;
  const rings = Math.ceil(Math.log(outer / inner) / Math.log(ratio));
  const pos = new Float32Array((1 + rings * segs) * 3);
  let r = inner;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2 + (i % 2) * (Math.PI / segs);
      const o = (1 + i * segs + j) * 3;
      pos[o] = Math.cos(a) * r;
      pos[o + 2] = Math.sin(a) * r;
    }
    r *= ratio;
  }
  const idx: number[] = [];
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 0; i < rings - 1; i++) {
    const a0 = 1 + i * segs;
    const b0 = 1 + (i + 1) * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

export interface IslandShape { x: number; z: number; r: number }

export class Ocean {
  readonly mesh: Mesh;
  readonly uniforms = {
    uTime: { value: 0 },
    uWaveScale: { value: 1 },
    uCamPos: { value: new Vector3() },
    uOrigin: { value: new Vector3() },
    uShore: { value: null as DataTexture | null },
    uShoreSize: { value: SHORE_SIZE },
    uWorldR: { value: WORLD_RADIUS },
    uDeep: { value: new Color(0x0b6a96) },
    uShallow: { value: new Color(0x33c4d2) },
    uFoam: { value: new Color(0xffffff) },
    uZenith: { value: new Color(0x2a7fd6) },
    uHorizon: { value: new Color(0xbfe8ff) },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunCol: { value: new Color(1, 1, 1) },
    uSpecK: { value: 1 },
    uWake: { value: Array.from({ length: MAX_WAKE }, () => new Vector4()) },
  };
  private material: MeshToonMaterial;
  private wakeCount = 16;
  private tmp = { x: 0, y: 0, z: 0 };

  constructor() {
    this.material = this.makeMaterial();
    this.mesh = new Mesh(buildGrid(96), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 0;
    this.setIslands([]);
  }

  private makeMaterial(): MeshToonMaterial {
    const mat = new MeshToonMaterial({ color: 0xffffff, gradientMap: WATER_RAMP });
    const u = this.uniforms;
    const wakeN = this.wakeCount;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uOrigin;
          varying vec3 vSkW;
          varying float vCrest;
          ${GERSTNER_GLSL}`)
        .replace('#include <beginnormal_vertex>', `
          vec2 skP = position.xz + uOrigin.xz;
          vec3 skN; float skCrest;
          vec3 skDisp = skGerstner(skP, skN, skCrest);
          vec3 objectNormal = skN;`)
        .replace('#include <begin_vertex>', `
          vec3 transformed = position + skDisp;
          vCrest = skCrest;
          vSkW = transformed + uOrigin;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          #define WAKE_N ${wakeN}
          uniform float uTime;
          uniform float uWaveScale;
          uniform sampler2D uShore;
          uniform float uShoreSize;
          uniform float uWorldR;
          uniform vec3 uDeep, uShallow, uFoam, uZenith, uHorizon, uSunDir, uSunCol;
          uniform float uSpecK;
          uniform vec4 uWake[${MAX_WAKE}];
          varying vec3 vSkW;
          varying float vCrest;
          float skHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float skNoise(vec2 p) {
            vec2 i = floor(p); vec2 fr = fract(p); fr = fr * fr * (3.0 - 2.0 * fr);
            return mix(mix(skHash(i), skHash(i + vec2(1, 0)), fr.x), mix(skHash(i + vec2(0, 1)), skHash(i + vec2(1, 1)), fr.x), fr.y);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float skRad = length(vSkW.xz);
          if (skRad > uWorldR) discard;
          float sd = texture2D(uShore, vSkW.xz / uShoreSize + 0.5).r * 255.0;
          float shallow = 1.0 - smoothstep(0.0, 48.0, sd);
          vec3 skBase = mix(uDeep, uShallow, clamp(shallow * 0.9 + smoothstep(-0.8, 1.6, vSkW.y) * 0.22, 0.0, 1.0));
          // Gischt auf Wellenkämmen, aufgebrochen durch Rauschen
          float nz = skNoise(vSkW.xz * 0.35 + uTime * 0.3) * 0.6 + skNoise(vSkW.xz * 1.3 - uTime * 0.5) * 0.4;
          float crestT = 0.42 - 0.06 * clamp(uWaveScale - 1.0, 0.0, 2.0);
          float skFoam = smoothstep(crestT, crestT + 0.12, vCrest + (nz - 0.5) * 0.18);
          // Brandungsringe und Küstenlinie
          float bands = smoothstep(0.78, 1.0, sin(sd * 0.45 - uTime * 1.6)) * (1.0 - smoothstep(3.0, 24.0, sd));
          float coast = 1.0 - smoothstep(0.0, 3.2, sd + (nz - 0.5) * 3.0);
          skFoam = max(skFoam, max(bands * 0.55 * step(nz, 0.75), coast * 0.9));
          // Strömung zum Weltrand
          float edgeK = smoothstep(uWorldR - 140.0, uWorldR, skRad);
          float ang = atan(vSkW.z, vSkW.x);
          float streak = smoothstep(0.6, 1.0, skNoise(vec2(ang * 260.0, skRad * 0.08 - uTime * 2.4)));
          skFoam = max(skFoam, edgeK * max(streak, smoothstep(uWorldR - 18.0, uWorldR, skRad)));
          // Kielwasser
          for (int i = 0; i < WAKE_N; i++) {
            vec4 w = uWake[i];
            if (w.w <= 0.0) continue;
            float d = distance(vSkW.xz, w.xy);
            float r = 1.4 + w.z * 1.7;
            float ring = smoothstep(r - 1.6, r - 0.6, d) * (1.0 - smoothstep(r - 0.6, r + 0.3, d));
            float core = 1.0 - smoothstep(0.0, r * 0.75, d);
            float life = w.w * (1.0 - clamp(w.z / 6.0, 0.0, 1.0));
            skFoam = max(skFoam, (ring * 0.95 + core * 0.45) * life * step(0.25, nz));
          }
          skFoam = clamp(skFoam, 0.0, 1.0);
          diffuseColor.rgb = mix(skBase, uFoam, skFoam * 0.92);`)
        .replace('#include <opaque_fragment>', `
          {
            vec3 Nw = normalize(inverseTransformDirection(normal, viewMatrix));
            vec3 Vw = normalize(cameraPosition - vSkW);
            float fr = pow(1.0 - clamp(dot(Nw, Vw), 0.0, 1.0), 4.0) * (1.0 - skFoam);
            vec3 R = reflect(-Vw, Nw);
            vec3 skyC = mix(uHorizon, uZenith, clamp(R.y * 1.8, 0.0, 1.0));
            outgoingLight = mix(outgoingLight, skyC, fr * 0.6);
            float sp = pow(max(dot(R, uSunDir), 0.0), 260.0);
            outgoingLight += uSunCol * step(0.28, sp) * 1.8 * uSpecK * (1.0 - skFoam);
          }
          #include <opaque_fragment>
          // Alpha 0 markiert Wasser: Kantenerkennung und Umgebungsverdeckung lassen es aus
          gl_FragColor.a = 0.0;`);
    };
    mat.customProgramCacheKey = () => `sk-ocean-${wakeN}`;
    return mat;
  }

  /** Auflösung und Kielwasser-Punkte je Grafikstufe */
  setDetail(detail: number, wakeCount: number) {
    this.mesh.geometry.dispose();
    this.mesh.geometry = buildGrid(Math.max(48, Math.round(128 * detail)));
    if (wakeCount !== this.wakeCount) {
      this.wakeCount = wakeCount;
      this.material.dispose();
      this.material = this.makeMaterial();
      this.mesh.material = this.material;
    }
  }

  /** Abstandsfeld zu den Inseln für Flachwasser und Brandung */
  setIslands(list: IslandShape[]) {
    const data = new Uint8Array(SHORE_RES * SHORE_RES).fill(255);
    const cell = SHORE_SIZE / SHORE_RES;
    for (const s of list) {
      const reach = s.r + 255;
      const i0 = Math.max(0, Math.floor((s.x - reach) / cell + SHORE_RES / 2));
      const i1 = Math.min(SHORE_RES - 1, Math.ceil((s.x + reach) / cell + SHORE_RES / 2));
      const j0 = Math.max(0, Math.floor((s.z - reach) / cell + SHORE_RES / 2));
      const j1 = Math.min(SHORE_RES - 1, Math.ceil((s.z + reach) / cell + SHORE_RES / 2));
      for (let j = j0; j <= j1; j++) {
        const z = (j + 0.5 - SHORE_RES / 2) * cell;
        for (let i = i0; i <= i1; i++) {
          const x = (i + 0.5 - SHORE_RES / 2) * cell;
          const d = Math.max(0, Math.hypot(x - s.x, z - s.z) - s.r);
          const k = j * SHORE_RES + i;
          if (d < data[k]) data[k] = Math.min(255, Math.round(d));
        }
      }
    }
    const tex = new DataTexture(data, SHORE_RES, SHORE_RES, RedFormat);
    tex.magFilter = tex.minFilter = LinearFilter;
    tex.needsUpdate = true;
    this.uniforms.uShore.value?.dispose();
    this.uniforms.uShore.value = tex;
  }

  /** Kielwasser-Punkte: x, z, Alter in s, Stärke 0 … 1 */
  setWake(points: { x: number; z: number; age: number; strength: number }[]) {
    const arr = this.uniforms.uWake.value;
    for (let i = 0; i < MAX_WAKE; i++) {
      const p = points[i];
      if (p && i < this.wakeCount) arr[i].set(p.x, p.z, p.age, p.strength);
      else arr[i].set(0, 0, 0, 0);
    }
  }

  /** Wasserhöhe an einer Weltposition (für Schiffe, Bojen, Treibgut) */
  heightAt(x: number, z: number, t = this.uniforms.uTime.value, scale = this.uniforms.uWaveScale.value): number {
    // Gerstner verschiebt Punkte seitlich – Ausgangspunkt iterativ zurückrechnen
    let px = x, pz = z;
    const o = this.tmp;
    for (let i = 0; i < 3; i++) {
      gerstnerCPU(px, pz, t, scale, o);
      px -= px + o.x - x;
      pz -= pz + o.z - z;
    }
    gerstnerCPU(px, pz, t, scale, o);
    return o.y;
  }

  /** Jeden Frame: Gitter zur Kamera mitführen */
  follow(camX: number, camZ: number, camPos: Vector3) {
    const sx = Math.round(camX / 2) * 2;
    const sz = Math.round(camZ / 2) * 2;
    this.mesh.position.set(sx, 0, sz);
    this.uniforms.uOrigin.value.set(sx, 0, sz);
    this.uniforms.uCamPos.value.copy(camPos);
  }
}
