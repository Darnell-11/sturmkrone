import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { markShared } from './dispose';

/**
 * Lichtschein und Flammen: jede Lichtquelle der Welt (Lagerfeuer, Feuerkörbe, Fackeln, Laternen an Land, auf Schiffen, an
 * Figuren) meldet sich als Emitter an. Das System zeichnet für die nächsten Emitter, in drei Instanz-Netzen mit je einem
 * Zeichenaufruf:
 *  - Flamme: Zunge aus Rauschen mit Kern, Rand und flackernder Spitze (steht senkrecht, dreht sich nur um die Hochachse zur Kamera)
 *  - Lichthof: weicher Schein um Flamme oder Glas, nachts auch aus der Ferne sichtbar, tagsüber kaum
 *  - Bodenlicht: warmer Lichtfleck auf dem Boden unter Lampen und Feuern (wirkt wie Lichtwurf, ohne echtes Licht zu kosten)
 * Echte Punktlichter bekommen nur die allernächsten (LampPool). Alles andere ist Schein, damit die Bildrate hoch bleibt.
 */
export type GlowKind = 'fire' | 'lamp' | 'torch' | 'window';

/** Beschreibung einer Lichtquelle an einem Bauwerk oder einer Insel (Koordinaten im jeweiligen Raum); gy = Boden unter der Quelle (Höhe über dem Aufstellpunkt) */
export interface GlowSpec { kind: GlowKind; x: number; y: number; z: number; gy?: number | null; size?: number; pool?: number; /** Versatz des Bodenlichts (Objektraum), z. B. vor einem Fenster */ px?: number; pz?: number; glint?: boolean }

/** Lichtquelle in Inselkoordinaten mit absoluter Bodenhöhe (null = kein Bodenlicht) */
export interface GlowPlaced { kind: GlowKind; x: number; y: number; z: number; ground: number | null; size?: number; pool?: number; pdx?: number; pdz?: number; glint?: boolean }

export interface GlowEmitter {
  x: number; y: number; z: number;
  kind: GlowKind;
  /** Größe: Flammenhöhe bzw. Haloradius in Metern */
  size: number;
  /** Farbe (HDR, Werte über 1 blühen im Bloom) */
  color: Color;
  /** Boden unter der Quelle (Weltkoordinate y) für das Bodenlicht; null = keins */
  ground: number | null;
  /** Radius des Bodenlichts in Metern */
  pool: number;
  /** Versatz des Bodenlichts zur Quelle (Weltachsen), etwa vor einem Fenster */
  pdx: number; pdz: number;
  /** Spiegelt sich als Lichtstreifen im Wasser (Schiffe, Bojen, Stege) */
  glint: boolean;
  /** Zufallsphase */
  seed: number;
  /** Objekt, dessen Weltposition gilt (Schiffe, Figuren); sonst feste Koordinaten */
  obj?: Object3D | null;
  /** Versatz zur Objektposition (Weltachsen) */
  oy?: number;
  /** Besitzer (Schiff, Figur) zum gemeinsamen Entfernen */
  owner?: unknown;
  /** Wie stark die Quelle am Tag leuchtet 0 … 1 (Feuer 1, Laternen 0) */
  day: number;
  /** Ein- und Ausschalten (0 … 1) für Quellen, die nur zeitweise brennen */
  on: number;
}

const FIRE_COL = new Color(3.4, 1.35, 0.32);
const LAMP_COL = new Color(3.2, 1.9, 0.75);
const TORCH_COL = new Color(3.0, 1.2, 0.3);
const WINDOW_COL = new Color(2.4, 1.55, 0.6);
let seedCounter = 1;

/** Emitter anlegen (noch nicht angemeldet) */
export function makeEmitter(kind: GlowKind, x: number, y: number, z: number, o: Partial<GlowEmitter> = {}): GlowEmitter {
  const base = kind === 'fire' ? FIRE_COL : kind === 'torch' ? TORCH_COL : kind === 'window' ? WINDOW_COL : LAMP_COL;
  return {
    x, y, z, kind,
    size: o.size ?? (kind === 'fire' ? 1.1 : kind === 'torch' ? 0.55 : kind === 'window' ? 0.55 : 0.9),
    color: o.color ?? base.clone(),
    ground: o.ground ?? null,
    pool: o.pool ?? (kind === 'fire' ? 8 : kind === 'torch' ? 4.5 : kind === 'window' ? 2.8 : 5.5),
    pdx: o.pdx ?? 0, pdz: o.pdz ?? 0, glint: o.glint ?? false,
    seed: (seedCounter++ * 12.9898) % 100,
    obj: o.obj ?? null, oy: o.oy ?? 0, owner: o.owner,
    day: o.day ?? (kind === 'fire' ? 1 : kind === 'torch' ? 0.9 : 0),
    on: o.on ?? 1,
  };
}

/** Gemeinsame Anmeldestelle: jedes Bauteil meldet seine Lichter hier an, das GlowSystem der Welt zeichnet sie */
class GlowHub {
  readonly list: GlowEmitter[] = [];
  add(e: GlowEmitter): GlowEmitter { this.list.push(e); return e; }
  remove(e: GlowEmitter) { const i = this.list.indexOf(e); if (i >= 0) { this.list[i] = this.list[this.list.length - 1]; this.list.pop(); } }
  removeOwner(owner: unknown) {
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].owner === owner) { this.list[i] = this.list[this.list.length - 1]; this.list.pop(); }
  }
  clear() { this.list.length = 0; }
}
export const glowHub = new GlowHub();

const VERT_HEAD = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iSize;   // x Breite, y Höhe/Radius, z Helligkeit, w Zufallsphase
  attribute vec3 iCol;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vI;
  varying float vSeed;
`;

const COMMON_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vI;
  varying float vSeed;
  float gH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float gN(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(gH(i), gH(i + vec2(1.0, 0.0)), f.x), mix(gH(i + vec2(0.0, 1.0)), gH(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

const flameVert = /* glsl */ `${VERT_HEAD}
  void main() {
    vUv = uv; vCol = iCol; vI = iSize.z; vSeed = iSize.w;
    vec3 toCam = cameraPosition - iPos;
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
    vec3 wp = iPos + right * position.x * iSize.x + vec3(0.0, 1.0, 0.0) * (position.y + 0.5) * iSize.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;

const flameFrag = /* glsl */ `${COMMON_FRAG}
  void main() {
    vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);
    float t = uTime * 2.8 + vSeed;
    // Zunge: wackelt mit der Höhe stärker, Spitze zuckt; zwei Schichten mit anderer Geschwindigkeit
    float w1 = gN(vec2(p.y * 2.6 - t, vSeed)) - 0.5;
    float w2 = gN(vec2(p.y * 5.8 - t * 1.8, vSeed + 7.0)) - 0.5;
    p.x += (w1 * 0.9 + w2 * 0.4) * (0.1 + p.y * 0.9);
    // schlanke Tropfenform: unten breit, nach oben spitz, die Spitze löst sich in Fetzen auf
    float width = pow(max(1.0 - p.y, 0.0), 1.15) * 0.62 * (0.5 + 0.5 * smoothstep(0.0, 0.18, p.y));
    float body = smoothstep(width, width * 0.3, abs(p.x));
    float tip = smoothstep(1.0, 0.35, p.y + (gN(vec2(p.x * 4.0 + t * 1.3, vSeed * 3.0)) - 0.5) * 0.55);
    float f = body * tip;
    float core = smoothstep(0.55, 0.0, abs(p.x) / max(width, 0.001)) * (1.0 - p.y * 1.1);
    core = clamp(core, 0.0, 1.0);
    // Farbverlauf: unten gelb und heiß, Mitte orange, Rand und Spitze rot; nur der Kern geht Richtung Weiß
    vec3 hot = vec3(1.0, 0.78, 0.32), mid = vec3(1.0, 0.38, 0.06), cold = vec3(0.8, 0.12, 0.02);
    vec3 col = mix(cold, mid, smoothstep(0.0, 0.55, f * (1.0 - p.y * 0.4)));
    col = mix(col, hot, smoothstep(0.35, 0.9, core));
    col += vec3(0.5, 0.42, 0.25) * core * core * (1.0 - p.y);
    // Farbton der Quelle (Fackel, Feuer) und Helligkeit; die Werte bleiben nahe 1, damit nichts ausbrennt
    col *= vCol / max(max(vCol.r, vCol.g), vCol.b) * 0.5 + 0.5;
    float a = pow(f, 0.7) * clamp(vI, 0.0, 1.0);
    if (a < 0.01) discard;
    gl_FragColor = vec4(col * 1.5 * a, a);
  }`;

const haloVert = /* glsl */ `${VERT_HEAD}
  void main() {
    vUv = uv; vCol = iCol; vI = iSize.z; vSeed = iSize.w;
    vec4 mv = viewMatrix * vec4(iPos, 1.0);
    mv.xy += position.xy * iSize.x;
    gl_Position = projectionMatrix * mv;
  }`;

const haloFrag = /* glsl */ `${COMMON_FRAG}
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    // heller Kern, weicher Hof, ganz außen ein Hauch Streuung (Dunst in der Luft)
    float g = exp(-d * d * 9.0) * 0.85 + exp(-d * d * 2.4) * 0.26 + exp(-d * 3.4) * 0.09;
    g *= 1.0 - smoothstep(0.82, 1.0, d);
    // Farbe auf Höchstwert 1 normieren, damit der Hof orange bleibt und nicht im Bloom zu Weiß ausbrennt
    vec3 hc = vCol / max(max(vCol.r, vCol.g), vCol.b) * 1.45;
    vec3 col = hc * g * vI;
    gl_FragColor = vec4(col, g * vI);
  }`;

const poolVert = /* glsl */ `${VERT_HEAD}
  void main() {
    vUv = uv; vCol = iCol; vI = iSize.z; vSeed = iSize.w;
    vec3 wp = iPos + vec3(position.x * iSize.x, 0.0, -position.y * iSize.x);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;

const poolFrag = /* glsl */ `${COMMON_FRAG}
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    // Lichtfleck: weicher Abfall, leicht unruhig wie Flammenlicht (Boden wird nicht flach ausgeleuchtet)
    float n = gN(vUv * 5.0 + vec2(uTime * 0.7 + vSeed, vSeed)) * 0.25 + 0.875;
    float g = pow(1.0 - r, 2.2) * n;
    gl_FragColor = vec4(vCol * g * vI, 1.0);
  }`;

const glintVert = /* glsl */ `${VERT_HEAD}
  void main() {
    vUv = uv; vCol = iCol; vI = iSize.z; vSeed = iSize.w;
    vec3 f = vec3(cameraPosition.x - iPos.x, 0.0, cameraPosition.z - iPos.z);
    float fl = max(length(f), 0.001);
    f /= fl;
    vec3 right = vec3(-f.z, 0.0, f.x);
    // Streifen läuft von der Lampe zum Betrachter, nahe am Betrachter breiter (Perspektive des Glitzerns)
    float along = position.y + 0.5;
    vec3 wp = iPos + right * position.x * iSize.x * (0.35 + 0.9 * along) + f * along * iSize.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;

const glintFrag = /* glsl */ `${COMMON_FRAG}
  void main() {
    float along = vUv.y;
    float across = abs(vUv.x - 0.5) * 2.0;
    // Wellenlicht: quer liegende Funkelbänder, die über das Wasser wandern, Rand und Ende laufen weich aus
    float band = gN(vec2(along * 26.0 - uTime * 1.6 + vSeed, vSeed * 2.3 + across * 3.0));
    band = smoothstep(0.42, 0.9, band);
    float shape = (1.0 - smoothstep(0.0, 1.0, across)) * pow(1.0 - along, 1.3) * smoothstep(0.0, 0.06, along);
    float g = shape * (0.25 + 0.75 * band);
    if (g < 0.01) discard;
    vec3 hc = vCol / max(max(vCol.r, vCol.g), vCol.b) * 1.3;
    gl_FragColor = vec4(hc * g * vI, g * vI);
  }`;

const MAX_FLAME = 150, MAX_HALO = 260, MAX_POOL = 110, MAX_GLINT = 48;
/** Sichtweiten in Metern: ab dort ist die Quelle ausgeblendet (innerhalb der letzten 30 % blendet sie weich aus) */
const RANGE = { flame: 190, haloFire: 520, haloLamp: 340, haloTorch: 300, haloWindow: 150, pool: 70, glint: 170 };

interface Layer {
  mesh: Mesh;
  geo: InstancedBufferGeometry;
  pos: InstancedBufferAttribute;
  size: InstancedBufferAttribute;
  col: InstancedBufferAttribute;
  n: number;
  max: number;
}

function makeLayer(scene: Scene, max: number, vert: string, frag: string, uTime: { value: number }, opt: { depthTest?: boolean; offset?: boolean; order: number }): Layer {
  const base = new PlaneGeometry(1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  const pos = new InstancedBufferAttribute(new Float32Array(max * 3), 3); pos.setUsage(DynamicDrawUsage);
  const size = new InstancedBufferAttribute(new Float32Array(max * 4), 4); size.setUsage(DynamicDrawUsage);
  const col = new InstancedBufferAttribute(new Float32Array(max * 3), 3); col.setUsage(DynamicDrawUsage);
  geo.setAttribute('iPos', pos); geo.setAttribute('iSize', size); geo.setAttribute('iCol', col);
  geo.instanceCount = 0;
  const mat = markShared(new ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, uniforms: { uTime },
    transparent: true, depthWrite: false, depthTest: opt.depthTest ?? true, blending: AdditiveBlending, fog: false,
    polygonOffset: !!opt.offset, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  }));
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = opt.order;
  mesh.userData.noOutline = true;
  scene.add(mesh);
  return { mesh, geo, pos, size, col, n: 0, max };
}

const visibleUp = (o: Object3D | null) => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _p = new Vector3();

/**
 * Das GlowSystem einer Szene. Jedes Bild `update` mit Kamera, Nachtwert (0 … 1), Regen (0 … 1) und Zeit.
 * Keine Zuweisungen je Bild: feste Felder, Auswahl der Nächsten per Schwellwert.
 */
export class GlowSystem {
  private flame: Layer;
  private halo: Layer;
  private pool: Layer;
  private glint: Layer;
  private time = { value: 0 };
  private d2 = new Float32Array(2048);
  /** Emitter-Indizes, alle 20 Bilder nach Abstand sortiert: bei Überfüllung gewinnen die nächsten */
  private order: number[] = [];
  private frame = 0;
  /** Mengenfaktor nach Grafikstufe (0 = aus) */
  quality = 1;

  constructor(scene: Scene) {
    // Reihenfolge: Bodenlicht (unten), Halos, Flammen (oben)
    this.pool = makeLayer(scene, MAX_POOL, poolVert, poolFrag, this.time, { offset: true, order: 8 });
    this.glint = makeLayer(scene, MAX_GLINT, glintVert, glintFrag, this.time, { offset: true, order: 8 });
    this.halo = makeLayer(scene, MAX_HALO, haloVert, haloFrag, this.time, { order: 9 });
    this.flame = makeLayer(scene, MAX_FLAME, flameVert, flameFrag, this.time, { order: 10 });
  }

  update(dt: number, cam: PerspectiveCamera, night: number, rain: number) {
    this.time.value += dt;
    const t = this.time.value;
    const list = glowHub.list;
    const L = this.flame, H = this.halo, P = this.pool, G = this.glint;
    L.n = H.n = P.n = G.n = 0;
    if (this.quality <= 0) { L.geo.instanceCount = H.geo.instanceCount = P.geo.instanceCount = G.geo.instanceCount = 0; return; }
    const cp = cam.position;
    // Lampen gehen mit der Dämmerung an, volle Helligkeit in der Nacht; im Regen etwas matter (nasse Luft streut, Funken fehlen)
    const lampOn = smooth(0.04, 0.55, night);
    const wetK = 1 - 0.18 * rain;
    // Kandidaten: Abstand² je Emitter, danach die Nächsten je Schicht
    const n = Math.min(list.length, this.d2.length);
    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (e.obj) { e.obj.getWorldPosition(_p); e.x = _p.x; e.y = _p.y + (e.oy ?? 0); e.z = _p.z; }
      this.d2[i] = (e.x - cp.x) ** 2 + (e.y - cp.y) ** 2 + (e.z - cp.z) ** 2;
    }
    if (this.frame++ % 20 === 0 || this.order.length !== n) {
      this.order.length = n;
      for (let i = 0; i < n; i++) this.order[i] = i;
      this.order.sort((a, b) => this.d2[a] - this.d2[b]);
    }
    for (let q = 0; q < n; q++) {
      const i = this.order[q];
      const e = list[i];
      if (!e) continue;
      if (e.on <= 0.01) continue;
      const d = Math.sqrt(this.d2[i]);
      if (e.obj && d < 520 && !visibleUp(e.obj)) continue;
      const fl = e.kind === 'fire' ? 1 + 0.12 * Math.sin(t * 9.3 + e.seed) + 0.08 * Math.sin(t * 23.1 + e.seed * 2.1) + 0.05 * Math.sin(t * 37 + e.seed * 5.3)
        : e.kind === 'torch' ? 1 + 0.1 * Math.sin(t * 11 + e.seed) + 0.07 * Math.sin(t * 29 + e.seed * 1.7)
        : e.kind === 'window' ? 1 + 0.02 * Math.sin(t * 2.3 + e.seed) + 0.012 * Math.sin(t * 7.1 + e.seed * 3.0)
        : 1 + 0.03 * Math.sin(t * 6.1 + e.seed) + 0.02 * Math.sin(t * 15.7 + e.seed * 2.0);
      const dayK = e.day + (1 - e.day) * lampOn;           // Tagesleuchtkraft: Feuer immer, Lampen erst mit der Dämmerung
      const lit = dayK * e.on * wetK;
      if (lit < 0.02) continue;
      const sky = e.kind === 'lamp' || e.kind === 'window' ? lampOn : 0.35 + 0.65 * lampOn;     // Himmel hell: Schein flacher
      // Flamme (Feuer und Fackeln): eine Hauptzunge und kleinere Nebenzungen mit eigener Phase, wie ein echtes Feuer
      if (e.kind !== 'lamp' && d < RANGE.flame) {
        const k = 1 - smooth(RANGE.flame * 0.7, RANGE.flame, d);
        const tongues = e.kind === 'fire' ? (d < 70 ? 4 : d < 130 ? 2 : 1) : (d < 60 ? 2 : 1);
        const h0 = e.size * (0.9 + 0.2 * fl) * (0.8 + 0.2 * Math.min(1, e.on));
        const toCamX = cp.x - e.x, toCamZ = cp.z - e.z, tl = Math.hypot(toCamX, toCamZ) || 1;
        const rx = -toCamZ / tl, rz = toCamX / tl;                          // quer zur Blickrichtung
        for (let q2 = 0; q2 < tongues && L.n < L.max; q2++) {
          const o = L.n++;
          const main = q2 === 0;
          const off = main ? 0 : (q2 % 2 ? 1 : -1) * e.size * (0.16 + 0.05 * q2);
          const hh = h0 * (main ? 1 : 0.55 + 0.12 * Math.sin(t * 7 + e.seed + q2 * 2.4) + 0.1 * q2);
          L.pos.array[o * 3] = e.x + rx * off; L.pos.array[o * 3 + 1] = e.y + (main ? 0 : 0.03); L.pos.array[o * 3 + 2] = e.z + rz * off;
          L.size.array[o * 4] = hh * (main ? 0.58 : 0.5); L.size.array[o * 4 + 1] = hh; L.size.array[o * 4 + 2] = k * lit * (main ? 1 : 0.85); L.size.array[o * 4 + 3] = e.seed + q2 * 5.7;
          L.col.array[o * 3] = e.color.r; L.col.array[o * 3 + 1] = e.color.g; L.col.array[o * 3 + 2] = e.color.b;
        }
      }
      // Lichthof
      const hr = e.kind === 'fire' ? RANGE.haloFire : e.kind === 'torch' ? RANGE.haloTorch : e.kind === 'window' ? RANGE.haloWindow : RANGE.haloLamp;
      if (H.n < H.max && d < hr) {
        const k = 1 - smooth(hr * 0.7, hr, d);
        const o = H.n++;
        const cy = e.kind === 'lamp' || e.kind === 'window' ? 0 : e.size * 0.5;
        H.pos.array[o * 3] = e.x; H.pos.array[o * 3 + 1] = e.y + cy; H.pos.array[o * 3 + 2] = e.z;
        // der Hof wächst mit der Entfernung (aus der Ferne bleibt eine Lampe als Lichtpunkt sichtbar), tagsüber klein und flach
        const far = 1 + Math.min(2.4, d * 0.012);
        const r = e.size * (e.kind === 'lamp' ? 1.7 : e.kind === 'window' ? 1.5 : 2.6) * far * (0.85 + 0.15 * fl);
        H.size.array[o * 4] = r; H.size.array[o * 4 + 1] = r; H.size.array[o * 4 + 2] = k * lit * fl * (0.1 + 0.55 * sky) * (e.kind === 'fire' ? 0.55 : e.kind === 'torch' ? 0.6 : e.kind === 'window' ? 0.5 : 0.85); H.size.array[o * 4 + 3] = e.seed;
        H.col.array[o * 3] = e.color.r; H.col.array[o * 3 + 1] = e.color.g; H.col.array[o * 3 + 2] = e.color.b;
      }
      // Wasserspiegelung: Lichtstreifen von der Lampe zum Betrachter (Schiffe, Bojen, Stege), nur nachts
      if (e.glint && G.n < G.max && d < RANGE.glint && d > 3) {
        const k = 1 - smooth(RANGE.glint * 0.6, RANGE.glint, d);
        const gi = k * lit * lampOn * fl * 0.5;
        if (gi > 0.01) {
          const o = G.n++;
          G.pos.array[o * 3] = e.x; G.pos.array[o * 3 + 1] = 0.12; G.pos.array[o * 3 + 2] = e.z;
          G.size.array[o * 4] = Math.max(0.8, e.size * 1.8); G.size.array[o * 4 + 1] = Math.min(15, 4 + d * 0.06); G.size.array[o * 4 + 2] = gi; G.size.array[o * 4 + 3] = e.seed;
          G.col.array[o * 3] = e.color.r; G.col.array[o * 3 + 1] = e.color.g; G.col.array[o * 3 + 2] = e.color.b;
        }
      }
      // Bodenlicht: nur nah, nur in der Dämmerung und Nacht
      if (e.ground !== null && P.n < P.max && d < RANGE.pool) {
        const k = 1 - smooth(RANGE.pool * 0.6, RANGE.pool, d);
        const night2 = lampOn * (e.kind === 'fire' ? 1 : 0.9) + (e.kind === 'fire' ? 0.12 : 0);
        const li = k * lit * night2 * fl * (e.kind === 'window' ? 0.3 : 0.42);
        if (li > 0.01) {
          const o = P.n++;
          P.pos.array[o * 3] = e.x + e.pdx; P.pos.array[o * 3 + 1] = e.ground + 0.06; P.pos.array[o * 3 + 2] = e.z + e.pdz;
          P.size.array[o * 4] = e.pool * (0.94 + 0.08 * fl) * 2; P.size.array[o * 4 + 1] = 0; P.size.array[o * 4 + 2] = li; P.size.array[o * 4 + 3] = e.seed;
          P.col.array[o * 3] = e.color.r * 0.55; P.col.array[o * 3 + 1] = e.color.g * 0.5; P.col.array[o * 3 + 2] = e.color.b * 0.42;
        }
      }
    }
    for (const l of [L, H, P, G]) {
      l.geo.instanceCount = l.n;
      l.pos.needsUpdate = l.size.needsUpdate = l.col.needsUpdate = true;
    }
  }

  dispose() {
    for (const l of [this.flame, this.halo, this.pool, this.glint]) { l.mesh.removeFromParent(); l.geo.dispose(); }
  }
}
