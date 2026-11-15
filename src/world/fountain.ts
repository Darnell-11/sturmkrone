import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  Points,
  RingGeometry,
  ShaderMaterial,
  Vector3,
  type Material,
} from 'three';
import { markShared } from '../render/dispose';
import { toon } from '../render/toon';
import { archGroup } from './envModels';

/**
 * Brunnen auf dem Marktplatz von Ankerglück: der Stein kommt aus Blender (tools/blender/build_brunnen.py), das Wasser baut dieser Code nach
 * denselben Maßen: spiegelnde, bewegte Wasserflächen mit Wellenringen unter jedem Strahl, acht Wasserbögen aus den Löwenköpfen, dünne Schleier an
 * den Schalenrändern und tanzende Tropfen (alles im Grafikchip, ohne CPU-Arbeit je Bild).
 */
const T = { uTime: { value: 0 } };
export function updateFountains(dt: number) { T.uTime.value += dt; }

/** Maße des Modells (siehe Kopf von build_brunnen.py) */
const POOL = { y: 0.84, r: 2.86, hole: 0.56 };
const BOWL1 = { y: 2.5, r: 1.64, hole: 0.3, rim: 1.84, rimY: 2.66 };
const BOWL2 = { y: 3.62, r: 0.94, hole: 0.2, rim: 1.06, rimY: 3.78 };
const BOWL3 = { y: 4.34, r: 0.44, rim: 0.52, rimY: 4.42 };
const SPOUT = { r: 3.0, y: 0.98, n: 8 };

const stoneMat = (role: string): Material => {
  const c = role === 'stonelight' ? '#CFC7B6' : role === 'moss' ? '#5E7A4A' : role === 'bronze' ? '#8C7048' : role === 'gold' ? '#E2BC55' : '#A39B8D';
  return toon({ color: c, vertexColors: true });
};

/** Wasserfläche (undurchsichtig): Tiefenfarbe, Wellenringe um Aufprallpunkte, Glanzlichter, Himmelsspiegelung, Schaum am Rand */
function poolMaterial(src: [number, number, number][], r: number, hole: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: T.uTime,
      uSrc: { value: Array.from({ length: 8 }, (_, i) => new Vector3(...(src[i] ?? [0, 0, 0]))) },
      uSrcN: { value: src.length },
      uR: { value: r },
      uHole: { value: hole },
    },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      varying vec3 vW;
      void main() {
        vP = position.xz;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSrc[8];
      uniform int uSrcN;
      uniform float uR;
      uniform float uHole;
      varying vec2 vP;
      varying vec3 vW;
      float skRipple(vec2 p) {
        float h = 0.0;
        for (int i = 0; i < 8; i++) {
          if (i >= uSrcN) break;
          vec2 d = p - uSrc[i].xy;
          float r = length(d);
          float ph = r * 11.0 - uTime * 3.6 + uSrc[i].z;
          h += sin(ph) * exp(-r * 0.85) * 0.5;
        }
        // leichte Grundbewegung
        h += 0.12 * sin(p.x * 3.1 + uTime * 0.9) * sin(p.y * 2.7 - uTime * 0.7);
        return h;
      }
      void main() {
        float r = length(vP);
        if (r < uHole) discard;
        float e = 0.02;
        float h0 = skRipple(vP);
        float hx = skRipple(vP + vec2(e, 0.0)) - h0;
        float hy = skRipple(vP + vec2(0.0, e)) - h0;
        vec3 n = normalize(vec3(-hx / e * 0.07, 1.0, -hy / e * 0.07));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
        // Tiefenfarbe: außen heller und türkis (flach), innen dunkler
        float t = clamp(r / uR, 0.0, 1.0);
        vec3 deep = vec3(0.04, 0.27, 0.35), shallow = vec3(0.16, 0.62, 0.68);
        vec3 col = mix(deep, shallow, smoothstep(0.1, 1.0, t) * 0.8 + 0.1);
        // Lichtmuster (Brechung auf dem Beckenboden)
        float c1 = sin(vP.x * 9.0 + h0 * 6.0 + uTime * 1.1) * sin(vP.y * 8.0 - h0 * 5.0 - uTime * 0.9);
        col += vec3(0.05, 0.12, 0.12) * smoothstep(0.35, 0.95, c1);
        // Himmel im Wasser
        col = mix(col, vec3(0.66, 0.82, 0.96), fres * 0.6);
        // Glanzlicht der Sonne
        vec3 L = normalize(vec3(0.45, 0.8, 0.35));
        float sp = pow(max(dot(reflect(-L, n), V), 0.0), 90.0);
        col += vec3(1.0, 0.96, 0.84) * sp * 1.6;
        // Schaum am Beckenrand und an der Säule
        float edge = smoothstep(uR - 0.2, uR, r) + (uHole > 0.0 ? smoothstep(uHole + 0.22, uHole, r) : 0.0);
        float foam = edge * (0.5 + 0.5 * sin(atan(vP.y, vP.x) * 24.0 + uTime * 1.5 + r * 30.0));
        col = mix(col, vec3(0.92, 0.97, 1.0), foam * 0.55);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    fog: false,
  });
}

function poolMesh(y: number, r: number, hole: number, src: [number, number, number][]): Mesh {
  const geo = hole > 0 ? new RingGeometry(hole, r, 56, 1) : new CircleGeometry(r, 56);
  geo.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geo, poolMaterial(src, r, hole));
  mesh.position.y = y;
  mesh.userData.noOutline = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

let flowMat: ShaderMaterial | null = null;
/** fließendes Wasser (Bögen, Schleier): helle, entlang der Strömung laufende Streifen, an den Enden weich */
function flowMaterial(): ShaderMaterial {
  if (flowMat) return flowMat;
  flowMat = markShared(new ShaderMaterial({
    uniforms: { uTime: T.uTime },
    vertexShader: /* glsl */ `
      attribute float aU;
      attribute float aSeed;
      varying float vU; varying float vSeed; varying vec3 vN; varying vec3 vV;
      void main() {
        vU = aU; vSeed = aSeed;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying float vU; varying float vSeed; varying vec3 vN; varying vec3 vV;
      void main() {
        float s = 0.7 + 0.3 * sin(vU * 46.0 - uTime * 15.0 + vSeed * 6.28);
        s *= 0.8 + 0.2 * sin(vU * 17.0 - uTime * 8.0 + vSeed * 11.0);
        float side = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
        float ends = smoothstep(0.0, 0.06, vU) * (1.0 - smoothstep(0.92, 1.0, vU));
        float a = clamp(s * pow(max(side, 1e-4), 0.8) * ends * 0.55, 0.0, 1.0);
        if (a < 0.02) discard;
        gl_FragColor = vec4(vec3(0.7, 0.88, 1.0) * (0.8 + 0.5 * s), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false,
  }));
  return flowMat;
}

/** Röhre (6 Seiten) entlang einer Kurve, u läuft 0 … 1 entlang der Strömung */
function tubeAlong(pts: Vector3[], radii: number[], seed: number, into: { pos: number[]; nor: number[]; u: number[]; sd: number[]; idx: number[] }) {
  const seg = 6, base = into.pos.length / 3;
  const ref = new Vector3(0, 0, 1);
  for (let k = 0; k < pts.length; k++) {
    const t = pts[Math.min(k + 1, pts.length - 1)].clone().sub(pts[Math.max(k - 1, 0)]).normalize();
    let nn = ref.clone().cross(t);
    if (nn.lengthSq() < 1e-6) nn = new Vector3(1, 0, 0).cross(t);
    nn.normalize();
    const bb = t.clone().cross(nn).normalize();
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const dir = nn.clone().multiplyScalar(c).addScaledVector(bb, s);
      const p = pts[k].clone().addScaledVector(dir, radii[k]);
      into.pos.push(p.x, p.y, p.z); into.nor.push(dir.x, dir.y, dir.z); into.u.push(k / (pts.length - 1)); into.sd.push(seed);
    }
  }
  for (let k = 0; k < pts.length - 1; k++) for (let i = 0; i < seg; i++) {
    const a = base + k * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
    into.idx.push(a, c, b, b, c, d);
  }
}

function flowMesh(): Mesh {
  const into = { pos: [] as number[], nor: [] as number[], u: [] as number[], sd: [] as number[], idx: [] as number[] };
  // acht Wasserbögen: aus den Löwenköpfen im Bogen zum Beckenwasser
  for (let k = 0; k < SPOUT.n; k++) {
    const a = (k + 0.5) * 2 * Math.PI / SPOUT.n, c = Math.cos(a), s = Math.sin(a);
    const pts: Vector3[] = [], rad: number[] = [];
    const vh = 1.35, vy = 0.55, g = 9.8;
    const tEnd = (vy + Math.sqrt(vy * vy + 2 * g * (SPOUT.y - POOL.y))) / g;
    for (let i = 0; i <= 18; i++) {
      const t = (i / 18) * tEnd;
      const rr = SPOUT.r - 0.12 - vh * t, yy = SPOUT.y + vy * t - 0.5 * g * t * t;
      pts.push(new Vector3(c * rr, yy, s * rr));
      rad.push(0.02 + 0.008 * (i / 18));
    }
    tubeAlong(pts, rad, k * 0.37, into);
  }
  // Schleier: dünne Wasserstränge, die über die Schalenränder in die nächste Fläche fallen
  const sheets: [number, number, number, number, number][] = [[BOWL1.rim - 0.02, BOWL1.rimY, POOL.y, 14, 0.07], [BOWL2.rim - 0.02, BOWL2.rimY, BOWL1.y, 10, 0.055], [BOWL3.rim - 0.02, BOWL3.rimY, BOWL2.y, 8, 0.045]];
  sheets.forEach(([r, y0, y1, n, w], si) => {
    for (let k = 0; k < n; k++) {
      const a = (k + 0.5) * 2 * Math.PI / n + si * 0.3, c = Math.cos(a), s = Math.sin(a);
      const pts: Vector3[] = [], rad: number[] = [];
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        // erst über den Rand hinaus, dann senkrecht fallen
        const rr = r + 0.1 * Math.min(1, u * 5) ;
        pts.push(new Vector3(c * rr, y0 - (y0 - y1) * u * u * (0.6 + 0.4 * u) - 0.04 * Math.min(1, u * 6), s * rr));
        rad.push(w * 0.62 * (0.6 + 0.4 * u));
      }
      tubeAlong(pts, rad, si * 1.7 + k * 0.53, into);
    }
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(into.pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(into.nor, 3));
  geo.setAttribute('aU', new Float32BufferAttribute(into.u, 1));
  geo.setAttribute('aSeed', new Float32BufferAttribute(into.sd, 1));
  geo.setIndex(into.idx);
  const m = new Mesh(geo, flowMaterial());
  m.frustumCulled = false; m.renderOrder = 6; m.castShadow = false; m.userData.noOutline = true;
  return m;
}

let dropMat: ShaderMaterial | null = null;
/** Tropfen und Gischt: Wurfparabeln im Vertex-Shader (Ursprung, Anfangsgeschwindigkeit, Lebensdauer je Punkt) */
function dropMaterial(): ShaderMaterial {
  if (dropMat) return dropMat;
  dropMat = markShared(new ShaderMaterial({
    uniforms: { uTime: T.uTime },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec3 aVel;
      attribute vec4 aInfo; // x: Lebensdauer, y: Phase, z: Bodenhöhe, w: Größe
      varying float vA;
      void main() {
        float life = aInfo.x;
        float t = mod(uTime + aInfo.y * life, life);
        vec3 p = position + aVel * t;
        p.y -= 4.9 * t * t;
        float ground = aInfo.z;
        vA = (p.y > ground ? 1.0 : 0.0) * smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(life * 0.8, life, t));
        p.y = max(p.y, ground);
        vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(aInfo.w * 120.0 / max(-mv.z, 1.0), 1.0, 7.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, d) * vA * 0.9;
        if (a < 0.02) discard;
        gl_FragColor = vec4(vec3(0.85, 0.95, 1.0) * 1.3, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  }));
  return dropMat;
}

function dropPoints(): Points {
  const pos: number[] = [], vel: number[] = [], info: number[] = [];
  let s = 19;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const add = (ox: number, oy: number, oz: number, vx: number, vy: number, vz: number, life: number, ground: number, size: number) => {
    pos.push(ox, oy, oz); vel.push(vx, vy, vz); info.push(life, rnd(), ground, size);
  };
  // Spitze: Tropfen springen aus der obersten Schale in die zweite
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, v = 0.35 + rnd() * 0.5;
    add(0, BOWL3.y + 0.05, 0, Math.cos(a) * v, 1.2 + rnd() * 1.4, Math.sin(a) * v, 0.9 + rnd() * 0.5, BOWL2.y, 0.05 + rnd() * 0.04);
  }
  // Einschläge der acht Bögen: Gischt im Beckenwasser
  for (let k = 0; k < SPOUT.n; k++) {
    const a = (k + 0.5) * 2 * Math.PI / SPOUT.n, c = Math.cos(a), s2 = Math.sin(a);
    const vh = 1.35, vy = 0.55, g = 9.8;
    const tEnd = (vy + Math.sqrt(vy * vy + 2 * g * (SPOUT.y - POOL.y))) / g;
    const rr = SPOUT.r - 0.12 - vh * tEnd;
    for (let i = 0; i < 9; i++) {
      const b = rnd() * Math.PI * 2, v = 0.2 + rnd() * 0.4;
      add(c * rr, POOL.y + 0.02, s2 * rr, Math.cos(b) * v, 0.9 + rnd() * 0.8, Math.sin(b) * v, 0.5 + rnd() * 0.3, POOL.y, 0.04 + rnd() * 0.03);
    }
  }
  // Aufprall der Schleier von Schale 1 im Becken und von Schale 2 in Schale 1
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2;
    add(Math.cos(a) * (BOWL1.rim + 0.05), POOL.y + 0.02, Math.sin(a) * (BOWL1.rim + 0.05), Math.cos(a) * 0.3, 0.7 + rnd() * 0.7, Math.sin(a) * 0.3, 0.5 + rnd() * 0.3, POOL.y, 0.04 + rnd() * 0.03);
  }
  for (let i = 0; i < 20; i++) {
    const a = rnd() * Math.PI * 2;
    add(Math.cos(a) * (BOWL2.rim + 0.05), BOWL1.y + 0.02, Math.sin(a) * (BOWL2.rim + 0.05), Math.cos(a) * 0.25, 0.6 + rnd() * 0.6, Math.sin(a) * 0.25, 0.45 + rnd() * 0.25, BOWL1.y, 0.035 + rnd() * 0.03);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('aVel', new Float32BufferAttribute(vel, 3));
  geo.setAttribute('aInfo', new Float32BufferAttribute(info, 4));
  const pts = new Points(geo, dropMaterial());
  pts.frustumCulled = false; pts.renderOrder = 7; pts.userData.noOutline = true;
  return pts;
}

/** Fertiger Brunnen (Ursprung auf dem Boden in der Mitte); null, wenn das Modell fehlt */
export function buildFountain(): Group | null {
  const stone = archGroup('brunnen', stoneMat);
  if (!stone) return null;
  const g = new Group();
  g.add(stone);
  // Wellenquellen: die acht Einschläge im Becken (x, z, Phase), in den Schalen die Mitte
  const src: [number, number, number][] = [];
  for (let k = 0; k < SPOUT.n; k++) {
    const a = (k + 0.5) * 2 * Math.PI / SPOUT.n;
    src.push([Math.cos(a) * 2.2, Math.sin(a) * 2.2, k * 0.8]);
  }
  g.add(poolMesh(POOL.y, POOL.r, POOL.hole, src));
  g.add(poolMesh(BOWL1.y, BOWL1.r, BOWL1.hole, [[0, 0, 0]]));
  g.add(poolMesh(BOWL2.y, BOWL2.r, BOWL2.hole, [[0, 0, 1.3]]));
  g.add(poolMesh(BOWL3.y, BOWL3.r, 0, [[0, 0, 2.1]]));
  g.add(flowMesh(), dropPoints());
  g.traverse((o) => { o.castShadow = o.userData.noOutline ? false : o.castShadow; });
  return g;
}

