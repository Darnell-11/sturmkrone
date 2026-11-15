import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { markShared } from './dispose';
import { lampFx } from './lampMaterials';
import { heatShared } from './heat';
import { smokeShared } from '../world/smoke';
import {
  CONE_FRAG, CONE_VERT, EMBER_FRAG, EMBER_VERT, FLAME_FRAG, FLAME_VERT, SMOKE_FRAG, SMOKE_VERT,
  coneGeometry, emberGeometry, flameGeometry, smokeGeometry,
} from './flameShaders';

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
    // breiter, weicher Abfall mit kleinem hellem Kern: wirkt wie Licht in der Luft, nicht wie eine Scheibe
    float g = (0.62 * pow(1.0 - r, 1.7) + 0.38 * pow(1.0 - r, 3.4)) * n;
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

const MAX_FLAME = 140, MAX_HALO = 260, MAX_POOL = 110, MAX_GLINT = 48, MAX_EMBER = 36, MAX_SMOKE = 26, MAX_CONE = 64;
/** Sichtweiten in Metern: ab dort ist die Quelle ausgeblendet (innerhalb der letzten 30 % blendet sie weich aus) */
const RANGE = { flame: 190, lampFlame: 26, ember: 50, emberTorch: 20, smoke: 100, smokeTorch: 26, cone: 75, haloFire: 520, haloLamp: 340, haloTorch: 300, haloWindow: 150, pool: 70, glint: 170, heat: 32 };

/**
 * Organisches Flackern (um 1): drei unharmonische Sinus plus seltene tiefe Einbrüche (Windstoß). Flamme, Lichthof und echtes
 * Punktlicht (LampPool) rechnen mit derselben Funktion und derselben Phase (`seed` des Emitters), damit sie im Takt bleiben.
 */
export function flickerOf(t: number, seed: number): number {
  const a = Math.sin(t * 9.3 + seed) * 0.5 + Math.sin(t * 23.1 + seed * 2.1) * 0.3 + Math.sin(t * 37.7 + seed * 5.3) * 0.2;
  const g = Math.max(0, Math.sin(t * 1.3 + seed * 3.7) * Math.sin(t * 0.77 + seed));
  return 1 + 0.13 * a - 0.2 * g * g;
}

interface Layer {
  mesh: Mesh;
  geo: InstancedBufferGeometry;
  pos: InstancedBufferAttribute;
  size: InstancedBufferAttribute;
  col: InstancedBufferAttribute;
  n: number;
  max: number;
}

interface LayerOpt { side?: boolean; depthTest?: boolean; offset?: boolean; order: number; geo?: BufferGeometry; normal?: boolean; col?: boolean }

function makeLayer(scene: Scene, max: number, vert: string, frag: string, uniforms: Record<string, { value: unknown }>, opt: LayerOpt): Layer {
  const base = opt.geo ?? new PlaneGeometry(1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = base.index;
  for (const name of Object.keys(base.attributes)) geo.setAttribute(name, base.getAttribute(name));
  const pos = new InstancedBufferAttribute(new Float32Array(max * 3), 3); pos.setUsage(DynamicDrawUsage);
  const size = new InstancedBufferAttribute(new Float32Array(max * 4), 4); size.setUsage(DynamicDrawUsage);
  const col = new InstancedBufferAttribute(new Float32Array(max * 3), 3); col.setUsage(DynamicDrawUsage);
  geo.setAttribute('iPos', pos); geo.setAttribute('iSize', size);
  if (opt.col !== false) geo.setAttribute('iCol', col);
  geo.instanceCount = 0;
  const mat = markShared(new ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, uniforms,
    transparent: true, depthWrite: false, depthTest: opt.depthTest ?? true, side: opt.side ? DoubleSide : FrontSide, blending: opt.normal ? NormalBlending : AdditiveBlending, fog: false,
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

/** Schreibt eine Instanz (Ort, vier Größenwerte, Farbe) in eine Schicht */
function put(l: Layer, x: number, y: number, z: number, a: number, b: number, c: number, d: number, col: Color) {
  const o = l.n++;
  l.pos.array[o * 3] = x; l.pos.array[o * 3 + 1] = y; l.pos.array[o * 3 + 2] = z;
  const s = l.size.array; s[o * 4] = a; s[o * 4 + 1] = b; s[o * 4 + 2] = c; s[o * 4 + 3] = d;
  const k = l.col.array; k[o * 3] = col.r; k[o * 3 + 1] = col.g; k[o * 3 + 2] = col.b;
}

/**
 * Das GlowSystem einer Szene. Jedes Bild `update` mit Kamera, Nachtwert (0 … 1), Regen (0 … 1) und Zeit.
 * Keine Zuweisungen je Bild: feste Felder, Auswahl der Nächsten per Schwellwert.
 */
export class GlowSystem {
  private flame: Layer;
  private halo: Layer;
  private pool: Layer;
  private glint: Layer;
  private ember: Layer;
  private smoke: Layer;
  private cone: Layer;
  private time = { value: 0 };
  private wind3 = { value: new Vector3() };
  private d2 = new Float32Array(2048);
  /** Emitter-Indizes, alle 20 Bilder nach Abstand sortiert: bei Überfüllung gewinnen die nächsten */
  private order: number[] = [];
  private frame = 0;
  private heatSlots: (ReturnType<typeof heatShared.add> | null)[] = [null, null, null];
  /** Mengenfaktor nach Grafikstufe (0 = aus) */
  quality = 1;
  /** Wind (m/s) für Flammen, Funken und Rauch; setzt die Welt */
  wind = { x: 0, z: 0 };
  /** Dunst in der Luft 0 … 1 (Nebel, Regen): verstärkt Lichthöfe und Lichtkegel */
  mist = 0;
  /** Hitzeflimmern über den nächsten Feuern (nur Stufen mit HeatEffect) */
  heat = false;

  constructor(scene: Scene) {
    const uni = { uTime: this.time, uWind: this.wind3 };
    // Reihenfolge: Rauch (Mischung), Bodenlicht, Lichtkegel, Halos, Flammen, Funken (alles Additive oben)
    this.smoke = makeLayer(scene, MAX_SMOKE, SMOKE_VERT, SMOKE_FRAG, { ...uni, uLit: smokeShared.uLit, uShade: smokeShared.uShade }, { geo: smokeGeometry(), normal: true, order: 7, col: false });
    this.pool = makeLayer(scene, MAX_POOL, poolVert, poolFrag, { uTime: this.time }, { offset: true, order: 8 });
    this.glint = makeLayer(scene, MAX_GLINT, glintVert, glintFrag, { uTime: this.time }, { offset: true, order: 8 });
    this.cone = makeLayer(scene, MAX_CONE, CONE_VERT, CONE_FRAG, uni, { geo: coneGeometry(), order: 8, side: true });
    this.halo = makeLayer(scene, MAX_HALO, haloVert, haloFrag, { uTime: this.time }, { order: 9 });
    this.flame = makeLayer(scene, MAX_FLAME, FLAME_VERT, FLAME_FRAG, uni, { geo: flameGeometry(), order: 10 });
    this.ember = makeLayer(scene, MAX_EMBER, EMBER_VERT, EMBER_FRAG, uni, { geo: emberGeometry(), order: 11 });
  }

  update(dt: number, cam: PerspectiveCamera, night: number, rain: number) {
    this.time.value += dt;
    const t = this.time.value;
    lampFx.uTime.value = t;
    const list = glowHub.list;
    const L = this.flame, H = this.halo, P = this.pool, G = this.glint, E = this.ember, S = this.smoke, C = this.cone;
    const layers = [L, H, P, G, E, S, C];
    for (const l of layers) l.n = 0;
    if (this.quality <= 0) { for (const l of layers) l.geo.instanceCount = 0; this.releaseHeat(); return; }
    // Sparstufe (Low): nur Flamme und Lichthof der Nahen, ohne Funken, Rauch, Lichtkegel, Bodenlicht, Spiegelung und Hitzeflimmern
    const lite = this.quality < 1;
    // Wind für die Shader: Böigkeit wächst mit der Windstärke
    const ws = Math.hypot(this.wind.x, this.wind.z);
    this.wind3.value.set(this.wind.x, Math.min(1, ws / 9), this.wind.z);
    const cp = cam.position;
    // Lampen gehen mit der Dämmerung an, volle Helligkeit in der Nacht; im Regen etwas matter (nasse Luft streut, Funken fehlen)
    const lampOn = smooth(0.04, 0.55, night);
    const wetK = 1 - 0.18 * rain;
    const mist = this.mist;
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
    let heatN = 0;
    for (let q = 0; q < n; q++) {
      const i = this.order[q];
      const e = list[i];
      if (!e) continue;
      if (e.on <= 0.01) continue;
      const d = Math.sqrt(this.d2[i]);
      if (e.obj && d < 520 && !visibleUp(e.obj)) continue;
      const calm = e.kind === 'window' ? 0.15 : e.kind === 'lamp' ? 0.3 : 1;
      const fl = (flickerOf(t, e.seed) - 1) * calm + 1;
      const dayK = e.day + (1 - e.day) * lampOn;           // Tagesleuchtkraft: Feuer immer, Lampen erst mit der Dämmerung
      const lit = dayK * e.on * wetK;
      if (lit < 0.02) continue;
      const sky = e.kind === 'lamp' || e.kind === 'window' ? lampOn : 0.35 + 0.65 * lampOn;     // Himmel hell: Schein flacher
      // Flamme (Feuer und Fackeln): eine Hauptzunge und kleinere Nebenzungen mit eigener Phase, wie ein echtes Feuer
      if (lite && d > 90 && e.kind !== 'fire') continue;
      if (e.kind !== 'lamp' && e.kind !== 'window' && d < RANGE.flame) {
        const k = 1 - smooth(RANGE.flame * 0.7, RANGE.flame, d);
        const tongues = lite ? 1 : e.kind === 'fire' ? (d < 70 ? 4 : d < 130 ? 2 : 1) : (d < 60 ? 2 : 1);
        const h0 = e.size * (0.9 + 0.2 * fl) * (0.8 + 0.2 * Math.min(1, e.on));
        const toCamX = cp.x - e.x, toCamZ = cp.z - e.z, tl = Math.hypot(toCamX, toCamZ) || 1;
        const rx = -toCamZ / tl, rz = toCamX / tl;                          // quer zur Blickrichtung
        for (let q2 = 0; q2 < tongues && L.n < L.max; q2++) {
          const main = q2 === 0;
          const off = main ? 0 : (q2 % 2 ? 1 : -1) * e.size * (0.2 + 0.07 * q2);
          const hh = h0 * (main ? 1 : 0.55 + 0.12 * Math.sin(t * 7 + e.seed + q2 * 2.4) + 0.1 * q2);
          put(L, e.x + rx * off, e.y + (main ? 0 : 0.03), e.z + rz * off, hh * (main ? 0.44 : 0.34), hh * (main ? 1.12 : 1), k * lit * (main ? 1 : 0.85), e.seed + q2 * 5.7, e.color);
        }
        // Funken und Rauch aus derselben Quelle
        const er = e.kind === 'fire' ? RANGE.ember : RANGE.emberTorch;
        if (!lite && E.n < E.max && d < er) {
          const kk = 1 - smooth(er * 0.6, er, d);
          put(E, e.x, e.y, e.z, e.size, Math.min(1, lit * kk * (e.kind === 'fire' ? 0.8 : 0.3)), e.seed, 0, e.color);
        }
        const sr = e.kind === 'fire' ? RANGE.smoke : RANGE.smokeTorch;
        if (!lite && S.n < S.max && d < sr) {
          const kk = 1 - smooth(sr * 0.6, sr, d);
          put(S, e.x, e.y, e.z, e.size * (e.kind === 'fire' ? 0.75 : 0.45), 0.85, e.seed, kk * (e.kind === 'fire' ? 1 : 0.4) * Math.min(1, lit), e.color);
        }
        // Hitzeflimmern über den nächsten drei Feuern
        if (!lite && this.heat && heatN < this.heatSlots.length && d < RANGE.heat) {
          const kk = 1 - smooth(RANGE.heat * 0.5, RANGE.heat, d);
          this.setHeat(heatN++, e.x, e.y + e.size * 0.9, e.z, e.size * 1.6, (e.kind === 'fire' ? 0.3 : 0.14) * kk * Math.min(1, lit));
        }
      }
      // kleine Kerzenflamme im Glas der Laternen (nur nah)
      if (!lite && e.kind === 'lamp' && d < RANGE.lampFlame && e.size > 0.3 && L.n < L.max) {
        const k = 1 - smooth(RANGE.lampFlame * 0.6, RANGE.lampFlame, d);
        const hh = e.size * 0.3 * (0.92 + 0.16 * fl);
        put(L, e.x, e.y - hh * 0.22, e.z, hh * 0.6, hh, k * lit * lampOn, e.seed, e.color);
      }
      // Lichtkegel unter Laternen: nachts leise, in Nebel und Regen deutlich
      if (!lite && e.kind === 'lamp' && e.size > 0.3 && C.n < C.max && d < RANGE.cone && lampOn > 0.05) {
        const k = 1 - smooth(RANGE.cone * 0.6, RANGE.cone, d);
        const gi = k * lit * lampOn * (0.1 + 0.8 * mist) * (0.85 + 0.15 * fl);
        if (gi > 0.01) { const cs = Math.min(e.size, 1.5); put(C, e.x, e.y, e.z, cs * 3.0, cs * 2.6, gi, e.seed, e.color); }
      }
      // Lichthof; im Dunst wächst er und wird heller
      const hr = e.kind === 'fire' ? RANGE.haloFire : e.kind === 'torch' ? RANGE.haloTorch : e.kind === 'window' ? RANGE.haloWindow : RANGE.haloLamp;
      if (H.n < H.max && d < hr) {
        const k = 1 - smooth(hr * 0.7, hr, d);
        const cy = e.kind === 'lamp' || e.kind === 'window' ? 0 : e.size * 0.5;
        // der Hof wächst mit der Entfernung (aus der Ferne bleibt eine Lampe als Lichtpunkt sichtbar), tagsüber klein und flach
        const far = 1 + Math.min(2.4, d * 0.012);
        const r = e.size * (e.kind === 'lamp' ? 1.7 : e.kind === 'window' ? 1.5 : 2.1) * far * (0.85 + 0.15 * fl) * (1 + 0.7 * mist);
        const nearK = 0.2 + 0.8 * smooth(0.8, 7, d);                          // ganz nah gehört das Bild der Flamme und dem Modell, nicht dem Hof
        const inten = k * lit * fl * nearK * (0.1 + 0.55 * sky) * (e.kind === 'fire' ? 0.5 : e.kind === 'torch' ? 0.6 : e.kind === 'window' ? 0.5 : 0.85) * (1 + 0.55 * mist);
        put(H, e.x, e.y + cy, e.z, r, r, inten, e.seed, e.color);
      }
      // Wasserspiegelung: Lichtstreifen von der Lampe zum Betrachter (Schiffe, Bojen, Stege), nur nachts
      if (!lite && e.glint && G.n < G.max && d < RANGE.glint && d > 3) {
        const k = 1 - smooth(RANGE.glint * 0.6, RANGE.glint, d);
        const gi = k * lit * lampOn * fl * 0.5;
        if (gi > 0.01) put(G, e.x, 0.12, e.z, Math.max(0.8, e.size * 1.8), Math.min(15, 4 + d * 0.06), gi, e.seed, e.color);
      }
      // Bodenlicht: nur nah, nur in der Dämmerung und Nacht
      if (!lite && e.ground !== null && P.n < P.max && d < RANGE.pool) {
        const k = 1 - smooth(RANGE.pool * 0.6, RANGE.pool, d);
        const night2 = lampOn * (e.kind === 'fire' ? 1 : 0.9) + (e.kind === 'fire' ? 0.12 : 0);
        // nasser Boden wirft das Licht kräftiger zurück (Pfützen, Pflaster glänzen)
        const wetUp = 1 + 0.45 * smooth(0.25, 0.7, rain);
        const li = k * lit * night2 * fl * wetUp * (e.kind === 'window' ? 0.5 : e.kind === 'fire' ? 0.62 : 0.62);
        if (li > 0.01) {
          const o = P.n++;
          P.pos.array[o * 3] = e.x + e.pdx; P.pos.array[o * 3 + 1] = e.ground + 0.06; P.pos.array[o * 3 + 2] = e.z + e.pdz;
          P.size.array[o * 4] = e.pool * (0.94 + 0.08 * fl) * 2; P.size.array[o * 4 + 1] = 0; P.size.array[o * 4 + 2] = li; P.size.array[o * 4 + 3] = e.seed;
          P.col.array[o * 3] = e.color.r * 0.55; P.col.array[o * 3 + 1] = e.color.g * 0.5; P.col.array[o * 3 + 2] = e.color.b * 0.42;
        }
      }
    }
    for (let i = heatN; i < this.heatSlots.length; i++) this.setHeat(i, 0, 0, 0, 0, 0);
    for (const l of layers) {
      l.geo.instanceCount = l.n;
      l.pos.needsUpdate = l.size.needsUpdate = true;
      l.col.needsUpdate = true;
    }
  }

  /** Hitzequelle i setzen (k = 0 gibt den Platz frei) */
  private setHeat(i: number, x: number, y: number, z: number, r: number, k: number) {
    let s = this.heatSlots[i];
    if (k <= 0.005) {
      if (s) { s.held = false; s.t = s.life; this.heatSlots[i] = null; }
      return;
    }
    if (!s) { s = heatShared.add(x, y, z, r, k, 1e9); s.held = true; this.heatSlots[i] = s; }
    s.x = x; s.y = y; s.z = z; s.r = r; s.k = k;
  }

  private releaseHeat() { for (let i = 0; i < this.heatSlots.length; i++) this.setHeat(i, 0, 0, 0, 0, 0); }

  dispose() {
    this.releaseHeat();
    for (const l of [this.flame, this.halo, this.pool, this.glint, this.ember, this.smoke, this.cone]) { l.mesh.removeFromParent(); l.geo.dispose(); }
  }
}
