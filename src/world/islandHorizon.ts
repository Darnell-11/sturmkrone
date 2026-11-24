// Horizont-Stufe der Inseln (HORIZON_LOD, Phase 4.3A): eine ultraleichte, gecachte Low-Poly-Silhouette mit Gischtband an der Küste und, wo
// es ein Feuer gibt, einem weithin sichtbaren Leuchtfeuer. Alle Inseln der Stufe zusammen kosten drei Zeichenaufrufe (Silhouetten, Gischt, Feuer), keine Kollision,
// kein Begehbarkeits-Netz. Die Netzdaten entstehen rein aus der Küsten- und Hügelform der Inselwerte (`buildHorizonData`, ohne three.js getestet)
// und bleiben als Zahlenfelder im Zwischenspeicher; die Grafikspeicher-Objekte gibt es nur, solange die Insel auf HORIZON_LOD steht.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial,
  type Scene,
} from 'three';
import { markShared } from '../render/dispose';
import { fogUniforms } from '../render/atmosphere';
import { coastK, WATERLINE, type WalkIsland } from './islandGround';

/** Was die Silhouette von einer Insel wissen muss (die Felder von `WalkIsland`) */
export type HorizonShape = Pick<WalkIsland, 'x' | 'z' | 'r' | 'coast' | 'shelf' | 'hills' | 'beachY' | 'hillY'>;

/** Leuchtfeuer: Lage relativ zur Inselmitte; `dayK` = Anteil, der auch am hellen Tag brennt (Leuchtturm: ja, Hafenfeuer: nur bei Dämmerung und Nacht) */
export interface HorizonBeacon { x: number; y: number; z: number; dayK: number; size: number }

export interface HorizonData {
  /** Silhouette: Eckpunkte (x, y, z relativ zur Inselmitte) und Dreiecke */
  pos: Float32Array;
  idx: Uint16Array;
  /** Gischtband an der Wasserlinie: senkrechter Streifen rund um die Küste */
  foamPos: Float32Array;
  foamIdx: Uint16Array;
  /** Höchster Punkt über dem Wasser (m) */
  top: number;
  beacon: HorizonBeacon | null;
}

const SEGMENTS = 28;
const HILL_SEGMENTS = 10;
/** Höhe des Gischtbands (m): bei 2 600 m Abstand knapp ein Bildpunkt */
const FOAM_HEIGHT = 2.2;

/** Silhouette und Gischtband einer Insel als reine Zahlenfelder (deterministisch, nur aus den Inselwerten) */
export function buildHorizonData(isl: HorizonShape, kind: string): HorizonData {
  const pos: number[] = [], idx: number[] = [];
  const foamPos: number[] = [], foamIdx: number[] = [];
  const N = SEGMENTS;
  const wl = 1 + isl.shelf * WATERLINE;
  const by = isl.beachY;
  // Strand: Mitte → Küste (Plateau) → Wasserlinie
  pos.push(0, by, 0);
  const ringB = 1, ringA = 1 + N;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2, e = isl.r * coastK(isl.coast, a);
    pos.push(Math.cos(a) * e, by, Math.sin(a) * e);
  }
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2, e = isl.r * coastK(isl.coast, a) * wl;
    pos.push(Math.cos(a) * e, 0.05, Math.sin(a) * e);
  }
  for (let k = 0; k < N; k++) {
    const k2 = (k + 1) % N;
    idx.push(0, ringB + k2, ringB + k);                              // Dreieck von der Mitte zur Küste, Normale nach oben
    idx.push(ringB + k, ringB + k2, ringA + k, ringB + k2, ringA + k2, ringA + k);
  }
  let top = by;
  // Hügel: zwei Ringe und Gipfel, zusammen eine gewölbte Kuppe
  for (const h of isl.hills) {
    const cx = h.x - isl.x, cz = h.z - isl.z, peak = isl.hillY + h.r * h.h;
    top = Math.max(top, peak);
    const base = pos.length / 3;
    const M = HILL_SEGMENTS;
    for (let k = 0; k < M; k++) { const a = (k / M) * Math.PI * 2; pos.push(cx + Math.cos(a) * h.r * 0.98, by, cz + Math.sin(a) * h.r * 0.98); }
    // Hügelprofil (1 − t²)^1,6 bei t = 0,62 ergibt rund 46 % der Höhe über dem Hügelfuß
    const mid = isl.hillY + (peak - isl.hillY) * 0.46;
    for (let k = 0; k < M; k++) { const a = (k / M) * Math.PI * 2; pos.push(cx + Math.cos(a) * h.r * 0.62, Math.max(by, mid), cz + Math.sin(a) * h.r * 0.62); }
    pos.push(cx, peak, cz);
    const apex = base + 2 * M;
    for (let k = 0; k < M; k++) {
      const k2 = (k + 1) % M;
      idx.push(base + k, base + k2, base + M + k, base + k2, base + M + k2, base + M + k);
      idx.push(base + M + k, base + M + k2, apex);
    }
  }
  // Leuchtturm: ein schlanker Turm als sechseckiges Prisma (weithin sichtbar)
  let beacon: HorizonBeacon | null = null;
  if (kind === 'lighthouse') {
    const base = pos.length / 3, H = 30, R0 = 2.6, R1 = 1.8;
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; pos.push(Math.cos(a) * R0, by, Math.sin(a) * R0); }
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; pos.push(Math.cos(a) * R1, by + H, Math.sin(a) * R1); }
    for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; idx.push(base + k, base + k2, base + 6 + k, base + k2, base + 6 + k2, base + 6 + k); }
    top = Math.max(top, by + H);
    beacon = { x: 0, y: by + H + 1, z: 0, dayK: 0.28, size: 1.3 };
  } else if (kind === 'harbor' || kind === 'town') {
    beacon = { x: 0, y: by + 8, z: 0, dayK: 0, size: kind === 'town' ? 1.4 : 1 };
  } else if (kind === 'citadel' || kind === 'marinefort') {
    beacon = { x: 0, y: by + 22, z: 0, dayK: 0.1, size: 1.6 };
  } else if (kind === 'camp' || kind === 'boss') {
    beacon = { x: 0, y: by + 3, z: 0, dayK: 0, size: 0.7 };
  }
  // Gischtband: senkrechter Streifen an der Wasserlinie
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2, e = isl.r * coastK(isl.coast, a) * wl;
    const c = Math.cos(a) * e, s = Math.sin(a) * e;
    foamPos.push(c, 0, s, c, FOAM_HEIGHT, s);
  }
  for (let k = 0; k < N; k++) {
    const k2 = (k + 1) % N, a0 = k * 2, a1 = k2 * 2;
    foamIdx.push(a0, a0 + 1, a1, a1, a0 + 1, a1 + 1);
  }
  return { pos: new Float32Array(pos), idx: new Uint16Array(idx), foamPos: new Float32Array(foamPos), foamIdx: new Uint16Array(foamIdx), top, beacon };
}

// ---------- Darstellung ----------

let silMat: MeshBasicMaterial | null = null;
let foamMat: MeshBasicMaterial | null = null;
let beaconMat: PointsMaterial | null = null;
let beaconTex: CanvasTexture | null = null;

/** Gemeinsame Materialien aller Silhouetten: eine Farbe für alle, je Bild aus Nebel und Tageszeit nachgeführt (nie je Insel ein Material) */
function materials() {
  if (!silMat) {
    // Seit 4.4.1 MIT dem Nebel der Welt: Silhouetten lösen sich wie alles andere in der Luftperspektive auf und verschwinden bei Nebel ganz
    // (früher standen sie ohne Nebel als scharfe Schatten hinter einer Nebelwand)
    silMat = markShared(new MeshBasicMaterial({ color: 0x3a4a44, fog: true, side: DoubleSide }));
    foamMat = markShared(new MeshBasicMaterial({ color: 0xf2fbff, fog: true, side: DoubleSide }));
    silMat.onBeforeCompile = fogUniforms;
    foamMat.onBeforeCompile = fogUniforms;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,230,170,0.85)'); grad.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    beaconTex = markShared(new CanvasTexture(c));
    // Feuer als Punkte fester Bildgröße (wie ein Stern am Horizont); Helligkeit je Feuer über die Eckpunktfarbe
    beaconMat = markShared(new PointsMaterial({ map: beaconTex, size: 13, sizeAttenuation: false, vertexColors: true, blending: AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
  }
  return { sil: silMat!, foam: foamMat!, beacon: beaconMat! };
}

/** Eine Insel auf HORIZON_LOD: ihre Zahlenfelder und ihr Platz in der Welt */
interface Shown { x: number; z: number; d: HorizonData }

const BEACON_COL = new Color(3.2, 2.2, 1.1);

/**
 * Alle Silhouetten der Welt in drei Zeichenaufrufen: eine Geometrie für alle Silhouetten, eine für alle Gischtbänder, eine Punktwolke für alle
 * Feuer. `show`/`hide` merken nur, welche Inseln dazugehören; ändert sich das, baut `update` die drei Geometrien neu (wenige Tausend Eckpunkte,
 * die alten werden freigegeben). Die Zahlenfelder je Insel bleiben im Zwischenspeicher. `update` färbt alles aus dem Nebel des Himmels: die Inseln
 * stehen als dunstige Schatten am Horizont, nachts dunkel mit den Feuern.
 */
export class HorizonLayer {
  readonly root = new Group();
  private shown = new Map<number, Shown>();
  private cache = new Map<number, HorizonData>();
  private tmp = new Color();
  private warm: Group | null = null;
  private dirty = false;
  private sil: Mesh | null = null;
  private foam: Mesh | null = null;
  private beacons: Points | null = null;
  /** Feuer in der Reihenfolge der Punktwolke: Tageslicht-Anteil und Größe */
  private beaconInfo: { dayK: number; size: number }[] = [];
  /** Zähler für Tests und Messung: Silhouetten, die gerade stehen, und Zeichenaufrufe daraus (höchstens 3 für alle zusammen) */
  get count(): number { return this.shown.size; }
  get drawCalls(): number { return (this.sil ? 1 : 0) + (this.foam ? 1 : 0) + (this.beacons ? 1 : 0); }

  constructor(scene: Scene) {
    this.root.name = 'horizon';
    this.root.frustumCulled = false;
    scene.add(this.root);
  }

  isShown(i: number): boolean { return this.shown.has(i); }

  data(i: number, isl: HorizonShape, kind: string): HorizonData {
    let d = this.cache.get(i);
    if (!d) { d = buildHorizonData(isl, kind); this.cache.set(i, d); }
    return d;
  }

  show(i: number, isl: HorizonShape, kind: string, x: number, z: number): void {
    if (this.shown.has(i)) return;
    this.shown.set(i, { x, z, d: this.data(i, isl, kind) });
    this.dirty = true;
  }

  hide(i: number): void {
    if (this.shown.delete(i)) this.dirty = true;
  }

  /** Die drei gemeinsamen Geometrien aus den gezeigten Inseln neu bauen (nur nach einer Änderung) */
  private rebuild(): void {
    for (const o of [this.sil, this.foam, this.beacons]) if (o) { o.removeFromParent(); o.geometry.dispose(); }
    this.sil = this.foam = null; this.beacons = null;
    this.beaconInfo.length = 0;
    if (!this.shown.size) return;
    const m = materials();
    let nv = 0, ni = 0, fv = 0, fi = 0, nb = 0;
    for (const s of this.shown.values()) { nv += s.d.pos.length / 3; ni += s.d.idx.length; fv += s.d.foamPos.length / 3; fi += s.d.foamIdx.length; if (s.d.beacon) nb++; }
    const pos = new Float32Array(nv * 3), idx = nv > 65000 ? new Uint32Array(ni) : new Uint16Array(ni);
    const fpos = new Float32Array(fv * 3), fidx = fv > 65000 ? new Uint32Array(fi) : new Uint16Array(fi);
    const bpos = new Float32Array(nb * 3), bcol = new Float32Array(nb * 3);
    let v = 0, k = 0, f = 0, fk = 0, b = 0;
    for (const s of this.shown.values()) {
      const d = s.d;
      for (let j = 0; j < d.idx.length; j++) idx[k++] = d.idx[j] + v;
      for (let j = 0; j < d.pos.length; j += 3) { pos[v * 3] = d.pos[j] + s.x; pos[v * 3 + 1] = d.pos[j + 1]; pos[v * 3 + 2] = d.pos[j + 2] + s.z; v++; }
      for (let j = 0; j < d.foamIdx.length; j++) fidx[fk++] = d.foamIdx[j] + f;
      for (let j = 0; j < d.foamPos.length; j += 3) { fpos[f * 3] = d.foamPos[j] + s.x; fpos[f * 3 + 1] = d.foamPos[j + 1]; fpos[f * 3 + 2] = d.foamPos[j + 2] + s.z; f++; }
      if (d.beacon) { bpos[b * 3] = d.beacon.x + s.x; bpos[b * 3 + 1] = d.beacon.y; bpos[b * 3 + 2] = d.beacon.z + s.z; this.beaconInfo.push({ dayK: d.beacon.dayK, size: d.beacon.size }); b++; }
    }
    const mesh = (p: Float32Array, i: Uint16Array | Uint32Array, mat: MeshBasicMaterial) => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(p, 3));
      g.setIndex(new BufferAttribute(i, 1));
      g.computeBoundingSphere();
      const o = new Mesh(g, mat);
      o.userData.noOutline = true; o.castShadow = false; o.receiveShadow = false;
      this.root.add(o);
      return o;
    };
    this.sil = mesh(pos, idx, m.sil);
    this.foam = mesh(fpos, fidx, m.foam);
    if (nb) {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(bpos, 3));
      g.setAttribute('color', new BufferAttribute(bcol, 3));
      g.computeBoundingSphere();
      const p = new Points(g, m.beacon);
      p.userData.noOutline = true;
      p.renderOrder = 6;
      this.root.add(p);
      this.beacons = p;
    }
  }

  /**
   * Je Bild: Farben aus dem Himmel. `fog` ist die Nebelfarbe (Horizontfarbe), `sun` 0 … 1 (Tageslicht), `night` 0 … 1, `fogFar` die
   * Nebelweite (m). Die Silhouette trägt eine gedämpfte Landfarbe (Wald und Fels im Dunst); den Rest macht der Nebel der Welt.
   * Leuchtfeuer verblassen mit dem Nebel.
   */
  update(fog: Color, sun: number, night: number, time: number, fogFar = 4000): void {
    if (this.dirty) { this.dirty = false; this.rebuild(); }
    const m = materials();
    this.tmp.copy(LAND).multiplyScalar(0.3 + 0.7 * sun).lerp(fog, 0.22).lerp(HAZE_BLUE, 0.12 * sun).lerp(NIGHT_TINT, 0.6 * night);
    m.sil.color.copy(this.tmp);
    m.foam.color.copy(fog).lerp(WHITE, 0.55).multiplyScalar(0.7 + 0.3 * sun);
    const clear = Math.min(1, Math.max(0, (fogFar - 700) / 1900));
    const bp = this.beacons;
    if (!bp) return;
    const col = bp.geometry.getAttribute('color') as BufferAttribute;
    const arr = col.array as Float32Array;
    const flicker = 0.9 + 0.1 * Math.sin(time * 7.3);
    for (let j = 0; j < this.beaconInfo.length; j++) {
      const info = this.beaconInfo[j];
      const k = Math.max(info.dayK, night) * info.size * flicker * 0.32 * clear;
      arr[j * 3] = BEACON_COL.r * k; arr[j * 3 + 1] = BEACON_COL.g * k; arr[j * 3 + 2] = BEACON_COL.b * k;
    }
    col.needsUpdate = true;
  }

  /**
   * Beim Laden: je ein Objekt jeder Art unter Wasser zeigen, damit die Shader vorübersetzt werden (sonst ruckelt der erste Auftritt einer
   * Silhouette im Spiel). `warmDone` baut sie wieder ab.
   */
  warmUp(): void {
    if (this.warm) return;
    const m = materials();
    const g = new Group();
    const geo = new PlaneGeometry(1, 1);
    const pg = new BufferGeometry();
    pg.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3));
    pg.setAttribute('color', new BufferAttribute(new Float32Array([0, 0, 0]), 3));
    const a = new Mesh(geo, m.sil), b = new Mesh(geo, m.foam), c = new Points(pg, m.beacon);
    for (const o of [a, b, c]) { o.position.set(0, -80, 0); o.userData.noOutline = true; g.add(o); }
    this.root.add(g);
    this.warm = g;
  }

  warmDone(): void {
    if (!this.warm) return;
    this.warm.removeFromParent();
    this.warm.children.forEach((o) => { const g = (o as Mesh).geometry; if (g) g.dispose(); });
    this.warm = null;
  }

  /** Alles abbauen (Welt wird verworfen) */
  dispose(): void {
    this.shown.clear();
    this.rebuild();
    this.warmDone();
    this.root.removeFromParent();
    this.cache.clear();
  }
}

const WHITE = new Color(1, 1, 1);
const NIGHT_TINT = new Color(0.02, 0.03, 0.06);
/** Dunstblau der Ferne am Tag: Inseln am Horizont sind blaugraue Schatten, deutlich dunkler als der helle Dunst */
const HAZE_BLUE = new Color(0.16, 0.3, 0.42);
/** Landfarbe der Silhouetten bei vollem Tageslicht (vor dem Dunst) */
const LAND = new Color(0.17, 0.24, 0.2);
