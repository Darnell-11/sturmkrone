import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type ColorRepresentation,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CharacterLook } from '../../data/characterParts';

/**
 * Baut eine Figur aus Grundformen, im Bindungsraum des KayKit-Skeletts "Rig_Medium"
 * (T-Pose, Blick nach +Z, Füße bei y = 0, Kopfknochen bei y = 1,24).
 * Jeder Teil hängt starr an einem Knochen – so spielen alle 132 Animationen auf jedem Look.
 */

export type BoneName =
  | 'hips' | 'spine' | 'chest' | 'head'
  | 'upperarml' | 'lowerarml' | 'handl' | 'upperarmr' | 'lowerarmr' | 'handr'
  | 'upperlegl' | 'lowerlegl' | 'footl' | 'upperlegr' | 'lowerlegr' | 'footr';

const tmpQ = new Quaternion();
const tmpE = new Euler();
const tmpC = new Color();

/** Farbe abdunkeln (k < 1) oder aufhellen (k > 1) */
function shade(hex: string, k: number): string {
  return '#' + new Color(hex).multiplyScalar(k).getHexString();
}

function mat(pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  tmpE.set(rot[0], rot[1], rot[2], 'XYZ');
  tmpQ.setFromEuler(tmpE);
  return new Matrix4().compose(new Vector3(...pos), tmpQ.clone(), new Vector3(...scale));
}

class PartList {
  readonly parts: BufferGeometry[] = [];
  constructor(private bones: Record<string, number>) {}

  add(geo: BufferGeometry, bone: BoneName, color: ColorRepresentation, m?: Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    if (m) g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    tmpC.set(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b; }
    const bi = this.bones[bone] ?? 0;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('color', new BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new BufferAttribute(sw, 4));
    this.parts.push(g);
    return g;
  }

  build(): BufferGeometry | null {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    g.computeBoundingSphere();
    return g;
  }
}

// ---------- Maße ----------
const HEAD_C = new Vector3(0, 1.62, 0.02);
/** Anime-Proportionen: Knochen werden verlängert (Skelett-Einheiten), die Glieder hier entsprechend länger gebaut */
export const LIMB_EXT = { thigh: 0.2, shin: 0.2, upperArm: 0.08, foreArm: 0.08 };
const ARM_T = 0.95;
const LEG_T = 0.92;
const HEAD_R = new Vector3(0.34, 0.37, 0.33);
const ARM_Y = 1.107;

/** Punkt auf der Kopfoberfläche (für Gesichtsdetails) */
function headSurface(x: number, y: number, inset = 0): { p: Vector3; yaw: number; pitch: number } {
  const dx = x / HEAD_R.x;
  const dy = (y - HEAD_C.y) / HEAD_R.y;
  const dz = Math.sqrt(Math.max(0.02, 1 - dx * dx - dy * dy));
  const p = new Vector3(x, y, HEAD_C.z + HEAD_R.z * dz - inset);
  const n = new Vector3(dx / HEAD_R.x, dy / HEAD_R.y, dz / HEAD_R.z).normalize();
  return { p, yaw: Math.atan2(n.x, n.z), pitch: -Math.asin(n.y) };
}

function headGeometry(face: CharacterLook['face']): BufferGeometry {
  const g = new SphereGeometry(1, 28, 20);
  const p = g.attributes.position;
  const taper = face === 'schmal' ? 0.3 : face === 'kantig' ? 0.12 : 0.18;
  const rx = face === 'schmal' ? 0.32 : face === 'kantig' ? 0.35 : HEAD_R.x;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (face === 'kantig') { x = Math.sign(x) * Math.pow(Math.abs(x), 0.8); }
    // Kinn: unten schmaler und leicht nach vorn
    const low = Math.max(0, -y);
    x *= 1 - taper * low * low;
    z = z * (1 - taper * 0.4 * low) + (z > 0 ? low * 0.08 : 0);
    p.setXYZ(i, x * rx, y * HEAD_R.y, z * HEAD_R.z);
  }
  g.computeVertexNormals();
  g.translate(HEAD_C.x, HEAD_C.y, HEAD_C.z);
  return g;
}

function limb(r0: number, r1: number, len: number, seg = 10) {
  return new CylinderGeometry(r1, r0, len, seg, 1);
}

/** Zylinder entlang X (für Arme in T-Pose). from/to = x-Werte */
function armPiece(x0: number, x1: number, r0: number, r1: number, side: number) {
  const len = Math.abs(x1 - x0);
  const g = limb(r0, r1, len);
  // Zylinder zeigt entlang Y; r0 unten, r1 oben → auf X drehen, Richtung nach außen
  g.applyMatrix4(mat([side * (Math.min(Math.abs(x0), Math.abs(x1)) + len / 2), ARM_Y, 0], [0, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2]));
  return g;
}

function legPiece(x: number, y0: number, y1: number, r0: number, r1: number, z = 0) {
  const g = limb(r0, r1, y0 - y1);
  g.translate(x, (y0 + y1) / 2, z);
  return g;
}

export interface BuiltCharacter {
  /** Hauptkörper mit Kontur */
  main: BufferGeometry;
  /** Gesichtsdetails (Augen, Mund, Brauen) ohne Kontur */
  detail: BufferGeometry | null;
}

export function buildCharacterGeometry(look: CharacterLook, bones: Record<string, number>): BuiltCharacter {
  const M = new PartList(bones);
  const D = new PartList(bones);
  const bw = look.body === 'schmal' ? 0.88 : look.body === 'kraeftig' ? 1.2 : 1;
  const skin = look.skin;
  const out = look.outfitColor;
  const acc = look.accentColor;
  const pants = look.pantsColor;
  const shoes = look.shoesColor;
  const gold = '#E3B04B';
  const dark = '#1E1A18';

  // ---------- Kopf ----------
  M.add(headGeometry(look.face), 'head', skin);
  M.add(limb(0.085 * bw, 0.08 * bw, 0.16), 'head', skin, mat([0, 1.27, 0]));
  for (const s of [-1, 1]) M.add(new SphereGeometry(0.065, 10, 8), 'head', skin, mat([s * (HEAD_R.x - 0.01), 1.58, -0.01], [0, 0, 0], [0.6, 1, 0.8]));
  // Nase
  M.add(new SphereGeometry(0.028, 8, 6), 'head', shade(skin, 0.9), mat([0, 1.53, HEAD_C.z + HEAD_R.z - 0.01]));

  // Augen (große Anime-Augen, Schichten mit Abstand)
  const eyeW = look.eyes === 'scharf' ? 0.085 : look.eyes === 'sanft' ? 0.075 : 0.08;
  const eyeH = look.eyes === 'gross' ? 0.115 : look.eyes === 'scharf' ? 0.075 : look.eyes === 'muede' ? 0.06 : 0.1;
  const eyeY = 1.585;
  for (const s of [-1, 1]) {
    if (look.eyepatch && s === 1) {
      const e = headSurface(0.13, eyeY);
      D.add(new CircleGeometry(0.1, 18), 'head', dark, mat([e.p.x, e.p.y, e.p.z + 0.006], [e.pitch, e.yaw, 0], [1, 0.9, 1]));
      continue;
    }
    const e = headSurface(s * 0.13, eyeY);
    const layer = (r: number, h: number, color: string, off: number, dx = 0, dy = 0) => {
      const m = mat([0, 0, 0], [0, 0, 0], [r, h, 1]);
      const place = mat([e.p.x, e.p.y, e.p.z], [e.pitch, e.yaw, 0]).multiply(mat([dx, dy, off])).multiply(m);
      D.add(new CircleGeometry(1, 20), 'head', color, place);
    };
    layer(eyeW, eyeH, '#FFFFFF', 0.004);
    layer(eyeW * 0.78, eyeH * 0.82, look.eyeColor, 0.007, 0, -eyeH * 0.08);
    layer(eyeW * 0.5, eyeH * 0.52, shade(look.eyeColor, 0.45), 0.009, 0, -eyeH * 0.05);
    layer(eyeW * 0.3, eyeH * 0.32, '#100C0A', 0.011, 0, -eyeH * 0.04);
    layer(eyeW * 0.24, eyeW * 0.24, '#FFFFFF', 0.013, -s * eyeW * 0.3, eyeH * 0.32);
    layer(eyeW * 0.12, eyeW * 0.12, '#FFFFFF', 0.013, s * eyeW * 0.25, -eyeH * 0.35);
    // Wimpernlinie oben
    const lash = mat([e.p.x, e.p.y, e.p.z], [e.pitch, e.yaw, 0]).multiply(mat([0, eyeH * 0.92, 0.012], [0, 0, s * (look.eyes === 'scharf' ? 0.25 : 0.12)]));
    D.add(new BoxGeometry(eyeW * 2.3, 0.022, 0.01), 'head', dark, lash);
    // Brauen
    const browTilt = look.brows === 'schraeg' ? 0.32 : look.brows === 'hoch' ? -0.2 : 0.05;
    const bh = look.brows === 'dick' ? 0.03 : 0.016;
    const b = headSurface(s * 0.13, 1.72);
    D.add(new BoxGeometry(0.14, bh, 0.012), 'head', look.hairColor === '#F0E6C8' ? '#8A7A5A' : look.hairColor,
      mat([b.p.x, b.p.y, b.p.z + 0.006], [b.pitch, b.yaw, s * browTilt]));
  }
  // Mund
  const mo = headSurface(0, 1.43);
  const mouthBase = mat([mo.p.x, mo.p.y, mo.p.z + 0.004], [mo.pitch, mo.yaw, 0]);
  if (look.mouth === 'laecheln' || look.mouth === 'grinsen') {
    const w = look.mouth === 'grinsen' ? 0.07 : 0.05;
    D.add(new TorusGeometry(w, 0.009, 4, 14, Math.PI), 'head', '#5A2A22', mouthBase.clone().multiply(mat([0, w * 0.6, 0], [0, 0, Math.PI])));
    if (look.mouth === 'grinsen') D.add(new CircleGeometry(w * 0.9, 14, Math.PI, Math.PI), 'head', '#FFFFFF', mouthBase.clone().multiply(mat([0, w * 0.55, -0.001], [0, 0, 0], [1, 0.55, 1])));
  } else if (look.mouth === 'offen') {
    D.add(new CircleGeometry(0.03, 14), 'head', '#5A2A22', mouthBase.clone().multiply(mat([0, 0, 0], [0, 0, 0], [1, 1.25, 1])));
  } else {
    D.add(new BoxGeometry(0.07, 0.012, 0.008), 'head', '#5A2A22', mouthBase);
  }
  if (look.scar) {
    const sc = headSurface(-0.13, 1.56);
    D.add(new BoxGeometry(0.014, 0.2, 0.008), 'head', '#B8645A', mat([sc.p.x, sc.p.y, sc.p.z + 0.016], [sc.pitch, sc.yaw, 0.35]));
  }
  if (look.earring) M.add(new TorusGeometry(0.03, 0.009, 6, 12), 'head', gold, mat([-(HEAD_R.x + 0.005), 1.5, -0.01], [0, Math.PI / 2, 0]));
  if (look.eyepatch) M.add(new TorusGeometry(HEAD_R.x + 0.01, 0.012, 4, 30), 'head', dark, mat([0, 1.66, 0.01], [0.35, 0, -0.42], [1, 1.05, 1.02]));

  buildHair(M, look);
  buildBeard(M, look);
  buildHat(M, look);

  // ---------- Rumpf ----------
  const top = look.outfit === 'uniform' ? out : look.outfit === 'weste' ? acc : out;
  M.add(new RoundedBoxGeometry(0.56 * bw, 0.32, 0.36 * (0.9 + bw * 0.1), 3, 0.1), 'chest', top, mat([0, 1.1, 0.01]));
  M.add(new RoundedBoxGeometry(0.5 * bw, 0.4, 0.32 * (0.9 + bw * 0.1), 3, 0.1), 'spine', top, mat([0, 0.8, 0]));
  M.add(new RoundedBoxGeometry(0.5 * bw, 0.24, 0.33, 3, 0.09), 'hips', pants, mat([0, 0.52, 0]));
  // Schultern
  for (const s of [-1, 1]) M.add(new SphereGeometry(0.1 * bw, 12, 10), 'chest', look.outfit === 'tunika' ? skin : top, mat([s * 0.24 * bw, ARM_Y, 0]));

  if (look.outfit === 'matrose') {
    for (let i = 0; i < 5; i++) {
      const y = 0.66 + i * 0.12;
      const bone: BoneName = y > 0.98 ? 'chest' : 'spine';
      M.add(new CylinderGeometry(0.262 * bw, 0.262 * bw, 0.045, 14, 1, true), bone, acc, mat([0, y, 0], [0, 0, 0], [1, 1, 0.68]));
    }
  }
  if (look.outfit === 'weste') {
    for (const s of [-1, 1]) {
      M.add(new RoundedBoxGeometry(0.2 * bw, 0.62, 0.05, 2, 0.02), 'spine', out, mat([s * 0.15 * bw, 0.92, 0.165 * (0.9 + bw * 0.1)]));
    }
    M.add(new RoundedBoxGeometry(0.54 * bw, 0.62, 0.05, 2, 0.02), 'spine', out, mat([0, 0.92, -0.165]));
  }
  if (look.outfit === 'jacke' || look.outfit === 'uniform') {
    for (let i = 0; i < 3; i++) M.add(new SphereGeometry(0.022, 8, 6), i === 0 ? 'chest' : 'spine', gold, mat([0, 1.06 - i * 0.14, 0.185 * (0.9 + bw * 0.1)]));
    if (look.outfit === 'uniform') {
      M.add(new RoundedBoxGeometry(0.2, 0.12, 0.04, 2, 0.02), 'chest', acc, mat([0, 1.22, 0.16]));
      for (const s of [-1, 1]) M.add(new RoundedBoxGeometry(0.16, 0.04, 0.16, 2, 0.015), 'chest', gold, mat([s * 0.25 * bw, ARM_Y + 0.09, 0]));
    }
  }
  if (look.outfit === 'tunika') {
    M.add(new TorusGeometry(0.25 * bw, 0.035, 6, 20), 'spine', acc, mat([0, 0.68, 0], [Math.PI / 2, 0, 0], [1, 0.68, 1]));
  }
  // Gürtel
  if (look.outfit !== 'tunika') {
    M.add(new TorusGeometry(0.255 * bw, 0.03, 6, 22), 'hips', '#3A2618', mat([0, 0.63, 0], [Math.PI / 2, 0, 0], [1, 0.68, 1]));
    M.add(new RoundedBoxGeometry(0.09, 0.07, 0.03, 2, 0.01), 'hips', gold, mat([0, 0.63, 0.175]));
  }
  if (look.scarf) {
    M.add(new TorusGeometry(0.12, 0.045, 8, 18), 'chest', acc, mat([0, 1.24, 0.02], [Math.PI / 2, 0, 0]));
    M.add(new ConeGeometry(0.05, 0.22, 6), 'chest', acc, mat([0.06, 1.12, 0.17], [0.2, 0, 0.3]));
  }

  // ---------- Arme ----------
  const longSleeve = look.outfit === 'jacke' || look.outfit === 'uniform' || look.coat !== 'keiner';
  const sleeve = look.coat !== 'keiner' ? look.coatColor : look.outfit === 'weste' ? acc : out;
  for (const s of [-1, 1]) {
    const L = s > 0 ? 'l' : 'r';
    const upper = (look.outfit === 'tunika' && look.coat === 'keiner') ? skin : sleeve;
    M.add(armPiece(0.2, 0.46 + LIMB_EXT.upperArm, 0.085 * bw * ARM_T, 0.075 * bw * ARM_T, s), `upperarm${L}` as BoneName, upper);
    M.add(new SphereGeometry(0.075 * bw * ARM_T, 10, 8), `upperarm${L}` as BoneName, upper, mat([s * (0.454 + LIMB_EXT.upperArm), ARM_Y, 0]));
    M.add(armPiece(0.454, 0.72 + LIMB_EXT.foreArm, 0.072 * bw * ARM_T, 0.062 * bw * ARM_T, s), `lowerarm${L}` as BoneName, longSleeve ? sleeve : skin);
    if (longSleeve) M.add(armPiece(0.66 + LIMB_EXT.foreArm, 0.72 + LIMB_EXT.foreArm, 0.078 * bw * ARM_T, 0.08 * bw * ARM_T, s), `lowerarm${L}` as BoneName, look.coat === 'kapitaen' ? gold : acc);
    // Hand (Faust) und Daumen
    const handCol = look.gloves ? '#5A3A22' : skin;
    const hs = look.gloves ? 1.25 : 1;
    M.add(new RoundedBoxGeometry(0.15 * hs, 0.11 * hs, 0.13 * hs, 2, 0.04), `hand${L}` as BoneName, handCol, mat([s * 0.8, ARM_Y - 0.005, 0.01]));
    M.add(new RoundedBoxGeometry(0.06, 0.05, 0.05, 2, 0.02), `hand${L}` as BoneName, handCol, mat([s * 0.76, ARM_Y + 0.01, 0.075 * hs]));
  }

  // ---------- Beine ----------
  for (const s of [-1, 1]) {
    const L = s > 0 ? 'l' : 'r';
    const x = s * 0.171 * (0.94 + bw * 0.06);
    M.add(legPiece(x, 0.56, 0.29 - LIMB_EXT.thigh, 0.1 * bw * LEG_T, 0.085 * bw * LEG_T), `upperleg${L}` as BoneName, pants);
    M.add(new SphereGeometry(0.085 * bw * LEG_T, 10, 8), `upperleg${L}` as BoneName, pants, mat([x, 0.292 - LIMB_EXT.thigh, 0.005]));
    const bootUp = look.shoes === 'stiefel';
    M.add(legPiece(x, 0.3, 0.1 - LIMB_EXT.shin, 0.08 * bw * LEG_T, 0.07 * bw * LEG_T, 0.01), `lowerleg${L}` as BoneName, bootUp ? shoes : look.shoes === 'sandalen' ? skin : pants);
    if (bootUp) M.add(new CylinderGeometry(0.098 * bw * LEG_T, 0.09 * bw * LEG_T, 0.07, 12), `lowerleg${L}` as BoneName, shade(shoes, 0.75), mat([x, 0.27, 0.01]));
    const footCol = look.shoes === 'sandalen' ? skin : shoes;
    M.add(new RoundedBoxGeometry(0.15, 0.1, 0.27, 2, 0.04), `foot${L}` as BoneName, footCol, mat([x, 0.05, 0.06]));
    if (look.shoes === 'sandalen') M.add(new BoxGeometry(0.16, 0.03, 0.06), `foot${L}` as BoneName, '#8A5A2B', mat([x, 0.07, 0.08]));
  }

  // ---------- Mantel ----------
  if (look.coat !== 'keiner') {
    const cc = look.coatColor;
    M.add(new RoundedBoxGeometry(0.6 * bw, 0.34, 0.4, 3, 0.1), 'chest', cc, mat([0, 1.1, -0.005]));
    for (const s of [-1, 1]) M.add(new RoundedBoxGeometry(0.15 * bw, 0.44, 0.36, 2, 0.05), 'spine', cc, mat([s * 0.2 * bw, 0.82, -0.01]));
    M.add(new RoundedBoxGeometry(0.42 * bw, 0.44, 0.06, 2, 0.03), 'spine', cc, mat([0, 0.82, -0.17]));
    if (look.coat === 'lang' || look.coat === 'kapitaen') {
      for (const s of [-1, 1]) {
        const L = s > 0 ? 'l' : 'r';
        M.add(new BoxGeometry(0.22, 0.42, 0.05), `upperleg${L}` as BoneName, cc, mat([s * 0.19, 0.38, -0.15], [-0.12, 0, s * 0.08]));
        M.add(new BoxGeometry(0.06, 0.4, 0.2), `upperleg${L}` as BoneName, cc, mat([s * 0.3, 0.38, -0.03], [0, 0, s * 0.12]));
      }
    }
    if (look.coat === 'kapitaen') {
      for (const s of [-1, 1]) {
        M.add(new RoundedBoxGeometry(0.17, 0.05, 0.17, 2, 0.02), 'chest', gold, mat([s * 0.26 * bw, ARM_Y + 0.1, 0]));
        M.add(new BoxGeometry(0.03, 0.44, 0.02), 'spine', gold, mat([s * 0.13 * bw, 0.82, 0.19]));
      }
    }
  }

  return { main: M.build()!, detail: D.build() };
}

// ---------- Haare ----------
function buildHair(M: PartList, look: CharacterLook) {
  const h = look.hair;
  if (h === 'glatze') return;
  const c = look.hairColor;
  const C = HEAD_C;
  const R = HEAD_R;
  // Haarkappe, nach hinten tiefer
  const cap = new SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56);
  M.add(cap, 'head', c, mat([C.x, C.y + 0.02, C.z - 0.01], [-0.42, 0, 0], [R.x + 0.03, R.y + 0.03, R.z + 0.035]));
  const tuft = (pos: [number, number, number], rot: [number, number, number], r: number, len: number) =>
    M.add(new ConeGeometry(r, len, 6), 'head', c, mat(pos, rot));

  // Pony (bei fast allen Frisuren)
  if (h !== 'dutt' && h !== 'zopf') {
    const n = h === 'seitenscheitel' ? 4 : 5;
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * 2 - 1;
      const side = h === 'seitenscheitel' ? 0.12 : 0;
      tuft([t * 0.22 + side, 1.82 - Math.abs(t) * 0.05, 0.28 - Math.abs(t) * 0.06], [2.5 - Math.abs(t) * 0.2, t * 0.4, t * 0.3 + side], 0.07, h === 'seitenscheitel' && i === 0 ? 0.32 : 0.24);
    }
  }
  switch (h) {
    case 'stachel':
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        tuft([Math.sin(a) * 0.2, 1.9 + Math.cos(a * 2) * 0.03, Math.cos(a) * 0.15 - 0.06], [-0.9 * Math.cos(a) - 0.3, 0, 0.9 * Math.sin(a)], 0.09, 0.42);
      }
      tuft([0, 2.0, -0.05], [-0.3, 0, 0], 0.1, 0.38);
      break;
    case 'igel':
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const r = 0.12 + (i % 2) * 0.1;
        tuft([Math.sin(a) * r, 1.95 - r * 0.3, Math.cos(a) * r - 0.04], [-0.5 * Math.cos(a), 0, 0.5 * Math.sin(a)], 0.06, 0.26);
      }
      break;
    case 'wuschel':
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const y = 1.8 + (i % 3) * 0.06;
        M.add(new SphereGeometry(0.11, 8, 6), 'head', c, mat([Math.sin(a) * 0.3, y, Math.cos(a) * 0.27 - 0.03]));
      }
      M.add(new SphereGeometry(0.16, 10, 8), 'head', c, mat([0, 1.98, -0.04]));
      break;
    case 'lang':
      M.add(new CylinderGeometry(R.x + 0.04, R.x + 0.1, 0.62, 18, 1, true, Math.PI * 0.6, Math.PI * 0.8), 'head', c, mat([0, 1.36, -0.03], [0, 0, 0], [1, 1, 0.85]));
      for (const s of [-1, 1]) tuft([s * 0.3, 1.38, 0.1], [Math.PI, 0, -s * 0.08], 0.08, 0.5);
      break;
    case 'pferdeschwanz':
      M.add(new SphereGeometry(0.09, 10, 8), 'head', look.accentColor, mat([0, 1.85, -0.34]));
      tuft([0, 1.58, -0.43], [Math.PI - 0.35, 0, 0], 0.13, 0.62);
      break;
    case 'zoepfe':
      for (const s of [-1, 1]) {
        M.add(new SphereGeometry(0.08, 10, 8), 'head', look.accentColor, mat([s * 0.33, 1.8, -0.12]));
        tuft([s * 0.45, 1.56, -0.14], [Math.PI, 0, s * 0.45], 0.11, 0.55);
      }
      break;
    case 'zopf':
      for (let i = 0; i < 6; i++) M.add(new SphereGeometry(0.085 - i * 0.006, 8, 6), 'head', c, mat([0, 1.55 - i * 0.1, -0.36 - i * 0.015]));
      M.add(new SphereGeometry(0.05, 8, 6), 'head', look.accentColor, mat([0, 0.96, -0.45]));
      for (let i = 0; i < 4; i++) tuft([(i - 1.5) * 0.12, 1.85, 0.25], [2.6, (i - 1.5) * 0.3, 0], 0.07, 0.2);
      break;
    case 'dutt':
      M.add(new SphereGeometry(0.16, 12, 10), 'head', c, mat([0, 2.0, -0.18]));
      M.add(new TorusGeometry(0.1, 0.025, 6, 14), 'head', look.accentColor, mat([0, 1.9, -0.16], [Math.PI / 2 - 0.5, 0, 0]));
      break;
    default:
      break;
  }
}

function buildBeard(M: PartList, look: CharacterLook) {
  const c = look.hairColor;
  switch (look.beard) {
    case 'kinnbart': M.add(new ConeGeometry(0.07, 0.16, 8), 'head', c, mat([0, 1.3, 0.25], [Math.PI + 0.3, 0, 0])); break;
    case 'schnurrbart':
      for (const s of [-1, 1]) M.add(new CylinderGeometry(0.02, 0.012, 0.14, 6), 'head', c, mat([s * 0.06, 1.48, HEAD_C.z + HEAD_R.z - 0.005], [0, 0, s * (Math.PI / 2 + 0.35)]));
      break;
    case 'vollbart': {
      const g = new SphereGeometry(1, 18, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
      M.add(g, 'head', c, mat([0, 1.5, 0.04], [0.15, 0, 0], [HEAD_R.x + 0.025, 0.28, HEAD_R.z + 0.03]));
      break;
    }
    case 'koteletten':
      for (const s of [-1, 1]) M.add(new BoxGeometry(0.05, 0.18, 0.1), 'head', c, mat([s * 0.33, 1.52, 0.08], [0, 0, s * 0.1]));
      break;
    default: break;
  }
}

function buildHat(M: PartList, look: CharacterLook) {
  const c = look.hatColor;
  const gold = '#E3B04B';
  const top = 1.98;
  switch (look.hat) {
    case 'dreispitz': {
      M.add(new CylinderGeometry(0.29, 0.33, 0.2, 18), 'head', c, mat([0, top, -0.02]));
      const brim = new CylinderGeometry(0.58, 0.58, 0.05, 3);
      M.add(brim, 'head', c, mat([0, top - 0.08, -0.02], [0, Math.PI / 6 + Math.PI, 0]));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        M.add(new BoxGeometry(0.55, 0.13, 0.04), 'head', c, mat([Math.sin(a + Math.PI) * 0.25, top - 0.02, Math.cos(a + Math.PI) * 0.25 - 0.02], [0.5, a + Math.PI, 0]));
      }
      M.add(new TorusGeometry(0.31, 0.012, 4, 24), 'head', gold, mat([0, top - 0.07, -0.02], [Math.PI / 2, 0, 0]));
      break;
    }
    case 'zweispitz': {
      const g = new CylinderGeometry(0.5, 0.5, 0.14, 24, 1, false, 0, Math.PI);
      M.add(g, 'head', c, mat([0, top - 0.05, -0.02], [0, Math.PI / 2, Math.PI / 2], [1, 1, 0.8]));
      M.add(new TorusGeometry(0.5, 0.014, 4, 24, Math.PI), 'head', gold, mat([0, top - 0.05, -0.02], [0, 0, 0], [1, 0.8, 1]));
      M.add(new SphereGeometry(0.05, 8, 6), 'head', gold, mat([0, top + 0.12, 0.06]));
      M.add(new ConeGeometry(0.05, 0.4, 6), 'head', '#FFFFFF', mat([0.1, top + 0.22, -0.02], [0, 0, -0.5]));
      break;
    }
    case 'bandana': {
      const g = new SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
      M.add(g, 'head', c, mat([HEAD_C.x, HEAD_C.y + 0.04, HEAD_C.z - 0.02], [-0.3, 0, 0], [HEAD_R.x + 0.05, HEAD_R.y + 0.03, HEAD_R.z + 0.05]));
      for (const s of [-1, 1]) M.add(new ConeGeometry(0.06, 0.24, 5), 'head', c, mat([s * 0.06, 1.6, -0.42], [-2.4, 0, s * 0.4]));
      M.add(new SphereGeometry(0.06, 8, 6), 'head', c, mat([0, 1.68, -0.36]));
      break;
    }
    case 'muetze': {
      const g = new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      M.add(g, 'head', c, mat([0, 1.72, -0.01], [-0.15, 0, 0], [0.4, 0.4, 0.39]));
      M.add(new TorusGeometry(0.37, 0.05, 6, 22), 'head', c, mat([0, 1.76, 0.0], [Math.PI / 2 - 0.15, 0, 0]));
      break;
    }
    case 'marine': {
      M.add(new CylinderGeometry(0.36, 0.32, 0.16, 20), 'head', c, mat([0, top - 0.02, 0], [-0.08, 0, 0]));
      M.add(new CylinderGeometry(0.34, 0.34, 0.05, 20), 'head', '#14284A', mat([0, top - 0.09, 0], [-0.08, 0, 0]));
      M.add(new CylinderGeometry(0.22, 0.22, 0.02, 16, 1, false, -Math.PI / 2, Math.PI), 'head', '#1E1A18', mat([0, top - 0.11, 0.25], [-0.25, 0, 0]));
      M.add(new CircleGeometry(0.05, 10), 'head', gold, mat([0, top - 0.05, 0.34], [-0.1, 0, 0]));
      break;
    }
    case 'kochmuetze':
      M.add(new CylinderGeometry(0.3, 0.28, 0.32, 18), 'head', c, mat([0, top + 0.08, -0.02]));
      M.add(new SphereGeometry(0.36, 14, 10), 'head', c, mat([0, top + 0.3, -0.02], [0, 0, 0], [1, 0.6, 1]));
      break;
    case 'suedwester': {
      const g = new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      M.add(g, 'head', c, mat([0, 1.74, -0.02], [-0.15, 0, 0], [0.4, 0.36, 0.4]));
      M.add(new ConeGeometry(0.62, 0.22, 20, 1, true), 'head', c, mat([0, 1.78, -0.08], [0.25, 0, 0]));
      break;
    }
    case 'helm': {
      const g = new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      M.add(g, 'head', '#9AA0AA', mat([0, 1.7, 0], [-0.1, 0, 0], [0.4, 0.42, 0.4]));
      M.add(new TorusGeometry(0.42, 0.04, 6, 24), 'head', '#7A808A', mat([0, 1.72, 0], [Math.PI / 2 - 0.1, 0, 0]));
      M.add(new BoxGeometry(0.06, 0.12, 0.5), 'head', '#7A808A', mat([0, 2.08, 0]));
      break;
    }
    case 'brille':
      for (const s of [-1, 1]) {
        M.add(new TorusGeometry(0.075, 0.025, 6, 14), 'head', '#8A5A2B', mat([s * 0.12, 1.83, 0.27], [-0.5, 0, 0]));
        M.add(new CircleGeometry(0.065, 14), 'head', '#7FD6FF', mat([s * 0.12, 1.83, 0.272], [-0.5, 0, 0]));
      }
      M.add(new TorusGeometry(HEAD_R.x + 0.02, 0.018, 4, 30), 'head', '#3A2618', mat([0, 1.8, 0.02], [Math.PI / 2 - 0.35, 0, 0]));
      break;
    default: break;
  }
}
