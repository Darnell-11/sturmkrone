import {
  AdditiveBlending,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { markShared } from '../render/dispose';
import { clamp01 } from '../core/mathUtil';

/**
 * Leuchtturm: zwei gegenüberliegende, umlaufende Lichtkegel (je ein weiter Außenkegel und ein schmaler heller Kern), Staub und Gischt im
 * Strahl, eine glühende Fresnel-Linse im Laternenhaus und ein Kern, der mit dem Strahl pulsiert.
 *
 * Regeln für die Strahlen (sonst gibt es schwarze Streifen und Tiefenblöcke): AdditiveBlending, depthWrite aus, DoubleSide, kein Nebel, kein
 * Schattenwurf und keine Kontur; alle Potenzen mit max(x, 1e-4). Der Strahl liegt entlang +x und wird im Vertex-Shader um die Hochachse gedreht.
 */
const U = {
  uTime: { value: 0 },
  /** 0 = aus (klarer Tag), 1 = voll (Abend, Nacht, schlechte Sicht) */
  uBeam: { value: 0 },
};
const groups: Group[] = [];

/** Tageszeit und Wetter: `night` 0 … 1 (Sonnenstand), `weather` 0 … 1 (Nebel, Regen, Sturm). Der Strahl blendet weich ein und aus. */
export function updateBeams(dt: number, night: number, weather = 0) {
  U.uTime.value += dt;
  const want = Math.min(1, Math.max(night, weather * 0.9));
  U.uBeam.value += (want - U.uBeam.value) * Math.min(1, dt * 1.2);
  const on = U.uBeam.value > 0.004;
  for (const g of groups) if (g.visible !== on) g.visible = on;
}

const ROT = /* glsl */ `
  uniform float uTime;
  vec3 skRot(vec3 p) {
    float a = uTime * 0.55;
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }
`;

const mats = new Map<string, ShaderMaterial>();
function beamMat(core: boolean): ShaderMaterial {
  const key = core ? 'core' : 'outer';
  const hit = mats.get(key);
  if (hit) return hit;
  const m = markShared(new ShaderMaterial({
    uniforms: { ...U, uCore: { value: core ? 1 : 0 } },
    vertexShader: /* glsl */ `
      ${ROT}
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vW;
      void main() {
        vec3 p = skRot(position);
        vec3 n = skRot(normal);
        vAlong = uv.y;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * n);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uBeam;
      uniform float uCore;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vW;
      void main() {
        // Fresnel: Kegel von der Seite hell, zum Rand weich durchsichtig (keine harte Kante, kein schwarzer Saum)
        float side = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
        float fres = pow(max(side, 1e-4), mix(1.25, 2.3, uCore));
        // Länge: am Ansatz sanft einblenden (keine Scheibe an der Linse), nach außen kräftig verblassen
        float along = clamp(vAlong, 0.0, 1.0);
        float lenF = pow(max(1.0 - along, 1e-4), mix(1.25, 1.7, uCore)) * smoothstep(0.0, 0.05, along);
        // schwebender Dunst: langsam wandernde Dichte im Strahl
        float dust = 0.82 + 0.18 * sin(dot(vW, vec3(0.37, 0.21, 0.29)) * 1.3 + uTime * 0.55) * sin(vW.x * 0.11 - vW.z * 0.13 + uTime * 0.31);
        float a = fres * lenF * dust * uBeam * mix(0.15, 0.34, uCore);
        if (a < 0.002) discard;
        vec3 col = mix(vec3(1.0, 0.78, 0.42), vec3(1.0, 0.93, 0.74), uCore) * (1.5 + 1.1 * uCore);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false,
  }));
  mats.set(key, m);
  return m;
}

let lensMat: ShaderMaterial | null = null;
/** Fresnel-Linse: ein Ring um die Lampe, der dort am hellsten glüht, wo gerade der Strahl hinaus geht (dreht mit dem Strahl) */
function lensMaterial(): ShaderMaterial {
  if (lensMat) return lensMat;
  lensMat = markShared(new ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying float vY;
      void main() {
        vY = uv.y;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uBeam;
      varying vec3 vN;
      varying float vY;
      void main() {
        float a = uTime * 0.55;
        vec3 dir = vec3(cos(a), 0.0, -sin(a));
        float al = abs(dot(normalize(vN), dir));
        float lit = pow(max(al, 1e-4), 3.5);
        // waagrechte Prismenringe der Linse
        float rings = 0.72 + 0.28 * sin(vY * 60.0);
        float v = (0.18 + lit * 3.2) * rings * uBeam;
        if (v < 0.01) discard;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.5) * v * 2.2, clamp(v, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false,
  }));
  return lensMat;
}

let coreMat: ShaderMaterial | null = null;
/** Glühender Lampenkern, der mit der Helligkeit des Strahls mitgeht */
function coreMaterial(): ShaderMaterial {
  if (coreMat) return coreMat;
  coreMat = markShared(new ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uBeam;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        float v = uBeam * (0.6 + 0.8 * f);
        if (v < 0.01) discard;
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.62) * 5.0 * v, clamp(v, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  }));
  return coreMat;
}

let dustMat: ShaderMaterial | null = null;
function dustMaterial(): ShaderMaterial {
  if (dustMat) return dustMat;
  dustMat = markShared(new ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      ${ROT}
      attribute float aSeed;
      varying float vTw;
      void main() {
        vec3 p = position;
        // Dunst und Gischt treiben langsam im Strahl umher
        p.y += sin(uTime * 0.35 + aSeed * 40.0) * 0.7;
        p.z += cos(uTime * 0.27 + aSeed * 23.0) * 0.7;
        p.x += sin(uTime * 0.2 + aSeed * 11.0) * 1.2;
        vec4 mv = viewMatrix * modelMatrix * vec4(skRot(p), 1.0);
        vTw = 0.55 + 0.45 * sin(uTime * (1.5 + aSeed * 2.5) + aSeed * 90.0);
        gl_PointSize = clamp(90.0 / max(-mv.z, 1.0), 1.5, 5.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uBeam;
      varying float vTw;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vTw * uBeam * 0.85;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.7) * 1.8, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  }));
  return dustMat;
}

/** Leuchtturm-Licht komplett (Ursprung in der Laterne): Lichtkegel, Linse, Kern und Staub im Strahl */
export function lighthouseBeams(length = 140): Group {
  const g = new Group();
  const R = length * 0.05;
  const mkCone = (r1: number) => {
    const geo = new CylinderGeometry(0.35, r1, length, 20, 1, true);
    // Zylinder liegt entlang y: auf die x-Achse legen, Anfang in den Ursprung; uv.y = Länge 0 … 1 aus der x-Position
    geo.rotateZ(-Math.PI / 2);
    geo.translate(length / 2, 0, 0);
    const uv = geo.getAttribute('uv'), pos = geo.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setY(i, clamp01(pos.getX(i) / length));
    return geo;
  };
  const outer = mkCone(R), core = mkCone(R * 0.36);
  for (const flip of [0, Math.PI]) {
    for (const [geo, mat] of [[outer, beamMat(false)], [core, beamMat(true)]] as const) {
      const m = new Mesh(geo, mat);
      m.rotation.y = flip;
      m.frustumCulled = false;
      m.renderOrder = 7;
      m.castShadow = false;
      m.receiveShadow = false;
      m.userData.noOutline = true;
      g.add(m);
    }
  }
  // Linse: offener Zylinder um die Lampe mit Prismenringen, dreht nicht selbst (der Shader lässt nur die zum Strahl gewandte Seite glühen)
  const lens = new Mesh(new CylinderGeometry(1.15, 1.15, 1.7, 36, 12, true), lensMaterial());
  lens.frustumCulled = false; lens.renderOrder = 8; lens.userData.noOutline = true;
  const bulb = new Mesh(new SphereGeometry(0.5, 16, 12), coreMaterial());
  bulb.frustumCulled = false; bulb.renderOrder = 8; bulb.userData.noOutline = true;
  g.add(lens, bulb);
  // Staub und Gischt in beiden Strahlen
  const N = 260, pos: number[] = [], seed: number[] = [];
  let s = 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < N; i++) {
    const t = Math.pow(rnd(), 0.8);
    const x = 3 + t * length * 0.85;
    const rad = (0.35 + (R - 0.35) * (x / length)) * 0.8 * Math.sqrt(rnd());
    const a = rnd() * Math.PI * 2;
    const sgn = i % 2 ? 1 : -1;
    pos.push(x * sgn, Math.cos(a) * rad, Math.sin(a) * rad);
    seed.push(rnd());
  }
  const dg = new BufferGeometry();
  dg.setAttribute('position', new Float32BufferAttribute(pos, 3));
  dg.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
  const dust = new Points(dg, dustMaterial());
  dust.frustumCulled = false; dust.renderOrder = 8; dust.userData.noOutline = true;
  g.add(dust);
  g.visible = U.uBeam.value > 0.004;
  groups.push(g);
  return g;
}
