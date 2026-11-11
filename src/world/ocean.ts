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
import { WAVES, WORLD_RADIUS, WORLD_SCALE } from '../data/world';
import { WATER_ALPHA } from '../render/outline';
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
const SHORE_SIZE = WORLD_RADIUS * 2.1;
// Auflösung wächst mit der Welt: eine Zelle bleibt rund 4 m groß (sonst würden Brandung und Flachwasser grob)
const SHORE_RES = 1024 * WORLD_SCALE;
const MAX_WAKE = 32;
/** Schiffe, deren Rumpfschaum und Bugwelle das Wasser zeichnet (das eigene und die nächsten) */
const MAX_HULL = 6;
/** Wellen laufen mit einem Bruchteil der echten Tiefwasser-Geschwindigkeit: im Spiel wirkt das Meer sonst wie ein reißender Fluss */
const WAVE_SPEED = 0.42;

interface WaveConst { k: number; c: number; dx: number; dz: number; amp: number; h: number; len: number }

const WAVE_CONST: WaveConst[] = WAVES.map((w) => {
  const k = (Math.PI * 2) / w.length;
  const a = (w.dir * Math.PI) / 180;
  return { k, c: Math.sqrt(G / k) * WAVE_SPEED, dx: Math.cos(a), dz: Math.sin(a), amp: w.amp, h: w.steep / (k * 5), len: w.length };
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
      H += amp * 1.25 * bow * (1.0 - smoothstep(hl * 0.5, hl * 1.2, ahead));
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
  // Die Spur selbst verformt das Wasser nicht: an den Grenzen zwischen Spurabschnitten springt eine Höhe und erzeugt Haarlinien.
  float skDispH(vec2 p) { return skHullH(p); }
`; }

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
    uShallow: { value: new Color(0x33c4d2) },
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
    uWake: { value: Array.from({ length: MAX_WAKE }, () => new Vector4()) },
    /** Spurpunkte: Richtung x, z, Halbbreite, Tempo in m/s */
    uWakeD: { value: Array.from({ length: MAX_WAKE }, () => new Vector4()) },
    /** Rümpfe: x, z, Kurs, 0 und Länge, Breite, Tempo 0 … 1, Sichtbarkeit */
    uHull: { value: Array.from({ length: MAX_HULL }, () => new Vector4()) },
    uHullD: { value: Array.from({ length: MAX_HULL }, () => new Vector4()) },
  };
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
          uniform vec3 uDeep, uShallow, uFoam, uZenith, uHorizon, uSunDir, uSunCol;
          uniform float uSpecK, uWindDir, uWindK, uDetail, uWaterAlpha;
          ${hullGlsl(wakeN)}
          varying vec3 vSkW;
          varying float vCrest;
          vec2 skOsc(float a, float b) { return vec2(sin(uTime * a), cos(uTime * b)) * 2.0; }
          float skHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
          float skNoise(vec2 p) {
            vec2 i = floor(p); vec2 fr = fract(p); fr = fr * fr * (3.0 - 2.0 * fr);
            return mix(mix(skHash(i), skHash(i + vec2(1, 0)), fr.x), mix(skHash(i + vec2(0, 1)), skHash(i + vec2(1, 1)), fr.x), fr.y);
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
            for (int i = 0; i < 18; i++) {
              float fi = float(i);
              // Handy-Stufe (Mid) rechnet nur die ersten Wellen
              if (fi > 4.0 + 28.0 * (uDetail - 0.5)) break;
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
          float shallow = 1.0 - smoothstep(0.0, 48.0, sd);
          // Tiefes Wasser bleibt satt und dunkel; nur Wellenberge und Küsten werden heller
          vec3 skBase = mix(uDeep, uShallow, clamp(shallow * 0.92 + smoothstep(-0.6, 1.8, skD.y) * 0.13, 0.0, 1.0));
          // Großflächige Farbfelder: Strömungen und Plankton färben das Meer mal türkisgrün, mal tiefblau (langsam, ohne Wandern)
          {
            float pt = skNoise(vSkW.xz * 0.0035 + skOsc(0.01, 0.013) * 0.3) * 0.65 + skNoise(vSkW.xz * 0.012 - skOsc(0.02, 0.017) * 0.3) * 0.35;
            skBase = mix(skBase, skBase * vec3(0.8, 1.1, 1.12) + vec3(0.0, 0.015, 0.02), smoothstep(0.4, 0.78, pt) * 0.55 * (1.0 - shallow));
            skBase = mix(skBase, skBase * vec3(0.88, 0.94, 1.12), (1.0 - smoothstep(0.15, 0.55, pt)) * 0.35 * (1.0 - shallow));
          }
          // Lichtspiele am Grund im Flachwasser (Kaustiken)
          {
            vec2 cp = vSkW.xz * 0.38;
            float c1 = abs(skNoise(cp + skOsc(0.3, 0.25)) - skNoise(cp * 1.7 - skOsc(0.21, 0.27)));
            float caust = pow(max(1.0 - clamp(c1 * 2.2, 0.0, 1.0), 1e-4), 5.0);
            skBase += uShallow * caust * shallow * shallow * 0.45 * uSpecK * (1.0 - smoothstep(60.0, 220.0, camD));
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
          float bands = smoothstep(0.9, 0.995, sin(sd * 0.45 - uTime * 0.9 + nz * 1.2)) * (1.0 - smoothstep(3.0, 22.0, sd));
          float coast = 1.0 - smoothstep(0.0, 4.5, sd + (nz - 0.5) * 3.0);
          // blasiger Küstenschaum: dichte Kante, nach außen zerfasernde Spitze statt glatter Fläche
          float bub = skNoise(vSkW.xz * 2.2 + skOsc(0.25, 0.18)) * 0.6 + skNoise(vSkW.xz * 5.5 - skOsc(0.31, 0.22)) * 0.4;
          float coastFoam = coast * smoothstep(0.62 - coast * 0.5, 0.75 - coast * 0.45, bub);
          skFoam = max(skFoam, max(bands * smoothstep(0.35, 0.6, bub) * 0.75, coastFoam * 0.9));
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
            float rough = clamp(0.055 + 0.05 * uWindK + 0.02 * clamp(uWaveScale - 1.0, 0.0, 2.0) + 0.22 * smoothstep(40.0, 1400.0, camD), 0.04, 0.5);
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
            // feines Funkeln: winzige Facetten nah an der Kamera blitzen auf, wenn sie die Sonne treffen
            {
              vec2 sp2 = vSkW.xz * 5.5;
              vec2 tn = vec2(skNoise(sp2 + skOsc(0.9, 0.7)), skNoise(sp2 * 1.3 - skOsc(0.8, 1.0))) - 0.5;
              vec3 Nt = normalize(Nw + vec3(tn.x, 0.0, tn.y) * 0.5);
              float ts = pow(max(dot(reflect(-Vw, Nt), uSunDir), 1e-4), 700.0);
              outgoingLight += uSunCol * ts * 5.0 * uSpecK * uDetail * (1.0 - skFoam) * (1.0 - smoothstep(30.0, 260.0, camD));
            }
            // Licht im Wasserkörper: gegen die Sonne leuchten dünne Wellenkämme grün-türkis, die Wellenflanken zur Sonne werden heller
            float back = pow(clamp(dot(Vw, -uSunDir) * 0.5 + 0.5, 1e-4, 1.0), 3.0);
            float thin = clamp(skCrestF * 1.6 + 0.2, 0.0, 1.0) * smoothstep(-0.4, 1.6, skD.y);
            float face = clamp(1.0 - abs(Nw.y), 0.0, 1.0);
            vec3 sssCol = mix(uShallow, vec3(0.2, 0.9, 0.72), 0.45);
            outgoingLight += sssCol * back * (thin * 0.65 + face * 0.6) * 0.9 * uSpecK * (1.0 - skFoam);
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
    mat.customProgramCacheKey = () => `sk-ocean26-${wakeN}`;
    // Kaskaden-Schatten: auch ein neu gebautes Wassermaterial zählt alle Kaskaden als ein Licht
    ensureCsm(mat);
    return mat;
  }

  /** Auflösung und Kielwasser-Punkte je Grafikstufe */
  setDetail(detail: number, wakeCount: number) {
    this.uniforms.uDetail.value = detail <= 0.5 ? 0 : Math.min(1, detail);
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
    const tex = new DataTexture(data, SHORE_RES, SHORE_RES, RedFormat);
    tex.magFilter = tex.minFilter = LinearFilter;
    tex.needsUpdate = true;
    this.uniforms.uShore.value?.dispose();
    this.uniforms.uShore.value = tex;
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
