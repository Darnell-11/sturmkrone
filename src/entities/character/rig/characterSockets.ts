// Phase 4.6F: Standardisierte Befestigungs-Sockets am bewegten Skelett (Fundament für 4.6G: Hüte, Brillen, Augenklappen, Bärte, Umhänge, Waffen).
// Jeder Socket ist ein Knoten direkt am tragenden Knochen. Sein Raum ist für jede Grundfigur gleich: +Z vorn, +Y oben, +X zur linken
// Körperseite, 1 Einheit = 1 m der Grundfigur – er wächst mit der Figur (Größe, Statur, Endboss-Maßstab) von selbst mit, weil er am Knochen
// hängt, und folgt jeder Animation exakt. Die Lage misst `measureSockets` einmal je Grundfigur an Haut, Haar und Augen.
import { Matrix4, Object3D, Quaternion, Vector3, type SkinnedMesh } from 'three';
import { RIG_BONES, SOCKET_DEFS, SOCKET_IDS, type CharacterSocketId, type RigBone } from '../../../data/characterRig';

/** Gemessene Lage je Socket (tragender Knochen, Ort im Knochenraum der Ruhehaltung) und Maßstab je Knochen (Knocheneinheiten je Meter) */
export interface SocketMeasures {
  at: Partial<Record<CharacterSocketId, { bone: string; pos: [number, number, number] }>>;
  unit: Record<string, number>;
}

/** Knochen der Ersatzfigur (Bausteine), falls die Anime-Grundfigur fehlt */
const BLOCK_BONE: Partial<Record<RigBone, string>> = { head: 'head', neck: 'head', upperChest: 'chest', chest: 'chest', hips: 'hips' };

const v1 = new Vector3(), v2 = new Vector3();
const q1 = new Quaternion(), q2 = new Quaternion();
const m1 = new Matrix4();

/**
 * Sockets an der Vorlage messen (Ruhehaltung, Weltmaß der Vorlage = Meter). body/face: Hautnetze; hairTop: Oberkante des Haars im Kopfraum.
 */
export function measureSockets(template: Object3D, body: SkinnedMesh | null, face: SkinnedMesh[], hairTop: { y: number; cx: number; cz: number } | null): SocketMeasures {
  template.updateMatrixWorld(true);
  const find = (n: string) => template.getObjectByName(n) ?? null;
  const at: SocketMeasures['at'] = {};
  const unit: Record<string, number> = {};
  for (const id of SOCKET_IDS) {
    const def = SOCKET_DEFS[id];
    if (def.bone === 'handslotr' || def.bone === 'handslotl') continue;
    const b = find(RIG_BONES[def.bone]);
    if (b) unit[b.name] = 1 / Math.max(1e-6, b.getWorldScale(v1).x);
  }
  /** Weg in Metern (Raum der Figur: +Z vorn) → Knochenraum */
  const localOf = (b: Object3D, x: number, y: number, z: number) => {
    b.getWorldQuaternion(q1);
    template.getWorldQuaternion(q2);
    return new Vector3(x, y, z).applyQuaternion(q2).applyQuaternion(q1.invert()).multiplyScalar(1 / Math.max(1e-6, b.getWorldScale(v2).x));
  };
  const head = find(RIG_BONES.head), neck = find(RIG_BONES.neck), uc = find(RIG_BONES.upperChest) ?? find(RIG_BONES.chest), hips = find(RIG_BONES.hips);
  const eyeL = find(RIG_BONES.eyeL), eyeR = find(RIG_BONES.eyeR);
  if (head) {
    const toHead = m1.copy(head.matrixWorld).invert();
    const fwd = localOf(head, 0, 0, 1);
    const fwdN = fwd.clone().normalize();
    if (hairTop) at.headTop = { bone: head.name, pos: [hairTop.cx, hairTop.y, hairTop.cz] };
    if (eyeL && eyeR) {
      const l = eyeL.position, r = eyeR.position;
      // 4.6G: Augen- und Gesichtsoberfläche gemessen – die Augenknochen der Anime-Gesichter liegen 7 bis 8 cm hinter der Haut (vorher
      // geschätzt 4,5 cm: Brillen, Monokel und Augenklappe versanken im Gesicht)
      const surf = (e: Vector3) => {
        const e0 = e.dot(fwdN);
        let best = -Infinity;
        for (const m of face) {
          const pos = m.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            v1.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(toHead);
            if (Math.abs(v1.x - e.x) < 0.016 && Math.abs(v1.y - e.y) < 0.016) best = Math.max(best, v1.dot(fwdN) - e0);
          }
        }
        return Number.isFinite(best) && best > 0.02 ? best : 0.075;
      };
      const dl = surf(l) + 0.003, dr = surf(r) + 0.003;
      at.eyeLeft = { bone: head.name, pos: [l.x + fwdN.x * dl, l.y + fwdN.y * dl, l.z + fwdN.z * dl] };
      at.eyeRight = { bone: head.name, pos: [r.x + fwdN.x * dr, r.y + fwdN.y * dr, r.z + fwdN.z * dr] };
      const d2 = Math.max(dl, dr) + 0.012;
      at.faceFront = { bone: head.name, pos: [(l.x + r.x) / 2 + fwdN.x * d2, (l.y + r.y) / 2 + fwdN.y * d2, (l.z + r.z) / 2 + fwdN.z * d2] };
    }
    // Kinn: tiefster Hautpunkt des Gesichts in der Mitte vorn
    let chin: Vector3 | null = null;
    for (const m of face) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v1.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(toHead);
        if (Math.abs(v1.x) > 0.012 || v1.dot(fwdN) < 0.02) continue;
        if (!chin || v1.y < chin.y) chin = v1.clone();
      }
    }
    if (chin) at.beardJaw = { bone: head.name, pos: [chin.x, chin.y + 0.012, chin.z] };
  }
  if (neck) {
    const f = localOf(neck, 0, 0.02, 0.045);
    at.neckScarf = { bone: neck.name, pos: [f.x, f.y, f.z] };
  }
  if (uc && body) {
    // Rücken: hinterster Hautpunkt auf Höhe des oberen Brustkorbs; Schultern: Mitte über den Schulterkuppen
    const toUc = new Matrix4().copy(uc.matrixWorld).invert();
    const ucw = uc.getWorldPosition(new Vector3());
    const pos = body.geometry.attributes.position;
    let backZ = Infinity, topY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      v1.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
      if (Math.abs(v1.x - ucw.x) < 0.03 && Math.abs(v1.y - ucw.y) < 0.03) backZ = Math.min(backZ, v1.z);
      if (Math.abs(Math.abs(v1.x - ucw.x) - 0.13) < 0.02 && Math.abs(v1.z - ucw.z) < 0.04) topY = Math.max(topY, v1.y);
    }
    if (Number.isFinite(backZ)) { v1.set(ucw.x, ucw.y, backZ - 0.03).applyMatrix4(toUc); at.backWeapon = { bone: uc.name, pos: [v1.x, v1.y, v1.z] }; }
    if (Number.isFinite(topY)) { v1.set(ucw.x, topY + 0.02, ucw.z - 0.015).applyMatrix4(toUc); at.shouldersCoat = { bone: uc.name, pos: [v1.x, v1.y, v1.z] }; }
  }
  if (hips && body) {
    // Hüften: seitlichster Hautpunkt auf Gürtelhöhe, dazu Platz für Gürtel und Mantel
    const hw = hips.getWorldPosition(new Vector3());
    const toHips = new Matrix4().copy(hips.matrixWorld).invert();
    const pos = body.geometry.attributes.position;
    let maxX = 0;
    for (let i = 0; i < pos.count; i++) {
      v1.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
      if (Math.abs(v1.y - (hw.y + 0.04)) < 0.025 && Math.abs(v1.z - hw.z) < 0.05) maxX = Math.max(maxX, Math.abs(v1.x - hw.x));
    }
    const x = (maxX || 0.15) + 0.035;
    v1.set(hw.x + x, hw.y + 0.04, hw.z).applyMatrix4(toHips); at.hipLeft = { bone: hips.name, pos: [v1.x, v1.y, v1.z] };
    v1.set(hw.x - x, hw.y + 0.04, hw.z).applyMatrix4(toHips); at.hipRight = { bone: hips.name, pos: [v1.x, v1.y, v1.z] };
  }
  return { at, unit };
}

/** Die zwölf Sockets einer Figur */
export class CharacterSockets {
  private readonly nodes = new Map<CharacterSocketId, Object3D>();
  /** Ruhe-Drehung des Knochens relativ zur Figur und Maßstab (Knocheneinheiten je Meter) */
  private readonly rest = new Map<string, { q: Quaternion; unit: number }>();

  /**
   * holder: Wurzel der Figur in der Welt, root: Skelett-Wurzel in Ruhehaltung, measures: gemessene Lage (Anime-Grundfigur) oder null
   * (Bausteinfigur: Datenwerte aus SOCKET_DEFS, Maßstab aus der aktuellen Größe).
   */
  constructor(holder: Object3D, private root: Object3D, private measures: SocketMeasures | null) {
    // Ruhe-Drehungen jetzt festhalten (die Figur steht beim Anlegen in Ruhehaltung)
    root.updateWorldMatrix(true, true);
    holder.getWorldQuaternion(q2).invert();
    const hs = holder.getWorldScale(v2).x;
    for (const id of SOCKET_IDS) {
      const b = this.boneOf(id);
      if (!b || this.rest.has(b.name)) continue;
      const unit = measures?.unit[b.name] ?? hs / Math.max(1e-6, b.getWorldScale(v1).x);
      this.rest.set(b.name, { q: b.getWorldQuaternion(new Quaternion()).premultiply(q2), unit });
    }
  }

  private boneOf(id: CharacterSocketId): Object3D | null {
    const def = SOCKET_DEFS[id];
    if (def.bone === 'handslotr' || def.bone === 'handslotl') return this.root.getObjectByName(def.bone) ?? null;
    const m = this.measures?.at[id];
    if (m) return this.root.getObjectByName(m.bone) ?? null;
    return this.root.getObjectByName(RIG_BONES[def.bone]) ?? this.root.getObjectByName(BLOCK_BONE[def.bone] ?? '') ?? null;
  }

  /** Socket-Knoten (wird beim ersten Abruf angelegt); null, wenn der Knochen fehlt */
  get(id: CharacterSocketId): Object3D | null {
    const bone = this.boneOf(id);
    if (!bone) return null;
    // Waffenhände: die Waffenhalterung selbst (Klinge entlang +Y aus der Faust)
    if (SOCKET_DEFS[id].bone === 'handslotr' || SOCKET_DEFS[id].bone === 'handslotl') return bone;
    const have = this.nodes.get(id);
    if (have && have.parent === bone) return have;
    const r = this.rest.get(bone.name);
    const n = new Object3D();
    n.name = `socket4_${id}`;
    if (r) n.quaternion.copy(r.q).invert();
    const m = this.measures?.at[id];
    if (m) n.position.set(m.pos[0], m.pos[1], m.pos[2]);
    else {
      // Datenwert (Meter im Raum der Figur) → Knochenraum
      const a = SOCKET_DEFS[id].at;
      v1.set(a[0], a[1], a[2]);
      if (r) v1.applyQuaternion(q1.copy(r.q).invert()).multiplyScalar(r.unit);
      n.position.copy(v1);
    }
    // 1 Einheit = 1 m der Grundfigur; Größe, Statur und Maßstab der Figur wirken über den Knochen mit
    n.scale.setScalar(r?.unit ?? 1);
    bone.add(n);
    this.nodes.set(id, n);
    return n;
  }

  /** Teil anhängen (mehrere Teile je Socket sind erlaubt) */
  attach(id: CharacterSocketId, obj: Object3D): boolean {
    const n = this.get(id);
    if (!n) return false;
    n.add(obj);
    return true;
  }

  /** Weltmatrix eines Sockets (aktualisiert die Kette darüber) */
  worldMatrix(id: CharacterSocketId, out: Matrix4): Matrix4 | null {
    const n = this.get(id);
    if (!n) return null;
    n.updateWorldMatrix(true, false);
    return out.copy(n.matrixWorld);
  }

  /** Alle angelegten Knoten abnehmen (Inhalte gibt der Aufrufer frei) */
  clear() {
    for (const n of this.nodes.values()) n.removeFromParent();
    this.nodes.clear();
  }
}
