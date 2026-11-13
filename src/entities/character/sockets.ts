// Socket-System: feste Plätze an der Figur, an denen Ausrüstung sitzt.
// Jeder Socket hat einen Knochen und eine „Halterung“: einen Knoten in einheitlichem Raum (+Z vorn, +Y oben, +X zur
// linken Körperseite, 1 Einheit = 1 m), egal welche Grundfigur und welche Körpergröße. Neue Teile werden in diesem Raum
// gebaut und müssen nichts über das Skelett wissen.
// Dazu Haut-Anker: Halterungen, die sich mit einem Punkt der Haut bzw. Kleidung bewegen (für Schärpenknoten,
// Schulterstücke) statt starr an einem Knochen zu hängen.
import { Matrix4, Object3D, Quaternion, Vector3, type Skeleton } from 'three';
import type { SocketId } from '../../data/equipment';

export type Side = 'l' | 'r';

/** Knochen je Socket; paarige Sockets haben links und rechts */
const VROID: Record<SocketId, string | [string, string]> = {
  head: 'J_Bip_C_Head', chest: 'J_Bip_C_Chest', legs: 'J_Bip_C_Hips',
  feet: ['J_Bip_L_Foot', 'J_Bip_R_Foot'], hands: ['J_Bip_L_Hand', 'J_Bip_R_Hand'],
  mainHand: 'handslotr', offHand: 'handslotl',
};
const BLOCK: Record<SocketId, string | [string, string]> = {
  head: 'head', chest: 'chest', legs: 'hips',
  feet: ['footl', 'footr'], hands: ['handl', 'handr'],
  mainHand: 'handslotr', offHand: 'handslotl',
};

const ws = new Vector3();

export class SocketRig {
  private nodes = new Map<string, Object3D>();
  private anchors: SkinAnchor[] = [];

  /**
   * rig: Wurzel der Figur. restQuat: Welt-Ausrichtung eines Knochens in der Ruhehaltung der Vorlage (daraus wird die
   * Halterung gerade gestellt – unabhängig davon, in welcher Pose die Figur gerade steht).
   */
  constructor(private rig: Object3D, private kind: 'vroid' | 'block', private restQuat: (bone: string) => Quaternion | null) {}

  private boneName(id: SocketId, side: Side) {
    const n = (this.kind === 'vroid' ? VROID : BLOCK)[id];
    return typeof n === 'string' ? n : n[side === 'l' ? 0 : 1];
  }

  /** Der Knochen des Sockets (roher Knochenraum, wie ihn die älteren Bausteine erwarten) */
  bone(id: SocketId, side: Side = 'l'): Object3D | null {
    return this.rig.getObjectByName(this.boneName(id, side)) ?? null;
  }

  /**
   * Die Halterung des Sockets im einheitlichen Raum. Für die Hände (mainHand, offHand) ist es die Waffenhalterung
   * selbst: sie ist schon so gedreht und bemessen, dass eine Klinge entlang +Y aus der Faust ragt.
   */
  node(id: SocketId, side: Side = 'l'): Object3D | null {
    const bone = this.bone(id, side);
    if (!bone) return null;
    if (id === 'mainHand' || id === 'offHand') return bone;
    const key = `${id}_${side}`;
    let n = this.nodes.get(key);
    if (!n || n.parent !== bone) {
      n = new Object3D();
      n.name = typeof (this.kind === 'vroid' ? VROID : BLOCK)[id] === 'string' ? `socket_${id}` : `socket_${id}_${side}`;
      const q = this.restQuat(bone.name);
      if (q) n.quaternion.copy(q).invert();
      bone.add(n);
      this.nodes.set(key, n);
      this.fit(n, bone);
    }
    return n;
  }

  private fit(n: Object3D, bone: Object3D) {
    bone.getWorldScale(ws);
    n.scale.setScalar(1 / Math.max(1e-4, (ws.x + ws.y + ws.z) / 3));
  }

  /** Nach einer Größenänderung der Figur: Halterungen wieder auf Meter bringen */
  normalize() {
    this.rig.updateMatrixWorld(true);
    for (const n of this.nodes.values()) if (n.parent) this.fit(n, n.parent);
  }

  /**
   * Haut-Anker anlegen: ein Knoten, der in Ruhe genau wie der Knochen „frame“ liegt, sich aber mit den Gewichten des
   * angegebenen Hautpunkts bewegt. Was im Raum dieses Knochens gebaut ist, sitzt so in jeder Pose auf dem Stoff.
   */
  skinAnchor(skeleton: Skeleton, pin: SkinPin, frame: string): SkinAnchor | null {
    const fi = skeleton.bones.findIndex((b) => b.name === frame);
    if (fi < 0) return null;
    const a = new SkinAnchor(skeleton, pin, fi);
    // als letztes Kind der Wurzel: seine Lage wird nach allen Knochen berechnet
    this.rig.add(a);
    this.anchors.push(a);
    return a;
  }

  /** Alle Haut-Anker lösen (ihre Inhalte gibt der Aufrufer frei) */
  takeAnchors(): SkinAnchor[] {
    const out = this.anchors;
    this.anchors = [];
    return out;
  }
}

/** Punkt auf Haut oder Kleidung samt den Knochen, die ihn bewegen */
export interface SkinPin { index: [number, number, number, number]; weight: [number, number, number, number] }

const mA = new Matrix4();

/**
 * Knoten, dessen Weltlage aus gewichteten Knochen entsteht (wie ein Hautpunkt im Shader). Er überschreibt die
 * Matrix-Berechnung von three.js und rechnet ohne neue Objekte.
 */
export class SkinAnchor extends Object3D {
  private rest = new Matrix4();
  private bi: number[] = [];
  private bw: number[] = [];

  constructor(private skeleton: Skeleton, pin: SkinPin, frame: number) {
    super();
    this.matrixAutoUpdate = false;
    // Ruhelage des Rahmenknochens im Bindungsraum
    this.rest.copy(skeleton.boneInverses[frame]).invert();
    let sum = 0;
    for (let k = 0; k < 4; k++) if (pin.weight[k] > 0 && skeleton.bones[pin.index[k]]) { this.bi.push(pin.index[k]); this.bw.push(pin.weight[k]); sum += pin.weight[k]; }
    if (!this.bi.length) { this.bi.push(frame); this.bw.push(1); sum = 1; }
    for (let k = 0; k < this.bw.length; k++) this.bw[k] /= sum;
  }

  private compute() {
    const te = this.matrixWorld.elements;
    for (let i = 0; i < 16; i++) te[i] = 0;
    const sk = this.skeleton;
    for (let k = 0; k < this.bi.length; k++) {
      const me = mA.multiplyMatrices(sk.bones[this.bi[k]].matrixWorld, sk.boneInverses[this.bi[k]]).elements, w = this.bw[k];
      for (let i = 0; i < 16; i++) te[i] += me[i] * w;
    }
    this.matrixWorld.multiply(this.rest);
  }

  override updateMatrixWorld(): void {
    this.compute();
    const ch = this.children;
    for (let i = 0; i < ch.length; i++) ch[i].updateMatrixWorld(true);
  }

  override updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void {
    if (updateParents) this.parent?.updateWorldMatrix(true, false);
    this.compute();
    if (updateChildren) { const ch = this.children; for (let i = 0; i < ch.length; i++) ch[i].updateWorldMatrix(false, true); }
  }
}
