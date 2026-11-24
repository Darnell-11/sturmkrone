import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  type Scene,
} from 'three';
import { fogUniforms } from '../render/atmosphere';
import { markShared } from '../render/dispose';

/**
 * Gischtfahnen auf rauer See (4.4B): bei Sturm und starkem Seegang reißt der Wind Gischt von den hohen Wellenkämmen und trägt sie als
 * weiche Schleier davon. Keine runden Partikel (das sah aus wie weiße Kugelhaufen), sondern große, ausgefranste, halbdurchsichtige Bahnen,
 * die sich in Flugrichtung strecken, beim Davonwehen wachsen und ausdünnen.
 *
 * Ein Zeichenaufruf für alle (instanziert, Lage und Bewegung je Instanz als Attribut, Ausrichtung zur Kamera im Shader), alle Felder fest
 * angelegt – im Spiel entsteht nichts Neues. Licht und Farbe setzt `SeaWorld` je Bild (Horizont, Sonne).
 */
const MAX = 240;

const VERT_PARS = /* glsl */ `
  attribute vec4 aP;    // Mitte (xyz) und Größe (m)
  attribute vec4 aV;    // Flugrichtung (xyz, m/s) und Deckkraft
  attribute float aSeed;
  varying vec2 vSprUv;
  varying float vSprA;
  varying float vSprSeed;
`;
const VERT_MAIN = /* glsl */ `
  vSprUv = uv;
  vSprA = aV.w;
  vSprSeed = aSeed;
  vec4 mvPosition = viewMatrix * vec4(aP.xyz, 1.0);
  // in Flugrichtung gestreckt (Bildebene), quer dazu schmaler: eine Fahne statt eines Balls
  vec2 vv = (viewMatrix * vec4(aV.xyz, 0.0)).xy;
  float sp = length(vv);
  vec2 dir = sp > 1e-3 ? vv / sp : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float stretch = 1.0 + min(sp * 0.16, 2.2);
  mvPosition.xy += dir * position.x * aP.w * stretch + perp * position.y * aP.w * 0.62;
  gl_Position = projectionMatrix * mvPosition;
`;
const FRAG_PARS = /* glsl */ `
  varying vec2 vSprUv;
  varying float vSprA;
  varying float vSprSeed;
  float sprH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float sprN(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(sprH(i), sprH(i + vec2(1.0, 0.0)), f.x), mix(sprH(i + vec2(0.0, 1.0)), sprH(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
const FRAG_ALPHA = /* glsl */ `
  {
    // weicher, zur Fahne gestreckter Fleck mit ausgefranstem Rand und Löchern (Gischt ist Nebel aus Tröpfchen, keine Fläche)
    vec2 q = vSprUv * 2.0 - 1.0;
    float r = length(q * vec2(1.0, 1.25));
    float body = 1.0 - smoothstep(0.25, 1.0, r);
    vec2 np = vSprUv * vec2(3.2, 2.2) + vSprSeed * 17.0;
    float n = sprN(np) * 0.55 + sprN(np * 2.3 + 4.1) * 0.3 + sprN(np * 5.1 + 9.7) * 0.15;
    float a = body * smoothstep(0.28, 0.72, n + body * 0.25) * vSprA;
    if (a < 0.01) discard;
    diffuseColor.a *= a;
  }
`;

export class SeaSpray {
  readonly mesh: Mesh;
  /** Licht der Gischt (Horizont und Sonne, setzt SeaWorld je Bild) */
  readonly color: Color;
  private readonly p: Float32Array;
  private readonly v: Float32Array;
  private readonly aP: InstancedBufferAttribute;
  private readonly aV: InstancedBufferAttribute;
  private readonly age = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly size0 = new Float32Array(MAX);
  private readonly alpha0 = new Float32Array(MAX);
  private next = 0;
  /** Anteil der Grafikstufe (Teilchenfaktor) */
  scale = 1;

  constructor(scene: Scene) {
    const quad = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    this.p = new Float32Array(MAX * 4);
    this.v = new Float32Array(MAX * 4);
    this.aP = new InstancedBufferAttribute(this.p, 4).setUsage(DynamicDrawUsage);
    this.aV = new InstancedBufferAttribute(this.v, 4).setUsage(DynamicDrawUsage);
    const seed = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) seed[i] = (i * 0.618034) % 1;
    geo.setAttribute('aP', this.aP);
    geo.setAttribute('aV', this.aV);
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 1));
    geo.instanceCount = MAX;
    const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: NormalBlending, fog: true });
    this.color = mat.color;
    mat.onBeforeCompile = (sh) => {
      fogUniforms(sh);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_PARS)
        .replace('#include <project_vertex>', VERT_MAIN);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
        .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n' + FRAG_ALPHA);
    };
    mat.customProgramCacheKey = () => 'sk-seaspray1';
    this.mesh = new Mesh(geo, markShared(mat));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'seaSpray';
    scene.add(this.mesh);
  }

  /** Eine Gischtfahne von einem Wellenkamm (x, y, z) mit Windgeschwindigkeit (wx, wz) */
  emit(x: number, y: number, z: number, wx: number, wz: number, rough: number) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    const r = Math.random();
    this.p[i * 4] = x; this.p[i * 4 + 1] = y; this.p[i * 4 + 2] = z;
    this.v[i * 4] = wx * (0.8 + 0.4 * r); this.v[i * 4 + 1] = 1.2 + 2.2 * rough * Math.random(); this.v[i * 4 + 2] = wz * (0.8 + 0.4 * r);
    this.age[i] = 0;
    this.life[i] = 1.6 + 1.4 * Math.random();
    this.size0[i] = 1.6 + 2.6 * rough * (0.6 + 0.4 * Math.random());
    this.alpha0[i] = 0.5 + 0.35 * rough;
  }

  /** Je Bild: fliegen lassen, wachsen, ausdünnen */
  update(dt: number) {
    const p = this.p, v = this.v;
    const drag = Math.exp(-dt * 0.6);
    for (let i = 0; i < MAX; i++) {
      const L = this.life[i];
      if (L <= 0) continue;
      const a = (this.age[i] += dt);
      if (a >= L) { this.life[i] = 0; v[i * 4 + 3] = 0; p[i * 4 + 3] = 0; continue; }
      const t = a / L;
      v[i * 4 + 1] -= 2.4 * dt;
      v[i * 4] *= drag; v[i * 4 + 2] *= drag;
      p[i * 4] += v[i * 4] * dt; p[i * 4 + 1] += v[i * 4 + 1] * dt; p[i * 4 + 2] += v[i * 4 + 2] * dt;
      p[i * 4 + 3] = this.size0[i] * (0.55 + 1.3 * t);
      // schnell sichtbar, langsam ausdünnend
      v[i * 4 + 3] = this.alpha0[i] * Math.min(1, t * 7) * (1 - t) * (1 - t);
    }
    this.aP.needsUpdate = true;
    this.aV.needsUpdate = true;
  }
}
