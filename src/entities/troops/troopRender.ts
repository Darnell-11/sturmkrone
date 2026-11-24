// Darstellung der Massentruppen: ein InstancedMesh je Truppentyp (geteilte Geometrie, ein Zeichenaufruf je Typ), höchstens ~120 Köpfe
// sichtbar. Jeder Kopf ist nur eine Matrix (Ort in der Aufstellung, Wippen beim Gehen, Ausfallschritt beim Angriff) – keine Skelette,
// keine Einzel-KI. Gefallene Köpfe liegen kurz am Boden (kleiner Ringpuffer) und sinken dann weg.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Euler, Group, InstancedBufferAttribute, InstancedMesh,
  Matrix4, Mesh, Object3D, Quaternion, SphereGeometry, Vector3, type MeshToonMaterial,
} from 'three';
import { buildSoldier, type SoldierPalette } from './soldierGeometry';
import { markWind } from '../../render/wind';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TROOP_TYPES, TROOPS, type TroopType } from '../../data/troops';
import { disposeObject, markShared } from '../../render/dispose';
import { toon } from '../../render/toon';

/** Was die Darstellung von einem Trupp braucht (plain Objekt, vom Spiel je Bild gefüllt) */
export interface TroopView {
  typ: TroopType;
  heads: number;
  x: number; y: number; z: number; yaw: number;
  /** Lauftempo 0 … 1, Angriffsimpuls 1 → 0 */
  move: number;
  pulse: number;
  seed: number;
  /** Dichte der Aufstellung (1 normal, kleiner = enger, z. B. im Boot) */
  compact: number;
}

/** Höchstzahl Instanzen je Typ (alle Köpfe eines Typs + Gefallene), Standard */
const CAP = 150;

/** Farben der Uniform für Verbände einer Weltmacht (Verteidiger, Wachen): Rock, Hose, Kopfbedeckung, Zierfarbe (Schild, Bandelier) */
export type TroopPalette = SoldierPalette;
const CORPSE_MAX = 24;
const CORPSE_LIFE = 2.6;

// ---------- Geometrie ----------

const _o = new Object3D();

/** Teil des Beiboots: Vorlage verschoben, gedreht, skaliert, mit Eckpunktfarbe */
function part(src: BufferGeometry, col: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.set(sx, sy, sz); _o.updateMatrix();
  g.applyMatrix4(_o.matrix);
  g.deleteAttribute('uv');
  const n = g.attributes.position.count, c = new Color(col), arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new BufferAttribute(arr, 3));
  return g;
}

/** Geteilter Pool: ein Netz je Truppentyp und Uniform für alle Trupps, Verbände und Decks der Sitzung (nie freigegeben) */
const geoCache = new Map<string, BufferGeometry>();

/** Ein Soldat (~1,75 m) aus `soldierGeometry.ts` (4.4A: verjüngte Glieder, Gesicht, Kragen, Gürtel, Stulpen, Hüte je Macht) */
function soldierGeometry(typ: TroopType, pal?: TroopPalette): BufferGeometry {
  const key = `${typ}:${pal?.id ?? ''}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const geo = markShared(buildSoldier(typ, pal));
  geoCache.set(key, geo);
  return geo;
}

/** Zahl der Netze im Pool (Prüfungen) */
export const soldierPoolSize = (): number => geoCache.size;

let sharedMat: MeshToonMaterial | null = null;
function troopMat(): MeshToonMaterial {
  // Stoff-Oberfläche der Figuren: Kantenlicht, Fresnel-Rand, Köperstoff aus der PBR-Schmiede; Rockschöße wehen im Wind (aWind)
  return sharedMat ??= markShared(markWind(toon({ color: 0xffffff, vertexColors: true, surface: 'cloth', unique: true })) as MeshToonMaterial);
}

// ---------- Aufstellung ----------

/** Zufallswert 0 … 1 aus Trupp-Zufall und Kopfnummer (stabil: kein Flackern, keine Zuweisung) */
function hash(a: number, i: number): number {
  const s = Math.sin(a * 91.7 + i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

const _off = { lat: 0, fwd: 0, row: 0 };
/** Platz von Kopf `i` in einem Trupp aus `n` Köpfen: Reihen quer zur Blickrichtung (Reihe 0 vorn) */
export function formationOffset(i: number, n: number, spacing: number, seed: number, out = _off) {
  const cols = Math.max(1, Math.round(Math.sqrt(n * 1.7)));
  const rows = Math.ceil(n / cols);
  const row = Math.floor(i / cols), col = i % cols;
  const rn = row < rows - 1 ? cols : n - cols * (rows - 1);
  out.lat = (col - (rn - 1) / 2) * spacing + (hash(seed, i) - 0.5) * spacing * 0.22;
  out.fwd = ((rows - 1) / 2 - row) * spacing * 0.85 + (hash(seed, i + 500) - 0.5) * spacing * 0.2;
  out.row = row;
  return out;
}

interface Corpse { on: boolean; typ: TroopType; x: number; y: number; z: number; yaw: number; t: number; spin: number }

const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _p = new Vector3(), _s = new Vector3();

export class TroopRenderer {
  private meshes = new Map<TroopType, InstancedMesh>();
  private counts = new Map<TroopType, number>();
  private corpses: Corpse[] = Array.from({ length: CORPSE_MAX }, () => ({ on: false, typ: 'schwert', x: 0, y: 0, z: 0, yaw: 0, t: 0, spin: 0 }));
  private corpseAt = 0;
  private boats: Mesh[] = [];
  readonly root = new Group();
  private readonly cap: number;

  /**
   * `parent`: die Szene (Weltkoordinaten) oder die Schiffsgruppe (Schiffskoordinaten, für die Deck-Anzeige).
   * `opts.palette`: Uniform einer Weltmacht (Verteidiger, Wachen); `opts.cap`: Platz für mehr Köpfe je Typ (Raid-Verbände).
   */
  constructor(parent: Object3D, shadows = true, opts: { palette?: TroopPalette; cap?: number } = {}) {
    this.root.name = 'truppen';
    this.cap = opts.cap ?? CAP;
    for (const typ of TROOP_TYPES) {
      const m = new InstancedMesh(soldierGeometry(typ, opts.palette), troopMat(), this.cap);
      m.instanceColor = new InstancedBufferAttribute(new Float32Array(this.cap * 3).fill(1), 3);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = shadows;
      m.receiveShadow = true;
      m.userData.noOutline = true;
      m.userData.instanced = true;
      m.name = `truppen_${typ}`;
      this.root.add(m);
      this.meshes.set(typ, m);
    }
    parent.add(this.root);
  }

  set visible(v: boolean) { this.root.visible = v; }

  /** Instanzen der Köpfe aktuell gezeichnet (für Prüfungen) */
  get drawn(): number { let n = 0; for (const m of this.meshes.values()) n += m.count; return n; }
  /** Zeichenaufrufe dieser Darstellung (ein Netz je Typ mit Köpfen) */
  get drawCalls(): number { let n = 0; for (const m of this.meshes.values()) if (m.count > 0 && this.root.visible) n++; return n; }

  /** `k` Köpfe eines Trupps sind gefallen: sie bleiben als Gefallene am Boden liegen */
  fall(v: TroopView, k: number) {
    const d = TROOPS[v.typ];
    const n = v.heads + k;
    const cs = Math.cos(v.yaw), sn = Math.sin(v.yaw);
    for (let j = 0; j < Math.min(k, 6); j++) {
      const o = formationOffset(v.heads + j, n, d.spacing * v.compact, v.seed);
      const c = this.corpses[this.corpseAt++ % CORPSE_MAX];
      c.on = true; c.typ = v.typ; c.t = 0; c.yaw = v.yaw; c.spin = (hash(v.seed, j) - 0.5) * 1.2;
      c.x = v.x + o.lat * cs + o.fwd * sn; c.z = v.z - o.lat * sn + o.fwd * cs; c.y = v.y;
    }
  }

  /** Alle Köpfe schreiben. `t` = Spielzeit (s), `dt` = Bildzeit */
  update(views: readonly TroopView[], t: number, dt: number) {
    for (const typ of TROOP_TYPES) this.counts.set(typ, 0);
    for (const v of views) {
      if (v.heads <= 0) continue;
      const mesh = this.meshes.get(v.typ)!;
      let c = this.counts.get(v.typ)!;
      const d = TROOPS[v.typ];
      const n = v.heads, sp = d.spacing * v.compact;
      const cs = Math.cos(v.yaw), sn = Math.sin(v.yaw);
      const arr = mesh.instanceMatrix.array as Float32Array, col = mesh.instanceColor!.array as Float32Array;
      for (let i = 0; i < n && c < this.cap - CORPSE_MAX; i++, c++) {
        const o = formationOffset(i, n, sp, v.seed);
        const ph = v.seed * 40 + i * 1.7;
        let fwd = o.fwd, lean = 0, bob = 0;
        if (v.move > 0.04) { bob = Math.abs(Math.sin(t * (7 + v.move * 3) + ph)) * 0.07 * v.move; lean = 0.14 * v.move; }
        if (v.pulse > 0) {
          const u = 1 - v.pulse;
          if (d.ranged) lean -= 0.3 * v.pulse;
          else if (o.row <= 1) { const k = Math.sin(Math.min(1, u * 1.6) * Math.PI); fwd += k * 0.5; lean += 0.4 * k; }
        }
        const sway = Math.sin(t * 1.3 + ph) * 0.012;
        const x = v.x + o.lat * cs + fwd * sn, z = v.z - o.lat * sn + fwd * cs;
        _e.set(lean, v.yaw + (hash(v.seed, i + 900) - 0.5) * 0.35, sway * 3 + (v.move > 0.04 ? Math.sin(t * 4 + ph) * 0.05 * v.move : 0), 'YXZ');
        _q.setFromEuler(_e);
        _m.compose(_p.set(x, v.y + bob, z), _q, _s.set(1, 1 + sway, 1));
        _m.toArray(arr, c * 16);
        const b = 0.86 + hash(v.seed, i + 77) * 0.28, tint = (hash(v.seed, i + 33) - 0.5) * 0.12;
        col[c * 3] = b * (1 + tint); col[c * 3 + 1] = b; col[c * 3 + 2] = b * (1 - tint);
      }
      this.counts.set(v.typ, c);
    }
    // Gefallene: kippen, liegen, sinken weg
    for (const k of this.corpses) {
      if (!k.on) continue;
      k.t += dt;
      if (k.t > CORPSE_LIFE) { k.on = false; continue; }
      const mesh = this.meshes.get(k.typ)!;
      const c = this.counts.get(k.typ)!;
      if (c >= this.cap) continue;
      const fall = Math.min(1, k.t * 3.5), sink = Math.max(0, k.t - 1.4) / (CORPSE_LIFE - 1.4);
      _e.set(-Math.PI / 2 * fall, k.yaw + k.spin, 0, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p.set(k.x, k.y + 0.12 * fall - sink * 0.35, k.z), _q, _s.set(1 - sink * 0.6, 1 - sink * 0.6, 1 - sink * 0.6));
      _m.toArray(mesh.instanceMatrix.array as Float32Array, c * 16);
      const col = mesh.instanceColor!.array as Float32Array;
      col[c * 3] = col[c * 3 + 1] = col[c * 3 + 2] = 0.7;
      this.counts.set(k.typ, c + 1);
    }
    for (const typ of TROOP_TYPES) {
      const m = this.meshes.get(typ)!;
      m.count = this.counts.get(typ)!;
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
    }
  }

  /** Beiboot Nr. `i` setzen (Weltkoordinaten); null = ausblenden */
  boat(i: number, pose: { x: number; y: number; z: number; yaw: number; s: number } | null) {
    let b = this.boats[i];
    if (!pose) { if (b) b.visible = false; return; }
    if (!b) { b = new Mesh(boatGeometry(), boatMaterial()); b.castShadow = true; b.receiveShadow = true; b.userData.noOutline = true; this.root.add(b); this.boats[i] = b; }
    b.visible = true;
    b.position.set(pose.x, pose.y, pose.z);
    b.rotation.set(0, pose.yaw, Math.sin(pose.x * 0.7 + pose.z * 0.5) * 0.03);
    b.scale.setScalar(pose.s);
  }

  clearCorpses() { for (const c of this.corpses) c.on = false; }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.meshes.values()) m.dispose();
    for (const b of this.boats) b?.removeFromParent();
    this.meshes.clear();
    this.boats = [];
    disposeObject(this.root);
  }
}

// ---------- Beiboot ----------

let boatGeo: BufferGeometry | null = null;
let boatMat: MeshToonMaterial | null = null;
function boatGeometry(): BufferGeometry {
  if (boatGeo) return boatGeo;
  const cyl = new CylinderGeometry(1, 1, 1, 10, 1);
  const box = new BoxGeometry(1, 1, 1);
  const sph = new SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const parts: BufferGeometry[] = [
    part(sph, '#6A4A2A', 0, 0.55, 0, 0, 0, 0, 1.15, 0.7, 3.0),     // Rumpf (Halbschale)
    part(box, '#8A6A3A', 0, 0.62, 0.0, 0, 0, 0, 2.0, 0.07, 0.14), // Ruderbank
    part(box, '#8A6A3A', 0, 0.62, 1.0, 0, 0, 0, 1.7, 0.07, 0.14),
    part(box, '#8A6A3A', 0, 0.62, -1.0, 0, 0, 0, 1.7, 0.07, 0.14),
    part(cyl, '#C9B38A', 1.3, 0.75, 0.3, 0, 0, 1.2, 0.05, 1.8, 0.05), // Riemen
    part(cyl, '#C9B38A', -1.3, 0.75, 0.3, 0, 0, -1.2, 0.05, 1.8, 0.05),
  ];
  boatGeo = markShared(mergeGeometries(parts, false) ?? new BufferGeometry());
  for (const p of parts) p.dispose();
  return boatGeo;
}
function boatMaterial(): MeshToonMaterial {
  return boatMat ??= markShared(toon({ color: 0xffffff, vertexColors: true, side: 2 }));
}
