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
import { WATER_ALPHA } from '../render/outline';
/** Weiche Lichtrampe fürs Wasser: keine harten Hell-Dunkel-Bänder auf den Wellen */
const SOFT_RAMP = (() => {
  const n = 32;
  const d = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const t = i / (n - 1); d[i] = Math.round(255 * (0.62 + 0.38 * Math.pow(t, 0.8))); }
  const t = new DataTexture(d, n, 1, RedFormat);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
})();

const G = 9.81;
const SHORE_SIZE = WORLD_RADIUS * 2.1;
const SHORE_RES = 1024;
const MAX_WAKE = 32;

interface WaveConst { k: number; c: number; dx: number; dz: number; amp: number; h: number; len: number }

const WAVE_CONST: WaveConst[] = WAVES.map((w) => {
  const k = (Math.PI * 2) / w.length;
  const a = (w.dir * Math.PI) / 180;
  return { k, c: Math.sqrt(G / k), dx: Math.cos(a), dz: Math.sin(a), amp: w.amp, h: w.steep / (k * 5), len: w.length };
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
  };
  private material: MeshToonMaterial;
  private wakeCount = 16;
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
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uOrigin;
          uniform sampler2D uShore;
          uniform float uShoreSize;
          varying vec3 vSkW;
          varying float vCrest;
          ${GERSTNER_GLSL}`)
        .replace('#include <beginnormal_vertex>', `
          vec2 skP = position.xz + uOrigin.xz;
          vec3 skN; float skCrest;
          vec3 skDisp = skGerstner(skP, skN, skCrest);
          vec3 objectNormal = skN;`)
        .replace('#include <begin_vertex>', `
          // Im Flachwasser vor der Küste werden die Wellen flacher (sonst stechen Kämme durch den Strand)
          float skShoreD = texture2D(uShore, skP / uShoreSize + 0.5).r * 255.0;
          vec3 transformed = position + skDisp * (0.2 + 0.8 * smoothstep(2.0, 40.0, skShoreD));
          vCrest = skCrest;
          vSkW = transformed + uOrigin;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          #define WAKE_N ${wakeN}
          ${GERSTNER_GLSL}
          uniform sampler2D uShore;
          uniform float uShoreSize;
          uniform float uWorldR;
          uniform vec3 uDeep, uShallow, uFoam, uZenith, uHorizon, uSunDir, uSunCol;
          uniform float uSpecK, uWindDir, uWindK, uDetail, uWaterAlpha;
          uniform vec4 uWake[${MAX_WAKE}];
          varying vec3 vSkW;
          varying float vCrest;
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
            for (int i = 0; i < 10; i++) {
              float fi = float(i);
              // Handy-Stufe (Mid) rechnet nur die größeren Oktaven
              if (fi > 1.0 + 16.0 * (uDetail - 0.5)) break;
              float ang = uWindDir + sin(fi * 2.39996) * 1.35;
              float len = 7.0 * pow(0.74, fi);
              float k = 6.2831853 / len;
              vec2 d = vec2(sin(ang), cos(ang));
              float ph = k * dot(d, rp) - sqrt(9.81 * k) * uTime + fi * 1.7;
              float sh = exp(sin(ph) - 1.0);
              float fd = 1.0 - smoothstep(len * 10.0, len * 38.0, camD);
              rn -= d * (sh * cos(ph) * 0.095 * fd);
            }
            // etwas Rauschen dazu, damit kein Muster sichtbar wird
            vec2 t1 = uTime * vec2(0.55, 0.21);
            float e = 0.35;
            float r0 = skNoise(rp * 0.9 + t1);
            float rx = skNoise((rp + vec2(e, 0.0)) * 0.9 + t1);
            float rz = skNoise((rp + vec2(0.0, e)) * 0.9 + t1);
            rn += vec2(r0 - rx, r0 - rz) * 0.25 * (1.0 - smoothstep(20.0, 120.0, camD));
            skNf = normalize(skNf + vec3(rn.x, 0.0, rn.y) * uDetail * wk);
          }
          float sd = texture2D(uShore, vSkW.xz / uShoreSize + 0.5).r * 255.0;
          float shallow = 1.0 - smoothstep(0.0, 48.0, sd);
          // Tiefes Wasser bleibt satt und dunkel; nur Wellenberge und Küsten werden heller
          vec3 skBase = mix(uDeep, uShallow, clamp(shallow * 0.92 + smoothstep(-0.6, 1.8, skD.y) * 0.13, 0.0, 1.0));
          // Lichtspiele am Grund im Flachwasser (Kaustiken)
          {
            vec2 cp = vSkW.xz * 0.38;
            float c1 = abs(skNoise(cp + vec2(uTime * 0.21, uTime * 0.13)) - skNoise(cp * 1.7 - vec2(uTime * 0.17, -uTime * 0.11)));
            float caust = pow(max(1.0 - clamp(c1 * 2.2, 0.0, 1.0), 1e-4), 5.0);
            skBase += uShallow * caust * shallow * shallow * 0.45 * uSpecK * (1.0 - smoothstep(60.0, 220.0, camD));
          }
          // Gischt auf Wellenkämmen, aufgebrochen durch Rauschen
          float nz = skNoise(vSkW.xz * 0.35 + uTime * 0.3) * 0.6 + skNoise(vSkW.xz * 1.3 - uTime * 0.5) * 0.4;
          float crestT = 0.57 - 0.09 * clamp(uWaveScale - 1.0, 0.0, 2.0);
          float skFoam = smoothstep(crestT, crestT + 0.2, skCrestF + (nz - 0.5) * 0.18);
          // Schaumkronen als zerfasernde Spitze mit Löchern statt flacher weißer Flecken
          float lace2 = skNoise(vSkW.xz * 3.3 + vec2(uTime * 0.3, 0.0)) * 0.6 + skNoise(vSkW.xz * 8.0 - uTime * 0.2) * 0.4;
          skFoam *= smoothstep(0.3, 0.62, lace2 + skFoam * 0.2) * 0.9;
          // Brandungsringe und Küstenlinie
          // anrollende Brandungswellen: schmale, aufgerissene Schaumlinien, die zur Küste hin dichter werden
          float bands = smoothstep(0.9, 0.995, sin(sd * 0.45 - uTime * 1.6 + nz * 1.2)) * (1.0 - smoothstep(3.0, 22.0, sd));
          float coast = 1.0 - smoothstep(0.0, 4.5, sd + (nz - 0.5) * 3.0);
          // blasiger Küstenschaum: dichte Kante, nach außen zerfasernde Spitze statt glatter Fläche
          float bub = skNoise(vSkW.xz * 2.2 + vec2(uTime * 0.25, -uTime * 0.18)) * 0.6 + skNoise(vSkW.xz * 5.5 - uTime * 0.3) * 0.4;
          float coastFoam = coast * smoothstep(0.62 - coast * 0.5, 0.75 - coast * 0.45, bub);
          skFoam = max(skFoam, max(bands * smoothstep(0.35, 0.6, bub) * 0.75, coastFoam * 0.9));
          // Schaumstreifen in Windrichtung (je stärker der Wind, desto mehr), wie auf echter offener See
          {
            vec2 wd = vec2(sin(uWindDir), cos(uWindDir));
            vec2 wp = vec2(dot(vSkW.xz, vec2(wd.y, -wd.x)), dot(vSkW.xz, wd));
            float lines = smoothstep(0.72, 0.94, skNoise(vec2(wp.x * 0.45, wp.y * 0.025 - uTime * 0.35)));
            float skPatch = smoothstep(0.5, 0.85, skNoise(vSkW.xz * 0.012 + uTime * 0.02));
            float sk = lines * skPatch * smoothstep(0.25, 0.9, uWindK) * (1.0 - smoothstep(120.0, 600.0, camD)) * (1.0 - shallow);
            skFoam = max(skFoam, sk * 0.45);
          }
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
            // Weiche, aufgerissene Schaumspur statt Ringen
            float core = 1.0 - smoothstep(r * 0.2, r, d);
            float life = w.w * (1.0 - clamp(w.z / 7.0, 0.0, 1.0));
            // feine Schaumspitze: nur dort Schaum, wo das feine Rauschen hoch ist – keine vollen Scheiben
            float lace = skNoise(vSkW.xz * 1.9 + vec2(uTime * 0.4, 0.0)) * 0.6 + skNoise(vSkW.xz * 4.3 - uTime * 0.3) * 0.4;
            skFoam = max(skFoam, smoothstep(0.62 - core * 0.18, 0.72 - core * 0.18, lace) * core * 0.8 * life);
          }
          skFoam = clamp(skFoam, 0.0, 1.0);
          diffuseColor.rgb = mix(skBase, uFoam, skFoam * 0.92);`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          normal = normalize((viewMatrix * vec4(skNf, 0.0)).xyz);`)
        .replace('#include <opaque_fragment>', `
          {
            // Wasser streut wenig Licht zurück: der diffuse Anteil bleibt gedämpft (Schaum ausgenommen),
            // die Helligkeit kommt aus Himmelsspiegelung und Sonnenglanz – so bleibt tiefes Wasser satt blau
            outgoingLight *= mix(0.6, 1.0, skFoam);
            vec3 Nw = normalize(inverseTransformDirection(normal, viewMatrix));
            vec3 Vw = normalize(cameraPosition - vSkW);
            float fr = 0.03 + 0.97 * pow(max(1.0 - clamp(dot(Nw, Vw), 0.0, 1.0), 1e-4), 4.0);
            fr *= (1.0 - skFoam);
            vec3 R = reflect(-Vw, Nw);
            R.y = abs(R.y);
            vec3 skyC = mix(uHorizon, uZenith, clamp(R.y * 1.8, 0.0, 1.0));
            outgoingLight = mix(outgoingLight, skyC, fr * 0.7);
            float sdot = max(dot(R, uSunDir), 1e-4);
            float sp = pow(sdot, 260.0);
            outgoingLight += uSunCol * step(0.28, sp) * 1.8 * uSpecK * (1.0 - skFoam);
            // Sonnenbahn: breiter, warmer Glanz mit funkelnden Glitzerpunkten bis zum Horizont
            float sheen = pow(sdot, 18.0);
            outgoingLight += uSunCol * sheen * 0.22 * uSpecK * (1.0 - skFoam);
            float glint = smoothstep(0.9 - 0.04 * uWindK, 0.97, skNoise(vSkW.xz * 2.6 + vec2(uTime * 2.1, -uTime * 1.7))) * pow(sdot, 120.0);
            outgoingLight += uSunCol * glint * 3.0 * uSpecK * uDetail * (1.0 - skFoam);
            // Licht scheint durch die Wellenkämme (türkis), Funkeln im Sonnenglanz
            // dünne Wellenkämme gegen die Sonne leuchten grün-türkis (Licht geht durchs Wasser)
            float back = pow(clamp(dot(Vw, -uSunDir) * 0.5 + 0.5, 1e-4, 1.0), 3.0);
            float thin = clamp(skCrestF * 1.6 + 0.2, 0.0, 1.0) * smoothstep(-0.4, 1.6, skD.y);
            float face = clamp(1.0 - abs(Nw.y), 0.0, 1.0);
            vec3 sssCol = mix(uShallow, vec3(0.25, 0.85, 0.7), 0.35);
            outgoingLight += sssCol * back * (thin * 0.5 + face * 0.6) * 0.75 * uSpecK * (1.0 - skFoam);
            // Wellentäler etwas dunkler – mehr Tiefe zwischen den Wellen
            outgoingLight *= mix(0.86, 1.04, smoothstep(-1.4, 1.2, skD.y));
            float tw = step(0.93, skNoise(vSkW.xz * 1.7 + vec2(uTime * 1.3, -uTime))) * pow(max(dot(R, uSunDir), 1e-4), 6.0);
            outgoingLight += uSunCol * tw * 1.1 * uSpecK * (1.0 - skFoam);
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
    mat.customProgramCacheKey = () => `sk-ocean5-${wakeN}`;
    return mat;
  }

  /** Auflösung und Kielwasser-Punkte je Grafikstufe */
  setDetail(detail: number, wakeCount: number) {
    this.uniforms.uDetail.value = detail <= 0.5 ? 0 : Math.min(1, detail);
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
