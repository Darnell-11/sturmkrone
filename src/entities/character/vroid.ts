// Anime-Figuren aus VRoid Studio (CC0) – Laden, Aufbereiten und Übertragen der Animationen.
import {
  PropertyBinding,
  AnimationClip,
  AnimationMixer,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  Matrix3,
  Matrix4,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
  Vector3,
  VectorKeyframeTrack,
  type Material,
  type MeshStandardMaterial,
} from 'three';
import type { HairFit } from './animeHats';
import type { SkinPin } from './sockets';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { markShared } from '../../render/dispose';
import { preload } from '../../core/preload';

/** Unsere Knochennamen (KayKit-Skelett) → VRoid-Knochen */
export const VROID_BONES: Record<string, string> = {
  hips: 'J_Bip_C_Hips', spine: 'J_Bip_C_Spine', chest: 'J_Bip_C_Chest', head: 'J_Bip_C_Head',
  upperarml: 'J_Bip_L_UpperArm', lowerarml: 'J_Bip_L_LowerArm', wristl: 'J_Bip_L_Hand',
  upperarmr: 'J_Bip_R_UpperArm', lowerarmr: 'J_Bip_R_LowerArm', wristr: 'J_Bip_R_Hand',
  upperlegl: 'J_Bip_L_UpperLeg', lowerlegl: 'J_Bip_L_LowerLeg', footl: 'J_Bip_L_Foot', toesl: 'J_Bip_L_ToeBase',
  upperlegr: 'J_Bip_R_UpperLeg', lowerlegr: 'J_Bip_R_LowerLeg', footr: 'J_Bip_R_Foot', toesr: 'J_Bip_R_ToeBase',
};
/** Quelle der Handbewegung beim Übertragen (in Ruhe deckungsgleich mit dem Handgelenk) */
const SRC_HAND: Record<string, string> = { wristl: 'handl', wristr: 'handr' };
/** Für Waffen und andere Halterungen: unsere Hand liegt auf der VRoid-Hand */
const HAND_ALIAS: Record<string, string> = { handl: 'J_Bip_L_Hand', handr: 'J_Bip_R_Hand' };

/** Welche Materialteile wie eingefärbt werden */
export type TintSlot = 'skin' | 'hair' | 'top' | 'bottom' | 'shoes' | 'iris' | 'brow' | 'fixed';
function slotOf(name: string): TintSlot {
  if (/HAIR/i.test(name)) return 'hair';
  if (/FaceBrow/i.test(name)) return 'brow';
  if (/_SKIN/i.test(name)) return 'skin';
  if (/Tops/i.test(name)) return 'top';
  if (/Bottoms/i.test(name)) return 'bottom';
  if (/Shoes/i.test(name)) return 'shoes';
  if (/EyeIris/i.test(name)) return 'iris';
  return 'fixed';
}

export interface VroidPart { mesh: SkinnedMesh; slot: TintSlot; map: Texture | null; gray: Texture | null; transparent: boolean; alphaTest: number; doubleSided: boolean }

const q1 = new Quaternion(), q2 = new Quaternion(), q3 = new Quaternion();
const v1 = new Vector3(), v2 = new Vector3();

/** Graustufen-Fassung einer Textur, damit beliebige Farben darübergelegt werden können */
function grayTexture(t: Texture | null, contrast = 1.15): Texture | null {
  const img = t?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!t || !img || !img.width) return null;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  // mittlere Helligkeit, damit die Zielfarbe ungefähr getroffen wird
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i += 16) if (a[i + 3] > 128) { sum += 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2]; n++; }
  const mean = n ? sum / n : 128;
  for (let i = 0; i < a.length; i += 4) {
    const l = 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2];
    const v = Math.max(0, Math.min(255, 215 + (l - mean) * contrast));
    a[i] = a[i + 1] = a[i + 2] = v;
  }
  g.putImageData(d, 0, 0);
  const out = markShared(new CanvasTexture(c));
  out.colorSpace = SRGBColorSpace;
  out.flipY = t.flipY;
  out.wrapS = t.wrapS; out.wrapT = t.wrapT;
  return out;
}

/** Eine aufbereitete Grundfigur (männlich oder weiblich) mit übertragenen Animationen */
export class VroidBase {
  readonly template: Group;
  /** Hüfthöhe in Weltmaß (für die Hüft-Bewegung der Animationen) */
  private hipH: number;
  private clips = new Map<string, AnimationClip>();
  /** Lage der Waffenhalterung relativ zur Hand */
  readonly slot: Record<'l' | 'r', { pos: Vector3; quat: Quaternion; scale: number }>;
  readonly parts: { name: string; slot: TintSlot; transparent: boolean; alphaTest: number; doubleSided: boolean; map: Texture | null; gray: Texture | null }[] = [];

  constructor(scene: Object3D, readonly height: number, private srcRig: Object3D, private srcClips: Map<string, AnimationClip>, srcSlot: Vector3) {
    // VRM 0.x schaut nach −Z, unsere Figuren nach +Z
    const inner = scene;
    inner.rotation.y = Math.PI;
    this.template = new Group();
    this.template.add(inner);
    this.mergeParts(inner);
    // auf Zielgröße bringen
    this.template.updateMatrixWorld(true);
    const head = this.find(this.template, 'J_Bip_C_Head');
    const foot = this.find(this.template, 'J_Bip_L_Foot');
    const hy = head ? head.getWorldPosition(v1).y + 0.12 : 1.6;
    const fy = foot ? foot.getWorldPosition(v2).y - 0.06 : 0;
    this.template.scale.setScalar(height / Math.max(0.5, hy - fy));
    this.template.updateMatrixWorld(true);
    // Netze der Grundfigur teilen sich alle Figuren (Klone) – nie freigeben
    this.template.traverse((o) => { const g = (o as SkinnedMesh).geometry; if (g) markShared(g); });
    this.hipH = this.find(this.template, 'J_Bip_C_Hips')!.getWorldPosition(v1).y;
    this.computeCorrections();
    // Waffenhalterung aus der alten Figur übernehmen (gleiche Ausrichtung in der Welt)
    this.slot = { l: this.slotFor('l', srcSlot), r: this.slotFor('r', srcSlot) };
    this.hairFit = this.computeHairFit();
  }

  /** Wo ein Hut auf dieser Frisur sitzt (im Raum des Kopfknochens) */
  readonly hairFit: HairFit | null;
  private computeHairFit(): HairFit | null {
    const head = this.find(this.template, 'J_Bip_C_Head');
    if (!head) return null;
    this.template.updateMatrixWorld(true);
    const inv = head.matrixWorld.clone().invert();
    const pts: number[] = [];
    this.template.traverse((o) => {
      const m = o as SkinnedMesh;
      const p = m.isSkinnedMesh ? this.parts[m.userData.vroidPart as number] : null;
      if (p?.slot !== 'hair') return;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { v1.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv); pts.push(v1.x, v1.y, v1.z); }
    });
    if (!pts.length) return null;
    const ys: number[] = [];
    for (let i = 1; i < pts.length; i += 3) ys.push(pts[i]);
    ys.sort((a, b) => a - b);
    // einzelne Strähnen (Antenne) zählen nicht: Oberkante bei 98,5 %
    const top = ys[Math.floor(ys.length * 0.985)];
    const cache = new Map<number, ReturnType<HairFit>>();
    return (sink: number) => {
      if (cache.has(sink)) return cache.get(sink)!;
      const seat = top - sink;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < pts.length; i += 3) {
        if (Math.abs(pts[i + 1] - seat) > 0.012) continue;
        minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
        minZ = Math.min(minZ, pts[i + 2]); maxZ = Math.max(maxZ, pts[i + 2]);
      }
      // Ponys ragen nach vorn – die Tiefe zählt etwas weniger als die Breite
      const res = Number.isFinite(minX) ? { seat, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, radius: Math.max((maxX - minX) / 2, ((maxZ - minZ) / 2) * 0.85) } : null;
      cache.set(sink, res);
      return res;
    };
  }

  private find(root: Object3D, name: string) { return root.getObjectByName(name) ?? null; }

  /**
   * Lage der Iris in ihrer Textur, gemessen an den UV-Koordinaten des Augen-Netzes (für die Glanzpunkte). Die Textur
   * enthält beide Augen nebeneinander: Abstand der Mitten von u = 0,5, Mitte v, halbe Breite (u), halbe Höhe (v).
   */
  private irisBox: [number, number, number, number] | null = null;
  irisUv(): [number, number, number, number] {
    if (this.irisBox) return this.irisBox;
    let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
    this.template.traverse((o) => {
      const m = o as SkinnedMesh;
      const p = m.isSkinnedMesh ? this.parts[m.userData.vroidPart as number] : null;
      const uv = p?.slot === 'iris' ? m.geometry.attributes.uv : null;
      if (!uv) return;
      for (let i = 0; i < uv.count; i++) {
        // eine Hälfte der Textur je Auge: auf die rechte Hälfte falten
        const u = Math.abs(uv.getX(i) - 0.5), w = uv.getY(i);
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); w0 = Math.min(w0, w); w1 = Math.max(w1, w);
      }
    });
    this.irisBox = Number.isFinite(u0) ? [(u0 + u1) / 2, (w0 + w1) / 2, Math.max(0.02, (u1 - u0) / 2), Math.max(0.02, (w1 - w0) / 2)] : [0.25, 0.5, 0.15, 0.3];
    return this.irisBox;
  }

  /**
   * Kopfmitte im Raum der Haar-Netze: Kugel durch die Haarkuppe (oberste 8 cm). Das Lichtband im Haar folgt dieser
   * Rundung statt den Normalen der einzelnen Strähnen.
   */
  private hairBall: [number, number, number] | null = null;
  hairCenter(): [number, number, number] {
    if (this.hairBall) return this.hairBall;
    const pts: number[] = [];
    this.template.traverse((o) => {
      const m = o as SkinnedMesh;
      const p = m.isSkinnedMesh ? this.parts[m.userData.vroidPart as number] : null;
      if (p?.slot !== 'hair') return;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) pts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    });
    if (!pts.length) return (this.hairBall = [0, 0, 0]);
    const ys: number[] = [];
    for (let i = 1; i < pts.length; i += 3) ys.push(pts[i]);
    ys.sort((a, b) => a - b);
    // einzelne abstehende Strähnen zählen nicht (wie beim Hutsitz)
    const top = ys[Math.floor(ys.length * 0.985)];
    const d = 0.08;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < pts.length; i += 3) {
      if (pts[i + 1] < top - d || pts[i + 1] > top) continue;
      minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
      minZ = Math.min(minZ, pts[i + 2]); maxZ = Math.max(maxZ, pts[i + 2]);
    }
    const a = Math.max(maxX - minX, maxZ - minZ) / 2;
    const R = Math.min(0.16, Math.max(0.08, (a * a + d * d) / (2 * d)));
    return (this.hairBall = [(minX + maxX) / 2, top - R, (minZ + maxZ) / 2]);
  }

  /**
   * Ausrichtungskorrektur je Knochen: die alte Figur steht in Ruhe leicht im A, die neue im T.
   * C dreht die Ruherichtung des neuen Knochens auf die des alten, damit Bewegungen gleich aussehen.
   */
  private corr = new Map<string, Quaternion>();
  private computeCorrections() {
    const CHILD: Record<string, [string, string]> = {
      hips: ['spine', 'J_Bip_C_Spine'], spine: ['chest', 'J_Bip_C_Chest'], chest: ['head', 'J_Bip_C_Head'],
      upperarml: ['lowerarml', 'J_Bip_L_LowerArm'], lowerarml: ['wristl', 'J_Bip_L_Hand'], wristl: ['handl', 'J_Bip_L_Middle1'],
      upperarmr: ['lowerarmr', 'J_Bip_R_LowerArm'], lowerarmr: ['wristr', 'J_Bip_R_Hand'], wristr: ['handr', 'J_Bip_R_Middle1'],
      upperlegl: ['lowerlegl', 'J_Bip_L_LowerLeg'], lowerlegl: ['footl', 'J_Bip_L_Foot'], footl: ['toesl', 'J_Bip_L_ToeBase'],
      upperlegr: ['lowerlegr', 'J_Bip_R_LowerLeg'], lowerlegr: ['footr', 'J_Bip_R_Foot'], footr: ['toesr', 'J_Bip_R_ToeBase'],
    };
    this.srcRig.updateMatrixWorld(true);
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), d = new Vector3();
    for (const [sn, dn] of Object.entries(VROID_BONES)) {
      const ch = CHILD[sn];
      const s = this.srcRig.getObjectByName(sn), dd = this.find(this.template, dn);
      if (!ch || !s || !dd || sn === 'hips' || sn === 'spine' || sn === 'chest') continue;
      const sc = this.srcRig.getObjectByName(ch[0]), dc = this.find(this.template, ch[1]);
      if (!sc || !dc) continue;
      s.getWorldPosition(a); sc.getWorldPosition(b);
      dd.getWorldPosition(c); dc.getWorldPosition(d);
      const ds = b.sub(a).normalize(), dt = d.sub(c).normalize();
      if (ds.lengthSq() < 0.5 || dt.lengthSq() < 0.5) continue;
      this.corr.set(dn, new Quaternion().setFromUnitVectors(dt, ds));
    }
  }

  /** Ruhe-Weltlage eines Zielknochens inklusive Ausrichtungskorrektur */
  private restWorld(d: Object3D, out: Quaternion) {
    d.getWorldQuaternion(out);
    const c = this.corr.get(d.name);
    if (c) out.premultiply(c);
    return out;
  }

  /** Teile mit gleichem Material zusammenführen (die Haare bestehen aus über 100 Einzelteilen) */
  private mergeParts(root: Object3D) {
    const groups = new Map<string, SkinnedMesh[]>();
    root.traverse((o) => {
      const m = o as SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      const mat = m.material as Material;
      const key = `${m.skeleton.uuid}|${mat.uuid}|${m.geometry.morphAttributes.position ? 'm' : ''}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
    });
    for (const list of groups.values()) {
      const first = list[0];
      if (list.length > 1 && !first.geometry.morphAttributes.position) {
        const geos = list.map((m) => m.geometry);
        const keys = Object.keys(geos[0].attributes);
        const merged = mergeGeometries(geos.map((g) => { const c = new BufferGeometry(); for (const k of keys) if (g.attributes[k]) c.setAttribute(k, g.attributes[k]); c.setIndex(g.index); return c; }), false);
        if (merged) {
          first.geometry = merged;
          for (const m of list.slice(1)) m.removeFromParent();
        }
      }
      // fehlende Normalen ergänzen (sonst ungültige Lichtwerte und ein schwarzes Bild)
      if (!first.geometry.attributes.normal) first.geometry.computeVertexNormals();
      // großzügige Hüllkugel, damit Figuren in Bewegung nicht fälschlich ausgeblendet werden
      first.geometry.computeBoundingSphere();
      if (first.geometry.boundingSphere) first.geometry.boundingSphere.radius *= 1.6;
      const mat = first.material as MeshStandardMaterial;
      const slot = slotOf(mat.name);
      // Texturen der Grundfigur teilen sich alle Figuren (auch ihre Effekt-Kopien) – nie freigeben
      const map = mat.map ? markShared(mat.map) : null;
      this.parts.push({
        name: first.name, slot, map,
        gray: slot === 'hair' || slot === 'top' || slot === 'bottom' || slot === 'shoes' || slot === 'iris' || slot === 'brow' ? grayTexture(map, slot === 'iris' ? 1.4 : 1.15) : null,
        transparent: mat.transparent, alphaTest: mat.alphaTest, doubleSided: mat.side === 2,
      });
      first.userData.vroidPart = this.parts.length - 1;
      this.partGeo.push(first.geometry);
      first.frustumCulled = false;
    }
  }

  /** Netz jedes Teils der Vorlage (Index wie parts) – Figuren teilen sich dessen Punktdaten, auch mit eigener Dreiecksliste */
  readonly partGeo: BufferGeometry[] = [];

  /** Halterung so legen, dass die Waffe in der Welt genauso liegt wie an der alten Figur */
  private slotFor(s: 'l' | 'r', srcSlot: Vector3) {
    this.srcRig.updateMatrixWorld(true);
    const srcHand = this.srcRig.getObjectByName(`hand${s}`)!;
    // Die Halterung der Animationsdateien ist gegen die Hand um 90° gedreht: die Klinge (+Y) ragt
    // quer aus der Faust (Daumenseite) statt als Verlängerung des Unterarms aus den Fingern
    const srcNode = this.srcRig.getObjectByName(`handslot${s}`);
    const local = srcNode ? srcNode.matrix.clone() : new Matrix4().compose(srcSlot, slotTurn(s), new Vector3(1, 1, 1));
    const slotWorld = new Matrix4().multiplyMatrices(srcHand.matrixWorld, local);
    const slotPos = new Vector3(), slotQuat = new Quaternion(), slotScale = new Vector3();
    slotWorld.decompose(slotPos, slotQuat, slotScale);
    const dstHand = this.find(this.template, s === 'l' ? 'J_Bip_L_Hand' : 'J_Bip_R_Hand')!;
    const handQuat = this.restWorld(dstHand, new Quaternion());
    const handScale = dstHand.getWorldScale(new Vector3()).x;
    const inv = handQuat.clone().invert();
    // in die Handfläche: zwischen Hand und Mittelfinger-Grundgelenk
    const mid = this.find(dstHand, s === 'l' ? 'J_Bip_L_Middle1' : 'J_Bip_R_Middle1');
    const palm = mid ? mid.position.clone().multiplyScalar(0.75) : new Vector3();
    return {
      pos: palm,
      quat: inv.multiply(slotQuat),
      // Waffen in derselben Weltgröße wie bisher
      scale: 0.8 / handScale,
    };
  }

  /** Kleidungsstücke aus dem Körper selbst (einmal je Grundfigur berechnet) */
  private garments = new Map<string, BufferGeometry | null>();
  garment(kind: GarmentKind, ctx: GarmentCtx = PLAIN): BufferGeometry | null {
    const key = garmentKey(kind, ctx);
    if (!this.garments.has(key)) this.garments.set(key, this.buildGarment(kind, ctx));
    return this.garments.get(key) ?? null;
  }

  /**
   * Mehrere Kleidungsstücke als ein Netz (eine Zeichenoperation je Figur): das Attribut „part“ sagt,
   * zu welchem Stück ein Punkt gehört – daraus färbt jede Figur ihre Stücke selbst ein.
   */
  private sets = new Map<string, BufferGeometry | null>();
  garmentSet(kinds: GarmentKind[], ctx: GarmentCtx = PLAIN): BufferGeometry | null {
    const key = kinds.map((k) => garmentKey(k, ctx)).join('+');
    if (!this.sets.has(key)) {
      const body = this.bodySkin(this.template)!;
      const skinIdx = body.geometry.index!;
      // je Dreieck: die drei Hautpunkte, aus denen es entstand, und die Ebene seines Stücks (für die Maske, bodyMask.ts)
      const src: number[] = [], level: number[] = [];
      const geos = kinds.map((k, i) => {
        const g = this.garment(k, ctx);
        if (!g) return null;
        const c = g.clone();
        c.userData = {};
        c.setAttribute('part', new BufferAttribute(new Float32Array(g.attributes.position.count).fill(i), 1));
        for (const t of (g.userData as GarmentData).srcTri) { src.push(skinIdx.getX(t * 3), skinIdx.getX(t * 3 + 1), skinIdx.getX(t * 3 + 2)); level.push(GARMENT_LEVEL[k]); }
        return c;
      }).filter((g): g is BufferGeometry => !!g);
      const merged = geos.length ? mergeGeometries(geos, false) : null;
      if (merged) {
        merged.computeBoundingSphere();
        if (merged.boundingSphere) merged.boundingSphere.radius *= 1.6;
        merged.userData = { key, src: Int32Array.from(src), level: Uint8Array.from(level) } satisfies GarmentSetData;
      }
      this.sets.set(key, merged ? markShared(merged) : null);
    }
    return this.sets.get(key) ?? null;
  }

  /** Hautpunkte, die ein Kleidungsstück eng und deckend verdeckt (Saumrand schon abgezogen) */
  garmentCover(kind: GarmentKind, ctx: GarmentCtx = PLAIN): Uint8Array | null {
    return (this.garment(kind, ctx)?.userData as GarmentData | undefined)?.cover ?? null;
  }

  // ---------- Aufbau der Haut (für Masken) ----------
  private topo: { weld: Int32Array; n: number } | null = null;
  /** Nahtpunkte der Haut (gleiche Lage, getrennte Punkte für Texturkanten) auf einen gemeinsamen Punkt abbilden */
  private skinWeld() {
    if (this.topo) return this.topo;
    const pos = this.bodySkin(this.template)!.geometry.attributes.position;
    const weld = new Int32Array(pos.count);
    const seen = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
      const c = seen.get(key);
      if (c === undefined) { seen.set(key, i); weld[i] = i; } else weld[i] = c;
    }
    return (this.topo = { weld, n: pos.count });
  }

  /**
   * Bedeckte Fläche um „rings“ Punkt-Ringe vom Rand zurücknehmen: unter jedem Saum bleibt ein Streifen der unteren
   * Schicht stehen, damit man nie in ein Loch sieht. Negative Werte weiten die Fläche um so viele Ringe aus.
   * (Ein Ring der Haut ist etwa 3 cm breit.)
   */
  erodeCover(cover: Uint8Array, rings: number): Uint8Array {
    const { weld, n } = this.skinWeld();
    const idx = this.bodySkin(this.template)!.geometry.index!;
    let cur = new Uint8Array(n);
    for (let i = 0; i < n; i++) cur[weld[i]] = 1;
    for (let i = 0; i < n; i++) if (!cover[i]) cur[weld[i]] = 0;
    for (let r = 0; r < Math.abs(rings); r++) {
      const next = cur.slice();
      for (let t = 0; t < idx.count; t += 3) {
        const a = weld[idx.getX(t)], b = weld[idx.getX(t + 1)], c = weld[idx.getX(t + 2)];
        if (rings > 0) { if (!(cur[a] && cur[b] && cur[c])) next[a] = next[b] = next[c] = 0; }
        else if (cur[a] || cur[b] || cur[c]) next[a] = next[b] = next[c] = 1;
      }
      cur = next;
    }
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = cur[weld[i]];
    return out;
  }

  /**
   * Hautpunkte unter der eng anliegenden, deckenden Grundkleidung (Hemd bzw. Schuhe der Vorlage), Saumrand abgezogen.
   * Gemessen mit einem Strahl je Hautpunkt entlang seiner Normale: trifft er innerhalb von 2,5 cm ein Stoff-Dreieck,
   * dessen Textur dort deckt, liegt der Punkt sicher unter dem Stoff. (Die Haut ist grob aufgeteilt – nach
   * Punkt-Nachbarschaft allein blieben zu viele Lücken.)
   */
  private baseCovers = new Map<string, Uint8Array>();
  baseCover(slot: 'top' | 'shoes'): Uint8Array {
    let c = this.baseCovers.get(slot);
    if (c) return c;
    const body = this.bodySkin(this.template)!;
    this.template.updateMatrixWorld(true);
    const cl = this.clearance();
    const near = slot === 'top' ? cl.top : cl.shoes;
    const pos = body.geometry.attributes.position, nor = body.geometry.attributes.normal;
    const n = pos.count;
    const nm = new Matrix3().getNormalMatrix(body.matrixWorld);
    // Schuhe sind rundum geschlossen: der Fuß darin ist nie zu sehen, auch wo die Sohle dick ist
    const reach = slot === 'shoes' ? 0.06 : BASE_TIGHT;
    // Stoff-Dreiecke in Weltlage, mit Hüllkasten und Texturkoordinaten
    const tris: { a: Vector3; e1: Vector3; e2: Vector3; lo: Vector3; hi: Vector3; uv: number[]; alpha: ((u: number, v: number) => boolean) | null }[] = [];
    this.template.traverse((o) => {
      const m = o as SkinnedMesh;
      const part = m.isSkinnedMesh ? this.parts[m.userData.vroidPart as number] : null;
      if (!part || part.slot !== slot || !m.geometry.index) return;
      const cp = m.geometry.attributes.position, uv = m.geometry.attributes.uv, idx = m.geometry.index;
      const alpha = alphaSampler(part.map);
      for (let t = 0; t < idx.count; t += 3) {
        const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
        const a = new Vector3().fromBufferAttribute(cp, i0).applyMatrix4(m.matrixWorld);
        const b = new Vector3().fromBufferAttribute(cp, i1).applyMatrix4(m.matrixWorld);
        const d = new Vector3().fromBufferAttribute(cp, i2).applyMatrix4(m.matrixWorld);
        tris.push({
          a, e1: b.clone().sub(a), e2: d.clone().sub(a), lo: a.clone().min(b).min(d).addScalar(-reach - 0.005), hi: a.clone().max(b).max(d).addScalar(reach + 0.005),
          uv: uv ? [uv.getX(i0), uv.getY(i0), uv.getX(i1), uv.getY(i1), uv.getX(i2), uv.getY(i2)] : [], alpha,
        });
      }
    });
    const hit = new Uint8Array(n);
    const P = new Vector3(), N = new Vector3(), h = new Vector3(), sV = new Vector3(), q = new Vector3();
    for (let i = 0; i < n; i++) {
      if (near[i] < 0) continue;
      P.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
      N.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      // knapp unter der Haut beginnen (anliegender Stoff liegt stellenweise auf ihr)
      P.addScaledVector(N, -0.004);
      let bestT = Infinity, solid = false;
      for (const tr of tris) {
        if (P.x < tr.lo.x || P.y < tr.lo.y || P.z < tr.lo.z || P.x > tr.hi.x || P.y > tr.hi.y || P.z > tr.hi.z) continue;
        h.crossVectors(N, tr.e2);
        const det = tr.e1.dot(h);
        if (Math.abs(det) < 1e-12) continue;
        const f = 1 / det;
        sV.subVectors(P, tr.a);
        const u = f * sV.dot(h);
        if (u < 0 || u > 1) continue;
        q.crossVectors(sV, tr.e1);
        const v = f * N.dot(q);
        if (v < 0 || u + v > 1) continue;
        const t = f * tr.e2.dot(q);
        if (t < 0 || t > reach + 0.004 || t >= bestT) continue;
        bestT = t;
        const w = 1 - u - v;
        solid = !!tr.alpha && tr.uv.length === 6 && tr.alpha(tr.uv[0] * w + tr.uv[2] * u + tr.uv[4] * v, tr.uv[1] * w + tr.uv[3] * u + tr.uv[5] * v);
      }
      if (solid) hit[i] = 1;
    }
    c = this.erodeCover(hit, BASE_RINGS);
    this.baseCovers.set(slot, c);
    return c;
  }

  /**
   * Haar-Dreiecke unter einer Kappe (Kopftuch, Mütze, Helm …): alles, was ganz über dem Hutrand liegt, fällt weg.
   * Liefert die Dreiecksliste des Haar-Teils ohne diese Dreiecke (geteilt, je Sitztiefe einmal berechnet).
   */
  private hairLists = new Map<string, BufferAttribute | null>();
  hairUnderCap(part: number, sink: number, rim = CAP_RIM): BufferAttribute | null {
    const key = `${part}|${sink}|${rim}`;
    if (this.hairLists.has(key)) return this.hairLists.get(key)!;
    let out: BufferAttribute | null = null;
    const fit = this.hairFit?.(sink);
    const head = this.find(this.template, 'J_Bip_C_Head');
    let mesh: SkinnedMesh | null = null;
    this.template.traverse((o) => { const m = o as SkinnedMesh; if (m.isSkinnedMesh && m.userData.vroidPart === part) mesh = m; });
    const m = mesh as SkinnedMesh | null;
    if (fit && head && m?.geometry.index) {
      this.template.updateMatrixWorld(true);
      const inv = head.matrixWorld.clone().invert().multiply(m.matrixWorld);
      const pos = m.geometry.attributes.position, idx = m.geometry.index;
      const above = new Uint8Array(pos.count);
      // Streifen unter dem Rand bleibt stehen (der Hut sitzt etwas ins Haar gedrückt)
      const limit = fit.seat + rim;
      for (let i = 0; i < pos.count; i++) if (v1.fromBufferAttribute(pos, i).applyMatrix4(inv).y > limit) above[i] = 1;
      const keep: number[] = [];
      for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
        if (!(above[a] && above[b] && above[c])) keep.push(a, b, c);
      }
      if (keep.length < idx.count) out = markShared(new BufferAttribute(pos.count > 65535 ? Uint32Array.from(keep) : Uint16Array.from(keep), 1));
    }
    this.hairLists.set(key, out);
    return out;
  }

  /** Weibliche Grundfigur? (Rock wird ausgeblendet, darunter trägt sie die erzeugte Hose) */
  get female() { return this.height < 1.7; }

  /**
   * Freiraum zur Grundkleidung je Hautpunkt (einmal je Grundfigur): Für jeden Punkt von Hemd, Hose und Schuhen
   * den nächsten Hautpunkt suchen (Raster 2 cm) und den Abstand entlang dessen Normale merken; danach zweimal über
   * die Nachbarn ausweiten, damit keine Lücken zwischen den Kleidungspunkten bleiben.
   */
  private clear: Clearance | null = null;
  clearance(): Clearance {
    if (this.clear) return this.clear;
    const body = this.bodySkin(this.template)!;
    this.template.updateMatrixWorld(true);
    const geo = body.geometry, pos = geo.attributes.position, nor = geo.attributes.normal;
    const mw = body.matrixWorld, nm = new Matrix3().getNormalMatrix(mw);
    const n = pos.count;
    const SP = new Float32Array(n * 3), SN = new Float32Array(n * 3);
    const cell = 0.02, grid = new Map<string, number[]>();
    const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    const P = new Vector3(), N = new Vector3();
    for (let i = 0; i < n; i++) {
      P.fromBufferAttribute(pos, i).applyMatrix4(mw); P.toArray(SP, i * 3);
      N.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N.toArray(SN, i * 3);
      const k = key(P.x, P.y, P.z);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
    }
    const out: Clearance = { top: new Float32Array(n).fill(-1), bottom: new Float32Array(n).fill(-1), shoes: new Float32Array(n).fill(-1), topSolid: new Uint8Array(n), shoesSolid: new Uint8Array(n), topLoose: new Uint8Array(n), shoesLoose: new Uint8Array(n), owners: new Map() };
    // direkter Befund je Hautpunkt: 1 = eng und deckend bedeckt, 2 = bedeckt, aber lose oder durchsichtig
    const direct = { top: new Uint8Array(n), bottom: new Uint8Array(n), shoes: new Uint8Array(n) };
    this.template.traverse((o) => {
      const m = o as SkinnedMesh;
      const part = m.isSkinnedMesh ? this.parts[m.userData.vroidPart as number] : null;
      if (!part || (part.slot !== 'top' && part.slot !== 'bottom' && part.slot !== 'shoes')) return;
      const dst = out[part.slot], dir = direct[part.slot];
      const cp = m.geometry.attributes.position, uv = m.geometry.attributes.uv;
      const owner = new Int32Array(cp.count).fill(-1);
      out.owners.set(m.userData.vroidPart as number, owner);
      const alpha = alphaSampler(part.map);
      for (let j = 0; j < cp.count; j++) {
        P.fromBufferAttribute(cp, j).applyMatrix4(m.matrixWorld);
        const cx = Math.floor(P.x / cell), cy = Math.floor(P.y / cell), cz = Math.floor(P.z / cell);
        let best = -1, bd = 0.06 * 0.06;
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
          const list = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!list) continue;
          for (const i of list) {
            const ex = P.x - SP[i * 3], ey = P.y - SP[i * 3 + 1], ez = P.z - SP[i * 3 + 2];
            const d2 = ex * ex + ey * ey + ez * ez;
            if (d2 < bd) { bd = d2; best = i; }
          }
        }
        if (best < 0) continue;
        const along = (P.x - SP[best * 3]) * SN[best * 3] + (P.y - SP[best * 3 + 1]) * SN[best * 3 + 1] + (P.z - SP[best * 3 + 2]) * SN[best * 3 + 2];
        // Ausreißer (Kragen, Falten weit weg von der Haut) begrenzen – sonst bläht sich alles darüber auf
        dst[best] = Math.max(dst[best], Math.min(0.04, Math.max(0, along)));
        owner[j] = best;
        // für die Maske: nur wo der Stoff deckt (kein Loch in der Textur) und eng anliegt – unter losem Stoff
        // (Kragen, Puffärmel) könnte man sonst von der Seite ins Leere sehen
        const solid = !!alpha && !!uv && alpha(uv.getX(j), uv.getY(j)) && along <= BASE_TIGHT;
        if (solid) { if (dir[best] === 0) dir[best] = 1; } else dir[best] = 2;
      }
    });
    // Lücken füllen: Hautpunkte ohne eigenen Wert zwischen gefundenen bekommen den Wert ihrer Nachbarn
    // (vorhandene Werte bleiben, damit nichts aufquillt)
    const idx = geo.index;
    if (idx) for (const arr of [out.top, out.bottom, out.shoes]) for (let pass = 0; pass < 2; pass++) {
      const next = arr.slice();
      for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
        const m = Math.max(arr[a], arr[b], arr[c]);
        if (m < 0) continue;
        for (const v of [a, b, c]) if (arr[v] < 0 && next[v] < m) next[v] = m;
      }
      arr.set(next);
    }
    for (let i = 0; i < n; i++) {
      out.topSolid[i] = direct.top[i] === 1 ? 1 : 0; out.shoesSolid[i] = direct.shoes[i] === 1 ? 1 : 0;
      out.topLoose[i] = direct.top[i] === 2 ? 1 : 0; out.shoesLoose[i] = direct.shoes[i] === 2 ? 1 : 0;
    }
    this.clear = out;
    return out;
  }

  /**
   * Ankerpunkte für angehängte Teile, aus der echten Körperform gemessen (Ruhehaltung der Vorlage):
   * Ohrläppchen (Kopfraum), Schultern (Brustraum, auf dem Mantel), Knoten und Schnalle der Schärpe (Hüftraum).
   */
  private anchorCache: Anchors | null = null;
  anchors(): Anchors {
    if (this.anchorCache) return this.anchorCache;
    const T = this.template;
    T.updateMatrixWorld(true);
    const head = this.find(T, 'J_Bip_C_Head')!, chest = this.find(T, 'J_Bip_C_Chest')!;
    const toHead = head.matrixWorld.clone().invert(), toChest = chest.matrixWorld.clone().invert();
    const P = new Vector3();
    // Hautpunkte in Weltlage (Kopf aus Gesicht und Körper, Rumpf aus dem Körper)
    const skin: { m: SkinnedMesh; face: boolean }[] = [];
    T.traverse((o) => {
      const m = o as SkinnedMesh;
      const part = m.isSkinnedMesh ? this.parts[m.userData.vroidPart as number] : null;
      if (part?.slot === 'skin') skin.push({ m, face: /^Face/.test(part.name) });
    });
    const eyeL = this.find(T, 'J_Adj_L_FaceEye'), eyeR = this.find(T, 'J_Adj_R_FaceEye');
    const eyeY = eyeL && eyeR ? (eyeL.position.y + eyeR.position.y) / 2 : 0.06;
    // Ohr: seitlichster Hautpunkt knapp unter Augenhöhe auf halber Kopftiefe, Läppchen = tiefster Punkt dort
    let maxX = 0;
    const band: Vector3[] = [];
    for (const { m } of skin) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        P.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(toHead);
        if (P.y < eyeY - 0.08 || P.y > eyeY - 0.005 || P.z < -0.035 || P.z > 0.012 || P.x < 0) continue;
        band.push(P.clone());
        maxX = Math.max(maxX, P.x);
      }
    }
    const ear = band.filter((v) => v.x > maxX - 0.012);
    const lobeY = ear.length ? Math.min(...ear.map((v) => v.y)) : eyeY - 0.05;
    const earZ = ear.length ? ear.reduce((s, v) => s + v.z, 0) / ear.length : 0;
    const earLobe = new Vector3(maxX, lobeY, earZ);
    // Schultern: höchster Hautpunkt über dem Schultergelenk, darüber Hemd, Mantel und etwas Luft
    const body = this.bodySkin(T)!;
    const cl = this.clearance();
    const bpos = body.geometry.attributes.position;
    const shoulder = (side: 'L' | 'R') => {
      const arm = this.find(T, `J_Bip_${side}_UpperArm`)!;
      const j = arm.getWorldPosition(new Vector3());
      let top = -Infinity, c = 0;
      for (let i = 0; i < bpos.count; i++) {
        P.fromBufferAttribute(bpos, i).applyMatrix4(body.matrixWorld);
        if (Math.abs(P.x - j.x) > 0.035 || Math.abs(P.z - j.z) > 0.05 || P.y > j.y + 0.09) continue;
        if (P.y > top) { top = P.y; c = Math.max(0, cl.top[i]); }
      }
      // etwas zur Körpermitte hin: Schulterstücke sitzen auf der Schulter, nicht über dem Oberarm
      const w = new Vector3(j.x * 0.92, (Number.isFinite(top) ? top : j.y + 0.04) + Math.min(c, SHIRT_CAP) + 0.026, j.z);
      return w.applyMatrix4(toChest);
    };
    this.anchorCache = { earLobe, eyeY, shoulders: [shoulder('L'), shoulder('R')] };
    return this.anchorCache;
  }

  /** Welt-Ausrichtung eines Knochens in der Ruhehaltung der Vorlage (für die Halterungen der Sockets) */
  restQuat(bone: string): Quaternion | null {
    const b = this.find(this.template, bone);
    if (!b) return null;
    this.template.updateMatrixWorld(true);
    return b.getWorldQuaternion(new Quaternion());
  }

  /** je Dreieck eines Grundkleidungs-Teils die drei Hautpunkte unter seinen Ecken (für die Maske) */
  private baseSrcs = new Map<number, Int32Array>();
  baseSrc(part: number): Int32Array | null {
    let out = this.baseSrcs.get(part);
    if (!out) {
      const owner = this.clearance().owners.get(part), idx = this.partGeo[part]?.index;
      if (!owner || !idx) return null;
      out = new Int32Array(idx.count);
      for (let i = 0; i < idx.count; i++) out[i] = owner[idx.getX(i)];
      this.baseSrcs.set(part, out);
    }
    return out;
  }

  /**
   * Sitz von Schärpenknoten und Gürtelschnalle, am erzeugten Band selbst gemessen: Lage im Hüftraum und die Gewichte
   * des Bandes an dieser Stelle. Damit sitzt beides in jeder Pose auf dem Band (vorher starr am Hüftknochen).
   */
  private belts = new Map<string, BeltAnchors | null>();
  beltAnchors(ctx: GarmentCtx): BeltAnchors | null {
    const key = garmentKey('guertel', ctx);
    if (this.belts.has(key)) return this.belts.get(key)!;
    const g = this.garment('guertel', ctx), body = this.bodySkin(this.template), hips = this.find(this.template, 'J_Bip_C_Hips');
    let out: BeltAnchors | null = null;
    if (g && body && hips) {
      this.template.updateMatrixWorld(true);
      const toHips = hips.matrixWorld.clone().invert();
      const y0 = hips.getWorldPosition(new Vector3()).y + 0.032;
      const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const P = new Vector3();
      const at = (angle: number) => {
        let best = -1, bd = Infinity;
        const W = new Vector3();
        for (let i = 0; i < pos.count; i++) {
          P.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
          const d = Math.abs(Math.atan2(P.x, P.z) - angle) + Math.abs(P.y - y0) * 4;
          if (d < bd) { bd = d; best = i; W.copy(P); }
        }
        if (best < 0) return null;
        // knapp vor dem Band
        W.x += Math.sin(angle) * 0.006; W.z += Math.cos(angle) * 0.006; W.y = y0;
        const pin: SkinPin = { index: [si.getX(best), si.getY(best), si.getZ(best), si.getW(best)], weight: [sw.getX(best), sw.getY(best), sw.getZ(best), sw.getW(best)] };
        return { pos: W.applyMatrix4(toHips), pin };
      };
      // Knoten seitlich vorn (links), Schnalle mittig vorn
      const knot = at(0.96), buckle = at(0);
      if (knot && buckle) out = { knot: knot.pos, knotPin: knot.pin, buckle: buckle.pos, bucklePin: buckle.pin };
    }
    this.belts.set(key, out);
    return out;
  }


  /**
   * Umhang: eine Stoffbahn hinter dem Rücken vom Nacken abwärts, am Skelett befestigt (Brust → Wirbelsäule → Hüfte, unten
   * zur Hälfte an den Oberschenkeln). Sie folgt dem Rücken der Haut im Abstand, der nach unten wächst, und geht nie hinter
   * dem Gesäß nach vorn zurück. Lage in Körper-Einheiten wie die Hautpunkte; Gewichte und Rand-Abstand sind mit dabei.
   */
  private capes = new Map<string, BufferGeometry | null>();
  cape(len: 'kurz' | 'lang' | 'schlepp'): BufferGeometry | null {
    if (this.capes.has(len)) return this.capes.get(len)!;
    const body = this.bodySkin(this.template);
    if (!body) return null;
    this.template.updateMatrixWorld(true);
    const mw = body.matrixWorld, inv = mw.clone().invert();
    const geo = body.geometry, bpos = geo.attributes.position;
    const wp = (n: string) => this.find(this.template, n)?.getWorldPosition(new Vector3()) ?? new Vector3();
    const neckY = wp('J_Bip_C_Neck').y, hipsY = wp('J_Bip_C_Hips').y, kneeY = wp('J_Bip_L_LowerLeg').y, ankleY = wp('J_Bip_L_Foot').y;
    const yTop = neckY - 0.012;
    const yBot = len === 'kurz' ? hipsY - 0.03 : len === 'lang' ? kneeY - 0.04 : ankleY + 0.03;
    const rows = 28, cols = 19, dy = (yTop - yBot) / (rows - 1);
    // Rücken der Haut je Höhe (kleinstes z in der Mitte; +z ist vorn)
    const zmin = new Float32Array(rows).fill(Infinity);
    const P = new Vector3();
    for (let i = 0; i < bpos.count; i++) {
      P.fromBufferAttribute(bpos, i).applyMatrix4(mw);
      if (Math.abs(P.x) > 0.13 || P.y > yTop + dy || P.y < yBot - dy) continue;
      const r = Math.max(0, Math.min(rows - 1, Math.round((yTop - P.y) / dy)));
      if (P.z < zmin[r]) zmin[r] = P.z;
    }
    // Lücken füllen, dann von oben nach unten nie wieder nach vorn
    let last = -0.08;
    for (let r = 0; r < rows; r++) { if (Number.isFinite(zmin[r])) last = zmin[r]; else zmin[r] = last; }
    const zc = new Float32Array(rows);
    let run = Infinity;
    for (let r = 0; r < rows; r++) {
      run = Math.min(run, zmin[r]);
      const t = r / (rows - 1);
      // Abstand zum Rücken: oben über den Schulterblättern, unten weiter; um das Gesäß ein Wulst (die Hüfte dreht in der Bewegung)
      const y = yTop - r * dy;
      const butt = Math.exp(-(((y - (hipsY - 0.07)) / 0.09) ** 2)) * 0.045;
      zc[r] = run - (0.062 + (len === 'schlepp' ? 0.12 : 0.07) * Math.pow(t, 1.1) + butt * 1.4);
    }
    const hemW = len === 'kurz' ? 0.2 : len === 'lang' ? 0.25 : 0.3;
    const n = rows * cols;
    const world = new Float32Array(n * 3), rim = new Float32Array(n);
    const bones = body.skeleton.bones;
    const bi = (re: RegExp) => Math.max(0, bones.findIndex((b) => re.test(b.name)));
    const iUC = bi(/J_Bip_C_UpperChest$/), iCh = bi(/J_Bip_C_Chest$/), iSp = bi(/J_Bip_C_Spine$/), iHp = bi(/J_Bip_C_Hips$/), iLL = bi(/J_Bip_L_UpperLeg$/), iRL = bi(/J_Bip_R_UpperLeg$/);
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let r = 0; r < rows; r++) {
      const t = r / (rows - 1), y = yTop - r * dy;
      const w = 0.155 + (hemW - 0.155) * Math.pow(t, 0.9);
      // Hüfte → Beine nach unten, Brust → Wirbelsäule nach oben
      const up = Math.min(1, Math.max(0, (neckY - y) / Math.max(0.01, neckY - hipsY)));
      const low = Math.min(1, Math.max(0, (hipsY - y) / 0.3));
      for (let c = 0; c < cols; c++) {
        const u = (2 * c) / (cols - 1) - 1, x = u * w, j = r * cols + c;
        // Seiten biegen sich nach vorn um den Körper
        // Seiten biegen sich nach vorn um den Körper (oben stärker: der Umhang liegt über den Schultern), dazu Falten
        const z = zc[r] + u * u * w * (0.85 - t * 0.35) + Math.sin(u * Math.PI * 3.2 + 0.6) * 0.011 * Math.min(1, t * 2.4);
        world[j * 3] = x; world[j * 3 + 1] = y; world[j * 3 + 2] = z;
        rim[j] = Math.min(r * dy, (rows - 1 - r) * dy, (1 - Math.abs(u)) * w * 0.9);
        const hipsW = (1 - low * 0.5) * up * up, spineW = up * (1 - up) * 2 * (1 - low * 0.5);
        const chestW = Math.max(0, 1 - up * 1.35);
        const wl: [number, number][] = [[iUC, chestW * 0.5], [iCh, chestW * 0.5 + spineW * 0.25], [iSp, spineW * 0.75], [iHp, hipsW], [x > 0 ? iLL : iRL, low * 0.5 * up]];
        const sum = wl.reduce((a, e) => a + e[1], 0) || 1;
        wl.sort((a, b) => b[1] - a[1]);
        for (let k = 0; k < 4; k++) { si[j * 4 + k] = wl[k][0]; sw[j * 4 + k] = wl[k][1] / sum; }
        // gleiche Knochen zusammenfassen (z. B. wenn zwei Einträge denselben Index haben)
        for (let k = 1; k < 4; k++) for (let q = 0; q < k; q++) if (si[j * 4 + k] === si[j * 4 + q] && sw[j * 4 + k] > 0) { sw[j * 4 + q] += sw[j * 4 + k]; sw[j * 4 + k] = 0; }
      }
    }
    const pos = new Float32Array(n * 3);
    for (let j = 0; j < n; j++) { P.set(world[j * 3], world[j * 3 + 1], world[j * 3 + 2]).applyMatrix4(inv); P.toArray(pos, j * 3); }
    const T: number[] = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      T.push(a, d, b, b, d, e);
    }
    const out = new BufferGeometry();
    out.setAttribute('position', new BufferAttribute(pos, 3));
    out.setAttribute('skinIndex', new BufferAttribute(si, 4));
    out.setAttribute('skinWeight', new BufferAttribute(sw, 4));
    out.setAttribute('rimD', new BufferAttribute(rim, 1));
    out.setIndex(T);
    out.computeVertexNormals();
    out.computeBoundingSphere();
    if (out.boundingSphere) out.boundingSphere.radius *= 1.6;
    this.capes.set(len, markShared(out));
    return out;
  }

  /**
   * Sitz von Schulterstücken und Schulterplatten (Brustraum) samt den Gewichten des Stoffs dort: gemessen am
   * angegebenen Kleidungsstück (dem äußersten über der Schulter) oder, ohne eines, an der Haut.
   */
  private epaulettes = new Map<string, { pos: Vector3; pin: SkinPin }[] | null>();
  shoulderAnchors(ctx: GarmentCtx, kind: GarmentKind | null): { pos: Vector3; pin: SkinPin }[] | null {
    const key = kind ? garmentKey(kind, ctx) : 'haut';
    if (this.epaulettes.has(key)) return this.epaulettes.get(key)!;
    const body = this.bodySkin(this.template), chest = this.find(this.template, 'J_Bip_C_Chest');
    const g = kind ? this.garment(kind, ctx) : body?.geometry ?? null;
    const bare = kind ? null : this.clearance().top;
    let out: { pos: Vector3; pin: SkinPin }[] | null = null;
    if (g && body && chest) {
      this.template.updateMatrixWorld(true);
      const toChest = chest.matrixWorld.clone().invert();
      const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const P = new Vector3();
      out = [];
      for (const side of ['L', 'R']) {
        const j = this.find(this.template, `J_Bip_${side}_UpperArm`)!.getWorldPosition(new Vector3());
        // etwas zur Körpermitte hin: Schulterstücke sitzen auf der Schulter, nicht über dem Oberarm
        const x = j.x * 0.92;
        let best = -1, top = -Infinity;
        for (let i = 0; i < pos.count; i++) {
          P.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
          if (Math.abs(P.x - x) > 0.03 || Math.abs(P.z - j.z) > 0.04 || P.y > j.y + 0.12) continue;
          if (P.y > top) { top = P.y; best = i; }
        }
        if (best < 0) { out = null; break; }
        // Gewichte über die ganze Schulterkuppe mitteln: ein einzelner Punkt kann fast ganz am Arm hängen, dann
        // schwenkt das Schulterstück mit dem Arm von der Schulter weg
        const wm = new Map<number, number>();
        for (let i = 0; i < pos.count; i++) {
          P.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
          if (Math.abs(P.x - x) > 0.03 || Math.abs(P.z - j.z) > 0.04 || P.y > j.y + 0.12 || P.y < top - 0.02) continue;
          for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > 0) wm.set(si.getComponent(i, k), (wm.get(si.getComponent(i, k)) ?? 0) + w); }
        }
        const w4 = [...wm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
        const sum = w4.reduce((t, e) => t + e[1], 0) || 1;
        out.push({
          pos: new Vector3(x, top + 0.005 + (bare ? Math.max(0, bare[best]) : 0), j.z).applyMatrix4(toChest),
          pin: { index: [w4[0]?.[0] ?? 0, w4[1]?.[0] ?? 0, w4[2]?.[0] ?? 0, w4[3]?.[0] ?? 0], weight: [(w4[0]?.[1] ?? 0) / sum, (w4[1]?.[1] ?? 0) / sum, (w4[2]?.[1] ?? 0) / sum, (w4[3]?.[1] ?? 0) / sum] },
        });
      }
    }
    this.epaulettes.set(key, out);
    return out;
  }

  /**
   * Bart aus der Gesichtsform: Hautpunkte der Bartregion werden nach außen geschoben (Kopfraum, starr am Kopf).
   * Schnurrbart über der Oberlippe, Kinnbart unter dem Mund, Koteletten vor den Ohren, Vollbart Kiefer und Kinn.
   */
  private beards = new Map<string, BufferGeometry | null>();
  beard(kind: 'kinnbart' | 'schnurrbart' | 'vollbart' | 'koteletten'): BufferGeometry | null {
    if (this.beards.has(kind)) return this.beards.get(kind)!;
    const T = this.template;
    T.updateMatrixWorld(true);
    const head = this.find(T, 'J_Bip_C_Head')!;
    const toHead = head.matrixWorld.clone().invert();
    const nmHead = new Matrix3();
    const an = this.anchors();
    // Mund: Mitte der Mundteile (kleines festes Teil vor dem Gesicht unter der Nase)
    let mouthY = an.eyeY - 0.065;
    T.traverse((o) => {
      const m = o as SkinnedMesh;
      const part = m.isSkinnedMesh ? this.parts[m.userData.vroidPart as number] : null;
      if (part?.slot !== 'fixed') return;
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld).applyMatrix4(toHead);
      if (bb.max.y < an.eyeY - 0.03 && bb.max.x - bb.min.x < 0.08) mouthY = (bb.min.y + bb.max.y) / 2;
    });
    const geos: BufferGeometry[] = [];
    const P = new Vector3(), N = new Vector3();
    T.traverse((o) => {
      const m = o as SkinnedMesh;
      const part = m.isSkinnedMesh ? this.parts[m.userData.vroidPart as number] : null;
      if (part?.slot !== 'skin' || !/^Face/.test(part.name)) return;
      const g = m.geometry, pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
      if (!idx) return;
      nmHead.getNormalMatrix(new Matrix4().multiplyMatrices(toHead, m.matrixWorld));
      const n = pos.count;
      const off = new Float32Array(n).fill(-1);
      const PP = new Float32Array(n * 3), NN = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        P.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(toHead);
        N.fromBufferAttribute(nor, i).applyMatrix3(nmHead).normalize();
        P.toArray(PP, i * 3); N.toArray(NN, i * 3);
        const ax = Math.abs(P.x), y = P.y;
        // nur die Vorderseite (Gesicht schaut nach −Z) und nicht die Lippen selbst
        const front = N.z < 0.2 && P.z < 0.0;
        const lips = ax < 0.026 && y > mouthY - 0.011 && y < mouthY + 0.007;
        if (!front || lips) continue;
        if (kind === 'schnurrbart' && ax < 0.03 && y >= mouthY + 0.007 && y < mouthY + 0.021) off[i] = 0.003;
        else if (kind === 'kinnbart' && ax < 0.024 && y < mouthY - 0.011) off[i] = 0.004 + Math.max(0, mouthY - 0.02 - y) * 0.12;
        else if (kind === 'koteletten' && ax > an.earLobe.x - 0.03 && y > an.earLobe.y && y < an.eyeY - 0.005 && P.z < an.earLobe.z - 0.005) off[i] = 0.0035;
        else if (kind === 'vollbart' && (y < mouthY - 0.011 || (ax > 0.03 && y < an.eyeY - 0.03) || (ax < 0.03 && y >= mouthY + 0.007 && y < mouthY + 0.021))) off[i] = 0.004 + Math.max(0, mouthY - y) * 0.1;
      }
      const tris: number[] = [];
      for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
        if (off[a] >= 0 && off[b] >= 0 && off[c] >= 0) tris.push(a, b, c);
      }
      if (!tris.length) return;
      const remap = new Map<number, number>();
      const p2: number[] = [], n2: number[] = [];
      for (const v of tris) if (!remap.has(v)) {
        remap.set(v, p2.length / 3);
        p2.push(PP[v * 3] + NN[v * 3] * off[v], PP[v * 3 + 1] + NN[v * 3 + 1] * off[v], PP[v * 3 + 2] + NN[v * 3 + 2] * off[v]);
        n2.push(NN[v * 3], NN[v * 3 + 1], NN[v * 3 + 2]);
      }
      const out = new BufferGeometry();
      out.setAttribute('position', new BufferAttribute(new Float32Array(p2), 3));
      out.setAttribute('normal', new BufferAttribute(new Float32Array(n2), 3));
      out.setIndex(tris.map((v) => remap.get(v)!));
      geos.push(out);
    });
    const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0] ?? null;
    if (merged) markShared(merged);
    this.beards.set(kind, merged);
    return merged;
  }

  /** Narbe: schmaler Streifen schräg über die rechte Wange, auf der Gesichtsfläche (Kopfraum) */
  scarPlacement(): { pos: Vector3; tilt: number } {
    const an = this.anchors();
    const T = this.template;
    const head = this.find(T, 'J_Bip_C_Head')!;
    const toHead = head.matrixWorld.clone().invert();
    const x0 = 0.032, y0 = an.eyeY - 0.022;
    let z = -0.08, best = 1;
    const P = new Vector3();
    T.traverse((o) => {
      const m = o as SkinnedMesh;
      const part = m.isSkinnedMesh ? this.parts[m.userData.vroidPart as number] : null;
      if (part?.slot !== 'skin' || !/^Face/.test(part.name)) return;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        P.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(toHead);
        const d = Math.hypot(P.x - x0, P.y - y0);
        if (P.z < 0 && d < best) { best = d; z = P.z; }
      }
    });
    return { pos: new Vector3(x0, y0, z - 0.002), tilt: 0.5 };
  }

  /**
   * Kappe, die sich um die Frisur legt (Kopftuch, Mütze, Südwester, Helm): Richtungsraster um die Haarmitte,
   * je Richtung die weiteste Haarspitze plus Rand, Lücken und Kanten geglättet. Kopfraum, Unterkante auf Sitzhöhe.
   */
  private caps = new Map<string, CapShell | null>();
  capShell(sink: number, margin: number): CapShell | null {
    const key = `${sink}|${margin}`;
    if (this.caps.has(key)) return this.caps.get(key)!;
    const fit = this.hairFit?.(sink);
    if (!fit) { this.caps.set(key, null); return null; }
    const T = this.template;
    T.updateMatrixWorld(true);
    const head = this.find(T, 'J_Bip_C_Head')!;
    const inv = head.matrixWorld.clone().invert();
    const A = 32, E = 9;
    const R = new Float32Array(A * (E + 1)).fill(0);
    const cy = fit.seat, cx = fit.cx, cz = fit.cz;
    const P = new Vector3();
    T.traverse((o) => {
      const m = o as SkinnedMesh;
      const part = m.isSkinnedMesh ? this.parts[m.userData.vroidPart as number] : null;
      if (part?.slot !== 'hair') return;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        P.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
        const dx = P.x - cx, dy = P.y - cy, dz = P.z - cz;
        if (dy < -0.004) continue;
        const h = Math.hypot(dx, dz);
        const el = Math.atan2(Math.max(0, dy), h);
        const az = Math.atan2(dx, dz);
        const ai = ((Math.round((az / (Math.PI * 2)) * A) % A) + A) % A;
        const ei = Math.min(E, Math.round((el / (Math.PI / 2)) * E));
        const d = Math.hypot(h, Math.max(0, dy));
        if (d > R[ei * A + ai]) R[ei * A + ai] = d;
      }
    });
    // leere Felder aus den Nachbarn füllen, dann nach außen glätten (nie kleiner als die Haarspitze)
    for (let pass = 0; pass < 6; pass++) {
      const nx = R.slice();
      for (let e = 0; e <= E; e++) for (let a = 0; a < A; a++) {
        let s = 0, c = 0;
        for (const [de, da] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const e2 = e + de; if (e2 < 0 || e2 > E) continue;
          const v = R[e2 * A + ((a + da + A) % A)];
          if (v > 0) { s += v; c++; }
        }
        const avg = c ? s / c : 0;
        nx[e * A + a] = R[e * A + a] > 0 ? Math.max(R[e * A + a], avg * 0.97) : avg;
      }
      R.set(nx);
    }
    const ringR = Array.from({ length: A }, (_, a) => R[a]).reduce((s, v) => s + v, 0) / A + margin;
    const pos: number[] = [];
    for (let e = 0; e <= E; e++) for (let a = 0; a <= A; a++) {
      const el = (e / E) * (Math.PI / 2), az = (a / A) * Math.PI * 2;
      const r = (e === E ? Math.max(...Array.from({ length: A }, (_, k) => R[E * A + k])) : R[e * A + (a % A)]) + margin;
      pos.push(cx + Math.sin(az) * Math.cos(el) * r, cy + Math.sin(el) * r, cz + Math.cos(az) * Math.cos(el) * r);
    }
    const idx: number[] = [];
    for (let e = 0; e < E; e++) for (let a = 0; a < A; a++) {
      const i0 = e * (A + 1) + a, i1 = i0 + 1, i2 = i0 + A + 1, i3 = i2 + 1;
      idx.push(i0, i1, i2, i1, i3, i2);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    markShared(geo);
    const shell: CapShell = { geo, seatY: cy, cx, cz, ringR };
    this.caps.set(key, shell);
    return shell;
  }

  /** Hautnetz des Körpers (unter der Kleidung vollständig modelliert) */
  bodySkin(root: Object3D): SkinnedMesh | null {
    let found: SkinnedMesh | null = null;
    root.traverse((o) => {
      const m = o as SkinnedMesh;
      const p = m.isSkinnedMesh ? this.parts[m.userData.vroidPart as number] : null;
      if (!found && p?.slot === 'skin' && /^Body/.test(p.name)) found = m;
    });
    return found;
  }

  /**
   * Kleidungsstück als Hülle um den Körper: Hautpunkte einer Region werden entlang ihrer Normalen nach außen
   * geschoben und behalten ihre Gewichte – so bewegt sich das Stück genau mit dem Körper und schneidet nicht ein.
   * Lage in Weltmaßen der Vorlage: Figur schaut nach +Z, links liegt bei +X, Ruhehaltung T-Pose.
   */
  private buildGarment(kind: GarmentKind, ctx: GarmentCtx): BufferGeometry | null {
    const body = this.bodySkin(this.template);
    if (!body) return null;
    this.template.updateMatrixWorld(true);
    const geo = body.geometry;
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    const bones = body.skeleton.bones;
    const mw = body.matrixWorld;
    const nm = new Matrix3().getNormalMatrix(mw);
    const scale = new Vector3().setFromMatrixScale(mw).x;
    const wp = (n: string) => this.find(this.template, n)?.getWorldPosition(new Vector3()) ?? new Vector3();
    const ankle = wp('J_Bip_L_Foot'), toe = wp('J_Bip_L_ToeBase'), elbow = wp('J_Bip_L_LowerArm'), wrist = wp('J_Bip_L_Hand');
    const hipsY = wp('J_Bip_C_Hips').y, kneeY = wp('J_Bip_L_LowerLeg').y, ankleY = ankle.y, neckY = wp('J_Bip_C_Neck').y;
    const R: Region = { hipsY, kneeY, ankleY, neckY, leg: kneeY - ankleY, ankleZ: ankle.z, toeZ: toe.z, elbowX: Math.abs(elbow.x), wristX: Math.abs(wrist.x) };
    const n = pos.count;
    const off = new Float32Array(n).fill(-1);
    const P = new Vector3(), N = new Vector3();
    const cl = this.clearance();
    // Körperregion je Knochen und je Hautpunkt als Gewichtssumme (statt nur nach dem stärksten Knochen – an Achsel,
    // Knie und Taille wechselt der von Punkt zu Punkt und riss Löcher)
    const cls = bones.map((b) => boneClass(b.name));
    const WP = new Float32Array(n * 3), WN = new Float32Array(n * 3), WW = new Float32Array(n * NCLS);
    const who = new Float32Array(NCLS);
    for (let i = 0; i < n; i++) {
      P.fromBufferAttribute(pos, i).applyMatrix4(mw); P.toArray(WP, i * 3);
      N.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N.toArray(WN, i * 3);
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k), c = cls[si.getComponent(i, k)];
        if (w > 0 && c) for (let j = 0; j < NCLS; j++) if (c & (1 << j)) WW[i * NCLS + j] += w;
      }
      for (let j = 0; j < NCLS; j++) who[j] = WW[i * NCLS + j];
      off[i] = garmentOffset(kind, who, P, N, R, cl.top[i], -1, cl.shoes[i], ctx); // Hose der Grundfigur ist ausgeblendet (erzeugte Hose liegt eng an)
    }
    /** Abstand an einer Stelle der Kante a→b (t = 0 … 1): alle Größen wandern mit, der Freiraum bis zur Kantenmitte */
    const evalEdge = (a: number, b: number, t: number) => {
      P.set(WP[a * 3] + (WP[b * 3] - WP[a * 3]) * t, WP[a * 3 + 1] + (WP[b * 3 + 1] - WP[a * 3 + 1]) * t, WP[a * 3 + 2] + (WP[b * 3 + 2] - WP[a * 3 + 2]) * t);
      N.set(WN[a * 3] + (WN[b * 3] - WN[a * 3]) * t, WN[a * 3 + 1] + (WN[b * 3 + 1] - WN[a * 3 + 1]) * t, WN[a * 3 + 2] + (WN[b * 3 + 2] - WN[a * 3 + 2]) * t).normalize();
      for (let j = 0; j < NCLS; j++) who[j] = WW[a * NCLS + j] + (WW[b * NCLS + j] - WW[a * NCLS + j]) * t;
      const mixc = (x: number, y: number) => (x >= 0 && y >= 0 ? x + (y - x) * t : t < 0.5 ? x : y);
      return garmentOffset(kind, who, P, N, R, mixc(cl.top[a], cl.top[b]), -1, mixc(cl.shoes[a], cl.shoes[b]), ctx);
    };
    // Arbeitsdaten je Kleidungspunkt: Hautlage, Normale, Abstand (Modelleinheiten), Gewichte
    const BP: number[] = [], BN: number[] = [], OF: number[] = [], SI: number[] = [], SW: number[] = [];
    const src = geo.index;
    const remap = new Int32Array(n).fill(-1);
    const vert = (v: number) => {
      if (remap[v] >= 0) return remap[v];
      const j = BP.length / 3;
      P.fromBufferAttribute(pos, v); N.fromBufferAttribute(nor, v).normalize();
      BP.push(P.x, P.y, P.z); BN.push(N.x, N.y, N.z); OF.push(off[v] / scale);
      for (let k = 0; k < 4; k++) { SI.push(si.getComponent(v, k)); SW.push(sw.getComponent(v, k)); }
      return (remap[v] = j);
    };
    // Saum als Linie: wo der Rand des Stücks durch ein Haut-Dreieck läuft, wird es dort geschnitten (vorher fielen
    // angeschnittene Dreiecke ganz weg – der Saum folgte dem Zickzack der Haut)
    const cuts = new Map<number, number>();
    const cutVert = (a: number, b: number) => {
      // a liegt im Stück, b nicht
      const key = a * 65536 + b;
      const hit = cuts.get(key);
      if (hit !== undefined) return hit;
      let lo = 0, hi = 1, o = off[a];
      for (let it = 0; it < 7; it++) {
        const mid = (lo + hi) / 2, e = evalEdge(a, b, mid);
        if (e >= 0) { lo = mid; o = e; } else hi = mid;
      }
      const j = BP.length / 3, t = lo;
      for (let k = 0; k < 3; k++) BP.push(pos.getComponent(a, k) + (pos.getComponent(b, k) - pos.getComponent(a, k)) * t);
      N.set(nor.getX(a) + (nor.getX(b) - nor.getX(a)) * t, nor.getY(a) + (nor.getY(b) - nor.getY(a)) * t, nor.getZ(a) + (nor.getZ(b) - nor.getZ(a)) * t).normalize();
      BN.push(N.x, N.y, N.z); OF.push(o / scale);
      const wm = new Map<number, number>();
      for (const [e, f] of [[a, 1 - t], [b, t]] as const) for (let k = 0; k < 4; k++) { const w = sw.getComponent(e, k) * f; if (w > 0) wm.set(si.getComponent(e, k), (wm.get(si.getComponent(e, k)) ?? 0) + w); }
      const top = [...wm.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
      const sum = top.reduce((u, e) => u + e[1], 0) || 1;
      for (let k = 0; k < 4; k++) { SI.push(top[k]?.[0] ?? 0); SW.push(top[k] ? top[k][1] / sum : 0); }
      cuts.set(key, j);
      return j;
    };
    let T: number[] = [];
    /** je Dreieck des Stücks: Nummer des Haut-Dreiecks, aus dem es entstand */
    let srcTri: number[] = [];
    const full: number[] = [];
    const triCount = src ? src.count / 3 : n / 3;
    for (let t = 0; t < triCount; t++) {
      const v = [src ? src.getX(t * 3) : t * 3, src ? src.getX(t * 3 + 1) : t * 3 + 1, src ? src.getX(t * 3 + 2) : t * 3 + 2];
      const ins = (off[v[0]] >= 0 ? 1 : 0) + (off[v[1]] >= 0 ? 1 : 0) + (off[v[2]] >= 0 ? 1 : 0);
      if (ins === 0) continue;
      if (ins === 3) { T.push(vert(v[0]), vert(v[1]), vert(v[2])); srcTri.push(t); full.push(v[0], v[1], v[2]); continue; }
      if (!CUT_HEMS) continue;
      if (ins === 1) {
        // Ecke a innen: kleines Dreieck bis zur Schnittlinie (Umlaufsinn bleibt)
        const k = off[v[0]] >= 0 ? 0 : off[v[1]] >= 0 ? 1 : 2;
        const a = v[k], b = v[(k + 1) % 3], c = v[(k + 2) % 3];
        T.push(vert(a), cutVert(a, b), cutVert(a, c)); srcTri.push(t);
      } else {
        // Ecke c außen: Viereck aus zwei Dreiecken
        const k = off[v[0]] < 0 ? 0 : off[v[1]] < 0 ? 1 : 2;
        const c = v[k], a = v[(k + 1) % 3], b = v[(k + 2) % 3];
        const bc = cutVert(b, c), ac = cutVert(a, c);
        T.push(vert(a), vert(b), bc, vert(a), bc, ac); srcTri.push(t, t);
      }
    }
    if (!T.length) return null;
    // Maske: Hautpunkte, die dieses Stück eng bedeckt (weit abstehende Teile wie Stulpen und Mantelschöße verdecken
    // nichts – dort sieht man von unten hinein), um den Saumrand zurückgenommen
    const tight = new Uint8Array(n);
    for (const v of full) if (off[v] <= COVER_TIGHT || BANDS.has(kind)) tight[v] = 1;
    // hauteng (Handschuhe, Hose): kein Saumrand nötig – in den schmalen Spalt am Saum sieht man nicht hinein
    let far = 0;
    for (const v of full) if (off[v] > far) far = off[v];
    // je weiter ein Stück absteht, desto weiter sieht man schräg unter seinen Saum: dann bleibt ein breiterer Rand stehen
    // Bänder und Schienen liegen dicht auf der Schicht darunter (nicht auf der Haut): auch sie brauchen keinen Rand
    const cover = this.erodeCover(tight, far <= SNUG || BANDS.has(kind) ? 0 : far <= 0.02 ? COVER_RINGS : COVER_RINGS + 1);
    const soft = !HARD.has(kind);
    if (soft) {
      // einmal feiner unterteilen (jedes Dreieck in vier): runde Formen und Ränder statt grober Treppen
      const mid = new Map<string, number>();
      const midOf = (a: number, b: number) => {
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        const hit = mid.get(key);
        if (hit !== undefined) return hit;
        const i = BP.length / 3;
        for (let k = 0; k < 3; k++) BP.push((BP[a * 3 + k] + BP[b * 3 + k]) / 2);
        const nx = BN[a * 3] + BN[b * 3], ny = BN[a * 3 + 1] + BN[b * 3 + 1], nz = BN[a * 3 + 2] + BN[b * 3 + 2];
        const nl = Math.hypot(nx, ny, nz) || 1;
        BN.push(nx / nl, ny / nl, nz / nl);
        OF.push((OF[a] + OF[b]) / 2);
        // Gewichte beider Ecken mischen, die vier stärksten behalten
        const wm = new Map<number, number>();
        for (const e of [a, b]) for (let k = 0; k < 4; k++) { const w = SW[e * 4 + k]; if (w > 0) wm.set(SI[e * 4 + k], (wm.get(SI[e * 4 + k]) ?? 0) + w / 2); }
        const top = [...wm.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
        const sum = top.reduce((t, e) => t + e[1], 0) || 1;
        for (let k = 0; k < 4; k++) { SI.push(top[k]?.[0] ?? 0); SW.push(top[k] ? top[k][1] / sum : 0); }
        mid.set(key, i);
        return i;
      };
      const T2: number[] = [];
      for (let t = 0; t < T.length; t += 3) {
        const a = T[t], b = T[t + 1], c = T[t + 2];
        const ab = midOf(a, b), bc = midOf(b, c), ca = midOf(c, a);
        T2.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      }
      T = T2;
      srcTri = srcTri.flatMap((t) => [t, t, t, t]);
    }
    const m = BP.length / 3;
    const p2 = new Float32Array(m * 3);
    for (let j = 0; j < m; j++) for (let k = 0; k < 3; k++) p2[j * 3 + k] = BP[j * 3 + k] + BN[j * 3 + k] * OF[j];
    // Nahtpunkte (gleiche Lage, getrennte Eckpunkte für Texturkanten) zusammenfassen – sonst reißt die Glättung auf
    const weld = new Int32Array(m);
    {
      const seen = new Map<string, number>();
      for (let j = 0; j < m; j++) {
        const key = `${Math.round(BP[j * 3] * 1e4)},${Math.round(BP[j * 3 + 1] * 1e4)},${Math.round(BP[j * 3 + 2] * 1e4)}`;
        const c = seen.get(key);
        if (c === undefined) { seen.set(key, j); weld[j] = j; } else weld[j] = c;
      }
    }
    if (soft) {
      // Stoff statt Körperbemalung: glätten (Brust, Bauchmuskeln, Schulterblätter, grobe Kanten verschwinden),
      // Ränder nur entlang der Kante (keine Zacken und abstehenden Zipfel, Säume bleiben an ihrem Platz)
      const lt = T.map((v) => weld[v]);
      const edgeCount = new Map<string, number>();
      for (let t = 0; t < lt.length; t += 3) for (let k = 0; k < 3; k++) {
        const x = lt[t + k], y = lt[t + (k + 1) % 3];
        if (x === y) continue;
        const e = x < y ? `${x},${y}` : `${y},${x}`;
        edgeCount.set(e, (edgeCount.get(e) ?? 0) + 1);
      }
      const nb: Set<number>[] = Array.from({ length: m }, () => new Set<number>());
      const rimNb: Set<number>[] = Array.from({ length: m }, () => new Set<number>());
      for (const [e, c] of edgeCount) {
        const [x, y] = e.split(',').map(Number);
        nb[x].add(y); nb[y].add(x);
        if (c === 1) { rimNb[x].add(y); rimNb[y].add(x); }
      }
      const tmp = new Float32Array(p2.length);
      for (let it = 0; it < 8; it++) {
        tmp.set(p2);
        for (let j = 0; j < m; j++) {
          if (weld[j] !== j) continue;
          const rimList = rimNb[j];
          const list = rimList.size ? (rimList.size === 2 ? rimList : null) : nb[j];
          if (!list || !list.size) continue;
          let x = 0, y = 0, z = 0;
          for (const q of list) { x += p2[q * 3]; y += p2[q * 3 + 1]; z += p2[q * 3 + 2]; }
          const k = 0.5 / list.size;
          tmp[j * 3] = p2[j * 3] * 0.5 + x * k; tmp[j * 3 + 1] = p2[j * 3 + 1] * 0.5 + y * k; tmp[j * 3 + 2] = p2[j * 3 + 2] * 0.5 + z * k;
        }
        for (let j = 0; j < m; j++) if (weld[j] !== j) { const c = weld[j]; tmp[j * 3] = tmp[c * 3]; tmp[j * 3 + 1] = tmp[c * 3 + 1]; tmp[j * 3 + 2] = tmp[c * 3 + 2]; }
        p2.set(tmp);
        // nie näher an die Haut als vorgesehen
        for (let j = 0; j < m; j++) {
          const d = (p2[j * 3] - BP[j * 3]) * BN[j * 3] + (p2[j * 3 + 1] - BP[j * 3 + 1]) * BN[j * 3 + 1] + (p2[j * 3 + 2] - BP[j * 3 + 2]) * BN[j * 3 + 2];
          if (d < OF[j]) for (let k = 0; k < 3; k++) p2[j * 3 + k] += BN[j * 3 + k] * (OF[j] - d);
        }
      }
      // Beim Glätten rutschen Punkte seitlich über den Körper. Ihre Gewichte müssen mitwandern: jeder verschobene Punkt
      // übernimmt die Gewichte der Haut, über der er jetzt liegt – sonst biegt er sich am Gelenk wie seine alte Stelle
      // und die Haut sticht durch.
      if (REFETCH_WEIGHTS) {
        const cell = 0.02 / scale, lim = (0.002 / scale) ** 2;
        const grid = new Map<number, number[]>();
        const gk = (x: number, y: number, z: number) => (Math.floor(x / cell) * 73856093) ^ (Math.floor(y / cell) * 19349663) ^ (Math.floor(z / cell) * 83492791);
        for (let i = 0; i < n; i++) {
          const k = gk(pos.getX(i), pos.getY(i), pos.getZ(i));
          const list = grid.get(k);
          if (list) list.push(i); else grid.set(k, [i]);
        }
        const wm = new Map<number, number>();
        for (let j = 0; j < m; j++) {
          // Nahtpunkte bekommen die Gewichte ihres gemeinsamen Punkts (unten) – sonst reißt die Naht in Bewegung auf
          if (weld[j] !== j) continue;
          const nx = BN[j * 3], ny = BN[j * 3 + 1], nz = BN[j * 3 + 2];
          const d = (p2[j * 3] - BP[j * 3]) * nx + (p2[j * 3 + 1] - BP[j * 3 + 1]) * ny + (p2[j * 3 + 2] - BP[j * 3 + 2]) * nz;
          // Fußpunkt auf der Haut
          const fx = p2[j * 3] - nx * d, fy = p2[j * 3 + 1] - ny * d, fz = p2[j * 3 + 2] - nz * d;
          if ((fx - BP[j * 3]) ** 2 + (fy - BP[j * 3 + 1]) ** 2 + (fz - BP[j * 3 + 2]) ** 2 < lim) continue;
          // die drei nächsten Hautpunkte derselben Körperseite (nicht das andere Bein)
          const near: [number, number][] = [];
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            const list = grid.get(gk(fx + dx * cell, fy + dy * cell, fz + dz * cell));
            if (!list) continue;
            for (const i of list) {
              if (nor.getX(i) * nx + nor.getY(i) * ny + nor.getZ(i) * nz < 0.3) continue;
              const d2 = (pos.getX(i) - fx) ** 2 + (pos.getY(i) - fy) ** 2 + (pos.getZ(i) - fz) ** 2;
              if (d2 < cell * cell) near.push([d2, i]);
            }
          }
          if (!near.length) continue;
          near.sort((x, y) => x[0] - y[0]);
          wm.clear();
          for (const [d2, i] of near.slice(0, 3)) {
            const w = 1 / (d2 + lim * 0.25);
            for (let k = 0; k < 4; k++) { const sw0 = sw.getComponent(i, k); if (sw0 > 0) wm.set(si.getComponent(i, k), (wm.get(si.getComponent(i, k)) ?? 0) + sw0 * w); }
          }
          const top = [...wm.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
          const sum = top.reduce((t, e) => t + e[1], 0) || 1;
          for (let k = 0; k < 4; k++) { SI[j * 4 + k] = top[k]?.[0] ?? 0; SW[j * 4 + k] = top[k] ? top[k][1] / sum : 0; }
        }
        for (let j = 0; j < m; j++) if (weld[j] !== j) for (let k = 0; k < 4; k++) { SI[j * 4 + k] = SI[weld[j] * 4 + k]; SW[j * 4 + k] = SW[weld[j] * 4 + k]; }
      }
    }
    // Mantelschöße hängen am Becken und folgen den Beinen nur zum Teil: vorher klebten sie als verschobene
    // Oberschenkel-Haut an jedem Bein und rissen beim Ausfallschritt auseinander
    if ((kind === 'mantelLang' || kind === 'kilt') && TAIL_HIPS > 0) {
      const hipsBone = bones.findIndex((b) => /J_Bip_C_Hips$/.test(b.name));
      const wm = new Map<number, number>();
      if (hipsBone >= 0) for (let j = 0; j < m; j++) {
        const y = P.set(BP[j * 3], BP[j * 3 + 1], BP[j * 3 + 2]).applyMatrix4(mw).y;
        const k = smooth(hipsY - 0.03, hipsY - 0.16, y) * (kind === 'kilt' ? 0.8 : TAIL_HIPS);
        if (k <= 0) continue;
        wm.clear();
        for (let q = 0; q < 4; q++) if (SW[j * 4 + q] > 0) wm.set(SI[j * 4 + q], (wm.get(SI[j * 4 + q]) ?? 0) + SW[j * 4 + q] * (1 - k));
        wm.set(hipsBone, (wm.get(hipsBone) ?? 0) + k);
        const top = [...wm.entries()].sort((x, y2) => y2[1] - x[1]).slice(0, 4);
        const sum = top.reduce((u, e) => u + e[1], 0) || 1;
        for (let q = 0; q < 4; q++) { SI[j * 4 + q] = top[q]?.[0] ?? 0; SW[j * 4 + q] = top[q] ? top[q][1] / sum : 0; }
      }
    }
    const i2 = new Uint16Array(SI), w2 = new Float32Array(SW);
    // Ringelhemd: Maske für die Streifen (zeichnet der Shader), alle anderen Stücke einfarbig
    const stripe = new Float32Array(m);
    if (kind === 'ringel') stripe.fill(1);
    const out = new BufferGeometry();
    out.setAttribute('position', new BufferAttribute(p2, 3));
    out.setAttribute('skinIndex', new BufferAttribute(i2, 4));
    out.setAttribute('skinWeight', new BufferAttribute(w2, 4));
    out.setAttribute('stripe', new BufferAttribute(stripe, 1));
    out.setAttribute('rimD', new BufferAttribute(rimDistance(T, weld, p2, m, scale, RIM_MAX), 1));
    out.setIndex(T);
    // Normalen aus der geglätteten Form (die Hautnormalen ließen den Stoff kantig schattieren), über Nähte gemittelt
    out.computeVertexNormals();
    {
      const nrm = out.attributes.normal as BufferAttribute;
      const acc = new Float32Array(m * 3);
      for (let j = 0; j < m; j++) { const c = weld[j]; acc[c * 3] += nrm.getX(j); acc[c * 3 + 1] += nrm.getY(j); acc[c * 3 + 2] += nrm.getZ(j); }
      for (let j = 0; j < m; j++) {
        const c = weld[j], l = Math.hypot(acc[c * 3], acc[c * 3 + 1], acc[c * 3 + 2]) || 1;
        nrm.setXYZ(j, acc[c * 3] / l, acc[c * 3 + 1] / l, acc[c * 3 + 2] / l);
      }
    }
    out.computeBoundingSphere();
    if (out.boundingSphere) out.boundingSphere.radius *= 1.6;
    out.userData = { srcTri: Uint32Array.from(srcTri), cover } satisfies GarmentData;
    return out;
  }

  /** Animation (nach Name wie im alten Skelett) für diese Figur – wird beim ersten Abruf übertragen */
  clip(name: string): AnimationClip | null {
    const hit = this.clips.get(name);
    if (hit) return hit;
    const src = this.srcClips.get(name);
    if (!src) return null;
    const c = this.retarget(src);
    this.clips.set(name, c);
    return c;
  }

  private srcPose: { rig: Object3D; mixer: AnimationMixer } | null = null;
  private dstPose: Object3D | null = null;

  /** Bewegung jedes Knochens in Weltlage übertragen: Δ = Quelle(t) · Quelle(Ruhe)⁻¹, Ziel = Δ · Ziel(Ruhe) */
  private retarget(src: AnimationClip): AnimationClip {
    if (!this.srcPose) {
      const rig = cloneSkinned(this.srcRig);
      this.srcPose = { rig, mixer: new AnimationMixer(rig) };
    }
    if (!this.dstPose) this.dstPose = cloneSkinned(this.template);
    const { rig, mixer } = this.srcPose;
    const dst = this.dstPose;
    rig.updateMatrixWorld(true);
    // Ruhelagen merken (Quelle vor dem Abspielen, Ziel aus der Vorlage)
    const pairs: { s: Object3D; d: Object3D; sr: Quaternion; dr: Quaternion; dl: Quaternion }[] = [];
    const resetSrc = () => { mixer.stopAllAction(); rig.traverse((o) => { const r = o.userData.rest as { q: Quaternion; p: Vector3 } | undefined; if (r) { o.quaternion.copy(r.q); o.position.copy(r.p); } }); };
    rig.traverse((o) => { if (!o.userData.rest) o.userData.rest = { q: o.quaternion.clone(), p: o.position.clone() }; });
    resetSrc();
    rig.updateMatrixWorld(true);
    dst.traverse((o) => { if (!o.userData.rest) o.userData.rest = { q: o.quaternion.clone(), p: o.position.clone() }; else { o.quaternion.copy(o.userData.rest.q); o.position.copy(o.userData.rest.p); } });
    dst.updateMatrixWorld(true);
    for (const [sn, dn] of Object.entries(VROID_BONES)) {
      // die Hand folgt dem Handknochen (hinter dem Handgelenk), den die Kampfanimationen eigens drehen –
      // sonst ginge die Drehung der Faust verloren und die Klinge zeigte beim Zustechen schräg zur Seite
      const s = rig.getObjectByName(SRC_HAND[sn] ?? sn), d = dst.getObjectByName(dn);
      if (!s || !d) continue;
      pairs.push({ s, d, sr: s.getWorldQuaternion(new Quaternion()), dr: this.restWorld(d, new Quaternion()), dl: d.quaternion.clone() });
    }
    // Eltern vor Kindern
    pairs.sort((a, b) => depth(a.d) - depth(b.d));
    const sHips = rig.getObjectByName('hips')!, dHips = dst.getObjectByName('J_Bip_C_Hips')!;
    const sHip0 = sHips.getWorldPosition(new Vector3());
    const dHip0 = dHips.getWorldPosition(new Vector3());
    const ratio = this.hipH / Math.max(0.01, sHip0.y);
    const fps = 30;
    const n = Math.max(2, Math.ceil(src.duration * fps) + 1);
    const times = new Float32Array(n);
    const qv = pairs.map(() => new Float32Array(n * 4));
    const pv = new Float32Array(n * 3);
    // Spuren ohne Ziel in der Quellfigur (Waffenhalterungen „handslot“, die erst die Spielfigur bekommt) weglassen –
    // sonst meldet three.js für jeden übertragenen Clip „No target node found“
    const bound = src.clone();
    bound.tracks = bound.tracks.filter((tr) => !!rig.getObjectByName(PropertyBinding.parseTrackName(tr.name).nodeName));
    const action = mixer.clipAction(bound);
    action.play();
    // Arme näher am Körper: die Vorlagen stammen von breiten Figuren, deren Arme stets abgespreizt sind
    const side = (name: string) => (name.includes('_L_') ? 'l' : name.includes('_R_') ? 'r' : null);
    const armDir = new Map<string, Vector3>();
    for (const p of pairs) {
      if (!/UpperArm$/.test(p.d.name)) continue;
      const child = p.d.children.find((c) => /LowerArm$/.test(c.name));
      if (child) armDir.set(p.d.name, child.position.clone().normalize());
    }
    const tuck = { l: new Quaternion(), r: new Quaternion() };
    const inPlace = /Attack|Hit_|Block|Interact|Magic|Spell/.test(src.name);
    for (let i = 0; i < n; i++) {
      const t = Math.min(src.duration, i / fps);
      times[i] = t;
      action.time = t;
      mixer.update(0);
      rig.updateMatrixWorld(true);
      tuck.l.identity(); tuck.r.identity();
      for (let k = 0; k < pairs.length; k++) {
        const p = pairs[k];
        p.s.getWorldQuaternion(q1);
        q2.copy(p.sr).invert();
        q1.multiply(q2).multiply(p.dr); // Zielweltlage
        const sd = side(p.d.name);
        const dir = armDir.get(p.d.name);
        if (sd && dir) {
          tuckArm(v1.copy(dir).applyQuaternion(q1), sd, tuck[sd]);
          q1.premultiply(tuck[sd]);
        } else if (sd && /LowerArm$|_Hand$/.test(p.d.name)) {
          q1.premultiply(tuck[sd]);
        }
        p.d.parent!.getWorldQuaternion(q3).invert();
        p.d.quaternion.copy(q3.multiply(q1));
        p.d.updateMatrixWorld(true);
        p.d.quaternion.toArray(qv[k], i * 4);
      }
      // Hüftbewegung maßstäblich übertragen
      sHips.getWorldPosition(v1).sub(sHip0).multiplyScalar(ratio);
      if (inPlace) {
        // Angriffe der Vorlagen springen bis 1,5 m vor und am Ende zurück – das Spiel schiebt die Figur
        // selbst nach vorn (Ausfallschritt), sonst wirkt es wie Vorspringen und Zurückschnappen
        const h = Math.hypot(v1.x, v1.z);
        if (h > 1e-4) { const k = Math.min(h * 0.3, 0.3) / h; v1.x *= k; v1.z *= k; }
        if (v1.y > 0) v1.y = 0.4 * Math.tanh(v1.y / 0.4);
      }
      v1.add(dHip0);
      dHips.parent!.worldToLocal(v1);
      v1.toArray(pv, i * 3);
      dHips.position.copy(v1);
      dHips.updateMatrixWorld(true);
    }
    action.stop();
    // Hilfs-Clip wieder freigeben (der Quell-Mixer behielte sonst eine Aktion je übertragenem Clip)
    mixer.uncacheClip(bound);
    resetSrc();
    const tracks = pairs.map((p, k) => new QuaternionKeyframeTrack(`${p.d.name}.quaternion`, times, qv[k]));
    tracks.push(new VectorKeyframeTrack(`${dHips.name}.position`, times, pv));
    return new AnimationClip(src.name, src.duration, tracks);
  }

  static readonly HAND_ALIAS = HAND_ALIAS;
}

/** Kleidungsstücke, die aus dem Körper erzeugt werden */
export type GarmentKind = 'hose' | 'stiefel' | 'mantelKurz' | 'mantelLang' | 'guertel'
  | 'weste' | 'jacke' | 'tunika' | 'ringel' | 'hemd' | 'handschuhe' | 'schal'
  | 'uniform' | 'armschiene' | 'beinschiene' | 'kuerass' | 'kilt' | 'kragen';

/**
 * Was unter Gürtel, Halstuch und Mantel liegt – danach richtet sich, wie weit außen sie sitzen:
 * „grund“ = Hemd der Grundfigur, „eng“ = erzeugtes enges Hemd, sonst das genannte eigene Oberteil.
 */
export type TopUnder = 'grund' | 'eng' | 'ringel' | 'tunika' | 'jacke' | 'uniform';
export interface GarmentCtx { under: TopUnder; coat: 'keiner' | 'kurz' | 'lang'; /** Stiefel getragen (Beinschienen sitzen dann auf dem Schaft) */ boots?: boolean }
const PLAIN: GarmentCtx = { under: 'grund', coat: 'keiner' };

/** Maße der Vorlage, nach denen die Stücke zugeschnitten werden (Weltmaß, Ruhehaltung) */
interface Region { hipsY: number; kneeY: number; ankleY: number; neckY: number; leg: number; ankleZ: number; toeZ: number; elbowX: number; wristX: number }

/** Körperregionen als Bits; ein Hautpunkt gehört zu einer Region, wenn ihre Knochen zusammen mehr als die Hälfte wiegen */
const C_HAND = 0, C_ARM = 1, C_UPARM = 2, C_TORSO = 3, C_PELVIS = 4, C_FOOT = 5, C_UPLEG = 6, C_LOWLEG = 7, C_LOWARM = 8, NCLS = 9;
function boneClass(b: string): number {
  let c = 0;
  if (/Hand$|Thumb|Index|Middle|Ring|Little/.test(b)) c |= 1 << C_HAND;
  if (/UpperArm$|LowerArm$/.test(b)) c |= 1 << C_ARM;
  if (/UpperArm$/.test(b)) c |= 1 << C_UPARM;
  if (/LowerArm$/.test(b)) c |= 1 << C_LOWARM;
  if (/Hips$|Spine$|Chest$|UpperChest$|Shoulder$/.test(b)) c |= 1 << C_TORSO;
  if (/Hips$|_Spine$/.test(b)) c |= 1 << C_PELVIS;
  if (/Foot$|Toe/.test(b)) c |= 1 << C_FOOT;
  if (/UpperLeg$/.test(b)) c |= 1 << C_UPLEG;
  if (/LowerLeg$/.test(b)) c |= 1 << C_LOWLEG;
  return c;
}

/** Stücke ohne Unterteilen und Glätten (harte Teile, schmale Riemen) */
const HARD = new Set<GarmentKind>(['handschuhe', 'armschiene', 'beinschiene']);
/** Schmale Stücke, die dicht auf der Schicht unter ihnen liegen: sie verdecken bis an ihren Rand */
const BANDS = new Set<GarmentKind>(['schal', 'kragen', 'guertel', 'armschiene', 'beinschiene']);
/** Säume an der Schnittlinie schneiden (statt angeschnittene Dreiecke wegzulassen) */
const CUT_HEMS = true;
/** Anteil, mit dem die Schöße des langen Mantels am Becken hängen (Rest folgt dem Bein) */
const TAIL_HIPS = 0.55;

/** Schlüssel eines Stücks: der Zusammenhang zählt nur bei den Stücken, deren Form von ihm abhängt */
export function garmentKey(kind: GarmentKind, ctx: GarmentCtx) {
  const coat = ctx.coat !== 'keiner';
  if (kind === 'guertel' || kind === 'mantelKurz' || kind === 'mantelLang' || kind === 'kuerass' || kind === 'kilt') return `${kind}@${ctx.under}${coat ? '+m' : ''}`;
  if (kind === 'ringel' || kind === 'tunika' || kind === 'jacke' || kind === 'uniform') return coat ? `${kind}+m` : kind;
  if (kind === 'armschiene') return `${kind}@${ctx.under}/${ctx.coat}`;
  if (kind === 'beinschiene') return `${kind}@${ctx.boots ? 'stiefel' : 'hose'}`;
  if (kind === 'schal' || kind === 'kragen') return `${kind}@${ctx.under}/${ctx.coat}`;
  return kind;
}

/** Daten am erzeugten Stück bzw. am zusammengeführten Satz (für die Maske) */
export interface GarmentData { srcTri: Uint32Array; cover: Uint8Array }
export interface GarmentSetData { key: string; src: Int32Array; level: Uint8Array }

/** Gewichte nach dem Glätten von der Haut unter der neuen Lage holen */
const REFETCH_WEIGHTS = true;
/** Ein Stück verdeckt nur, wo es höchstens so weit von der Haut absteht (m) */
const COVER_TIGHT = 0.04;
/** Saumrand: so viele Punkt-Ringe der unteren Schicht bleiben unter jedem Saum stehen */
const COVER_RINGS = 1;
/** bis zu diesem Abstand (m) gilt ein Stück als hauteng */
const SNUG = 0.012;
/** Grundkleidung (eigenes Netz, lose Stellen): strenger */
const BASE_TIGHT = 0.025;
const BASE_RINGS = 1;
/** Haare bleiben bis so weit über dem Hutrand stehen (m, Kopfraum) */
const CAP_RIM = 0.035;

/** Deckt die Textur an dieser Stelle? (Kleidung der Grundfigur hat teils durchsichtige Bereiche) */
function alphaSampler(t: Texture | null): ((u: number, v: number) => boolean) | null {
  const img = t?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!t || !img || !img.width) return null;
  try {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const a = g.getImageData(0, 0, c.width, c.height).data;
    const w = c.width, h = c.height;
    return (u, v) => {
      const x = Math.min(w - 1, Math.floor((u - Math.floor(u)) * w)), y = Math.min(h - 1, Math.floor((v - Math.floor(v)) * h));
      return a[(y * w + x) * 4 + 3] >= 128;
    };
  } catch { return null; }
}

/** Ebene jedes Kleidungsstücks, innen → außen: ein Stück verdeckt, was auf einer niedrigeren Ebene unter ihm liegt */
export const GARMENT_LEVEL: Record<GarmentKind, number> = {
  hose: 1, handschuhe: 1, hemd: 2, ringel: 2, tunika: 2, weste: 3, jacke: 3, uniform: 3, kilt: 3, guertel: 4, kuerass: 4, stiefel: 5,
  mantelKurz: 6, mantelLang: 6, beinschiene: 6, schal: 7, kragen: 7, armschiene: 8,
};

/**
 * Unter Mantel und Weste wird das weite Hemd der Grundfigur (Puffärmel, abstehender Kragen) durch ein eng anliegendes,
 * erzeugtes Hemd ersetzt. Alles darüber rechnet dann höchstens mit dieser Hemddicke – schlanke Mäntel ohne Durchstechen.
 */
export const SHIRT_CAP = 0.014;

/**
 * Abstand der Grundkleidung zur Haut je Hautpunkt (−1 = dort liegt keine). Kleidung, die darüber getragen wird,
 * muss mindestens so weit außen liegen – sonst sticht Hemd oder Hose hindurch.
 */
export interface Clearance {
  top: Float32Array; bottom: Float32Array; shoes: Float32Array;
  /** 1 = dieser Hautpunkt liegt unter eng anliegendem, deckendem Hemd bzw. Schuh der Grundfigur */
  topSolid: Uint8Array; shoesSolid: Uint8Array;
  /** 1 = dort liegt Grundkleidung, aber lose oder mit Loch in der Textur (verdeckt nichts sicher) */
  topLoose: Uint8Array; shoesLoose: Uint8Array;
  /** je Teil der Grundkleidung (Index wie parts): nächster Hautpunkt jedes seiner Punkte, −1 = keiner */
  owners: Map<number, Int32Array>;
}

/** Gemessene Ankerpunkte: Ohrläppchen und Augenhöhe im Kopfraum, Schultern im Brustraum, Schärpe im Hüftraum */
/** Aus der Frisur gemessene Kappe (Kopfraum): Netz, Sitzhöhe, Mitte und mittlerer Randradius */
export interface CapShell { geo: BufferGeometry; seatY: number; cx: number; cz: number; ringR: number }

export interface Anchors { earLobe: Vector3; eyeY: number; shoulders: [Vector3, Vector3] }

/** Knoten und Schnalle am Band: Lage im Hüftraum und die Knochen, die das Band dort bewegen */
export interface BeltAnchors { knot: Vector3; knotPin: SkinPin; buckle: Vector3; bucklePin: SkinPin }

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Abstand eines Hautpunkts zur Kleidung in Metern, −1 = gehört nicht dazu.
 * b: Knochen mit dem größten Gewicht, P/N: Lage und Normale in der Vorlage.
 * cTop/cBot/cShoe: Abstand der Grundkleidung (Hemd, Hose, Schuhe) an diesem Punkt, −1 = keine.
 * Schichten von innen nach außen: Hemd → Ringelhemd/Tunika → Weste/Jacke → Gürtel/Schärpe → Schal → Mantel.
 */
function garmentOffset(kind: GarmentKind, who: ArrayLike<number>, P: Vector3, N: Vector3, r: Region, cTop: number, cBot: number, cShoe: number, ctx: GarmentCtx): number {
  const isPelvis = who[C_PELVIS] > 0.5;
  const arm = who[C_ARM] > 0.5;
  const hand = who[C_HAND] > 0.5;
  const torso = who[C_TORSO] > 0.5;
  const upperArm = who[C_UPARM] >= who[C_LOWARM];
  const foot = who[C_FOOT] > 0.5;
  const under = Math.max(cTop, cBot, 0);
  // Außenfläche eines eigenen Oberteils (Ringelhemd, Tunika, Jacke, Uniformrock) an dieser Stelle: was darüber getragen
  // wird, muss darüber liegen. Vorher rechneten Gürtel und Mantel immer mit dem engen Hemd und versanken in der Jacke.
  const own = ctx.under === 'ringel' || ctx.under === 'tunika' || ctx.under === 'jacke' || ctx.under === 'uniform';
  // Unter einem Mantel sitzen auch eigene Oberteile schlank: sie folgen sonst den Puffärmeln des Hemds der Grundfigur,
  // und an deren Saum blitzt das Oberteil unter dem Mantelärmel hervor
  const cT = ctx.coat !== 'keiner' && cTop >= 0 ? Math.min(cTop, SHIRT_CAP) : cTop;
  // Wo die Hose reicht (bis knapp über die Hüfte), liegt jedes Oberteil klar über ihr: ein eng anliegender Hemdsaum
  // lag sonst auf gleicher Höhe wie der Hosenbund und flackerte auf Entfernung
  const overHose = (o: number) => (P.y < r.hipsY + 0.07 ? Math.max(o, 0.017) : o);
  const slim = cTop < 0 ? 0 : overHose(Math.min(cTop * 0.6, SHIRT_CAP - 0.004) + 0.004);
  const T = ctx.under === 'jacke' || ctx.under === 'uniform' ? (cTop < 0 ? 0.018 : arm ? Math.max(0.016, cT + 0.008) : Math.max(0.018, cT + 0.009))
    : ctx.under === 'tunika' ? (cTop < 0 ? 0.021 : overHose(Math.max(0.012, cT + 0.006)))
    : ctx.under === 'ringel' ? (cTop < 0 ? 0 : overHose(cT + 0.004)) : 0;
  /** Außenfläche dessen, was am Oberkörper unter Platten und Schienen liegt (0 = nackte Haut) */
  const topSurface = () => (own ? (ctx.under === 'ringel' || ctx.under === 'tunika' ? (cTop < 0 ? 0 : T) : arm || torso ? T : 0)
    : cTop < 0 ? 0 : ctx.under === 'eng' ? slim : cTop);
  switch (kind) {
    case 'hose':
      // Bund knapp über der Hüfte, Saum steckt in den Stiefeln; nur nach Höhe (das Becken hat gemischte Gewichte),
      // Hände und Arme liegen in der T-Pose ohnehin weiter oben
      // bis zum Knöchel (ohne Stiefel sonst eine zu kurze Hose), Fuß frei für die Schuhe
      if (hand || arm || foot || P.y > r.hipsY + 0.07 || P.y < r.ankleY + 0.012) return -1;
      return 0.011;
    case 'ringel':
      // Ringelhemd: liegt dicht auf dem Hemd der Grundfigur, überall wo es Hemd gibt
      if (cTop < 0 || hand) return -1;
      return overHose(cT + 0.004);
    case 'hemd':
      // eng anliegendes Hemd überall, wo die Grundfigur eines trägt (ersetzt es unter Mantel und Weste)
      if (cTop < 0 || hand) return -1;
      return slim;
    case 'tunika':
      // lange Tunika: Oberkörper und Ärmel wie das Hemd, unten bis zur Mitte des Oberschenkels
      if (hand) return -1;
      if (cTop >= 0) return overHose(Math.max(0.012, cT + 0.006));
      if (who[C_TORSO] + who[C_UPLEG] > 0.5 && P.y < r.hipsY && P.y > r.hipsY - (r.hipsY - r.kneeY) * 0.5) return Math.max(0.02, under + 0.008 + (r.hipsY - P.y) * 0.06);
      return -1;
    case 'weste': {
      // Weste über dem engen Hemd: Rumpf ohne Ärmel, vorn offen, bis über die Schultern
      if (hand || arm) return -1;
      if (cTop < 0 && !(torso && P.y > r.hipsY - 0.04 && P.y < r.neckY + 0.02)) return -1;
      if (P.y < r.hipsY - 0.04 || P.y > r.neckY + 0.02) return -1;
      // schmaler als die Mantelöffnung, damit die Weste im Ausschnitt sichtbar bleibt
      if (N.z > 0.35 && N.y < 0.45 && Math.abs(P.x) < 0.012 + Math.max(0, P.y - (r.hipsY + 0.25)) * 0.12) return -1;
      // immer 8 mm über dem engen Hemd darunter
      return Math.max(0.016, slim + 0.008);
    }
    case 'jacke': {
      // Weste: Rumpf ohne Ärmel, vorn offen; Jacke: überall, wo die Grundfigur ein Hemd trägt, dazu lange Ärmel.
      // Fläche nach dem Hemd statt nach Knochen – die Brust hängt an eigenen Knochen (sonst Löcher)
      if (hand) return -1;
      if (arm) return Math.max(0.016, cT + 0.008);
      if (cTop < 0 && !(torso && P.y > r.hipsY - 0.04 && P.y < r.neckY + 0.02)) return -1;
      return Math.max(0.018, cT + 0.009);
    }
    case 'guertel':
      // Schärpe bzw. Koppel: breites Band um die Taille, über Hemd, Hose, Weste und Tunika, unter dem Mantel
      // (eng: über dem erzeugten engen Hemd unter Mantel/Weste; über einem eigenen Oberteil knapp auf diesem)
      if (!isPelvis || P.y < r.hipsY - 0.005 || P.y > r.hipsY + 0.065) return -1;
      if (own) return Math.max(0.026, T + 0.008);
      return ctx.under === 'eng' ? Math.max(0.026, Math.min(under, SHIRT_CAP) + 0.02, slim + 0.014) : Math.max(0.026, under + 0.026);
    case 'handschuhe':
      // Fäustlinge: Hand und Finger, knapp über das Handgelenk
      if (!hand) return -1;
      return 0.006;
    case 'schal':
      // Halstuch: Ring um den Hals auf Höhe des Kragens
      // nur um den Hals: die Schultern liegen auf gleicher Höhe und gehören nicht dazu (sonst wird es ein Schulterkragen)
      if (P.y < r.neckY - 0.06 || P.y > r.neckY + 0.025 || hand || arm || Math.abs(P.x) > 0.1) return -1;
      {
        let o = own ? Math.max(0.022, T + 0.01) : Math.max(0.022, cTop + 0.012);
        // über dem Mantelkragen, wo einer liegt (vorher lag das Tuch auf gleicher Höhe wie der Mantel und flackerte)
        if (ctx.coat !== 'keiner') {
          const c = garmentOffset(ctx.coat === 'kurz' ? 'mantelKurz' : 'mantelLang', who, P, N, r, cTop, cBot, cShoe, ctx);
          if (c >= 0) o = Math.max(o, c + 0.008);
        }
        return o;
      }
    case 'stiefel':
      // vom Knöchel bis knapp unter das Knie, oben eine weite Stulpe – immer über Hose und Schuhen
      if (who[C_LOWLEG] + who[C_FOOT] <= 0.5 || P.y > r.kneeY - r.leg * 0.08 || P.y < r.ankleY - 0.06) return -1;
      return Math.max(0.026 + smooth(r.kneeY - r.leg * 0.32, r.kneeY - r.leg * 0.1, P.y) * 0.022, cBot + 0.008, cShoe + 0.005);
    case 'mantelKurz':
    case 'mantelLang': {
      // eng über Hemd und Weste (2 cm), nur über der Schärpe weiter; Ärmel schlank – vorher überall 3,4–3,6 cm (klobig)
      // unter dem Mantel liegt immer das enge Hemd (höchstens SHIRT_CAP dick)
      const thin = Math.min(Math.max(cTop, 0), SHIRT_CAP);
      const over = own ? Math.max(0.024, T + 0.012) : Math.max(0.024, thin + 0.016);
      if (arm) return own ? Math.max(0.018, T + 0.009) : upperArm ? Math.max(0.018, thin + 0.01) : Math.max(0.015, thin + 0.008);
      // bis über die Schultern (die Schulterhaut liegt auf Höhe des Halsansatzes; Hals und Kopf gehören zu eigenen Knochen)
      if (torso && P.y >= r.hipsY - 0.03 && P.y < r.neckY + 0.03) {
        // offene Front: schmales V, Schultern und nach oben zeigende Flächen bleiben bedeckt
        const open = 0.04 + smooth(r.hipsY + 0.22, r.neckY, P.y) * 0.025;
        if (N.z > 0.4 && N.y < 0.45 && Math.abs(P.x) < open) return -1;
        const band = smooth(r.hipsY - 0.03, r.hipsY - 0.005, P.y) * (1 - smooth(r.hipsY + 0.075, r.hipsY + 0.1, P.y));
        return over + band * 0.016;
      }
      // Schöße nur beim langen Mantel: seitlich und hinten bis übers Knie, nach unten etwas weiter
      if (kind === 'mantelLang' && who[C_TORSO] + who[C_UPLEG] > 0.5 && P.y < r.hipsY && P.y > r.kneeY + 0.02) {
        if (N.z > 0.2) return -1;
        if ((P.x > 0 && N.x < -0.35) || (P.x < 0 && N.x > 0.35)) return -1;
        return Math.max(0.03 + (r.hipsY - P.y) * 0.16, over + 0.01);
      }
      return -1;
    }
    case 'uniform': {
      // Uniformrock: geschlossen, lange Ärmel, kurzer Schoß bis über die Hüfte
      if (hand) return -1;
      if (arm) return Math.max(0.016, cT + 0.008);
      if (cTop >= 0 || (torso && P.y > r.hipsY - 0.04 && P.y < r.neckY + 0.02)) return Math.max(0.018, cT + 0.009);
      if (who[C_TORSO] + who[C_UPLEG] > 0.5 && P.y <= r.hipsY && P.y > r.hipsY - 0.13) return 0.02 + (r.hipsY - P.y) * 0.07;
      return -1;
    }
    case 'armschiene': {
      // Schiene um den Unterarm, über Ärmel und Mantel
      const f = (Math.abs(P.x) - r.elbowX) / Math.max(0.01, r.wristX - r.elbowX);
      if (!arm || upperArm || hand || f < 0.22 || f > 0.9) return -1;
      let o = Math.max(0.008, topSurface() + 0.006);
      if (ctx.coat !== 'keiner') {
        const c = garmentOffset(ctx.coat === 'kurz' ? 'mantelKurz' : 'mantelLang', who, P, N, r, cTop, cBot, cShoe, ctx);
        if (c >= 0) o = Math.max(o, c + 0.006);
      }
      return o;
    }
    case 'beinschiene': {
      // Platte vorn auf dem Schienbein, auf dem Stiefelschaft bzw. der Hose
      if (who[C_LOWLEG] <= 0.5 || N.z < 0.05 || P.y > r.kneeY - r.leg * 0.14 || P.y < r.ankleY + r.leg * 0.14) return -1;
      const base = ctx.boots ? garmentOffset('stiefel', who, P, N, r, cTop, cBot, cShoe, ctx) : 0.011;
      return (base < 0 ? 0.011 : base) + 0.007;
    }
    case 'kilt': {
      // Lendenschurz bzw. Hüftplatten: vom Gürtel bis über die Mitte der Oberschenkel, nach unten weiter abstehend.
      // Die Innenseiten der Oberschenkel bleiben frei (sonst stechen die beiden Hälften ineinander).
      const bot = r.hipsY - (r.hipsY - r.kneeY) * 0.6;
      if (hand || arm || who[C_TORSO] + who[C_UPLEG] <= 0.5 || P.y > r.hipsY + 0.012 || P.y < bot) return -1;
      if ((P.x > 0.005 && N.x < -0.3) || (P.x < -0.005 && N.x > 0.3)) return -1;
      const k = Math.min(1, Math.max(0, (r.hipsY + 0.012 - P.y) / (r.hipsY + 0.012 - bot)));
      // unter dem Gürtel: knapp über dem, was darunter liegt
      return Math.max(0.016, under + 0.008) + k * k * 0.028;
    }
    case 'kragen': {
      // Stehkragen bzw. Halsberge: höher und weiter als das Halstuch, oben nach außen aufgestellt
      if (P.y < r.neckY - 0.07 || P.y > r.neckY + 0.045 || hand || arm || Math.abs(P.x) > 0.11) return -1;
      let o = own ? Math.max(0.03, T + 0.014) : Math.max(0.03, cTop + 0.016);
      if (ctx.coat !== 'keiner') {
        const c = garmentOffset(ctx.coat === 'kurz' ? 'mantelKurz' : 'mantelLang', who, P, N, r, cTop, cBot, cShoe, ctx);
        if (c >= 0) o = Math.max(o, c + 0.01);
      }
      return o + smooth(r.neckY - 0.01, r.neckY + 0.045, P.y) * 0.02;
    }
    case 'kuerass': {
      // Brustplatte: Rumpf ohne Ärmel, von über der Schärpe bis unter den Hals
      if (hand || arm || !torso || P.y < r.hipsY + 0.075 || P.y > r.neckY - 0.015) return -1;
      return Math.max(0.026, topSurface() + 0.009);
    }
  }
}

/** Borten reichen höchstens so weit vom Rand (m); weiter entfernte Punkte bekommen diesen Wert */
const RIM_MAX = 0.09;

/**
 * Abstand jedes Punkts zum nächsten Rand des Stücks in Metern (Kantenweg über das Netz, höchstens maxD): damit zeichnet der
 * Shader Borten (Saum, Ärmelrand, Kragen, Mantelöffnung) scharf und unabhängig von der Auflösung des Netzes.
 */
function rimDistance(T: number[], weld: Int32Array, p: Float32Array, m: number, scale: number, maxD: number): Float32Array {
  const cnt = new Map<number, number>();
  for (let t = 0; t < T.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = weld[T[t + k]], b = weld[T[t + (k + 1) % 3]];
    if (a === b) continue;
    const key = a < b ? a * m + b : b * m + a;
    cnt.set(key, (cnt.get(key) ?? 0) + 1);
  }
  const adj: number[][] = Array.from({ length: m }, () => []);
  const d = new Float32Array(m).fill(maxD);
  const queue: number[] = [];
  const inQ = new Uint8Array(m);
  for (const [key, c] of cnt) {
    const a = Math.floor(key / m), b = key - a * m;
    adj[a].push(b); adj[b].push(a);
    if (c === 1) for (const v of [a, b]) if (!inQ[v]) { d[v] = 0; inQ[v] = 1; queue.push(v); }
  }
  for (let h = 0; h < queue.length; h++) {
    const a = queue[h];
    inQ[a] = 0;
    for (const b of adj[a]) {
      const nd = d[a] + Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]) * scale;
      if (nd < d[b]) { d[b] = nd; if (!inQ[b]) { inQ[b] = 1; queue.push(b); } }
    }
    if (h > 4096 && h * 2 > queue.length) { queue.splice(0, h + 1); h = -1; }
  }
  for (let j = 0; j < m; j++) if (weld[j] !== j) d[j] = d[weld[j]];
  return d;
}

const TUCK = 0.42; // ≈ 24°
const Z_AXIS = new Vector3(0, 0, 1);
/**
 * Seitliches Abspreizen des Oberarms (in der Körperebene, Figur schaut nach +Z) verringern.
 * Nach vorn oder über den Kopf gerichtete Arme bleiben fast unverändert.
 */
function tuckArm(dir: Vector3, s: 'l' | 'r', out: Quaternion) {
  out.identity();
  // links liegt bei +X, rechts bei −X; Arme vor dem Körper über Kreuz nicht anfassen
  const lateral = s === 'l' ? dir.x : -dir.x;
  const inPlane = Math.hypot(dir.x, dir.y);
  if (lateral <= 0 || inPlane < 0.15) return;
  const phi = Math.atan2(lateral, -dir.y); // 0 = hängt gerade herab, π/2 = waagrecht zur Seite
  const fade = phi < 1.75 ? 1 : Math.max(0, 1 - (phi - 1.75) / 0.9); // über Kopfhöhe ausblenden
  const amount = Math.min(TUCK * fade * Math.min(1, inPlane / 0.6), Math.max(0, phi - 0.14));
  if (amount <= 0) return;
  out.setFromAxisAngle(Z_AXIS, s === 'l' ? -amount : amount);
}

/** Drehung der Waffenhalterung gegen die Hand (wie in den Animationsdateien): rechts +90°, links −90° um Z */
export function slotTurn(s: 'l' | 'r') { return new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), s === 'r' ? Math.PI / 2 : -Math.PI / 2); }

function depth(o: Object3D) { let d = 0; let p = o.parent; while (p) { d++; p = p.parent; } return d; }

/**
 * Haare einer Figur auf eine andere übertragen: die Haar-Netze samt ihren Haarknochen (J_Sec_…)
 * werden an den gleichnamigen Kopfknochen der Zielfigur gehängt. Beide Figuren nutzen dasselbe VRoid-Skelett.
 */
function graftHair(target: Object3D, donor: Object3D, skip?: RegExp) {
  const hairs: SkinnedMesh[] = [];
  donor.traverse((o) => {
    const m = o as SkinnedMesh;
    if (m.isSkinnedMesh && /HAIR/i.test((m.material as Material).name) && !(skip && skip.test(m.name))) hairs.push(m);
  });
  if (!hairs.length) return;
  const byName = new Map<string, Object3D>();
  target.traverse((o) => byName.set(o.name, o));
  // fehlende Knochen (Haarknochen) mit gleicher Lage übernehmen
  const ensure = (b: Object3D): Object3D => {
    const have = byName.get(b.name);
    if (have) return have;
    const parent = b.parent ? ensure(b.parent) : target;
    const c = new (b.constructor as new () => Object3D)();
    c.name = b.name;
    c.position.copy(b.position); c.quaternion.copy(b.quaternion); c.scale.copy(b.scale);
    parent.add(c);
    byName.set(c.name, c);
    return c;
  };
  // ein gemeinsames Skelett je Quellskelett, damit die Haarteile später zusammengeführt werden können
  const skels = new Map<string, Skeleton>();
  for (const h of hairs) {
    let skel = skels.get(h.skeleton.uuid);
    if (!skel) {
      const bones = h.skeleton.bones.map((b) => ensure(b) as unknown as import('three').Bone);
      skel = new Skeleton(bones, h.skeleton.boneInverses.map((m) => m.clone()));
      skels.set(h.skeleton.uuid, skel);
    }
    const m = new SkinnedMesh(h.geometry, h.material);
    m.name = h.name;
    const parent = h.parent ? byName.get(h.parent.name) ?? target : target;
    parent.add(m);
    m.position.copy(h.position); m.quaternion.copy(h.quaternion); m.scale.copy(h.scale);
    m.bind(skel, h.bindMatrix.clone());
  }
}

/** Krawatte der Schuluniform entfernen (passt nicht zu Piraten) */
function removeParts(root: Object3D, re: RegExp) {
  const drop: Object3D[] = [];
  root.traverse((o) => { const m = o as SkinnedMesh; if (m.isSkinnedMesh && re.test((m.material as Material).name)) drop.push(m); });
  for (const d of drop) d.removeFromParent();
}

/** Beide Grundfiguren laden */
export async function loadVroid(srcRig: Object3D, srcClips: Map<string, AnimationClip>, srcSlot: Vector3): Promise<{ male: VroidBase; female: VroidBase } | null> {
  const base = `${import.meta.env.BASE_URL}assets/characters/vroid/`;
  try {
    // Körper und Kleidung der Grundfiguren (Hemd, Weste), Haare der Frisur-Beispiele – über die zentrale Pipeline
    const [bm, bf, hm, hf] = await Promise.all(['base_male', 'base_female', 'male', 'female'].map((n) => preload.loadGltf(`${base}${n}.glb`)));
    removeParts(bm.scene, /Tie|HairBack/i);
    removeParts(bf.scene, /Tie|HairBack/i);
    graftHair(bm.scene, hm.scene);
    // die Frisur der Haar-Vorlage trägt Katzenohren (die sechs obersten Teile) – die passen nicht zu Piraten
    graftHair(bf.scene, hf.scene, /^Hair001baked(_[1-5])?$/);
    return { male: new VroidBase(bm.scene, 1.74, srcRig, srcClips, srcSlot), female: new VroidBase(bf.scene, 1.64, srcRig, srcClips, srcSlot) };
  } catch (e) {
    console.warn('Anime-Figuren konnten nicht geladen werden – nutze Ersatzfiguren', e);
    return null;
  }
}

