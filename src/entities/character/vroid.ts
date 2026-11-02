// Anime-Figuren aus VRoid Studio (CC0) – Laden, Aufbereiten und Übertragen der Animationen.
import {
  AnimationClip,
  AnimationMixer,
  BufferGeometry,
  CanvasTexture,
  Group,
  Matrix4,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
  Vector3,
  VectorKeyframeTrack,
  type Material,
  type MeshStandardMaterial,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Unsere Knochennamen (KayKit-Skelett) → VRoid-Knochen */
export const VROID_BONES: Record<string, string> = {
  hips: 'J_Bip_C_Hips', spine: 'J_Bip_C_Spine', chest: 'J_Bip_C_Chest', head: 'J_Bip_C_Head',
  upperarml: 'J_Bip_L_UpperArm', lowerarml: 'J_Bip_L_LowerArm', wristl: 'J_Bip_L_Hand',
  upperarmr: 'J_Bip_R_UpperArm', lowerarmr: 'J_Bip_R_LowerArm', wristr: 'J_Bip_R_Hand',
  upperlegl: 'J_Bip_L_UpperLeg', lowerlegl: 'J_Bip_L_LowerLeg', footl: 'J_Bip_L_Foot', toesl: 'J_Bip_L_ToeBase',
  upperlegr: 'J_Bip_R_UpperLeg', lowerlegr: 'J_Bip_R_LowerLeg', footr: 'J_Bip_R_Foot', toesr: 'J_Bip_R_ToeBase',
};
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
  const out = new CanvasTexture(c);
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

  constructor(scene: Object3D, height: number, private srcRig: Object3D, private srcClips: Map<string, AnimationClip>, srcSlot: Vector3) {
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
    this.hipH = this.find(this.template, 'J_Bip_C_Hips')!.getWorldPosition(v1).y;
    this.computeCorrections();
    // Waffenhalterung aus der alten Figur übernehmen (gleiche Ausrichtung in der Welt)
    this.slot = { l: this.slotFor('l', srcSlot), r: this.slotFor('r', srcSlot) };
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
      const map = mat.map ?? null;
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
    const srcWrist = this.srcRig.getObjectByName(`wrist${s}`)!;
    const slotWorld = new Matrix4().multiplyMatrices(srcHand.matrixWorld, new Matrix4().setPosition(srcSlot));
    const slotPos = new Vector3(), slotQuat = new Quaternion(), slotScale = new Vector3();
    slotWorld.decompose(slotPos, slotQuat, slotScale);
    const wristPos = srcWrist.getWorldPosition(new Vector3());
    const srcHip = this.srcRig.getObjectByName('hips')!.getWorldPosition(new Vector3()).y;
    const ratio = this.hipH / Math.max(0.01, srcHip);
    const dstHand = this.find(this.template, s === 'l' ? 'J_Bip_L_Hand' : 'J_Bip_R_Hand')!;
    const handPos = dstHand.getWorldPosition(new Vector3());
    const handQuat = this.restWorld(dstHand, new Quaternion());
    const handScale = dstHand.getWorldScale(new Vector3()).x;
    const offset = slotPos.clone().sub(wristPos).multiplyScalar(ratio * 0.9);
    const inv = handQuat.clone().invert();
    void handPos; void offset;
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
      const s = rig.getObjectByName(sn), d = dst.getObjectByName(dn);
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
    const action = mixer.clipAction(src);
    action.play();
    for (let i = 0; i < n; i++) {
      const t = Math.min(src.duration, i / fps);
      times[i] = t;
      action.time = t;
      mixer.update(0);
      rig.updateMatrixWorld(true);
      for (let k = 0; k < pairs.length; k++) {
        const p = pairs[k];
        p.s.getWorldQuaternion(q1);
        q2.copy(p.sr).invert();
        q1.multiply(q2).multiply(p.dr); // Zielweltlage
        p.d.parent!.getWorldQuaternion(q3).invert();
        p.d.quaternion.copy(q3.multiply(q1));
        p.d.updateMatrixWorld(true);
        p.d.quaternion.toArray(qv[k], i * 4);
      }
      // Hüftbewegung maßstäblich übertragen
      sHips.getWorldPosition(v1).sub(sHip0).multiplyScalar(ratio).add(dHip0);
      dHips.parent!.worldToLocal(v1);
      v1.toArray(pv, i * 3);
      dHips.position.copy(v1);
      dHips.updateMatrixWorld(true);
    }
    action.stop();
    mixer.uncacheAction(src);
    resetSrc();
    const tracks = pairs.map((p, k) => new QuaternionKeyframeTrack(`${p.d.name}.quaternion`, times, qv[k]));
    tracks.push(new VectorKeyframeTrack(`${dHips.name}.position`, times, pv));
    return new AnimationClip(src.name, src.duration, tracks);
  }

  static readonly HAND_ALIAS = HAND_ALIAS;
}

function depth(o: Object3D) { let d = 0; let p = o.parent; while (p) { d++; p = p.parent; } return d; }

/** Beide Grundfiguren laden */
export async function loadVroid(srcRig: Object3D, srcClips: Map<string, AnimationClip>, srcSlot: Vector3): Promise<{ male: VroidBase; female: VroidBase } | null> {
  const base = `${import.meta.env.BASE_URL}assets/characters/vroid/`;
  const loader = new GLTFLoader();
  try {
    const [m, f] = await Promise.all([loader.loadAsync(`${base}male.glb`), loader.loadAsync(`${base}female.glb`)]);
    return { male: new VroidBase(m.scene, 1.74, srcRig, srcClips, srcSlot), female: new VroidBase(f.scene, 1.64, srcRig, srcClips, srcSlot) };
  } catch (e) {
    console.warn('Anime-Figuren konnten nicht geladen werden – nutze Ersatzfiguren', e);
    return null;
  }
}

