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
  type Texture,
} from 'three';
import { WAVES, WORLD_RADIUS } from '../data/world';
import { WATER_ALPHA } from '../render/outline';
import { SEA_COLOR_GLSL } from '../data/oceanLook';
import { forgeSet } from '../graphics/pbrMaterialForge';
import { fogUniforms } from '../render/atmosphere';
import { ensureCsm } from '../render/csm';
import { markShared } from '../render/dispose';
/** Weiche Lichtrampe fürs Wasser: keine harten Hell-Dunkel-Bänder auf den Wellen */
const SOFT_RAMP = (() => {
  const n = 32;
  const d = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const t = i / (n - 1); d[i] = Math.round(255 * (0.62 + 0.38 * Math.pow(t, 0.8))); }
  const t = new DataTexture(d, n, 1, RedFormat);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return markShared(t);
})();

const G = 9.81;
// deckt die ganze Meeresscheibe (seit 4.5C 15 930 m Radius: rund 8 m je Texel; Inseln liegen alle innerhalb von 15 500 m)
const SHORE_SIZE = WORLD_RADIUS * 2.04;
// Auflösung wächst mit der Welt: eine Zelle bleibt rund 5,5 m groß (sonst würden Brandung und Flachwasser grob); seit 4.3B 4096 × 4096 (ein Byte je Zelle)
const SHORE_RES = 4096;
const MAX_WAKE = 32;
/** Schiffe, deren Rumpfschaum und Bugwelle das Wasser zeichnet (das eigene und die nächsten) */
const MAX_HULL = 6;
/** Wellen laufen mit einem Bruchteil der echten Tiefwasser-Geschwindigkeit: im Spiel wirkt das Meer sonst wie ein reißender Fluss */
const WAVE_SPEED = 0.42;

/**
 * Wellengruppen (4.4.1): die drei langen Wellen laufen in Sätzen – mehrere hohe Wellen hintereinander, dann ruhigeres Wasser – wie echte Dünung.
 * Die Hüllkurve wandert mit der halben Phasengeschwindigkeit (Gruppengeschwindigkeit im Tiefwasser) und gilt gleich auf CPU und GPU.
 * `gk`/`gw` = Wellenzahl und Kreisfrequenz der Hülle, `gp` = Phase, `ga` = Stärke (0 = keine Gruppe).
 */
interface WaveConst { k: number; c: number; dx: number; dz: number; amp: number; h: number; len: number; gk: number; gw: number; gp: number; ga: number }

const GROUP_AMP = [0.34, 0.3, 0.24];

const WAVE_CONST: WaveConst[] = WAVES.map((w, i) => {
  const k = (Math.PI * 2) / w.length;
  const a = (w.dir * Math.PI) / 180;
  const c = Math.sqrt(G / k) * WAVE_SPEED;
  const gk = k / (7 + i * 2);
  return { k, c, dx: Math.cos(a), dz: Math.sin(a), amp: w.amp, h: w.steep / (k * 5), len: w.length, gk, gw: gk * c * 0.5, gp: i * 2.1, ga: GROUP_AMP[i] ?? 0 };
});

const f = (n: number) => n.toFixed(6);

/** GLSL-Funktion mit fest eingesetzten Wellen – identisch mit der CPU-Version unten. */
export const GERSTNER_GLSL = /* glsl */ `
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
      ${w.ga > 0 ? `float gE = 1.0 + ${f(w.ga)} * sin(${f(w.gk)} * (${f(w.dx)} * p.x + ${f(w.dz)} * p.y) - ${f(w.gw)} * uTime + ${f(w.gp)});` : 'float gE = 1.0;'}
      float A = ${f(w.amp)} * uWaveScale * fd * gE;
      float H = ${f(w.h)} * hs * fd * (0.5 + 0.5 * gE);
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


/** Wasserverdrängung der Schiffe. Am Rumpf (Bugwulst, Mulden an der Bordwand, kurzer V-Ansatz) rechnet `skHullH` in
 *  Schiffskoordinaten; alles dahinter (Kelvin-Kämme mit Querwellen, Heckmulde) liegt als Spur im Wasser: `skWakeH` folgt
 *  den gespeicherten Spurpunkten und bleibt in Kurven dort, wo das Schiff gefahren ist, statt am Heck zu schwenken.
 *  Läuft im Vertex-Shader (echte Geometrie) und im Fragment-Shader (Normale per Differenz). */
function hullGlsl(wakeN: number): string { return /* glsl */ `
  uniform vec4 uHull[${MAX_HULL}];
  uniform vec4 uHullD[${MAX_HULL}];
  uniform vec4 uWake[${MAX_WAKE}];
  uniform vec4 uWakeD[${MAX_WAKE}];
  float skHullH(vec2 p) {
    float H = 0.0;
    for (int i = 0; i < ${MAX_HULL}; i++) {
      vec4 hd = uHullD[i];
      if (hd.w <= 0.0 || hd.z < 0.02) continue;
      vec4 hh = uHull[i];
      bool trail = hh.w > 0.5;
      vec2 dp = p - hh.xy;
      vec2 f = vec2(sin(hh.z), cos(hh.z));
      float lz = dot(dp, f);
      float lx = dot(dp, vec2(f.y, -f.x));
      float hl = hd.x * 0.5, hw = hd.y * 0.5, sp = hd.z;
      if (lz < -hl * 2.6 || lz > hl * 2.0 || abs(lx) > hw * 4.0 + hl * 1.4) continue;
      float amp = clamp(hd.y * 0.12, 0.2, 1.0) * sp * hd.w;
      float ax = abs(lx);
      float behind = hl - lz;
      // Bugwulst: das Wasser staut sich vor dem Steven
      float ahead = max(lz - hl, 0.0);
      float bow = exp(-(ahead * ahead) / (hw * hw * 0.9 + 0.3) - (lx * lx) / (hw * hw * 1.6 + 0.3));
      // Der Wulst gehört vor den Steven: ohne diesen Faktor lief er (ahead = 0) als Band entlang der ganzen Mittellinie nach hinten und brach hinter dem Schiff
      // an der Grenze der Rumpf-Schleife hart ab (der Buckel mit scharfer Kante im Kielwasser). Jetzt steigt er erst ab der Schiffsmitte weich zum Bug an.
      H += amp * 1.25 * bow * smoothstep(hl * 0.35, hl * 1.0, lz) * (1.0 - smoothstep(hl * 0.5, hl * 1.2, ahead));
      // Mulde an der Bordwand (Wasser wird zur Seite gedrückt)
      float sideT = exp(-pow((ax - hw * 1.15) / (hw * 0.55 + 0.2), 2.0));
      H -= amp * 0.55 * sideT * smoothstep(-hl * 1.1, hl * 0.2, lz) * (1.0 - smoothstep(hl * 0.8, hl * 1.1, lz));
      if (behind > 0.0) {
        float rx = hw * 0.7 + behind * 0.34;
        float wdt = 0.7 + behind * 0.08 + hw * 0.15;
        float rid = exp(-pow((ax - rx) / wdt, 2.0));
        float osc = 0.62 + 0.38 * cos(behind * (6.2831853 / (hd.x * (0.28 + 0.25 * sp))));
        float dec = smoothstep(0.0, hl * 0.35, behind) / (1.0 + behind / (hl * 1.6));
        // Schiffe mit Spur: der V-Ansatz endet am Heck, den Rest zeichnet die Spur im Wasser
        float cut = 1.0 - smoothstep(hl * 1.7, hl * 2.4, behind);
        H += amp * 0.95 * rid * osc * dec * cut;
        if (false) {
          float lam = hd.x * (0.55 + 0.55 * sp);
          float tr = cos(6.2831853 * (behind - hl * 1.6) / lam);
          float lat = exp(-pow(ax / (hw * 2.6 + behind * 0.22), 2.0));
          H += amp * 0.4 * tr * lat * smoothstep(hl * 1.8, hl * 2.6, behind) / (1.0 + behind / (hl * 2.0)) * (1.0 - smoothstep(hl * 4.5, hl * 6.5, behind));
          float sternD = max(-lz - hl, 0.0);
          float chan = exp(-(lx * lx) / (hw * hw * 1.3 + 0.2));
          H -= amp * 0.42 * chan * smoothstep(0.0, hl * 0.4, sternD) * (1.0 - smoothstep(hl * 1.5, hl * 4.5, sternD)) * step(0.0, -lz - hl * 0.8);
        }
      }
    }
    return H;
  }
  /** Spur im Wasser: Höhe aus den gespeicherten Heckpunkten (Weltposition, Richtung, Halbbreite, Tempo) */
  /** Nächster Punkt auf dem Spurzug: seitlicher Abstand zur gefahrenen Bahn, Alter, Halbbreite, Tempo (m/s) und Stärke an dieser
   *  Stelle. Die Spur ist in Weltkoordinaten gespeichert und biegt sich darum in Kurven mit dem Fahrweg. */
  void skWakeFind(vec2 p, out float bs, out float bage, out float bhw, out float bspd, out float bstr) {
    float best = 1e9;
    float endK = 1.0;
    float idxK = 1.0;
    bs = 0.0; bage = 0.0; bhw = 0.0; bspd = 0.0; bstr = 0.0;
    for (int i = 0; i < ${wakeN}; i++) {
      vec4 w = uWake[i];
      if (w.w <= 0.0) continue;
      vec2 d0 = p - w.xy;
      if (dot(d0, d0) > 6400.0) continue;
      vec4 w2 = (i + 1 < ${wakeN}) ? uWake[i + 1] : vec4(0.0);
      bool two = w2.w > 0.0;
      vec4 d1 = uWakeD[i];
      vec4 d2 = two ? uWakeD[i + 1] : d1;
      vec2 ab = (two ? w2.xy : w.xy) - w.xy;
      float tt = clamp(dot(d0, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
      vec2 q = w.xy + ab * tt;
      vec2 e = p - q;
      float dq = dot(e, e);
      if (dq < best) {
        best = dq;
        vec2 dir = mix(d1.xy, d2.xy, tt);
        dir /= max(length(dir), 1e-3);
        bs = dot(e, vec2(dir.y, -dir.x));
        bage = mix(w.z, two ? w2.z : w.z, tt);
        bhw = mix(d1.z, d2.z, tt);
        bspd = mix(d1.w, d2.w, tt);
        bstr = mix(w.w, two ? w2.w : w.w, tt);
        // An den Enden der Spur (Heck und ältester Punkt) läuft sie weich aus, statt mit einer geraden Kante abzuschneiden
        float beyond = (!two || (tt <= 0.0 && i == 0)) ? abs(dot(e, dir)) : 0.0;
        endK = 1.0 - smoothstep(0.0, 4.0 + bhw * 1.5, beyond);
        // die letzten Spurpunkte des Feldes blenden aus (sonst endet die Spur bei Tempo mit einer hellen Querlinie, bevor das Alter sie auflöst)
        idxK = 1.0 - smoothstep(float(${wakeN}) - 10.0, float(${wakeN}) - 2.0, float(i) + tt);
      }
    }
    bstr *= endK * idxK;
  }
  // Ozean-Teilung (4.6B, Erdspalter-Ultimate): ein Graben entlang der Strecke a → b (uTrench), Halbbreite uTrenchD.x, Tiefe uTrenchD.y,
  // weicher Rand uTrenchD.z. Das verdrängte Wasser türmt sich an den Rändern zu Wällen auf; die Enden laufen spitz zu.
  // CPU-Zwilling: trenchCPU (gleiche Zahlen), damit Schiffe und Treibgut mit absinken.
  uniform vec4 uTrench;
  uniform vec4 uTrenchD;
  float skTrench(vec2 p) {
    if (uTrenchD.y <= 0.0) return 0.0;
    vec2 a = uTrench.xy, ab = uTrench.zw - uTrench.xy;
    float u = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    float d = length(p - a - ab * u);
    float endK = smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.9, 1.0, u));
    float hw = uTrenchD.x * (0.4 + 0.6 * endK);
    float k = 1.0 - smoothstep(hw, hw + uTrenchD.z, d);
    float wall = smoothstep(hw, hw + uTrenchD.z * 0.7, d) * (1.0 - smoothstep(hw + uTrenchD.z * 0.7, hw + uTrenchD.z * 2.4, d));
    return uTrenchD.y * endK * (0.22 * wall - k);
  }
  // Die Spur selbst verformt das Wasser nicht: an den Grenzen zwischen Spurabschnitten springt eine Höhe und erzeugt Haarlinien.
  float skDispH(vec2 p) { return skHullH(p) + skTrench(p); }
`; }

/** Graben der Ozean-Teilung (wie `skTrench` im Shader): negative Höhe im Graben, kleine Wälle am Rand */
export function trenchCPU(x: number, z: number, t: { ax: number; az: number; bx: number; bz: number; hw: number; depth: number; soft: number }): number {
  if (!(t.depth > 0)) return 0;
  const abx = t.bx - t.ax, abz = t.bz - t.az;
  const u = Math.min(1, Math.max(0, ((x - t.ax) * abx + (z - t.az) * abz) / Math.max(abx * abx + abz * abz, 1e-4)));
  const d = Math.hypot(x - t.ax - abx * u, z - t.az - abz * u);
  const ss = (e0: number, e1: number, v: number) => { const k = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
  const endK = ss(0, 0.1, u) * (1 - ss(0.9, 1, u));
  const hw = t.hw * (0.4 + 0.6 * endK);
  const k = 1 - ss(hw, hw + t.soft, d);
  const wall = ss(hw, hw + t.soft * 0.7, d) * (1 - ss(hw + t.soft * 0.7, hw + t.soft * 2.4, d));
  return t.depth * endK * (0.22 * wall - k);
}

function gerstnerCPU(x: number, z: number, t: number, scale: number, out: { x: number; y: number; z: number }) {
  const hs = Math.min(scale, 1);
  out.x = 0; out.y = 0; out.z = 0;
  for (const w of WAVE_CONST) {
    const gE = w.ga > 0 ? 1 + w.ga * Math.sin(w.gk * (w.dx * x + w.dz * z) - w.gw * t + w.gp) : 1;
    const ph = w.k * (w.dx * x + w.dz * z - w.c * t);
    const cf = Math.cos(ph);
    const hk = w.h * hs * (0.5 + 0.5 * gE);
    out.x += w.dx * hk * cf;
    out.z += w.dz * hk * cf;
    out.y += w.amp * scale * gE * Math.sin(ph);
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

export interface IslandShape { x: number; z: number; r: number; /** Küstenlinie wie in islandGround (sonst Kreis) */ coast?: { a: number; f: number; p: number }[]; base?: number }

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
    /** Mitteltiefes Wasser (Azur) und heller Sand des Meeresgrunds (derselbe Ton wie der Inselstrand) */
    uMid: { value: new Color(0x0e93c9) },
    uSand: { value: new Color(0xf3e5c2) },
    uShallow: { value: new Color(0x33c4d2) },
    /** Strandlagune (Smaragd-Türkis) und offene See (Kobalt), 4.4C: setzt Environment je Bild aus den Tageszeit-Farben */
    uLagoon: { value: new Color(0x2ad6b4) },
    uAbyss: { value: new Color(0x0b3d8a) },
    /** Kleinwellen aus der Schmiede (Satz `wasser`, 1024 px): Normalkarte und Stärke nach Grafikstufe (0 aus, 0,5 eine Lage, 1 zwei Lagen) */
    uWaterN: { value: null as Texture | null },
    uWaterK: { value: 1 },
    /** Lichtstreuung durch dünne Wellenkämme im Gegenlicht (ab Hoch) */
    uSss: { value: 1 },
    uFoam: { value: new Color(0xffffff) },
    uZenith: { value: new Color(0x2a7fd6) },
    uHorizon: { value: new Color(0xbfe8ff) },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunCol: { value: new Color(1, 1, 1) },
    uSpecK: { value: 1 },
    /** Windrichtung (wie heading) und Stärke 0 … 1 für Schaumstreifen */
    uWindDir: { value: 0 },
    uWindK: { value: 0.3 },
    /** Mikro-Wellen und Glitzern (nach Grafikstufe) */
    uDetail: { value: 1 },
    /** 0 = Wasser im Alpha markieren (nur mit Post-Effekten), 1 = undurchsichtig */
    uWaterAlpha: WATER_ALPHA,
    /** Regenstärke 0 … 1: Tropfen schlagen Ringwellen ins Wasser (Normalen) */
    uRain: { value: 0 },
    uWake: { value: Array.from({ length: MAX_WAKE }, () => new Vector4()) },
    /** Spurpunkte: Richtung x, z, Halbbreite, Tempo in m/s */
    uWakeD: { value: Array.from({ length: MAX_WAKE }, () => new Vector4()) },
    /** Rümpfe: x, z, Kurs, 0 und Länge, Breite, Tempo 0 … 1, Sichtbarkeit */
    uHull: { value: Array.from({ length: MAX_HULL }, () => new Vector4()) },
    uHullD: { value: Array.from({ length: MAX_HULL }, () => new Vector4()) },
    /** Ozean-Teilung (4.6B): Strecke a (x, z) → b (z, w) und Halbbreite, Tiefe, weicher Rand (Tiefe 0 = aus) */
    uTrench: { value: new Vector4() },
    uTrenchD: { value: new Vector4() },
  };
  /** Zustand der Ozean-Teilung (CPU-Zwilling der Uniforms) */
  readonly trench = { ax: 0, az: 0, bx: 0, bz: 0, hw: 0, depth: 0, soft: 6 };
  /** Graben setzen (Tiefe 0 = aus); wirkt im Shader und in `heightAt` */
  setTrench(ax: number, az: number, bx: number, bz: number, hw: number, depth: number, soft = 6) {
    const t = this.trench;
    t.ax = ax; t.az = az; t.bx = bx; t.bz = bz; t.hw = hw; t.depth = Math.max(0, depth); t.soft = soft;
    this.uniforms.uTrench.value.set(ax, az, bx, bz);
    this.uniforms.uTrenchD.value.set(hw, t.depth, soft, 0);
  }
  private material: MeshToonMaterial;
  private wakeCount = 16;
  /** Schiffe mit Wasserverdrängung je Grafikstufe (Handys rechnen weniger) */
  private hullMax = MAX_HULL;
  private tmp = { x: 0, y: 0, z: 0 };

  constructor() {
    this.material = this.makeMaterial();
    this.mesh = new Mesh(buildGrid(96), this.material);
    this.mesh.frustumCulled = false;
    // Wasser bekommt keine Schatten: sonst wandern riesige dunkle Flecken über die Wellen
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 0;
    this.setIslands([]);
  }

  private makeMaterial(): MeshToonMaterial {
    const mat = new MeshToonMaterial({ color: 0xffffff, gradientMap: SOFT_RAMP });
    const u = this.uniforms;
    const wakeN = this.wakeCount;
    mat.onBeforeCompile = (shader) => {
      fogUniforms(shader);
      // Normalkarte der Kleinwellen erst beim Übersetzen holen (dann steht der Satz aus dem Start schon bereit)
      if (!u.uWaterN.value) u.uWaterN.value = forgeSet('wasser').normal;
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uOrigin;
          uniform sampler2D uShore;
          uniform float uShoreSize;
          varying vec3 vSkW;
          varying float vCrest;
          ${GERSTNER_GLSL}
          ${hullGlsl(wakeN)}`)
        .replace('#include <beginnormal_vertex>', `
          vec2 skP = position.xz + uOrigin.xz;
          vec3 skN; float skCrest;
          vec3 skDisp = skGerstner(skP, skN, skCrest);
          vec3 objectNormal = skN;`)
        .replace('#include <begin_vertex>', `
          // Im Flachwasser vor der Küste werden die Wellen flacher (sonst stechen Kämme durch den Strand)
          float skShoreD = texture2D(uShore, skP / uShoreSize + 0.5).r * 255.0;
          vec3 transformed = position + skDisp * (0.2 + 0.8 * smoothstep(2.0, 40.0, skShoreD));
          transformed.y += skDispH(skP);
          vCrest = skCrest;
          vSkW = transformed + uOrigin;`)
        // Das Meer reicht bis zum Horizont: Punkte jenseits der Kamera-Fernebene werden knapp davor gelegt statt abgeschnitten
        .replace('#include <project_vertex>', `#include <project_vertex>
          gl_Position.z = min(gl_Position.z, gl_Position.w * 0.999999);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          #define WAKE_N ${wakeN}
          #define HULL_N ${MAX_HULL}
          ${GERSTNER_GLSL}
          uniform sampler2D uShore;
          uniform float uShoreSize;
          uniform float uWorldR;
          uniform vec3 uDeep, uMid, uSand, uShallow, uFoam, uZenith, uHorizon, uSunDir, uSunCol, uLagoon, uAbyss;
          uniform float uSpecK, uWindDir, uWindK, uDetail, uWaterAlpha, uRain, uWaterK, uSss;
          uniform sampler2D uWaterN;
          ${hullGlsl(wakeN)}
          varying vec3 vSkW;
          varying float vCrest;
          vec2 skOsc(float a, float b) { return vec2(sin(uTime * a), cos(uTime * b)) * 2.0; }
          float skHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
          float skNoise(vec2 p) {
            vec2 i = floor(p); vec2 fr = fract(p); fr = fr * fr * (3.0 - 2.0 * fr);
            return mix(mix(skHash(i), skHash(i + vec2(1, 0)), fr.x), mix(skHash(i + vec2(0, 1)), skHash(i + vec2(1, 1)), fr.x), fr.y);
          }
          // Regentropfen als Wellen IN der Wasseroberfläche: je Zelle (Kantenlänge cs, Meter) ein Tropfen an zufälliger Stelle, dessen
          // Ringwelle (Wellenpaket der Breite ~0,11 · rm, wandert bis zum Radius rm, dabei abklingend) die Normale kippt. Das verformt
          // Spiegelung, Sonnenglanz und Licht wie echtes Wasser; geprüft werden nur die vier nächsten Zellen (Ringe bleiben unter 0,5 Zellen)
          vec2 skRainRipples(vec2 p, float cs, float rm, float seed, float dens) {
            vec2 q = p / cs;
            vec2 c0 = floor(q);
            vec2 f = fract(q);
            vec2 sg = vec2(f.x < 0.5 ? -1.0 : 1.0, f.y < 0.5 ? -1.0 : 1.0);
            vec2 g = vec2(0.0);
            for (int n = 0; n < 4; n++) {
              vec2 cell = c0 + vec2(mod(float(n), 2.0), floor(float(n) * 0.5)) * sg;
              float h4 = skHash(cell - seed + 5.3);
              if (h4 > dens) continue;
              float h1 = skHash(cell + seed);
              float h2 = skHash(cell * 1.7 + seed + 3.1);
              float h3 = skHash(cell + seed + 9.7);
              vec2 dv = (q - (cell + vec2(0.2 + 0.6 * h1, 0.2 + 0.6 * h2))) * cs;
              float t = fract(uTime / (0.8 + 0.8 * h3) + h3 * 7.0);
              float d = length(dv);
              float w = rm * 0.11;
              float x = d - t * rm;
              float env = exp(-(x * x) / (w * w)) * (1.0 - t) * (1.0 - t);
              // zweite, kleinere Welle läuft hinterher (wie bei einem echten Aufprall)
              float x2 = d - t * rm * 0.62;
              float env2 = exp(-(x2 * x2) / (w * w * 1.4)) * (1.0 - t) * (1.0 - t) * smoothstep(0.08, 0.3, t) * 0.55;
              float k = 6.2831853 / (w * 2.7);
              float s = sin(k * x) * env + sin(k * x2) * env2;
              g += (dv / max(d, 1e-3)) * s;
            }
            return g;
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // Wellen-Normale und Kamm pro Pixel: keine Keile und Kanten vom groben Gitter
          vec3 skNf; float skCrestF;
          vec3 skD = skGerstner(vSkW.xz, skNf, skCrestF);
          float skRad = length(vSkW.xz);
          if (skRad > uWorldR) discard;
          float camD = distance(vSkW.xz, cameraPosition.xz);
          // Mikro-Wellen: feines, wanderndes Kräuseln bricht die glatte Fläche auf (Licht, Spiegelung, Glitzern)
          if (uDetail > 0.0) {
            vec2 rp = vSkW.xz;
            // Spektrum kleiner Windwellen (10 Oktaven, 7 m … 0,5 m): spitze Kämme, laufen mit echter
            // Tiefwasser-Geschwindigkeit in Windrichtung (± 70°) – kreuzen sich wie auf offener See
            vec2 rn = vec2(0.0);
            float wk = 0.75 + 0.6 * uWindK;
            // 4.4C: nur noch die acht längeren Windwellen werden gerechnet (Mittel sechs); alles Feinere kommt aus der Normalkarte der Schmiede
            for (int i = 0; i < 8; i++) {
              float fi = float(i);
              if (fi > 3.0 + 10.0 * (uDetail - 0.5)) break;
              // Goldener Winkel: die Wellen kommen aus allen Richtungen (kein gemeinsames Fließen), Windrichtung bevorzugt
              float ang = uWindDir + fi * 2.39996;
              float wgt = 0.3 + 0.7 * (0.5 + 0.5 * cos(ang - uWindDir));
              float len = 9.0 * pow(0.84, fi * 0.62 * 1.6);
              float k = 6.2831853 / len;
              vec2 d = vec2(sin(ang), cos(ang));
              float ph = k * dot(d, rp) - sqrt(9.81 * k) * uTime * 0.3 + fi * 1.7;
              float sh = exp(0.5 * (sin(ph) - 1.0));
              float fd = 1.0 - smoothstep(len * 10.0, len * 38.0, camD);
              rn -= d * (sh * cos(ph) * 0.032 * wgt * fd * (0.45 + 0.55 * smoothstep(0.0, 8.0, fi)));
            }
            // etwas Rauschen dazu, damit kein Muster sichtbar wird
            vec2 t1 = skOsc(0.23, 0.19) * 1.1;
            float e = 0.35;
            float r0 = skNoise(rp * 0.9 + t1);
            float rx = skNoise((rp + vec2(e, 0.0)) * 0.9 + t1);
            float rz = skNoise((rp + vec2(0.0, e)) * 0.9 + t1);
            rn += vec2(r0 - rx, r0 - rz) * 0.25 * (1.0 - smoothstep(20.0, 120.0, camD));
            skNf = normalize(skNf + vec3(rn.x, 0.0, rn.y) * uDetail * wk);
            // Kapillar- und Windwellen aus der Schmiede (4.4C): zwei Größen gegeneinander verschoben (9 m und 21 m je Kachel, die zweite gedreht),
            // mit dem Wind laufend; in der Ferne ausgeblendet (die Mipmaps glätten vorher schon)
            if (uWaterK > 0.0) {
              vec2 skWd = vec2(sin(uWindDir), cos(uWindDir));
              float skWf = 1.0 - smoothstep(60.0, 650.0, camD);
              vec2 skG = (texture2D(uWaterN, rp / 9.0 + skWd * (uTime * 0.05)).xy * 2.0 - 1.0) * 0.6;
              if (uWaterK > 0.6) {
                vec2 skU2 = mat2(0.8, -0.6, 0.6, 0.8) * rp / 21.0 - skWd * (uTime * 0.022) + vec2(uTime * 0.009, 0.0);
                skG += mat2(0.8, 0.6, -0.6, 0.8) * (texture2D(uWaterN, skU2).xy * 2.0 - 1.0) * 0.45;
              }
              skNf = normalize(skNf + vec3(skG.x, 0.0, skG.y) * uWaterK * (0.42 + 0.3 * uWindK) * skWf);
            }
          }
          // Ferne See (4.4.1): wo die Gerstner-Wellen ausgeblendet sind, tragen zwei weiche Rauschfelder die Wellenstruktur bis zum Horizont
          // (sonst wird das Meer in der Ferne zum glatten Spiegel); sie brechen Himmelsspiegelung und Sonnenbahn in Bänder und Flecken
          {
            float fk = smoothstep(90.0, 700.0, camD);
            if (fk > 0.0) {
              vec2 fp = vSkW.xz * 0.05 + skOsc(0.05, 0.04);
              float a0 = skNoise(fp), ax = skNoise(fp + vec2(0.5, 0.0)), az = skNoise(fp + vec2(0.0, 0.5));
              vec2 fp2 = vSkW.xz * 0.014 - skOsc(0.03, 0.035);
              float b0 = skNoise(fp2), bx = skNoise(fp2 + vec2(0.5, 0.0)), bz = skNoise(fp2 + vec2(0.0, 0.5));
              vec2 fg = vec2(a0 - ax, a0 - az) * 0.6 + vec2(b0 - bx, b0 - bz) * 0.9;
              skNf = normalize(skNf + vec3(fg.x, 0.0, fg.y) * fk * (0.45 + 0.25 * min(uWaveScale, 2.0)));
            }
          }
          // Regen: Tropfen schlagen Ringwellen ins Wasser (drei Größen: große seltene, mittlere, feines Nieseln nah an der Kamera)
          float skRainI = 0.0;
          if (uRain > 0.02 && uDetail > 0.0) {
            float dens = clamp(uRain * 1.3 - 0.08, 0.0, 1.0);
            vec2 rg = skRainRipples(vSkW.xz, 1.5, 0.7, 1.0, dens) * (1.0 - smoothstep(40.0, 100.0, camD));
            rg += skRainRipples(vSkW.xz, 3.3, 1.45, 7.0, dens * 0.8) * (1.0 - smoothstep(80.0, 190.0, camD)) * 0.85;
            rg += skRainRipples(vSkW.xz, 0.7, 0.34, 13.0, dens) * (1.0 - smoothstep(14.0, 40.0, camD)) * 0.75;
            skRainI = min(length(rg), 1.5);
            skNf = normalize(skNf + vec3(rg.x, 0.0, rg.y) * (0.42 + 0.3 * uRain));
          }
          // Schiffsverdrängung: Normale aus der Verdrängungshöhe, Brechschaum auf den steilen Kämmen
          float skHg = 0.0;
          if (uDetail > 0.0) {
            float he = 0.45;
            float h0 = skDispH(vSkW.xz);
            float hx = skDispH(vSkW.xz + vec2(he, 0.0));
            float hz = skDispH(vSkW.xz + vec2(0.0, he));
            vec2 gr = vec2(hx - h0, hz - h0) / he;
            skNf = normalize(skNf + vec3(-gr.x, 0.0, -gr.y) * 1.4);
            skHg = length(gr);
            skD.y += h0;
          }
          float sd = texture2D(uShore, vSkW.xz / uShoreSize + 0.5).r * 255.0;
          // Wassertiefe (Meter) aus dem Küstenabstand: flache Lagune am Strand, dazu Sandbänke und Riffflecken, dann der Abfall in die offene See
          float skSb = skNoise(vSkW.xz * 0.021 + 5.3) * 0.62 + skNoise(vSkW.xz * 0.057 - 2.1) * 0.38;
          float skBank = smoothstep(0.52, 0.74, skSb) * smoothstep(10.0, 45.0, sd) * (1.0 - smoothstep(60.0, 215.0, sd));
          float skZ = max(0.1 + sd * 0.042 + smoothstep(52.0, 235.0, sd) * 24.0 - skBank * (1.1 + sd * 0.028), 0.08);
          float shallow = 1.0 - smoothstep(0.0, 3.2, skZ);
          // Wassersäule (4.4C, data/oceanLook.ts): Smaragd-Lagune → Türkis (bis ~6 m) → Azur → Tiefblau → Kobalt der offenen See. Wellenberge etwas heller.
${SEA_COLOR_GLSL}
          skWater *= 0.94 + 0.14 * smoothstep(-0.8, 1.6, skD.y);
          // Ozean-Teilung: am Grund des Grabens schimmert nasser Meeresboden durch
          if (uTrenchD.y > 0.0) { float skTk = clamp(-skTrench(vSkW.xz) / uTrenchD.y, 0.0, 1.0); skWater = mix(skWater, vec3(0.34, 0.29, 0.21), smoothstep(0.55, 0.95, skTk) * 0.8); }
          // Meeresgrund: heller Sand scheint durch das klare Wasser, Rot wird zuerst verschluckt (daher türkis);
          // Lichtnetze (Kaustiken) wandern darüber. Mit der Tiefe verschwindet der Grund.
          vec2 skCp = vSkW.xz * 0.5;
          float skC1 = abs(skNoise(skCp + skOsc(0.3, 0.25)) - skNoise(skCp * 1.73 - skOsc(0.21, 0.27)));
          float skC2 = abs(skNoise(skCp * 2.3 + skOsc(0.27, 0.33) + 7.0) - skNoise(skCp * 3.9 - skOsc(0.18, 0.24)));
          float caust = pow(max(1.0 - clamp(skC1 * 2.4, 0.0, 1.0), 1e-4), 6.0) * 0.75 + pow(max(1.0 - clamp(skC2 * 2.8, 0.0, 1.0), 1e-4), 6.0) * 0.55;
          float skCFade = (1.0 - smoothstep(70.0, 260.0, camD)) * uSpecK;
          vec3 skAbs = exp(-vec3(0.62, 0.11, 0.05) * skZ * 1.7);
          vec3 skBed = uSand * (0.74 + 0.2 * skNoise(vSkW.xz * 0.8 + 3.0) + caust * 1.15 * skCFade) * skAbs;
          float skVis = exp(-skZ * 0.55);
          vec3 skBase = mix(skWater, skBed * 0.95 + skWater * 0.2, clamp(skVis * 1.05, 0.0, 1.0));
          // Großflächige Farbfelder: Strömungen und Plankton färben das Meer mal türkisgrün, mal tiefblau (langsam, ohne Wandern)
          {
            float pt = skNoise(vSkW.xz * 0.0035 + skOsc(0.01, 0.013) * 0.3) * 0.65 + skNoise(vSkW.xz * 0.012 - skOsc(0.02, 0.017) * 0.3) * 0.35;
            skBase = mix(skBase, skBase * vec3(0.8, 1.1, 1.12) + vec3(0.0, 0.015, 0.02), smoothstep(0.4, 0.78, pt) * 0.55 * (1.0 - shallow));
            skBase = mix(skBase, skBase * vec3(0.88, 0.94, 1.12), (1.0 - smoothstep(0.15, 0.55, pt)) * 0.35 * (1.0 - shallow));
          }
          // Gischt auf Wellenkämmen, aufgebrochen durch Rauschen
          float nz = skNoise(vSkW.xz * 0.35 + skOsc(0.17, 0.13)) * 0.6 + skNoise(vSkW.xz * 1.3 - skOsc(0.2, 0.23)) * 0.4;
          float crestT = 0.57 - 0.06 * clamp(uWaveScale - 1.0, 0.0, 2.0) - 0.04 * uWindK - 0.06;
          // Wellengruppen: Kämme türmen sich in langen Böen auf und fallen wieder zusammen (Schaumneigung schwankt mit)
          float grp = skNoise(vSkW.xz * 0.011 + vec2(uTime * 0.035, -uTime * 0.02)) * 0.65 + skNoise(vSkW.xz * 0.03 - uTime * 0.05) * 0.35;
          crestT -= (grp - 0.5) * 0.22;
          float crestAll = skCrestF;
          // Schaumschleppe hinter dem Kamm: dort, wo eben noch ein Kamm lief (in Laufrichtung der Hauptwelle)
          if (uDetail > 0.7) {
            vec3 nT; float cT1, cT2;
            skGerstner(vSkW.xz + vec2(${f(WAVE_CONST[1].dx)}, ${f(WAVE_CONST[1].dz)}) * 2.2, nT, cT1);
            skGerstner(vSkW.xz + vec2(${f(WAVE_CONST[1].dx)}, ${f(WAVE_CONST[1].dz)}) * 4.6, nT, cT2);
            crestAll = max(skCrestF, max(cT1 - 0.06, cT2 - 0.14) * 0.9);
          }
          float skFoam = smoothstep(crestT, crestT + 0.2, crestAll + (nz - 0.5) * 0.18);
          // Schaumkronen als zerfasernde Spitze mit Löchern statt flacher weißer Flecken
          float lace2 = skNoise(vSkW.xz * 3.3 + skOsc(0.3, 0.2)) * 0.6 + skNoise(vSkW.xz * 8.0 - skOsc(0.22, 0.26)) * 0.4;
          // Schaumplatten in Fäden aufbrechen: langgezogene Strähnen quer zur Laufrichtung plus feine Löcher
          float strand = skNoise(vec2(dot(vSkW.xz, vec2(${f(WAVE_CONST[1].dz)}, -${f(WAVE_CONST[1].dx)})) * 1.7, dot(vSkW.xz, vec2(${f(WAVE_CONST[1].dx)}, ${f(WAVE_CONST[1].dz)})) * 0.32 + sin(uTime * 0.2) * 2.0));
          skFoam *= smoothstep(0.34, 0.66, lace2 * 0.65 + strand * 0.45 + skFoam * 0.08) * 0.9;
          // Brandungsringe und Küstenlinie
          // anrollende Brandungswellen: schmale, aufgerissene Schaumlinien, die zur Küste hin dichter werden
          // (Karibik: breite Brandungszone, mehrere Wellenzüge laufen auf den Strand, dazu ein Schaumteppich, der den Sand hinauf- und herunterläuft)
          // Seegang (4.4C): bei hohen Wellen läuft die Brandung schneller, breiter und weiter hinaus (Klippen und Schären im Sturm)
          float skSurfK = clamp((uWaveScale - 0.9) / 1.6, 0.0, 1.0);
          float skSurf = sd * 0.3 - uTime * (0.55 + 0.3 * skSurfK) + nz * 1.5;
          float bands = smoothstep(0.82 - 0.1 * skSurfK, 0.985, sin(skSurf * 3.14159)) * (1.0 - smoothstep(5.0, 38.0 + 30.0 * skSurfK, sd));
          float coast = 1.0 - smoothstep(0.0, 5.5 + 4.0 * skSurfK, sd + (nz - 0.5) * 3.5);
          // blasiger Küstenschaum: dichte Kante, nach außen zerfasernde Spitze statt glatter Fläche
          float bub = skNoise(vSkW.xz * 2.2 + skOsc(0.25, 0.18)) * 0.6 + skNoise(vSkW.xz * 5.5 - skOsc(0.31, 0.22)) * 0.4;
          float coastFoam = coast * smoothstep(0.58 - coast * 0.5, 0.72 - coast * 0.45, bub);
          float wash = (1.0 - smoothstep(0.0, 9.0 + 8.0 * skSurfK, sd + (nz - 0.5) * 6.0)) * (0.5 + 0.5 * sin(uTime * (0.85 + 0.4 * skSurfK) + nz * 7.0));
          float washFoam = wash * smoothstep(0.4, 0.68, bub);
          skFoam = max(skFoam, max(max(bands * smoothstep(0.32, 0.58, bub) * 0.85, coastFoam * 0.96), washFoam * 0.7));
          // Schaumstreifen in Windrichtung (je stärker der Wind, desto mehr), wie auf echter offener See
          {
            vec2 wd = vec2(sin(uWindDir), cos(uWindDir));
            vec2 wp = vec2(dot(vSkW.xz, vec2(wd.y, -wd.x)), dot(vSkW.xz, wd));
            float lines = smoothstep(0.72, 0.94, skNoise(vec2(wp.x * 0.45, wp.y * 0.025 + sin(uTime * 0.17) * 3.0)));
            float skPatch = smoothstep(0.5, 0.85, skNoise(vSkW.xz * 0.012 + uTime * 0.01));
            float sk = lines * skPatch * smoothstep(0.25, 0.9, uWindK) * (1.0 - smoothstep(120.0, 600.0, camD)) * (1.0 - shallow);
            skFoam = max(skFoam, sk * 0.45);
          }
          // Strömung zum Weltrand
          float edgeK = smoothstep(uWorldR - 140.0, uWorldR, skRad);
          float ang = atan(vSkW.z, vSkW.x);
          float streak = smoothstep(0.6, 1.0, skNoise(vec2(ang * 260.0, skRad * 0.08 - uTime * 2.4)));
          skFoam = max(skFoam, edgeK * max(streak, smoothstep(uWorldR - 18.0, uWorldR, skRad)));
          // Kielwasser in Spurkoordinaten (seitlicher Abstand s zur gefahrenen Bahn, Alter): der Schaum liegt im Wasser, wo das
          // Schiff gefahren ist, biegt sich in Kurven mit dem Fahrweg, wird mit der Zeit breiter, dünner und zerfasert
          float skWk = 0.0;
          {
            float ws, wage, whw, wspd, wstr;
            skWakeFind(vSkW.xz, ws, wage, whw, wspd, wstr);
            if (wstr > 0.0) {
              float ax = abs(ws);
              float w0 = whw * 0.45 + wage * 0.4;
              float core = 1.0 - smoothstep(w0 * 0.3, w0 * 1.5, ax);
              float life = wstr * (1.0 - smoothstep(0.4, 4.2, wage)) * smoothstep(0.0, 0.25, wage);
              float lace = skNoise(vSkW.xz * 1.5 + vec2(0.0, uTime * 0.1)) * 0.5 + skNoise(vSkW.xz * 4.2 - uTime * 0.1) * 0.35 + skNoise(vSkW.xz * 10.0) * 0.15;
              float thr = 0.57 + (1.0 - core) * 0.32 + wage * 0.07;
              skFoam = max(skFoam, smoothstep(thr, thr + 0.16, lace + core * 0.24) * core * life * 0.75);
              skWk = (1.0 - smoothstep(0.0, w0 * 3.0, ax)) * life;
            }
          }
          float skAer = skWk * 0.8;
          // Rumpfschaum und Bugwelle: das Wasser selbst schäumt um den Rumpf (kein aufgesetztes Netz). Alles läuft in
          // Schiffskoordinaten: u = −1 Heck … +1 Bug, e = Abstand zur Bordwand. Echter Schaum ist nicht weiß und glatt:
          // er besteht aus Strähnen entlang der Strömung, Bläschen und dünnen Stellen, und färbt das Wasser rundum heller (Luftblasen).
          for (int i = 0; i < HULL_N; i++) {
            vec4 hd = uHullD[i];
            if (hd.w <= 0.0) continue;
            vec4 h = uHull[i];
            vec2 dp = vSkW.xz - h.xy;
            vec2 f = vec2(sin(h.z), cos(h.z));
            float lz = dot(dp, f);
            float lx = dot(dp, vec2(f.y, -f.x));
            float hl = hd.x * 0.5, hw = hd.y * 0.5;
            if (abs(lz) > hl * 2.0 || abs(lx) > hw * 2.5 + hl * 0.7) continue;
            float u = lz / hl;
            float prof = u >= 0.0 ? pow(max(0.0, 1.0 - pow(u, 2.3)), 0.6) : 0.78 + 0.22 * pow(max(0.0, 1.0 - pow(-u, 3.0)), 0.5);
            float sp = hd.z;
            // Strömung: Muster wandert am Rumpf entlang nach hinten
            vec2 fl = vec2(lx, lz + uTime * (0.6 + sp * 2.2));
            float streak = skNoise(vec2(fl.x * 3.0, fl.y * 0.55)) * 0.6 + skNoise(vec2(fl.x * 6.5, fl.y * 1.3) + 3.0) * 0.4;
            float bub = skNoise(fl * 5.0 + 11.0) * 0.5 + skNoise(fl * 12.0) * 0.5;
            float skPch = 0.45 + 0.55 * skNoise(fl * 0.4 + 5.0);
            float lace2 = streak * 0.55 + bub * 0.45;
            // ausgefranster Rand statt glatter Kante
            float e = abs(lx) - prof * hw + (skNoise(fl * 1.2) - 0.5) * (0.5 + sp * 0.9);
            // 1) Anlegeschaum an der Bordwand, am Bug am breitesten, mit Tempo mehr
            float along = smoothstep(-1.0, -0.25, u) * (1.0 - smoothstep(0.9, 1.15, u));
            float bowK = smoothstep(0.0, 1.0, u);
            float band = (1.0 - smoothstep(0.0, 0.35 + sp * (0.6 + bowK * 1.2), e)) * smoothstep(-0.7, 0.0, e);
            float hullFoam = smoothstep(0.4, 0.8, lace2 * 0.85 + band * skPch * 0.6) * band * along * (0.25 + 0.65 * sp);
            // 2) Bugwelle: zwei Schaumkämme laufen V-förmig vom Steven nach hinten (Kelvin-Winkel etwa 20 Grad)
            float behind = hl - lz;
            float ridge = abs(lx) - (hw * 0.55 + max(behind, 0.0) * 0.36) + (skNoise(fl * 0.9) - 0.5) * 0.8;
            float vk = smoothstep(-0.2, 1.0, behind) * (1.0 - smoothstep(hl * 0.3, hl * 1.5, behind));
            float rd = 1.0 - smoothstep(0.0, 0.45 + sp * 0.9, abs(ridge));
            float bowWave = smoothstep(0.42, 0.8, lace2 * 0.9 + rd * 0.45) * rd * vk * sp * skPch * (h.w > 0.5 ? 0.35 : 0.7);
            // 3) Gischtwulst unmittelbar vor dem Steven
            float ahead = length(vec2(lx * 0.8, max(0.0, lz - hl)));
            float sr = 1.0 - smoothstep(0.0, 1.1 + sp * 1.4, ahead);
            float bowSplash = smoothstep(0.45, 0.8, lace2 * 0.9 + sr * 0.4) * sr * step(hl * 0.7, lz) * sp;
            skFoam = max(skFoam, max(max(hullFoam, bowWave * 0.85), bowSplash * 0.8) * hd.w * 0.88);
            // Luftblasen färben das Wasser um Rumpf und Bugwellen heller und türkis (unter dem Schaum, weich auslaufend)
            float aer = (1.0 - smoothstep(0.0, 1.8 + sp * 2.4, e)) * along * (0.2 + 0.8 * sp) + rd * vk * sp * 0.7 + sr * sp * 0.6;
            skAer = max(skAer, aer * skPch * hd.w);
          }
          {
            // brechender Schaum auf den steilen Verdrängungskämmen, in Fäden aufgerissen
            float brk = smoothstep(0.5, 1.15, skHg);
            float lc = skNoise(vSkW.xz * 2.4 + skOsc(0.33, 0.2)) * 0.55 + skNoise(vSkW.xz * 6.5 - skOsc(0.25, 0.29)) * 0.45;
            skFoam = max(skFoam, smoothstep(0.5, 0.78, lc + brk * 0.4) * brk * 0.8);
            skAer = max(skAer, brk * 0.6);
          }
          skBase = mix(skBase, skBase * 1.5 + vec3(0.03, 0.1, 0.11), clamp(skAer, 0.0, 1.0) * 0.55);
          skFoam = clamp(skFoam, 0.0, 1.0);
          diffuseColor.rgb = mix(skBase, uFoam, skFoam * 0.92);`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          normal = normalize((viewMatrix * vec4(skNf, 0.0)).xyz);`)
        .replace('#include <opaque_fragment>', `
          {
            // Wasser streut wenig Licht zurück: der diffuse Anteil bleibt gedämpft (Schaum ausgenommen),
            // die Helligkeit kommt aus Himmelsspiegelung, Sonnenglanz und Licht im Wasserkörper
            outgoingLight *= mix(0.6, 1.0, skFoam);
            vec3 Nw = normalize(inverseTransformDirection(normal, viewMatrix));
            vec3 Vw = normalize(cameraPosition - vSkW);
            float nv = clamp(dot(Nw, Vw), 1e-3, 1.0);
            // Fresnel aus geglätteter Normale: flach geschaut kippt sonst jede Kräuselung zwischen dunkel und gleißend (Seidenstreifen)
            float nvF = clamp(dot(normalize(mix(Nw, vec3(0.0, 1.0, 0.0), 0.5)), Vw), 1e-3, 1.0);
            // Fresnel (Schlick, Wasser F0 = 0,02): flach geschaut spiegelt das Meer den Himmel fast vollständig
            float fr = 0.02 + 0.98 * pow(max(1.0 - nvF, 1e-4), 5.0);
            fr = clamp(fr * 1.15, 0.0, 1.0) * (1.0 - skFoam);
            vec3 R = reflect(-Vw, Nw);
            R.y = abs(R.y);
            float sdot = max(dot(R, uSunDir), 1e-4);
            // Himmelsspiegelung: Horizontverlauf, Aufhellung am Horizont, warmer Schein um die Sonne (Streuung in der Luft)
            vec3 skyC = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.55));
            skyC = mix(skyC, uHorizon * 1.12, (1.0 - clamp(R.y * 3.0, 0.0, 1.0)) * 0.35);
            skyC += uSunCol * (pow(sdot, 6.0) * 0.28 + pow(sdot, 40.0) * 0.5) * uSpecK;
            outgoingLight = mix(outgoingLight, skyC, fr * 0.78);
            // Sonnenglanz: GGX-Spiegelung an den Wellenfacetten. Rauer mit Wind, Entfernung und Seegang, damit
            // die Glitzerbahn zum Horizont hin breit und weich wird (kein Flimmern) und nah an der Kamera funkelt
            float rough = clamp(0.055 + 0.05 * uWindK + 0.02 * clamp(uWaveScale - 1.0, 0.0, 2.0) + 0.03 * uRain + 0.22 * smoothstep(40.0, 1400.0, camD), 0.04, 0.5);
            float a2 = rough * rough;
            vec3 Hh = normalize(uSunDir + Vw);
            float nh = clamp(dot(Nw, Hh), 0.0, 1.0);
            float dd = nh * nh * (a2 - 1.0) + 1.0;
            float D = a2 / (3.14159265 * dd * dd + 1e-5);
            float vh = clamp(dot(Vw, Hh), 0.0, 1.0);
            float Fh = 0.02 + 0.98 * pow(max(1.0 - vh, 1e-4), 5.0);
            float nl = clamp(dot(Nw, uSunDir), 0.0, 1.0);
            float spec = D * Fh * nl / (4.0 * max(nv, 0.12) * max(vh * vh, 0.1));
            outgoingLight += uSunCol * min(spec, 60.0) * 1.25 * uSpecK * (1.0 - skFoam);
            // Sonnenbahn: breiter, warmer Glanz bis zum Horizont
            float sheen = pow(sdot, 18.0);
            outgoingLight += uSunCol * sheen * 0.2 * uSpecK * (1.0 - skFoam);
            // Regenringe: die gekippten Flanken spiegeln helleren Himmel (bei bedecktem Himmel trägt das den Ring), kleine Aufprallpunkte glitzern
            {
              float ri = smoothstep(0.08, 0.9, skRainI);
              outgoingLight += (max(uHorizon * 0.55, vec3(0.09, 0.12, 0.19)) + uSunCol * 0.1 * uSpecK) * ri * (0.25 + 0.75 * nvF) * (1.0 - skFoam) * (0.6 + 0.8 * uRain);
              outgoingLight *= 1.0 - 0.07 * uRain * (1.0 - ri);
            }
            // feines Funkeln: winzige Facetten nah an der Kamera blitzen auf, wenn sie die Sonne treffen
            {
              vec2 sp2 = vSkW.xz * 5.5;
              vec2 tn = vec2(skNoise(sp2 + skOsc(0.9, 0.7)), skNoise(sp2 * 1.3 - skOsc(0.8, 1.0))) - 0.5;
              vec3 Nt = normalize(Nw + vec3(tn.x, 0.0, tn.y) * 0.5);
              float ts = pow(max(dot(reflect(-Vw, Nt), uSunDir), 1e-4), 700.0);
              outgoingLight += uSunCol * ts * 7.0 * uSpecK * uDetail * (1.0 - skFoam) * (1.0 - smoothstep(30.0, 260.0, camD));
              // zweite, feinere Funkelschicht (Sonnenreflexe auf sanften tropischen Wellen)
              vec2 sp3 = vSkW.xz * 12.0;
              vec2 tn2 = vec2(skNoise(sp3 + skOsc(1.1, 0.8)), skNoise(sp3 * 1.2 - skOsc(0.9, 1.2))) - 0.5;
              vec3 Nt2 = normalize(Nw + vec3(tn2.x, 0.0, tn2.y) * 0.7);
              float ts2 = pow(max(dot(reflect(-Vw, Nt2), uSunDir), 1e-4), 1100.0);
              outgoingLight += uSunCol * ts2 * 6.0 * uSpecK * uDetail * (1.0 - skFoam) * (1.0 - smoothstep(20.0, 150.0, camD));
            }
            // Licht im Wasserkörper: gegen die Sonne leuchten dünne Wellenkämme grün-türkis, die Wellenflanken zur Sonne werden heller
            float back = pow(clamp(dot(Vw, -uSunDir) * 0.5 + 0.5, 1e-4, 1.0), 3.0);
            float thin = clamp(skCrestF * 1.6 + 0.2, 0.0, 1.0) * smoothstep(-0.4, 1.6, skD.y);
            float face = clamp(1.0 - abs(Nw.y), 0.0, 1.0);
            // smaragdgrüne Lichtdurchlässigkeit hoher, dünner Kämme (4.4C: ab Hoch, uSss)
            vec3 sssCol = mix(uShallow, vec3(0.12, 0.92, 0.62), 0.55);
            float skHigh = smoothstep(0.2, 1.6, skD.y);
            outgoingLight += sssCol * back * (thin * (0.6 + 0.45 * skHigh) + face * 0.45) * 0.75 * uSpecK * (1.0 - skFoam) * uSss;
            // Wasserkörper je nach Blickwinkel: steil hinabgeschaut dunkler und tiefer, mit Aufhellung durch Streulicht
            outgoingLight += mix(uDeep, uShallow, 0.35) * nl * 0.18 * uSpecK * (1.0 - skFoam) * nv;
            // Wellentäler etwas dunkler – mehr Tiefe zwischen den Wellen
            outgoingLight *= mix(0.84, 1.06, smoothstep(-1.4, 1.2, skD.y));
            // Ferne Wasserflächen gehen in die Horizontfarbe über
            float far = smoothstep(180.0, 1600.0, camD);
            outgoingLight = mix(outgoingLight, uHorizon * 0.82, far * 0.3);
            // Sicherheitsnetz für Handy-Grafikchips: ungültige oder riesige Werte würden vom Leuchteffekt
            // als große schwarze Flecken über das Bild verschmiert
            if (any(isnan(outgoingLight)) || any(isinf(outgoingLight))) outgoingLight = skBase * 0.7;
            outgoingLight = clamp(outgoingLight, 0.0, 24.0);
          }
          #include <opaque_fragment>
          // Alpha 0 markiert Wasser: Kantenerkennung und Umgebungsverdeckung lassen es aus (nur mit Post-Effekten,
          // die das Bild danach wieder undurchsichtig machen – sonst wäre das Wasser auf manchen Handys durchsichtig)
          gl_FragColor.a = uWaterAlpha;`);
    };
    mat.customProgramCacheKey = () => `sk-ocean31-${wakeN}`;
    // Kaskaden-Schatten: auch ein neu gebautes Wassermaterial zählt alle Kaskaden als ein Licht
    ensureCsm(mat);
    return mat;
  }

  /** Auflösung und Kielwasser-Punkte je Grafikstufe */
  setDetail(detail: number, wakeCount: number) {
    this.uniforms.uDetail.value = detail <= 0.5 ? 0 : Math.min(1, detail);
    // Kleinwellen aus der Karte: Mittel eine Lage, ab Hoch zwei; Streuung im Kamm ab Hoch (4.4C)
    this.uniforms.uWaterK.value = detail <= 0.5 ? 0 : detail < 1 ? 0.5 : 1;
    this.uniforms.uSss.value = detail >= 1 ? 1 : 0;
    this.hullMax = detail <= 0.5 ? 2 : detail < 1 ? 3 : MAX_HULL;
    this.mesh.geometry.dispose();
    this.mesh.geometry = buildGrid(Math.max(48, Math.round(160 * detail)));
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
          // Abstand zur echten Küstenlinie (nicht zu einem Kreis) – sonst liegen breite Schaumringe auf dem Wasser
          let edge = s.r;
          if (s.coast && s.base) { let k = 1; const a = Math.atan2(z - s.z, x - s.x); for (const w of s.coast) k += w.a * Math.sin(w.f * a + w.p); edge = s.base * k; }
          const d = Math.max(0, Math.hypot(x - s.x, z - s.z) - edge);
          const k = j * SHORE_RES + i;
          if (d < data[k]) data[k] = Math.min(255, Math.round(d));
        }
      }
    }
    this.shoreData = data;
    const tex = new DataTexture(data, SHORE_RES, SHORE_RES, RedFormat);
    tex.magFilter = tex.minFilter = LinearFilter;
    tex.needsUpdate = true;
    this.uniforms.uShore.value?.dispose();
    this.uniforms.uShore.value = tex;
  }

  private shoreData: Uint8Array | null = null;
  /** Abstand zur nächsten Küste in Metern (0 … 255, 255 = offene See) – dasselbe Feld, das der Shader liest (Brandungsgischt, 4.4C) */
  shoreDist(x: number, z: number): number {
    const d = this.shoreData;
    if (!d) return 255;
    const i = Math.floor(x / (SHORE_SIZE / SHORE_RES) + SHORE_RES / 2), j = Math.floor(z / (SHORE_SIZE / SHORE_RES) + SHORE_RES / 2);
    if (i < 0 || j < 0 || i >= SHORE_RES || j >= SHORE_RES) return 255;
    return d[j * SHORE_RES + i];
  }

  /** Kielwasser-Punkte: x, z, Alter in s, Stärke 0 … 1 */
  setWake(points: { x: number; z: number; age: number; strength: number; dx: number; dz: number; hw: number; spd: number }[]) {
    const arr = this.uniforms.uWake.value, dat = this.uniforms.uWakeD.value;
    for (let i = 0; i < MAX_WAKE; i++) {
      const p = points[i];
      if (p && i < this.wakeCount) { arr[i].set(p.x, p.z, p.age, p.strength); dat[i].set(p.dx, p.dz, p.hw, p.spd); }
      else { arr[i].set(0, 0, 0, 0); dat[i].set(0, 0, 0, 0); }
    }
  }

  /** Schiffe, um die das Wasser schäumt (die ersten MAX_HULL zählen); Tempo 0 … 1, vis blendet weit entfernte aus */
  setHulls(list: { x: number; z: number; h: number; L: number; W: number; speed: number; vis: number; trail?: boolean }[]) {
    const a = this.uniforms.uHull.value, d = this.uniforms.uHullD.value;
    for (let i = 0; i < MAX_HULL; i++) {
      const s = i < this.hullMax ? list[i] : undefined;
      if (s) { a[i].set(s.x, s.z, s.h, s.trail ? 1 : 0); d[i].set(s.L, s.W, s.speed, s.vis); } else d[i].set(0, 0, 0, 0);
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
    return this.trench.depth > 0 ? o.y + trenchCPU(x, z, this.trench) : o.y;
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
