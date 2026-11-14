import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Shader für Flammen, Funken, Rauch und Lichtkegel des GlowSystems (render/glow.ts).
 *  - Flamme: drei ineinander liegende Zungen-Schalen (außen rot, Mitte orange, Kern gelbweiß) als echte 3D-Körper. Die Eckpunkte
 *    verschiebt ein dreidimensionales FBM-Rauschen, das mit der Höhe stärker wird und nach oben läuft; der Wind biegt die Spitze
 *    quadratisch zur Höhe ab. Im Fragment färbt eine Schwarzkörper-Rampe nach „Temperatur“ (Kern heiß, Spitzen kühl), weiche
 *    Fresnel-Ränder lösen die Silhouette auf (kein Billboard-Rand), die Spitze zerfasert am Rauschen.
 *  - Funken: GPU-Bahn je Funke (Aufstieg, Turbulenz, Wind), ein Zeichenaufruf für alle Feuer.
 *  - Rauch: weiche, im Wind treibende Schwaden, von unten vom Feuer angeleuchtet.
 *  - Lichtkegel: Fresnel-gedämpfter, nach unten geöffneter Kegel unter Laternen und Fackeln (steht nachts, in Nebel und Regen in der Luft).
 */

export const NOISE_GLSL = /* glsl */ `
  float nHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float nVal(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(nHash(i), nHash(i + vec3(1, 0, 0)), f.x), mix(nHash(i + vec3(0, 1, 0)), nHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(nHash(i + vec3(0, 0, 1)), nHash(i + vec3(1, 0, 1)), f.x), mix(nHash(i + vec3(0, 1, 1)), nHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float nFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * nVal(p); p = p * 2.03 + 7.1; a *= 0.5; } return s / 0.875; }
`;

/** Zungenform: unten breit (nach kurzem Anstieg), nach oben spitz; Radius 0 … 0,5 */
const flameRadius = (h: number) => 0.5 * Math.pow(Math.max(0, 1 - h), 0.95) * (0.55 + 0.45 * Math.min(1, h / 0.22) ** 2);

/** Drei Schalen (aLayer 0 = außen, 1 = Mitte, 2 = Kern) um die Y-Achse, Höhe 0 … 1 */
export function flameGeometry(seg = 10, ring = 9): BufferGeometry {
  const pos: number[] = [], nor: number[] = [], lay: number[] = [], idx: number[] = [];
  for (let L = 0; L < 3; L++) {
    const base = pos.length / 3;
    for (let r = 0; r <= ring; r++) {
      const h = r / ring;
      const rad = flameRadius(h);
      const e = 0.02;
      const slope = (flameRadius(Math.min(1, h + e)) - flameRadius(Math.max(0, h - e))) / (Math.min(1, h + e) - Math.max(0, h - e));
      for (let s = 0; s < seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        const c = Math.cos(a), sn = Math.sin(a);
        pos.push(c * rad, h, sn * rad);
        const l = Math.hypot(1, slope);
        nor.push(c / l, -slope / l, sn / l);
        lay.push(L);
      }
    }
    for (let r = 0; r < ring; r++) {
      for (let s = 0; s < seg; s++) {
        const a = base + r * seg + s, b = base + r * seg + (s + 1) % seg, c = a + seg, d = b + seg;
        idx.push(a, c, b, b, c, d);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('aLayer', new Float32BufferAttribute(lay, 1));
  g.setIndex(idx);
  return g;
}

export const FLAME_VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iSize;   // x Breite (m), y Höhe (m), z Helligkeit, w Zufallsphase
  attribute vec3 iCol;
  attribute float aLayer;
  uniform float uTime;
  uniform vec3 uWind;      // x, z = Wind (m/s), y = Böigkeit 0 … 1
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vLocal;
  varying vec3 vCol;
  varying float vI;
  varying float vLayer;
  varying float vSeed;
  ${NOISE_GLSL}
  void main() {
    float layer = aLayer;
    float sx = layer < 0.5 ? 1.0 : (layer < 1.5 ? 0.68 : 0.4);
    float sy = layer < 0.5 ? 1.0 : (layer < 1.5 ? 0.8 : 0.52);
    float h = position.y;
    vec3 lp = vec3(position.x * sx, h * sy, position.z * sx);
    float seed = iSize.w;
    float t = uTime;
    // Rauschen läuft nach oben; je höher, desto wilder; die Schalen laufen leicht versetzt (Zungen lösen sich voneinander)
    vec3 np = vec3(lp.x * 2.6 + seed * 3.0, lp.y * 3.2 - t * (2.3 + layer * 0.5), lp.z * 2.6 + seed * 1.7);
    float n1 = nFbm(np), n2 = nFbm(np * 1.31 + 13.7);
    float amp = 0.04 + 0.55 * lp.y * lp.y;
    lp.x += (n1 - 0.5) * amp * 1.5;
    lp.z += (n2 - 0.5) * amp * 1.5;
    lp.y *= 1.0 + 0.16 * (n1 - 0.5) + 0.05 * sin(t * 11.0 + seed * 5.0);
    // Wind: Spitze lehnt sich zur Seite (quadratisch zur Höhe), in Böen zittert sie; starke Böen drücken die Flamme flacher
    float ws = length(uWind.xz);
    float lean = min(ws * 0.075, 0.95);
    float gust = 1.0 + uWind.y * 0.9 * (nVal(vec3(t * 1.7 + seed, seed * 3.0, 1.0)) - 0.3);
    float bend = lp.y * lp.y * lean * gust;
    vec2 wd = ws > 0.01 ? uWind.xz / ws : vec2(0.0);
    lp.y *= 1.0 - lean * 0.22 * lp.y;
    vec3 wp = iPos + vec3(lp.x * iSize.x * 2.0 + wd.x * bend * iSize.y, lp.y * iSize.y, lp.z * iSize.x * 2.0 + wd.y * bend * iSize.y);
    vLocal = vec3(lp.x, h, lp.z);
    vN = normalize(normal);
    vV = cameraPosition - wp;
    vCol = iCol; vI = iSize.z; vLayer = layer; vSeed = seed;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;

/** Weltnormale der Zunge: die Normale liegt im Objektraum (keine Drehung der Flamme), also direkt zur Kamera vergleichbar */
export const FLAME_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vLocal;
  varying vec3 vCol;
  varying float vI;
  varying float vLayer;
  varying float vSeed;
  ${NOISE_GLSL}
  // Schwarzkörper-Rampe: 0 = tiefrot, 0,35 = Orange, 0,65 = Gelb, 1 = Gelbweiß
  vec3 blackbody(float T) {
    vec3 c = mix(vec3(0.5, 0.04, 0.0), vec3(1.0, 0.32, 0.03), smoothstep(0.0, 0.38, T));
    c = mix(c, vec3(1.0, 0.68, 0.16), smoothstep(0.3, 0.7, T));
    return mix(c, vec3(1.0, 0.95, 0.72), smoothstep(0.68, 1.0, T));
  }
  void main() {
    vec3 v = normalize(vV);
    vec3 n = normalize(vN);
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    // weicher Fresnel-Rand: in der Mitte der Zunge dicht, an der Silhouette durchsichtig
    float fres = pow(ndv, 1.35);
    float h = vLocal.y;
    float tt = uTime;
    float nz = nFbm(vec3(vLocal.x * 3.4 + vSeed, h * 4.2 - tt * 3.1, vLocal.z * 3.4));
    // Spitze zerfasert: je höher, desto mehr Rauschen schneidet ab
    float tip = 1.0 - smoothstep(0.35, 1.0, h + (nz - 0.5) * 0.75);
    float layerK = vLayer < 0.5 ? 0.0 : (vLayer < 1.5 ? 1.0 : 2.0);
    // Temperatur: Kern heiß, außen kühl; oben kühler; Rauschen bringt Unruhe
    float T = 0.1 + 0.27 * layerK + 0.32 * (1.0 - h) + (nz - 0.5) * 0.3;
    T = clamp(T, 0.0, 1.0);
    vec3 col = blackbody(T);
    // Quellfarbe (Fackel, Feuerschale, Laterne) tönt leicht mit
    vec3 tint = vCol / max(max(vCol.r, vCol.g), vCol.b);
    col *= mix(vec3(1.0), tint, 0.4);
    float a = fres * tip * (vLayer < 0.5 ? 0.72 : (vLayer < 1.5 ? 0.78 : 0.8));
    a *= 0.75 + 0.5 * nz;
    a *= clamp(vI, 0.0, 1.0);
    if (a < 0.01) discard;
    // HDR: Kern und Mitte überschreiten die Bloom-Schwelle, die Ränder nicht
    float gain = 0.95 + 0.6 * layerK + 0.55 * smoothstep(0.75, 1.0, T);
    gl_FragColor = vec4(col * gain * a, a);
  }`;

// ---------------------------------------------------------------- Funken

export const EMBERS_PER_FIRE = 14;

/** EMBERS_PER_FIRE Quadrate; aK = Nummer des Funkens (Zufallszahlen daraus), Instanz = ein Feuer */
export function emberGeometry(): BufferGeometry {
  const pos: number[] = [], uv: number[] = [], k: number[] = [], idx: number[] = [];
  for (let i = 0; i < EMBERS_PER_FIRE; i++) {
    const b = pos.length / 3;
    for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) { pos.push(x, y, 0); uv.push(x + 0.5, y + 0.5); k.push(i); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('aK', new Float32BufferAttribute(k, 1));
  g.setIndex(idx);
  return g;
}

export const EMBER_VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iSize;   // x Feuergröße (m), y Menge/Helligkeit, z Zufallsphase, w –
  attribute vec3 iCol;
  attribute float aK;
  uniform float uTime;
  uniform vec3 uWind;
  varying vec2 vUv;
  varying float vA;
  varying float vHeat;
  float h1(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
  void main() {
    float k = aK + iSize.z * 31.0;
    float life = 1.5 + h1(k) * 2.2;
    float ph = fract(uTime / life + h1(k + 3.7));
    float cyc = floor(uTime / life + h1(k + 3.7));
    float r1 = h1(k + cyc * 1.7), r2 = h1(k + 9.1 + cyc * 2.3), r3 = h1(k + 5.3 + cyc * 0.9);
    float s = iSize.x;
    // Start: kleine Scheibe über der Glut; Aufstieg verlangsamt sich; Turbulenz seitlich wird mit der Höhe stärker
    vec3 p = vec3((r1 - 0.5) * 0.4 * s, 0.15 * s, (r2 - 0.5) * 0.4 * s);
    float rise = (1.0 - pow(1.0 - ph, 1.7)) * (2.6 + 3.2 * r3) * s;
    p.y += rise;
    float tw = uTime * (1.6 + r1 * 2.4) + k * 6.3;
    p.x += sin(tw) * 0.28 * ph * s + sin(tw * 2.3 + 1.7) * 0.1 * ph * s;
    p.z += cos(tw * 0.9 + 2.0) * 0.28 * ph * s + cos(tw * 2.1) * 0.1 * ph * s;
    p.xz += uWind.xz * ph * ph * life * 0.45;
    // Anteil sichtbarer Funken: nur ein Teil glimmt gleichzeitig (Menge in iSize.y), der Rest bleibt unsichtbar
    float on = step(r2 * 0.999, iSize.y);
    float fadeIn = smoothstep(0.0, 0.06, ph);
    float fadeOut = pow(max(1.0 - ph, 0.0), 1.3);
    float tw2 = 0.65 + 0.35 * sin(uTime * (14.0 + r3 * 12.0) + k * 3.0);
    vA = on * fadeIn * fadeOut * tw2;
    vHeat = 1.0 - ph;
    vUv = uv;
    vec4 mv = viewMatrix * vec4(iPos + p, 1.0);
    float sz = (0.02 + 0.022 * r3) * (0.7 + 0.5 * s);
    mv.xy += position.xy * sz;
    gl_Position = projectionMatrix * mv;
  }`;

export const EMBER_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying float vA;
  varying float vHeat;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0 || vA < 0.01) discard;
    float g = pow(1.0 - d, 1.6);
    // heiß = gelbweiß, kühl = Orange → Rot
    vec3 col = mix(vec3(1.0, 0.16, 0.02), vec3(1.0, 0.72, 0.28), vHeat);
    col = mix(col, vec3(1.0, 0.95, 0.75), pow(vHeat, 3.0) * g);
    gl_FragColor = vec4(col * (1.8 + 1.6 * vHeat) * g * vA, g * vA);
  }`;

// ---------------------------------------------------------------- Rauch

export const SMOKE_PER_FIRE = 4;

export function smokeGeometry(): BufferGeometry {
  const pos: number[] = [], uv: number[] = [], k: number[] = [], idx: number[] = [];
  for (let i = 0; i < SMOKE_PER_FIRE; i++) {
    const b = pos.length / 3;
    for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) { pos.push(x, y, 0); uv.push(x + 0.5, y + 0.5); k.push(i); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('aK', new Float32BufferAttribute(k, 1));
  g.setIndex(idx);
  return g;
}

export const SMOKE_VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iSize;   // x Feuergröße (m), y Deckkraft, z Zufallsphase, w Rauchmenge
  attribute float aK;
  uniform float uTime;
  uniform vec3 uWind;
  varying vec2 vUv;
  varying float vA;
  varying float vAge;
  varying float vSeed;
  float h1(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
  void main() {
    float k = aK + iSize.z * 17.0;
    float life = 3.8 + h1(k) * 2.4;
    float ph = fract(uTime / life + aK / ${SMOKE_PER_FIRE}.0 + h1(k + 1.3) * 0.2);
    float cyc = floor(uTime / life + aK / ${SMOKE_PER_FIRE}.0 + h1(k + 1.3) * 0.2);
    float r1 = h1(k + cyc * 1.9), r2 = h1(k + 4.7 + cyc * 2.7);
    float s = iSize.x;
    vec3 p = vec3((r1 - 0.5) * 0.3 * s, 0.6 * s, (r2 - 0.5) * 0.3 * s);
    p.y += ph * (2.2 + 1.6 * r1) * s * 1.6;
    p.x += sin(uTime * 0.7 + k * 5.1) * 0.35 * ph * s;
    p.z += cos(uTime * 0.6 + k * 3.7) * 0.35 * ph * s;
    p.xz += uWind.xz * ph * life * 0.55;
    float size = s * (0.5 + ph * 2.2);
    vA = iSize.y * iSize.w * smoothstep(0.0, 0.12, ph) * pow(max(1.0 - ph, 0.0), 1.4);
    vAge = ph; vSeed = k;
    vUv = uv;
    vec4 mv = viewMatrix * vec4(iPos + p, 1.0);
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
  }`;

export const SMOKE_FRAG = /* glsl */ `
  uniform vec3 uLit;
  uniform vec3 uShade;
  uniform float uTime;
  varying vec2 vUv;
  varying float vA;
  varying float vAge;
  varying float vSeed;
  ${NOISE_GLSL}
  void main() {
    vec2 q = vUv - 0.5;
    float d = length(q) * 2.0;
    if (d > 1.0 || vA < 0.004) discard;
    float nz = nFbm(vec3(q * 3.2 + vSeed, uTime * 0.25 + vSeed));
    float a = smoothstep(1.0, 0.25, d) * (0.4 + 0.9 * nz) * vA;
    // Licht des Himmels von oben, nach unten das Feuer: unten warm, solange der Rauch jung ist
    float up = q.y * 2.0;
    vec3 col = mix(uShade, uLit, smoothstep(-0.8, 0.8, up + (nz - 0.5)));
    col += vec3(1.5, 0.55, 0.14) * (1.0 - smoothstep(-0.2, 0.9, up + 0.4)) * (1.0 - vAge * 1.4) * 0.55;
    gl_FragColor = vec4(col * 0.55, a);
  }`;

// ---------------------------------------------------------------- Lichtkegel

/** Nach unten geöffneter Kegel (Spitze oben im Ursprung, Länge 1, Radius unten 0,5), offen, mit Normalen für den Fresnel */
export function coneGeometry(seg = 18): BufferGeometry {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const slope = 0.5;
  const ln = Math.hypot(1, slope);
  for (let r = 0; r <= 1; r++) {
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      pos.push(c * 0.5 * r, -r, sn * 0.5 * r);
      nor.push(c / ln, slope / ln, sn / ln);
    }
  }
  for (let s = 0; s < seg; s++) idx.push(s, seg + s, seg + (s + 1) % seg, s, seg + (s + 1) % seg, (s + 1) % seg);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

export const CONE_VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iSize;   // x Länge (m), y Weite (Radius unten = 0,5 · y), z Helligkeit, w Zufallsphase
  attribute vec3 iCol;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vCol;
  varying float vI;
  varying float vT;
  varying float vSeed;
  void main() {
    float t = -position.y;       // 0 an der Lampe, 1 unten
    vec3 wp = iPos + vec3(position.x * iSize.y, position.y * iSize.x, position.z * iSize.y);
    vN = normalize(normal);
    vV = cameraPosition - wp;
    vCol = iCol; vI = iSize.z; vT = t; vSeed = iSize.w;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;

export const CONE_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vCol;
  varying float vI;
  varying float vT;
  varying float vSeed;
  ${NOISE_GLSL}
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float ndv = abs(dot(n, v));
    // Mitte des Kegels dicht, Silhouette weich (Fresnel-gedämpft); nach unten und zur Lampe hin ausblenden
    float fres = pow(ndv, 2.2);
    float along = smoothstep(0.0, 0.18, vT) * pow(max(1.0 - vT, 0.0), 1.4);
    float dust = 0.75 + 0.5 * nFbm(vec3(vT * 6.0 + vSeed, uTime * 0.2, vSeed * 2.0));
    float a = fres * along * dust * vI;
    if (a < 0.003) discard;
    vec3 c = vCol / max(max(vCol.r, vCol.g), vCol.b);
    gl_FragColor = vec4(c * a * 1.2, a);
  }`;
