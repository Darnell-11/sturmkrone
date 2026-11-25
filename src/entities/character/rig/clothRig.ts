// Phase 4.6F: Kleidungs- und Haarphysik über Feder-Ketten (springChain.ts) an echten Skelett-Knochen.
// Beim Laden einer Grundfigur (VroidBase) entstehen einmal Ketten-Knochen im Skelett der Vorlage: Mantelschöße und Rocksaum um die Hüfte,
// Umhang-Bahnen am oberen Brustkorb, Haarsträhnen-Bündel am Kopf, Schalenden am Hals und Schärpenbänder an der Hüfte. Jede Figur (Klon)
// erbt diese Knochen; ihre Kleidung bekommt Haut-Gewichte auf die Ketten (einmal je Kleidungs-Satz berechnet und geteilt). Jede Figur
// simuliert nur die Ketten, die sie gerade trägt, und schreibt die Lage in die Knochen – keine neuen Shader, keine Speicheranforderung je Bild.
import { Bone, BufferAttribute, BufferGeometry, Matrix4, Object3D, Quaternion, Vector3, type Skeleton, type SkinnedMesh } from 'three';
import { CHAIN_LAYOUT, CLOTH, CLOTH_WIND, type ChainTuning } from '../../../data/characterRig';
import { SpringChains, type ChainColliders } from './springChain';

export type ChainKind = 'tails' | 'cape' | 'hair' | 'scarf' | 'sash';
export const CHAIN_KINDS: ChainKind[] = ['tails', 'cape', 'hair', 'scarf', 'sash'];
const TUNE_OF: Record<ChainKind, keyof typeof CLOTH> = { tails: 'coat', cape: 'cape', hair: 'hair', scarf: 'scarf', sash: 'ribbon' };

/** Aufbau einer Kettengruppe in der Vorlage (geteilt von allen Figuren dieser Grundfigur) */
export interface ChainGroupLayout {
  kind: ChainKind;
  anchor: string;
  chains: number;
  links: number;
  /** Ruheform im Raum des Rahmen-Knochens (Punkt 0 = Wurzel) */
  rest: Float32Array;
  /** Knochenname je Kette und Punkt ≥ 1 (chains × links) */
  names: string[];
  /** Kette hat Länge (Haar-Sektoren ohne lange Strähnen ruhen) */
  active: Uint8Array;
  /** Ruheform in Welt der Vorlage (nur Umhang: Spalten beim Umwiegen) */
  world?: Float32Array;
}

/** Hilfsmaße zum Umwiegen von Kleidung auf die Ketten (Welt der Vorlage) */
interface TailMeta { cx: number; cz: number; y0: number; y1: number }
interface CapeMeta { yTop: number; yBot: number }
export interface RibbonGeo { geo: BufferGeometry; count: number }

export interface ClothLayout {
  groups: Partial<Record<ChainKind, ChainGroupLayout>>;
  tails: TailMeta | null;
  cape: CapeMeta | null;
  /** Kopf-Kugel gegen Haarsträhnen (Raum des Kopfknochens): Mitte und Halbmesser */
  headBall: [number, number, number, number];
  /** Bänder für Schal und Schärpe (Lage im Raum des Körpernetzes, Gewichte auf die Ketten) */
  ribbons: Partial<Record<'scarf' | 'sash', RibbonGeo>>;
  /** Körpernetz-Matrix der Vorlage (Körperraum → Welt der Vorlage) */
  bodyMatrix: Matrix4;
  /** Index der Rahmen- und Ketten-Knochen im Körperskelett */
  bodyBone: Map<string, number>;
}

const v1 = new Vector3(), v2 = new Vector3(), v3 = new Vector3();
const mA = new Matrix4(), mB = new Matrix4();

function boneName(kind: ChainKind, c: number, i: number) { return `K_${kind}_${c}_${i}`; }

/** Knochen anlegen (Kinder des Rahmens, Lage = Ruhe, ohne Drehung) und ins Skelett eintragen (Bindungs-Inverse aus dem Rahmen abgeleitet) */
function addChainBones(anchor: Object3D, lay: ChainGroupLayout, skels: Skeleton[]) {
  const bones: Bone[] = [];
  for (let c = 0; c < lay.chains; c++) for (let i = 1; i <= lay.links; i++) {
    const b = new Bone();
    b.name = lay.names[c * lay.links + i - 1];
    const o = (c * (lay.links + 1) + i) * 3;
    b.position.set(lay.rest[o], lay.rest[o + 1], lay.rest[o + 2]);
    anchor.add(b);
    bones.push(b);
  }
  anchor.updateMatrixWorld(true);
  for (const sk of skels) {
    const ai = sk.bones.findIndex((b) => b === anchor);
    if (ai < 0) continue;
    // B_neu · Inv_neu = B_Rahmen · Inv_Rahmen (Ruhe): gleiche Bindung wie die übrigen Knochen dieses Skeletts
    const ref = mA.multiplyMatrices(anchor.matrixWorld, sk.boneInverses[ai]);
    for (const b of bones) {
      if (sk.bones.includes(b)) continue;
      sk.bones.push(b);
      sk.boneInverses.push(new Matrix4().copy(b.matrixWorld).invert().multiply(ref));
    }
    sk.boneMatrices = new Float32Array(sk.bones.length * 16);
    if (sk.boneTexture) { sk.boneTexture.dispose(); sk.boneTexture = null; }
  }
}

function toLocal(anchor: Object3D, p: Vector3) { return p.applyMatrix4(mB.copy(anchor.matrixWorld).invert()); }

/**
 * Ketten in einer Grundfigur einrichten. template: Wurzel der Vorlage (Ruhehaltung), body: Hautnetz, hair: Haarnetze,
 * capeGrid: Umhang (längste Form) als Gitter in Körperraum, knot: Schärpenknoten in Weltlage der Vorlage.
 */
export function buildClothLayout(template: Object3D, body: SkinnedMesh, hair: SkinnedMesh[], capeGrid: { geo: BufferGeometry; rows: number; cols: number } | null, knot: Vector3 | null): ClothLayout {
  template.updateMatrixWorld(true);
  const find = (n: string) => template.getObjectByName(n) ?? null;
  const wp = (n: string) => find(n)?.getWorldPosition(new Vector3()) ?? new Vector3();
  const bmw = body.matrixWorld.clone();
  const bpos = body.geometry.attributes.position;
  // Hautpunkte in Welt der Vorlage (einmal)
  const skin = new Float32Array(bpos.count * 3);
  for (let i = 0; i < bpos.count; i++) { v1.fromBufferAttribute(bpos, i).applyMatrix4(bmw); v1.toArray(skin, i * 3); }
  const lay: ClothLayout = { groups: {}, tails: null, cape: null, headBall: [0, 0.05, 0, 0.08], ribbons: {}, bodyMatrix: bmw, bodyBone: new Map() };
  const hipsB = find('J_Bip_C_Hips'), ucB = find('J_Bip_C_UpperChest') ?? find('J_Bip_C_Chest'), headB = find('J_Bip_C_Head'), neckB = find('J_Bip_C_Neck');
  const skels: Skeleton[] = [body.skeleton];

  // ---------- Mantelschöße / Rocksaum ----------
  if (hipsB) {
    const hp = wp('J_Bip_C_Hips'), knee = wp('J_Bip_L_LowerLeg');
    const S = CHAIN_LAYOUT.tails.sectors, L = CHAIN_LAYOUT.tails.links;
    const y0 = hp.y - 0.04, y1 = knee.y - 0.02;
    const rest = new Float32Array(S * (L + 1) * 3);
    const g: ChainGroupLayout = { kind: 'tails', anchor: hipsB.name, chains: S, links: L, rest, names: [], active: new Uint8Array(S).fill(1) };
    for (let s = 0; s < S; s++) {
      const a = (s / S) * Math.PI * 2;
      const dx = Math.sin(a), dz = Math.cos(a);
      for (let i = 0; i <= L; i++) {
        const y = y0 + (y1 - y0) * (i / L);
        // weitester Hautpunkt in diesem Sektor auf dieser Höhe (Oberschenkel, Gesäß), dazu Luft für Hose und Mantel, nach unten etwas weiter
        let r = 0;
        for (let k = 0; k < bpos.count; k++) {
          const px = skin[k * 3] - hp.x, py = skin[k * 3 + 1], pz = skin[k * 3 + 2] - hp.z;
          if (Math.abs(py - y) > 0.03) continue;
          const d = Math.hypot(px, pz);
          if (d < 1e-4 || (px * dx + pz * dz) / d < Math.cos(Math.PI / S + 0.15)) continue;
          r = Math.max(r, px * dx + pz * dz);
        }
        r = Math.max(r, 0.09) + 0.036 + 0.014 * (i / L);
        v1.set(hp.x + dx * r, y, hp.z + dz * r);
        toLocal(hipsB, v1).toArray(rest, (s * (L + 1) + i) * 3);
        if (i > 0) g.names.push(boneName('tails', s, i));
      }
    }
    lay.groups.tails = g;
    lay.tails = { cx: hp.x, cz: hp.z, y0, y1 };
    addChainBones(hipsB, g, skels);
  }

  // ---------- Umhang (längste Form: Bahnen über die Breite) ----------
  if (ucB && capeGrid) {
    const { geo, rows, cols } = capeGrid;
    const C = CHAIN_LAYOUT.cape.columns, L = CHAIN_LAYOUT.cape.links;
    const cp = geo.attributes.position;
    const at = (r: number, c: number, out: Vector3) => {
      // zwischen den Gitterpunkten mitteln
      const r0 = Math.floor(r), r1 = Math.min(rows - 1, r0 + 1), fr = r - r0;
      const c0 = Math.floor(c), c1 = Math.min(cols - 1, c0 + 1), fc = c - c0;
      out.set(0, 0, 0);
      const add = (rr: number, cc: number, w: number) => { v2.fromBufferAttribute(cp, rr * cols + cc).applyMatrix4(bmw); out.addScaledVector(v2, w); };
      add(r0, c0, (1 - fr) * (1 - fc)); add(r0, c1, (1 - fr) * fc); add(r1, c0, fr * (1 - fc)); add(r1, c1, fr * fc);
      return out;
    };
    const rest = new Float32Array(C * (L + 1) * 3);
    const g: ChainGroupLayout = { kind: 'cape', anchor: ucB.name, chains: C, links: L, rest, names: [], active: new Uint8Array(C).fill(1) };
    const world = new Float32Array(C * (L + 1) * 3);
    g.world = world;
    for (let c = 0; c < C; c++) for (let i = 0; i <= L; i++) {
      at((i / L) * (rows - 1), (c / (C - 1)) * (cols - 1), v3);
      // die Bahnen liegen etwas hinter dem Stoff (Halt für die Gewichte, nie im Körper)
      v3.z -= 0.012;
      v3.toArray(world, (c * (L + 1) + i) * 3);
      toLocal(ucB, v3).toArray(rest, (c * (L + 1) + i) * 3);
      if (i > 0) g.names.push(boneName('cape', c, i));
    }
    v1.fromBufferAttribute(cp, 0).applyMatrix4(bmw);
    v2.fromBufferAttribute(cp, (rows - 1) * cols).applyMatrix4(bmw);
    lay.cape = { yTop: v1.y, yBot: v2.y };
    lay.groups.cape = g;
    addChainBones(ucB, g, skels);
  }

  // ---------- Haare: Strähnen-Bündel je Sektor um den Kopf ----------
  if (headB && hair.length) {
    const toHead = headB.matrixWorld.clone().invert();
    const pts: number[] = [];
    for (const m of hair) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { v1.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(toHead); pts.push(v1.x, v1.y, v1.z); }
    }
    const eyeL = find('J_Adj_L_FaceEye');
    const eyeY = eyeL ? eyeL.position.y : 0.06;
    // Wurzel-Ring knapp über Augenhöhe: darüber liegt das Haar am Kopf an, darunter hängt es frei
    const yRoot = eyeY + 0.035;
    const S = CHAIN_LAYOUT.hair.sectors, L = CHAIN_LAYOUT.hair.links;
    const rest = new Float32Array(S * (L + 1) * 3);
    const g: ChainGroupLayout = { kind: 'hair', anchor: headB.name, chains: S, links: L, rest, names: [], active: new Uint8Array(S) };
    // Kopfmitte (Raum des Kopfknochens): Mittel der Haarpunkte auf Wurzelhöhe
    let cx = 0, cz = 0, cn = 0;
    for (let i = 0; i < pts.length; i += 3) if (Math.abs(pts[i + 1] - yRoot) < 0.02) { cx += pts[i]; cz += pts[i + 2]; cn++; }
    if (cn) { cx /= cn; cz /= cn; }
    let minR = Infinity;
    for (let s = 0; s < S; s++) {
      // Winkel 0 = Gesicht (der Kopfknochen schaut nach −Z)
      const a = (s / S) * Math.PI * 2;
      const dx = Math.sin(a), dz = -Math.cos(a);
      const inSec = (x: number, z: number) => { const d = Math.hypot(x - cx, z - cz); return d > 1e-4 && ((x - cx) * dx + (z - cz) * dz) / d > Math.cos(Math.PI / S + 0.12); };
      let low = yRoot;
      for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] < low && inSec(pts[i], pts[i + 2])) low = pts[i + 1];
      const len = yRoot - low;
      const on = len > 0.045;
      g.active[s] = on ? 1 : 0;
      for (let i = 0; i <= L; i++) {
        const y = yRoot - (on ? len : 0.02) * (i / L);
        // Mitte der Strähnen in diesem Sektor auf dieser Höhe (Abstand von der Kopfmitte)
        let r = 0, n = 0;
        for (let k = 0; k < pts.length; k += 3) {
          if (Math.abs(pts[k + 1] - y) > 0.025 || !inSec(pts[k], pts[k + 2])) continue;
          r += Math.hypot(pts[k] - cx, pts[k + 2] - cz); n++;
        }
        const rr = n ? r / n : 0.09;
        const o = (s * (L + 1) + i) * 3;
        rest[o] = cx + dx * rr; rest[o + 1] = y; rest[o + 2] = cz + dz * rr;
        if (i > 0) { g.names.push(boneName('hair', s, i)); if (on) minR = Math.min(minR, rr); }
      }
    }
    lay.headBall = [cx, yRoot - 0.01, cz, Math.min(0.085, Math.max(0.05, (Number.isFinite(minR) ? minR : 0.1) * 0.82))];
    lay.groups.hair = g;
    const hs = [...new Set(hair.map((m) => m.skeleton))];
    addChainBones(headB, g, [body.skeleton, ...hs]);
    for (const m of hair) reskinHair(m, g, headB, yRoot, cx, cz);
  }

  // ---------- Schalenden (vorn links am Hals) und Schärpenbänder (am Knoten) ----------
  if (ucB && neckB) {
    const nk = wp('J_Bip_C_Neck');
    const sp = CHAIN_LAYOUT.scarf;
    // vorderste Hautstelle knapp unter dem Hals, etwas links: dort sitzt der Knoten auf dem Halstuch
    const front = (x: number, y: number) => {
      let z = -Infinity;
      for (let k = 0; k < bpos.count; k++) if (Math.abs(skin[k * 3] - x) < 0.025 && Math.abs(skin[k * 3 + 1] - y) < 0.02) z = Math.max(z, skin[k * 3 + 2]);
      return Number.isFinite(z) ? z : nk.z + 0.08;
    };
    // Knoten vorn links am Hals; die Enden fallen über das linke Schlüsselbein (beim Laufen wehen sie über die Schulter nach hinten)
    const root = new Vector3(0.075, nk.y - 0.04, 0);
    root.z = front(root.x, root.y) + 0.03;
    const r = ribbonGroup('scarf', ucB, sp.ribbons, sp.links, sp.length, (k, s) => {
      const x = root.x + k * 0.022 + s * 0.025;
      const y = root.y - s * sp.length * (k ? 0.78 : 1);
      return v3.set(x, y, front(x, y) + 0.032);
    });
    lay.groups.scarf = r;
    addChainBones(ucB, r, skels);
    lay.ribbons.scarf = ribbonGeo(r, ucB, body, sp.width, new Vector3(1, 0, 0));
  }
  if (hipsB && knot) {
    const hp = wp('J_Bip_C_Hips');
    const sa = CHAIN_LAYOUT.sash;
    const a0 = Math.atan2(knot.x - hp.x, knot.z - hp.z);
    const r = ribbonGroup('sash', hipsB, sa.ribbons, sa.links, sa.length, (k, s) => {
      const a = a0 + (k ? 0.16 : -0.05) + s * 0.1;
      const y = knot.y - 0.02 - s * sa.length * (k ? 0.82 : 1);
      // außen am Oberschenkel entlang
      let rad = 0;
      for (let q = 0; q < bpos.count; q++) {
        const px = skin[q * 3] - hp.x, py = skin[q * 3 + 1], pz = skin[q * 3 + 2] - hp.z;
        if (Math.abs(py - y) > 0.03) continue;
        const d = Math.hypot(px, pz);
        if (d > 1e-4 && (px * Math.sin(a) + pz * Math.cos(a)) / d > 0.93) rad = Math.max(rad, px * Math.sin(a) + pz * Math.cos(a));
      }
      rad = Math.max(rad, Math.hypot(knot.x - hp.x, knot.z - hp.z) - 0.01) + 0.03;
      return v3.set(hp.x + Math.sin(a) * rad, y, hp.z + Math.cos(a) * rad);
    });
    lay.groups.sash = r;
    addChainBones(hipsB, r, skels);
    lay.ribbons.sash = ribbonGeo(r, hipsB, body, sa.width, null);
  }

  // Index aller Rahmen- und Ketten-Knochen im Körperskelett (für Kleidungs-Gewichte)
  body.skeleton.bones.forEach((b, i) => { if (/^K_|^J_Bip_C_(Hips|UpperChest|Chest|Head|Neck)$/.test(b.name)) lay.bodyBone.set(b.name, i); });
  return lay;
}

/** Bänder-Gruppe: `at(k, s)` liefert die Weltlage von Band k bei Anteil s (0 = Knoten … 1 = Ende) */
function ribbonGroup(kind: 'scarf' | 'sash', anchor: Object3D, n: number, links: number, _len: number, at: (k: number, s: number) => Vector3): ChainGroupLayout {
  const rest = new Float32Array(n * (links + 1) * 3);
  const g: ChainGroupLayout = { kind, anchor: anchor.name, chains: n, links, rest, names: [], active: new Uint8Array(n).fill(1) };
  for (let k = 0; k < n; k++) for (let i = 0; i <= links; i++) {
    const p = at(k, i / links).clone();
    toLocal(anchor, p).toArray(rest, (k * (links + 1) + i) * 3);
    if (i > 0) g.names.push(boneName(kind, k, i));
  }
  return g;
}

/**
 * Streifen-Netz der Bänder (Körperraum, wie die Kleidung): je Band zwei Reihen Punkte entlang der Kette, Gewichte auf Rahmen (Punkt 0) und
 * Kettenknochen. Breite quer zur Kette, `side` = feste Querrichtung (Schal: x) oder null (um die Hüfte herum).
 */
function ribbonGeo(g: ChainGroupLayout, anchor: Object3D, body: SkinnedMesh, width: number, side: Vector3 | null): RibbonGeo {
  const sk = body.skeleton;
  const idx = (name: string) => Math.max(0, sk.bones.findIndex((b) => b.name === name));
  const ai = idx(anchor.name);
  const rowsPer = g.links * 2 + 1;
  const n = g.chains * rowsPer * 2;
  const pos = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const toBody = body.matrixWorld.clone().invert();
  const P = new Vector3(), A = new Vector3(), B = new Vector3(), T = new Vector3(), Wd = new Vector3();
  const tri: number[] = [];
  for (let c = 0; c < g.chains; c++) {
    for (let r = 0; r < rowsPer; r++) {
      const s = (r / (rowsPer - 1)) * g.links;
      const k = Math.min(g.links - 1, Math.floor(s)), f = s - k;
      const o0 = (c * (g.links + 1) + k) * 3, o1 = o0 + 3;
      A.set(g.rest[o0], g.rest[o0 + 1], g.rest[o0 + 2]).applyMatrix4(anchor.matrixWorld);
      B.set(g.rest[o1], g.rest[o1 + 1], g.rest[o1 + 2]).applyMatrix4(anchor.matrixWorld);
      P.copy(A).lerp(B, f);
      T.copy(B).sub(A).normalize();
      if (side) Wd.copy(side); else Wd.set(T.z, 0, -T.x);
      Wd.addScaledVector(T, -Wd.dot(T)).normalize().multiplyScalar(width * 0.5 * (1 - 0.35 * (r / (rowsPer - 1))));
      for (let e = 0; e < 2; e++) {
        const j = (c * rowsPer + r) * 2 + e;
        v1.copy(P).addScaledVector(Wd, e ? 1 : -1).applyMatrix4(toBody).toArray(pos, j * 3);
        const b0 = k === 0 ? ai : idx(g.names[c * g.links + k - 1]);
        const b1 = idx(g.names[c * g.links + k]);
        si[j * 4] = b0; sw[j * 4] = 1 - f; si[j * 4 + 1] = b1; sw[j * 4 + 1] = f;
      }
      if (r > 0) {
        const a = (c * rowsPer + r - 1) * 2, b = a + 2;
        tri.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('skinIndex', new BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new BufferAttribute(sw, 4));
  geo.setIndex(tri);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius *= 1.8;
  return { geo, count: n };
}

/** Haar-Gewichte: unter dem Wurzel-Ring hängen die Strähnen an den Ketten ihres Sektors (zwischen zwei Sektoren gemischt) */
function reskinHair(m: SkinnedMesh, g: ChainGroupLayout, head: Object3D, yRoot: number, cx: number, cz: number) {
  const geo = m.geometry, pos = geo.attributes.position;
  const sk = m.skeleton;
  const hi = sk.bones.findIndex((b) => b === head);
  if (hi < 0) return;
  const bi = (c: number, i: number) => sk.bones.findIndex((b) => b.name === g.names[c * g.links + i - 1]);
  const S = g.chains, L = g.links;
  const map: number[][] = [];
  for (let c = 0; c < S; c++) { map.push([]); for (let i = 1; i <= L; i++) map[c].push(bi(c, i)); }
  const toHead = head.matrixWorld.clone().invert();
  const oldI = geo.attributes.skinIndex, oldW = geo.attributes.skinWeight;
  const SI = new Uint16Array(pos.count * 4), SW = new Float32Array(pos.count * 4);
  const w = new Map<number, number>();
  for (let i = 0; i < pos.count; i++) {
    for (let k = 0; k < 4; k++) { SI[i * 4 + k] = oldI.getComponent(i, k); SW[i * 4 + k] = oldW.getComponent(i, k); }
    v1.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(toHead);
    if (v1.y >= yRoot) continue;
    // Sektor und Mischung mit dem Nachbarn (Winkel 0 = Gesicht, −Z)
    const ang = Math.atan2(v1.x - cx, -(v1.z - cz));
    const sf = ((ang / (Math.PI * 2)) * S + S) % S;
    const s0 = Math.floor(sf) % S, s1 = (s0 + 1) % S, fa = sf - Math.floor(sf);
    w.clear();
    const put = (b: number, x: number) => { if (x > 1e-4) w.set(b, (w.get(b) ?? 0) + x); };
    for (const [s, ws] of [[s0, 1 - fa], [s1, fa]] as const) {
      if (!g.active[s]) { put(hi, ws); continue; }
      // Anteil entlang der Kette aus der Höhe (Ruheform: Wurzel … Spitze)
      const top = g.rest[(s * (L + 1)) * 3 + 1], tip = g.rest[(s * (L + 1) + L) * 3 + 1];
      const h = Math.min(1, Math.max(0, (top - v1.y) / Math.max(1e-3, top - tip))) * L;
      const k = Math.min(L - 1, Math.floor(h)), f = h - k;
      put(k === 0 ? hi : map[s][k - 1], ws * (1 - f));
      put(map[s][k], ws * f);
    }
    const top4 = [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top4.reduce((t, e) => t + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) { SI[i * 4 + k] = top4[k]?.[0] ?? hi; SW[i * 4 + k] = top4[k] ? top4[k][1] / sum : 0; }
  }
  geo.setAttribute('skinIndex', new BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new BufferAttribute(SW, 4));
}

/**
 * Gewichte einer Kleidung auf die Ketten umlegen. kind 'tails': Punkte der Mantelschöße/des Rocks unter der Hüfte; kind 'cape': alle Punkte
 * des Umhangs unterhalb der Schulterblätter. share(i) = höchster Anteil der Kette je Punkt (0 = Punkt bleibt am Körper).
 * Ergebnis: neue skinIndex/skinWeight-Attribute (Körperskelett).
 */
export function chainSkin(lay: ClothLayout, kind: 'tails' | 'cape', geo: BufferGeometry, share: (i: number) => number): { skinIndex: BufferAttribute; skinWeight: BufferAttribute } | null {
  const g = lay.groups[kind];
  if (!g) return null;
  const pos = geo.attributes.position, oldI = geo.attributes.skinIndex, oldW = geo.attributes.skinWeight;
  const n = pos.count;
  const SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
  const ai = lay.bodyBone.get(g.anchor);
  if (ai === undefined) return null;
  const bone = (c: number, i: number) => (i === 0 ? ai : lay.bodyBone.get(g.names[c * g.links + i - 1]) ?? ai);
  const L = g.links, C = g.chains;
  const w = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) { SI[i * 4 + k] = oldI.getComponent(i, k); SW[i * 4 + k] = oldW.getComponent(i, k); }
    const sh = share(i);
    if (!(sh > 0)) continue;
    v1.fromBufferAttribute(pos, i).applyMatrix4(lay.bodyMatrix);
    let h: number, c0: number, c1: number, fc: number, k2: number;
    if (kind === 'tails') {
      const T = lay.tails!;
      const t = (T.y0 - v1.y) / Math.max(1e-3, T.y0 - T.y1);
      if (t <= 0) continue;
      h = Math.min(1, t);
      // Sektor um die Hüfte (0 = vorn, +X = links)
      const ang = Math.atan2(v1.x - T.cx, v1.z - T.cz);
      const sf = ((ang / (Math.PI * 2)) * C + C) % C;
      c0 = Math.floor(sf) % C; c1 = (c0 + 1) % C; fc = sf - Math.floor(sf);
      k2 = sh * smooth01(h / 0.35);
    } else {
      const Cm = lay.cape!;
      const t = (Cm.yTop - v1.y) / Math.max(1e-3, Cm.yTop - Cm.yBot);
      h = Math.min(1, Math.max(0, t));
      // Spalte über die Breite: Ruheform der Bahnen bei dieser Höhe vergleichen (x der Vorlage)
      const xs = columnX(g, h);
      let cf = 0;
      if (v1.x <= xs[0]) cf = 0; else if (v1.x >= xs[C - 1]) cf = C - 1;
      else for (let c = 0; c < C - 1; c++) if (v1.x >= xs[c] && v1.x <= xs[c + 1]) { cf = c + (v1.x - xs[c]) / Math.max(1e-4, xs[c + 1] - xs[c]); break; }
      c0 = Math.min(C - 1, Math.floor(cf)); c1 = Math.min(C - 1, c0 + 1); fc = cf - c0;
      k2 = sh * smooth01((h - 0.08) / 0.3);
    }
    if (k2 <= 1e-3) continue;
    const s = h * L;
    const k = Math.min(L - 1, Math.floor(s)), f = s - k;
    w.clear();
    for (let q = 0; q < 4; q++) { const x = SW[i * 4 + q] * (1 - k2); if (x > 1e-4) w.set(SI[i * 4 + q], (w.get(SI[i * 4 + q]) ?? 0) + x); }
    const put = (b: number, x: number) => { if (x > 1e-4) w.set(b, (w.get(b) ?? 0) + x); };
    put(bone(c0, k), k2 * (1 - fc) * (1 - f)); put(bone(c0, k + 1), k2 * (1 - fc) * f);
    put(bone(c1, k), k2 * fc * (1 - f)); put(bone(c1, k + 1), k2 * fc * f);
    const top4 = [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top4.reduce((t, e) => t + e[1], 0) || 1;
    for (let q = 0; q < 4; q++) { SI[i * 4 + q] = top4[q]?.[0] ?? ai; SW[i * 4 + q] = top4[q] ? top4[q][1] / sum : 0; }
  }
  return { skinIndex: new BufferAttribute(SI, 4), skinWeight: new BufferAttribute(SW, 4) };
}

function smooth01(x: number) { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); }

const colX = new Float32Array(16);
/** x der Umhang-Bahnen (Welt der Vorlage) bei Anteil h der Länge */
function columnX(g: ChainGroupLayout, h: number): Float32Array {
  const L = g.links, W = g.world!, s = Math.min(L, Math.max(0, h * L)), k = Math.min(L - 1, Math.floor(s)), f = s - k;
  for (let c = 0; c < g.chains; c++) {
    const o0 = (c * (L + 1) + k) * 3, o1 = o0 + 3;
    colX[c] = W[o0] + (W[o1] - W[o0]) * f;
  }
  return colX;
}

// ---------- Simulation je Figur ----------

interface Group {
  lay: ChainGroupLayout;
  sim: SpringChains;
  anchor: Object3D;
  bones: (Object3D | null)[];
  /** Ruherichtung je Punkt ≥ 1 (Rahmenraum, Einheitsvektor) */
  dirs: Float32Array;
  on: boolean;
}

const _inv = new Matrix4(), _rot = new Matrix4();
const _qa = new Quaternion(), _qai = new Quaternion(), _qs = new Quaternion();
const _p = new Vector3(), _d = new Vector3(), _r = new Vector3();

/** Ketten einer Figur: simuliert, was sie trägt, und schreibt die Lage in die Knochen */
export class ClothRig {
  readonly groups: Partial<Record<ChainKind, Group>> = {};
  /** gemeinsame Kollisionskörper (Beine, Rumpf, Kopf, Boden) – das Rig füllt sie je Schritt */
  readonly colliders: ChainColliders;
  private t = 0;
  private gustPh = Math.random() * 6.28;

  constructor(root: Object3D, lay: ClothLayout, colliders: ChainColliders) {
    this.colliders = colliders;
    for (const kind of CHAIN_KINDS) {
      const gl = lay.groups[kind];
      if (!gl) continue;
      const anchor = root.getObjectByName(gl.anchor);
      if (!anchor) continue;
      const tune: ChainTuning = CLOTH[TUNE_OF[kind]];
      const sim = new SpringChains(gl.chains, gl.links, tune, colliders);
      for (let k = 0; k < gl.rest.length / 3; k++) sim.setRest(Math.floor(k / (gl.links + 1)), k % (gl.links + 1), gl.rest[k * 3], gl.rest[k * 3 + 1], gl.rest[k * 3 + 2]);
      sim.finishRest();
      for (let c = 0; c < gl.chains; c++) if (!gl.active[c]) sim.active[c] = 0;
      const bones = gl.names.map((n) => anchor.getObjectByName(n) ?? null);
      const dirs = new Float32Array(gl.chains * gl.links * 3);
      for (let c = 0; c < gl.chains; c++) for (let i = 1; i <= gl.links; i++) {
        const o = (c * (gl.links + 1) + i) * 3;
        const a = i < gl.links ? o : o - 3, b = a + 3;
        _d.set(gl.rest[b] - gl.rest[a], gl.rest[b + 1] - gl.rest[a + 1], gl.rest[b + 2] - gl.rest[a + 2]);
        if (_d.lengthSq() < 1e-10) _d.set(0, -1, 0);
        _d.normalize().toArray(dirs, (c * gl.links + i - 1) * 3);
      }
      this.groups[kind] = { lay: gl, sim, anchor, bones, dirs, on: false };
    }
  }

  /** Welche Ketten schwingen (nicht getragene ruhen in ihrer Ruhelage) */
  setWorn(kind: ChainKind, on: boolean) {
    const g = this.groups[kind];
    if (!g || g.on === on) return;
    g.on = on;
    g.sim.reset();
    if (!on) this.restPose(g);
  }

  isOn(kind: ChainKind) { return !!this.groups[kind]?.on; }

  private restPose(g: Group) {
    const L = g.lay.links;
    for (let c = 0; c < g.lay.chains; c++) for (let i = 1; i <= L; i++) {
      const b = g.bones[c * L + i - 1];
      if (!b) continue;
      const o = (c * (L + 1) + i) * 3;
      b.position.set(g.lay.rest[o], g.lay.rest[o + 1], g.lay.rest[o + 2]);
      b.quaternion.identity();
    }
  }

  /** Alle getragenen Ketten in die Ruheform (nach Teleports durch das Laden, Aussehen-Wechsel) */
  snap() { for (const k of CHAIN_KINDS) { const g = this.groups[k]; if (g) g.sim.reset(); } }

  /** Stoß (m/s) auf alle getragenen Ketten */
  kick(vx: number, vy: number, vz: number) { for (const k of CHAIN_KINDS) { const g = this.groups[k]; if (g?.on) g.sim.kick(vx, vy, vz); } }

  /** Druckwelle (Welt) */
  blast(x: number, y: number, z: number, radius: number, strength: number) { for (const k of CHAIN_KINDS) { const g = this.groups[k]; if (g?.on) g.sim.blast(x, y, z, radius, strength); } }

  /**
   * Schritt: Wind (Welt, m/s), danach die Knochen schreiben. Erwartet aktuelle Weltmatrizen der Rahmen-Knochen.
   */
  update(dt: number, windX: number, windZ: number) {
    this.t += dt;
    const gust = 1 + CLOTH_WIND.gust * Math.sin(this.t * CLOTH_WIND.gustRate * 6.283 + this.gustPh) * Math.sin(this.t * 0.37 + this.gustPh * 2);
    const wl = Math.hypot(windX, windZ);
    const k = wl > CLOTH_WIND.max ? CLOTH_WIND.max / wl : 1;
    for (const kind of CHAIN_KINDS) {
      const g = this.groups[kind];
      if (!g?.on) continue;
      const sim = g.sim;
      sim.wind.x = windX * k * gust; sim.wind.y = 0; sim.wind.z = windZ * k * gust;
      sim.step(g.anchor.matrixWorld.elements, dt);
      this.write(g);
    }
  }

  /** Lage der Kettenpunkte in die Knochen (Raum des Rahmens): Ort = Punkt, Drehung = Schwenk der Ruherichtung auf die aktuelle Richtung */
  private write(g: Group) {
    const A = g.anchor, L = g.lay.links, N = L + 1, P = g.sim.pos;
    _inv.copy(A.matrixWorld).invert();
    _rot.extractRotation(A.matrixWorld);
    _qa.setFromRotationMatrix(_rot);
    _qai.copy(_qa).invert();
    for (let c = 0; c < g.lay.chains; c++) {
      for (let i = 1; i <= L; i++) {
        const b = g.bones[c * L + i - 1];
        if (!b) continue;
        const o = (c * N + i) * 3;
        const a = i < L ? o : o - 3, e = a + 3;
        _d.set(P[e] - P[a], P[e + 1] - P[a + 1], P[e + 2] - P[a + 2]);
        const dl = _d.length();
        _p.set(P[o], P[o + 1], P[o + 2]).applyMatrix4(_inv);
        b.position.copy(_p);
        if (dl < 1e-6) { b.quaternion.identity(); continue; }
        _d.multiplyScalar(1 / dl);
        const q = (c * L + i - 1) * 3;
        _r.set(g.dirs[q], g.dirs[q + 1], g.dirs[q + 2]).applyQuaternion(_qa);
        _qs.setFromUnitVectors(_r, _d);
        // lokal = A⁻¹ · Schwenk · A
        b.quaternion.copy(_qai).multiply(_qs).multiply(_qa);
      }
    }
  }
}
