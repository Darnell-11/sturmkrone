import { texDetail } from '../render/texDetail';
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
  float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 c = mix(uHorizon, uZenith, pow(max(h, 1e-4), 0.45));
    // Leuchten um die Sonne / Abendrot am Horizont
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    c += uGlow * pow(max(s, 1e-4), 6.0) * (1.0 - h) * 0.9;
    c += uSunCol * (pow(max(s, 1e-4), 64.0) * 0.5 + smoothstep(0.9993, 0.9996, s) * 8.0) * uSunVis;
    // Atmosphäre: Vorwärtsstreuung (Mie, Henyey-Greenstein) – heller Hof in der Lichtfarbe um die Sonne,
    // bei Bewölkung schwächer; dazu ein Dunstband, das am Horizont nahtlos in den Nebel übergeht
    float mieG = 0.76;
    float mie = (1.0 - mieG * mieG) / pow(max(1.0 + mieG * mieG - 2.0 * mieG * s, 1e-3), 1.5);
    c += uSunCol * mie * 0.012 * uSunVis * (1.0 - 0.7 * uGrey) * (0.4 + 0.6 * (1.0 - h));
    c = mix(c, uHorizon, exp(-max(d.y, 0.0) * 14.0) * 0.45);
    // Mond mit Hof
    float m = max(dot(d, normalize(uMoonDir)), 0.0);
    // Mond: Scheibe, weicher Hof und weiter Schimmer (Dunst im Mondlicht)
    c += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.99945, m) * 3.4 + pow(max(m, 1e-4), 180.0) * 0.35 + pow(max(m, 1e-4), 26.0) * 0.10) * uMoonVis;
    // Abendglut: breites warmes Band am Horizont in Richtung der tiefen Sonne
    c += uGlow * exp(-h * 9.0) * pow(max(s, 1e-4), 2.2) * 0.55 * uSunVis * (1.0 - h);
    // Sterne
    if (uStars > 0.01) {
      vec2 g = vec2(atan(d.z, d.x) * 90.0, asin(clamp(d.y, -1.0, 1.0)) * 90.0);
      vec2 cell = floor(g);
      float r = h21(cell);
      vec2 o = vec2(h21(cell + 7.1), h21(cell + 3.7)) * 0.6 + 0.2;
      float dd = length(fract(g) - o);
      float star = step(0.955, r) * (1.0 - smoothstep(0.04, 0.15, dd)) * (0.55 + 0.45 * sin(uTime * 2.5 + r * 80.0));
      // je Stern eigene Farbe (bläulich bis bernsteinfarben) und wenige besonders helle
      vec3 sc = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.65), h21(cell + 1.3));
      float bright = 1.0 + 1.6 * step(0.992, r);
      c += sc * star * bright * uStars * smoothstep(0.02, 0.25, d.y) * (1.0 - uGrey);
      // feinerer Sternenstaub in einem zweiten Raster
      vec2 g2 = g * 2.7; vec2 cell2 = floor(g2);
      float r2 = h21(cell2 + 19.0);
      float dd2 = length(fract(g2) - (vec2(h21(cell2 + 2.1), h21(cell2 + 5.9)) * 0.6 + 0.2));
      c += vec3(0.8, 0.88, 1.0) * step(0.93, r2) * (1.0 - smoothstep(0.03, 0.12, dd2)) * 0.5 * uStars * smoothstep(0.05, 0.3, d.y) * (1.0 - uGrey);
      // Milchstraße: schräges Band aus weichem Sternenlicht mit dunklen Staubfetzen
      vec3 bn = normalize(vec3(0.35, 0.8, -0.5));
      float band = exp(-pow(dot(d, bn) * 3.2, 2.0));
      float cloudN = h21(floor(g * 0.35)) * 0.5 + h21(floor(g * 0.8) + 3.0) * 0.5;
      c += vec3(0.32, 0.36, 0.55) * band * (0.35 + cloudN) * 0.22 * uStars * smoothstep(0.05, 0.4, d.y) * (1.0 - uGrey);
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
  // Kantenlänge folgt der Texturstufe (Ultra: hochauflösend gemalte Wolken)
  const S = Math.round(256 * Math.min(2, texDetail.scale));
  const c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const ctx = c.getContext('2d')!;
  const rnd = seeded(91);
  // Gemalte Kumuluswolken im ernsten Anime-Stil: viele weiche Ballen, aufgefranste Ränder,
  // eine sanft auslaufende Basis und ein fließender Übergang von Licht zu Schatten (statt harter Kreise)
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * S;
    const oy = Math.floor(k / 2) * S;
    const puffs: [number, number, number][] = [];
    const n = 16 + Math.floor(rnd() * 10);
    const base = oy + S * 0.7;
    const tall = 0.8 + rnd() * 0.6;
    for (let i = 0; i < n; i++) {
      const t = rnd();
      const x = ox + S * (0.12 + t * 0.76);
      const hump = Math.sin(t * Math.PI);
      const r = S * (0.05 + hump * 0.11 * tall + rnd() * 0.05);
      puffs.push([x, base - r * 0.4 - hump * S * 0.18 * tall * rnd(), r]);
    }
    // kleine Fetzen am Rand
    for (let i = 0; i < 10; i++) puffs.push([ox + S * (0.08 + rnd() * 0.84), base - S * (0.02 + rnd() * 0.12), S * (0.025 + rnd() * 0.03)]);
    const cov = document.createElement('canvas');
    cov.width = cov.height = S;
    const cc = cov.getContext('2d')!;
    // Deckung: weiche Ballen
    for (const [x, y, r] of puffs) {
      const g = cc.createRadialGradient(x - ox, y - oy, r * 0.55, x - ox, y - oy, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      cc.fillStyle = g;
      cc.beginPath(); cc.arc(x - ox, y - oy, r, 0, Math.PI * 2); cc.fill();
    }
    // Licht von oben links: weiche, nach oben versetzte Flecken nur innerhalb der Deckung
    cc.globalCompositeOperation = 'source-atop';
    for (const [x, y, r] of puffs) {
      const lx = x - ox - r * 0.2, ly = y - oy - r * 0.32;
      const g = cc.createRadialGradient(lx, ly, 0, lx, ly, r * 0.95);
      g.addColorStop(0, 'rgba(255,0,0,1)');
      g.addColorStop(0.6, 'rgba(200,0,0,0.85)');
      g.addColorStop(1, 'rgba(90,0,0,0)');
      cc.fillStyle = g;
      cc.beginPath(); cc.arc(lx, ly, r * 0.95, 0, Math.PI * 2); cc.fill();
    }
    // Basis sanft ausblenden statt hart abzuschneiden
    cc.globalCompositeOperation = 'destination-in';
    const fade = cc.createLinearGradient(0, S * 0.52, 0, S * 0.76);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    cc.fillStyle = fade;
    cc.fillRect(0, 0, S, S);
    ctx.drawImage(cov, ox, oy);
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
    // Wolken jenseits der Kamera-Fernebene nicht abschneiden, sondern knapp davor legen
    gl_Position.z = min(gl_Position.z, gl_Position.w * 0.999999);
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
    // weicher, aber noch klar gezeichneter Übergang (Anime-Wolke statt Zweifarb-Aufkleber)
    vec3 c = mix(shade, lit, smoothstep(0.22, 0.78, t.r));
    c = mix(c, uHorizon, vFar * 0.65);
    c += vec3(0.8, 0.85, 1.0) * uFlash * 0.8;
    gl_FragColor = vec4(c, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const MAX_CLOUDS = 120;
/** Abstand der Sonnenscheibe zur Kamera – innerhalb der Kamera-Fernebene (CAMERA_PLANES.far), sonst würde sie abgeschnitten */
const SUN_DIST = 900;
/** Scheinbare Größe wie bisher (28 m Radius in 1500 m Abstand) */
const SUN_RADIUS = (28 / 1500) * SUN_DIST;

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
      new SphereGeometry(SUN_RADIUS, 24, 12),
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
    this.sunMesh.position.copy(camPos).addScaledVector(sunDir, SUN_DIST);
    this.sunMesh.visible = sunVisible > 0.05;
    (this.sunMesh.material as MeshBasicMaterial).opacity = sunVisible;
    this.cloudU.uCenter.value.copy(camPos);
  }
}
