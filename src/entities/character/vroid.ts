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
      first.frustumCulled = false;
    }
  }

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
  private garments = new Map<GarmentKind, BufferGeometry | null>();
  garment(kind: GarmentKind): BufferGeometry | null {
    if (!this.garments.has(kind)) this.garments.set(kind, this.buildGarment(kind));
    return this.garments.get(kind) ?? null;
  }

  /**
   * Mehrere Kleidungsstücke als ein Netz (eine Zeichenoperation je Figur): das Attribut „part“ sagt,
   * zu welchem Stück ein Punkt gehört – daraus färbt jede Figur ihre Stücke selbst ein.
   */
  private sets = new Map<string, BufferGeometry | null>();
  garmentSet(kinds: GarmentKind[]): BufferGeometry | null {
    const key = kinds.join('+');
    if (!this.sets.has(key)) {
      const geos = kinds.map((k, i) => {
        const g = this.garment(k);
        if (!g) return null;
        const c = g.clone();
        c.setAttribute('part', new BufferAttribute(new Float32Array(g.attributes.position.count).fill(i), 1));
        return c;
      }).filter((g): g is BufferGeometry => !!g);
      const merged = geos.length ? mergeGeometries(geos, false) : null;
      if (merged) { merged.computeBoundingSphere(); if (merged.boundingSphere) merged.boundingSphere.radius *= 1.6; }
      this.sets.set(key, merged ? markShared(merged) : null);
    }
    return this.sets.get(key) ?? null;
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
    const out: Clearance = { top: new Float32Array(n).fill(-1), bottom: new Float32Array(n).fill(-1), shoes: new Float32Array(n).fill(-1) };
    this.template.traverse((o) => {
      const m = o as SkinnedMesh;
      const part = m.isSkinnedMesh ? this.parts[m.userData.vroidPart as number] : null;
      if (!part || (part.slot !== 'top' && part.slot !== 'bottom' && part.slot !== 'shoes')) return;
      const dst = out[part.slot];
      const cp = m.geometry.attributes.position;
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
    const head = this.find(T, 'J_Bip_C_Head')!, chest = this.find(T, 'J_Bip_C_Chest')!, hips = this.find(T, 'J_Bip_C_Hips')!;
    const toHead = head.matrixWorld.clone().invert(), toChest = chest.matrixWorld.clone().invert(), toHips = hips.matrixWorld.clone().invert();
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
    // Schärpe: Ellipse der Taille (Haut + Kleidung + Bandstärke) knapp über der Hüfte
    const hipsY = hips.getWorldPosition(new Vector3()).y;
    let hx = 0, hzF = 0, under = 0;
    for (let i = 0; i < bpos.count; i++) {
      P.fromBufferAttribute(bpos, i).applyMatrix4(body.matrixWorld);
      if (P.y < hipsY || P.y > hipsY + 0.06 || Math.abs(P.x) > 0.25) continue;
      hx = Math.max(hx, Math.abs(P.x)); hzF = Math.max(hzF, P.z);
      under = Math.max(under, cl.top[i]);
    }
    const a = 0.75; // Knoten seitlich vorn
    const onBand = (band: number) => {
      const ex = hx + band + 0.006, ez = hzF + band + 0.006;
      return { knot: new Vector3(Math.sin(a) * ex, hipsY + 0.032, Math.cos(a) * ez).applyMatrix4(toHips), buckle: new Vector3(0, hipsY + 0.032, ez).applyMatrix4(toHips) };
    };
    const wide = onBand(Math.max(0.026, under + 0.026)), eng = onBand(Math.max(0.026, Math.min(under, SHIRT_CAP) + 0.02));
    this.anchorCache = { earLobe, eyeY, shoulders: [shoulder('L'), shoulder('R')], knot: wide.knot, buckle: wide.buckle, knotEng: eng.knot, buckleEng: eng.buckle };
    return this.anchorCache;
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
  private buildGarment(kind: GarmentKind): BufferGeometry | null {
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
    const at = (n: string) => this.find(this.template, n)?.getWorldPosition(new Vector3()).y ?? 0;
    const hipsY = at('J_Bip_C_Hips'), kneeY = at('J_Bip_L_LowerLeg'), ankleY = at('J_Bip_L_Foot'), neckY = at('J_Bip_C_Neck');
    const leg = kneeY - ankleY;
    const n = pos.count;
    const off = new Float32Array(n).fill(-1);
    const P = new Vector3(), N = new Vector3();
    const cl = this.clearance();
    for (let i = 0; i < n; i++) {
      P.fromBufferAttribute(pos, i).applyMatrix4(mw);
      N.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      let bi = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } }
      const b = bones[bi]?.name ?? '';
      off[i] = garmentOffset(kind, b, P, N, { hipsY, kneeY, ankleY, neckY, leg }, cl.top[i], -1, cl.shoes[i]); // Hose der Grundfigur ist ausgeblendet (erzeugte Hose liegt eng an)
    }
    // nur Dreiecke, deren Ecken alle zum Stück gehören
    const src = geo.index;
    const remap = new Int32Array(n).fill(-1);
    const tris: number[] = [];
    const triCount = src ? src.count / 3 : n / 3;
    for (let t = 0; t < triCount; t++) {
      const a = src ? src.getX(t * 3) : t * 3, b2 = src ? src.getX(t * 3 + 1) : t * 3 + 1, c = src ? src.getX(t * 3 + 2) : t * 3 + 2;
      if (off[a] < 0 || off[b2] < 0 || off[c] < 0) continue;
      tris.push(a, b2, c);
    }
    if (!tris.length) return null;
    const used: number[] = [];
    for (const v of tris) if (remap[v] < 0) { remap[v] = used.length; used.push(v); }
    // Arbeitsdaten je Kleidungspunkt: Hautlage, Normale, Abstand (Modelleinheiten), Gewichte
    const BP: number[] = [], BN: number[] = [], OF: number[] = [], SI: number[] = [], SW: number[] = [];
    for (const v of used) {
      P.fromBufferAttribute(pos, v); N.fromBufferAttribute(nor, v).normalize();
      BP.push(P.x, P.y, P.z); BN.push(N.x, N.y, N.z); OF.push(off[v] / scale);
      for (let k = 0; k < 4; k++) { SI.push(si.getComponent(v, k)); SW.push(sw.getComponent(v, k)); }
    }
    let T = tris.map((v) => remap[v]);
    const soft = kind === 'weste' || kind === 'jacke' || kind === 'tunika' || kind === 'ringel' || kind === 'mantelKurz' || kind === 'mantelLang' || kind === 'guertel' || kind === 'guertelEng' || kind === 'schal' || kind === 'hose' || kind === 'stiefel' || kind === 'hemd';
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
export type GarmentKind = 'hose' | 'stiefel' | 'mantelKurz' | 'mantelLang' | 'guertel' | 'guertelEng'
  | 'weste' | 'jacke' | 'tunika' | 'ringel' | 'hemd' | 'handschuhe' | 'schal';

/**
 * Unter Mantel und Weste wird das weite Hemd der Grundfigur (Puffärmel, abstehender Kragen) durch ein eng anliegendes,
 * erzeugtes Hemd ersetzt. Alles darüber rechnet dann höchstens mit dieser Hemddicke – schlanke Mäntel ohne Durchstechen.
 */
export const SHIRT_CAP = 0.014;

/**
 * Abstand der Grundkleidung zur Haut je Hautpunkt (−1 = dort liegt keine). Kleidung, die darüber getragen wird,
 * muss mindestens so weit außen liegen – sonst sticht Hemd oder Hose hindurch.
 */
export interface Clearance { top: Float32Array; bottom: Float32Array; shoes: Float32Array }

/** Gemessene Ankerpunkte: Ohrläppchen und Augenhöhe im Kopfraum, Schultern im Brustraum, Schärpe im Hüftraum */
/** Aus der Frisur gemessene Kappe (Kopfraum): Netz, Sitzhöhe, Mitte und mittlerer Randradius */
export interface CapShell { geo: BufferGeometry; seatY: number; cx: number; cz: number; ringR: number }

export interface Anchors { earLobe: Vector3; eyeY: number; shoulders: [Vector3, Vector3]; knot: Vector3; buckle: Vector3; knotEng: Vector3; buckleEng: Vector3 }

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Abstand eines Hautpunkts zur Kleidung in Metern, −1 = gehört nicht dazu.
 * b: Knochen mit dem größten Gewicht, P/N: Lage und Normale in der Vorlage.
 * cTop/cBot/cShoe: Abstand der Grundkleidung (Hemd, Hose, Schuhe) an diesem Punkt, −1 = keine.
 * Schichten von innen nach außen: Hemd → Ringelhemd/Tunika → Weste/Jacke → Gürtel/Schärpe → Schal → Mantel.
 */
function garmentOffset(kind: GarmentKind, b: string, P: Vector3, N: Vector3, r: { hipsY: number; kneeY: number; ankleY: number; neckY: number; leg: number }, cTop: number, cBot: number, cShoe: number): number {
  const isPelvis = /Hips$|_Spine$/.test(b);
  const arm = /UpperArm$|LowerArm$/.test(b);
  const hand = /Hand$|Thumb|Index|Middle|Ring|Little/.test(b);
  const torso = /Hips$|Spine$|Chest$|UpperChest$|Shoulder$/.test(b);
  const under = Math.max(cTop, cBot, 0);
  switch (kind) {
    case 'hose':
      // Bund knapp über der Hüfte, Saum steckt in den Stiefeln; nur nach Höhe (das Becken hat gemischte Gewichte),
      // Hände und Arme liegen in der T-Pose ohnehin weiter oben
      // bis zum Knöchel (ohne Stiefel sonst eine zu kurze Hose), Fuß frei für die Schuhe
      if (hand || /Arm$|Foot$|Toe/.test(b) || P.y > r.hipsY + 0.07 || P.y < r.ankleY + 0.012) return -1;
      return 0.011;
    case 'ringel':
      // Ringelhemd: liegt dicht auf dem Hemd der Grundfigur, überall wo es Hemd gibt
      if (cTop < 0 || hand) return -1;
      return cTop + 0.004;
    case 'hemd':
      // eng anliegendes Hemd überall, wo die Grundfigur eines trägt (ersetzt es unter Mantel und Weste)
      if (cTop < 0 || hand) return -1;
      return Math.min(cTop * 0.6, SHIRT_CAP - 0.004) + 0.004;
    case 'tunika':
      // lange Tunika: Oberkörper und Ärmel wie das Hemd, unten bis zur Mitte des Oberschenkels
      if (hand) return -1;
      if (cTop >= 0) return Math.max(0.012, under + 0.006);
      if ((torso || /UpperLeg$/.test(b)) && P.y < r.hipsY && P.y > r.hipsY - (r.hipsY - r.kneeY) * 0.5) return Math.max(0.02, under + 0.008 + (r.hipsY - P.y) * 0.06);
      return -1;
    case 'weste': {
      // Weste über dem engen Hemd: Rumpf ohne Ärmel, vorn offen, bis über die Schultern
      if (hand || arm) return -1;
      if (cTop < 0 && !(torso && P.y > r.hipsY - 0.04 && P.y < r.neckY + 0.02)) return -1;
      if (P.y < r.hipsY - 0.04 || P.y > r.neckY + 0.02) return -1;
      // schmaler als die Mantelöffnung, damit die Weste im Ausschnitt sichtbar bleibt
      if (N.z > 0.35 && N.y < 0.45 && Math.abs(P.x) < 0.012 + Math.max(0, P.y - (r.hipsY + 0.25)) * 0.12) return -1;
      return Math.max(0.016, Math.min(Math.max(cTop, 0), SHIRT_CAP) + 0.008);
    }
    case 'jacke': {
      // Weste: Rumpf ohne Ärmel, vorn offen; Jacke: überall, wo die Grundfigur ein Hemd trägt, dazu lange Ärmel.
      // Fläche nach dem Hemd statt nach Knochen – die Brust hängt an eigenen Knochen (sonst Löcher)
      if (hand) return -1;
      if (arm) return Math.max(0.016, cTop + 0.008);
      if (cTop < 0 && !(torso && P.y > r.hipsY - 0.04 && P.y < r.neckY + 0.02)) return -1;
      return Math.max(0.018, cTop + 0.009);
    }
    case 'guertel':
    case 'guertelEng':
      // Schärpe bzw. Koppel: breites Band um die Taille, über Hemd, Hose, Weste und Tunika, unter dem Mantel
      // (Eng: über dem erzeugten engen Hemd unter Mantel/Weste)
      if (!isPelvis || P.y < r.hipsY - 0.005 || P.y > r.hipsY + 0.065) return -1;
      return kind === 'guertelEng' ? Math.max(0.026, Math.min(under, SHIRT_CAP) + 0.02) : Math.max(0.026, under + 0.026);
    case 'handschuhe':
      // Fäustlinge: Hand und Finger, knapp über das Handgelenk
      if (!hand) return -1;
      return 0.006;
    case 'schal':
      // Halstuch: Ring um den Hals auf Höhe des Kragens
      if (P.y < r.neckY - 0.06 || P.y > r.neckY + 0.025 || hand || arm) return -1;
      return Math.max(0.022, cTop + 0.012);
    case 'stiefel':
      // vom Knöchel bis knapp unter das Knie, oben eine weite Stulpe – immer über Hose und Schuhen
      if (!/LowerLeg$|Foot$|Toe/.test(b) || P.y > r.kneeY - r.leg * 0.08 || P.y < r.ankleY - 0.06) return -1;
      return Math.max(0.026 + smooth(r.kneeY - r.leg * 0.32, r.kneeY - r.leg * 0.1, P.y) * 0.022, cBot + 0.008, cShoe + 0.005);
    case 'mantelKurz':
    case 'mantelLang': {
      // eng über Hemd und Weste (2 cm), nur über der Schärpe weiter; Ärmel schlank – vorher überall 3,4–3,6 cm (klobig)
      // unter dem Mantel liegt immer das enge Hemd (höchstens SHIRT_CAP dick)
      const thin = Math.min(Math.max(cTop, 0), SHIRT_CAP);
      const over = Math.max(0.024, thin + 0.016);
      if (arm) return /UpperArm$/.test(b) ? Math.max(0.018, thin + 0.01) : Math.max(0.015, thin + 0.008);
      // bis über die Schultern (die Schulterhaut liegt auf Höhe des Halsansatzes; Hals und Kopf gehören zu eigenen Knochen)
      if (torso && P.y >= r.hipsY - 0.03 && P.y < r.neckY + 0.03) {
        // offene Front: schmales V, Schultern und nach oben zeigende Flächen bleiben bedeckt
        const open = 0.04 + smooth(r.hipsY + 0.22, r.neckY, P.y) * 0.025;
        if (N.z > 0.4 && N.y < 0.45 && Math.abs(P.x) < open) return -1;
        const band = smooth(r.hipsY - 0.03, r.hipsY - 0.005, P.y) * (1 - smooth(r.hipsY + 0.075, r.hipsY + 0.1, P.y));
        return over + band * 0.016;
      }
      // Schöße nur beim langen Mantel: seitlich und hinten bis übers Knie, nach unten etwas weiter
      if (kind === 'mantelLang' && (torso || /UpperLeg$/.test(b)) && P.y < r.hipsY && P.y > r.kneeY + 0.02) {
        if (N.z > 0.2) return -1;
        if ((P.x > 0 && N.x < -0.35) || (P.x < 0 && N.x > 0.35)) return -1;
        return Math.max(0.03 + (r.hipsY - P.y) * 0.16, over + 0.01);
      }
      return -1;
    }
  }
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

