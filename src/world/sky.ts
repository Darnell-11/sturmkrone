import {
  BackSide,
  CanvasTexture,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  type Scene,
} from 'three';
import { seeded } from './waves';

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith, uHorizon, uSunDir, uSunCol, uMoonDir, uGlow;
  uniform float uStars, uTime, uFlash, uSunVis, uMoonVis, uGrey;
  varying vec3 vDir;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 c = mix(uHorizon, uZenith, pow(h, 0.45));
    // Leuchten um die Sonne / Abendrot am Horizont
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    c += uGlow * pow(s, 6.0) * (1.0 - h) * 0.9;
    c += uSunCol * (pow(s, 64.0) * 0.5 + smoothstep(0.9993, 0.9996, s) * 8.0) * uSunVis;
    // Mond mit Hof
    float m = max(dot(d, normalize(uMoonDir)), 0.0);
    c += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99955, 0.9997, m) * 3.0 + pow(m, 200.0) * 0.25) * uMoonVis;
    // Sterne
    if (uStars > 0.01) {
      vec2 g = vec2(atan(d.z, d.x) * 90.0, asin(clamp(d.y, -1.0, 1.0)) * 90.0);
      vec2 cell = floor(g);
      float r = h21(cell);
      vec2 o = vec2(h21(cell + 7.1), h21(cell + 3.7)) * 0.6 + 0.2;
      float dd = length(fract(g) - o);
      float star = step(0.975, r) * (1.0 - smoothstep(0.04, 0.14, dd)) * (0.6 + 0.4 * sin(uTime * 2.5 + r * 80.0));
      c += vec3(star) * uStars * smoothstep(0.02, 0.25, d.y) * (1.0 - uGrey);
    }
    // Unter dem Horizont: der Abgrund hinter dem Weltrand
    if (d.y < 0.0) c = mix(uHorizon, uHorizon * 0.25, clamp(-d.y * 3.0, 0.0, 1.0));
    c += vec3(0.75, 0.8, 1.0) * uFlash;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Erzeugt 4 gemalte Wolkenformen (2 × 2 Atlas). Rot = beleuchtet, Alpha = Deckung. */
function cloudAtlas(): CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const ctx = c.getContext('2d')!;
  const rnd = seeded(91);
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * S;
    const oy = Math.floor(k / 2) * S;
    const puffs: [number, number, number][] = [];
    const n = 7 + Math.floor(rnd() * 5);
    const base = oy + S * 0.68;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = ox + S * (0.14 + t * 0.72) + (rnd() - 0.5) * 18;
      const r = S * (0.09 + Math.sin(t * Math.PI) * 0.14 + rnd() * 0.05);
      puffs.push([x, base - r * (0.45 + rnd() * 0.4), r]);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, S, S * 0.72);
    ctx.clip();
    // Schattenseite (Deckung)
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    // Lichtseite: kleiner und nach oben versetzt, nur innerhalb der Deckung
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,0,0,1)';
    for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.arc(x - r * 0.12, y - r * 0.22, r * 0.86, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  const tex = new CanvasTexture(c);
  tex.premultiplyAlpha = false;
  return tex;
}

const CLOUD_VERT = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec4 aData; // Atlas-Feld, Größe, Zufall, Höhenschicht
  uniform vec3 uCenter;
  uniform float uTime, uRange;
  uniform vec2 uWind;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vFar;
  varying float vRnd;
  uniform float uCover;
  void main() {
    vec3 wp = aOffset;
    wp.xz += uWind * uTime * (0.6 + aData.z * 0.8);
    wp.xz = mod(wp.xz - uCenter.xz + uRange, 2.0 * uRange) - uRange + uCenter.xz;
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    mv.xy += position.xy * vec2(aData.y, aData.y * 0.62);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = min(gl_Position.z, gl_Position.w * 0.99999);
    vUv = uv * 0.5 + vec2(mod(aData.x, 2.0), 1.0 - floor(aData.x / 2.0)) * 0.5;
    float dist = length(wp.xz - uCenter.xz);
    vFar = smoothstep(uRange * 0.35, uRange, dist);
    vAlpha = (1.0 - smoothstep(uRange * 0.8, uRange, dist)) * smoothstep(aData.z - 0.08, aData.z, uCover);
    vRnd = aData.z;
  }
`;

const CLOUD_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uLit, uShade, uHorizon;
  uniform float uDark, uFlash, uOpacity;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vFar;
  varying float vRnd;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vAlpha * uOpacity;
    if (a < 0.01) discard;
    vec3 lit = mix(uLit, uShade * 0.55, uDark * 0.85);
    vec3 shade = mix(uShade, uShade * 0.25, uDark);
    vec3 c = mix(shade, lit, smoothstep(0.35, 0.65, t.r));
    c = mix(c, uHorizon, vFar * 0.65);
    c += vec3(0.8, 0.85, 1.0) * uFlash * 0.8;
    gl_FragColor = vec4(c, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const MAX_CLOUDS = 120;

export class Sky {
  readonly dome: Mesh;
  readonly sunMesh: Mesh;
  readonly clouds: InstancedMesh;
  readonly skyU = {
    uZenith: { value: new Color() },
    uHorizon: { value: new Color() },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunCol: { value: new Color() },
    uMoonDir: { value: new Vector3(0, -1, 0) },
    uGlow: { value: new Color() },
    uStars: { value: 0 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uSunVis: { value: 1 },
    uMoonVis: { value: 0 },
    uGrey: { value: 0 },
  };
  readonly cloudU = {
    uMap: { value: cloudAtlas() },
    uCenter: { value: new Vector3() },
    uTime: { value: 0 },
    uRange: { value: 1400 },
    uWind: { value: new Vector2(3, 1) },
    uCover: { value: 0.4 },
    uLit: { value: new Color(1, 1, 1) },
    uShade: { value: new Color(0.7, 0.75, 0.85) },
    uHorizon: { value: new Color() },
    uDark: { value: 0 },
    uFlash: { value: 0 },
    uOpacity: { value: 1 },
  };

  constructor(scene: Scene) {
    this.dome = new Mesh(
      new SphereGeometry(1000, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.skyU,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }`,
        fragmentShader: SKY_FRAG,
      }),
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Sichtbare Sonnenscheibe – auch Lichtquelle für die Sonnenstrahlen (Hoch/Maximal)
    this.sunMesh = new Mesh(
      new SphereGeometry(28, 24, 12),
      new MeshBasicMaterial({ color: new Color(6, 5.2, 4), transparent: true, depthWrite: false, fog: false }),
    );
    this.sunMesh.frustumCulled = false;
    this.sunMesh.renderOrder = -9;
    scene.add(this.sunMesh);

    const geo = new PlaneGeometry(1, 1);
    const rnd = seeded(5);
    const offs = new Float32Array(MAX_CLOUDS * 3);
    const data = new Float32Array(MAX_CLOUDS * 4);
    for (let i = 0; i < MAX_CLOUDS; i++) {
      const layer = i % 3;
      offs[i * 3] = (rnd() - 0.5) * 2800;
      offs[i * 3 + 1] = [260, 190, 140][layer] + rnd() * 40;
      offs[i * 3 + 2] = (rnd() - 0.5) * 2800;
      data[i * 4] = Math.floor(rnd() * 4);
      data[i * 4 + 1] = [260, 190, 150][layer] * (0.7 + rnd() * 0.7);
      data[i * 4 + 2] = rnd();
      data[i * 4 + 3] = layer;
    }
    geo.setAttribute('aOffset', new InstancedBufferAttribute(offs, 3));
    geo.setAttribute('aData', new InstancedBufferAttribute(data, 4));
    this.clouds = new InstancedMesh(
      geo,
      new ShaderMaterial({ uniforms: this.cloudU, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false, fog: false }),
      MAX_CLOUDS,
    );
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -8;
    scene.add(this.clouds);
  }

  setCloudCount(n: number) { this.clouds.count = Math.min(MAX_CLOUDS, n); }

  /** Jeden Frame: Himmel und Sonne um die Kamera zentrieren */
  follow(camPos: Vector3, sunDir: Vector3, sunVisible: number) {
    this.dome.position.copy(camPos);
    this.sunMesh.position.copy(camPos).addScaledVector(sunDir, 1500);
    this.sunMesh.visible = sunVisible > 0.05;
    (this.sunMesh.material as MeshBasicMaterial).opacity = sunVisible;
    this.cloudU.uCenter.value.copy(camPos);
  }
}
