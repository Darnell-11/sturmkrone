// Phase 4.6G.3: Hüte am Schädel statt auf den Haarspitzen (keine kahle Stirn, Innenkappe), neu gebaute „Mehrlagig“-Frisur mit gültigen Normalen
// und starrer Kopf-Verankerung (Mann und Frau), straffe Mantel- und Ärmelphysik mit Gelenkgrenze, Brillen/Monokel/Augenklappe an der
// Pupillenmitte ohne Überschneidung, Drei-Tage-Bart auf der Haut.
import { readFileSync } from 'node:fs';
import { Bone, BufferAttribute, BufferGeometry, DoubleSide, Matrix4, Mesh, Object3D, Skeleton, SkinnedMesh, Vector3, type Material } from 'three';
import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { CLOTH, CLOTH_LEGACY, type ChainTuning } from '../src/data/characterRig';
import { defaultLook, COSMETIC_HATS, type CharacterLook } from '../src/data/characterParts';
import { EQUIPMENT } from '../src/data/equipment';
import { SpringChains } from '../src/entities/character/rig/springChain';
import { measureSockets } from '../src/entities/character/rig/characterSockets';
import { HAT_FIT, SEATED_HATS, bandYAt, isSeatedHat, seatFromSkull, squeezeUnderHat, toSeat, type HatSeat } from '../src/entities/character/hatFit';
import { buildSeatedHat } from '../src/entities/character/seatedHats';
import {
  attachHeadgear, eyePatch, lensPlane, LENS_AHEAD, LENS_CLEAR, LENS_R, MONO_R, PATCH_GAP, type FaceParts,
} from '../src/entities/character/animeHats';
import { buildBeardGeometry, buildFaceField, fieldRadius, jawFromField, STUBBLE_LIFT, STUBBLE_UNDER_JAW, type FaceField, type FaceMarks } from '../src/entities/character/beardStrands';
import { adaptHead, MALE_SKULL } from '../src/entities/character/gear/glbGear';
import { finishMat, shade } from '../src/entities/character/gear/kit';
import type { Anchors } from '../src/entities/character/vroid';

const ROOT = new URL('..', import.meta.url);

// ---------- Prüfkopf: Schädel und Gesicht als Ellipsoide (Kopfraum: y oben, Gesicht nach −Z) ----------
const EYE_Y = 0.0625;
/** Schädel: Mitte (0, 0,09, 0), Halbachsen x 0,092, y 0,114, z 0,105; darunter Gesicht/Kinn schmaler */
function skullR(th: number, y: number): number {
  const dy = (y - 0.09) / 0.114;
  const k = Math.sqrt(Math.max(0.02, 1 - dy * dy));
  const rx = 0.092 * k, rz = 0.105 * k;
  const s = Math.sin(th), c = Math.cos(th);
  return 1 / Math.sqrt((s / rx) ** 2 + (c / rz) ** 2);
}
const SKULL_TOP = 0.09 + 0.114;
/** Hautpunkte des Prüfkopfs (für Gesichtsfeld und Bart) */
function headPoints(): number[] {
  const pts: number[] = [];
  for (let y = -0.16; y <= EYE_Y + 0.12; y += 0.002) {
    const neck = y < -0.04;
    for (let a = -Math.PI; a < Math.PI; a += 0.02) {
      const r = neck ? 0.045 : Math.min(skullR(a, Math.max(y, -0.0)), 0.095) * (1 - Math.max(0, -0.01 - y) * 3);
      pts.push(Math.sin(a) * r, y, -Math.cos(a) * r);
    }
  }
  return pts;
}
const FIELD: FaceField = buildFaceField(headPoints(), 0, EYE_Y - 0.22, EYE_Y + 0.11, -2, 2, 96, 99);
const MARKS: FaceMarks = {
  eyeY: EYE_Y, mouthY: -0.003, chinY: -0.035, ear: { x: 0.088, y: 0.02, z: 0.0 },
  jawY: (th) => jawFromField(FIELD, th, -0.003, -0.07),
};
/** Pupillen: 4,2 cm neben der Mitte, Hornhaut 1 cm hinter der Gesichtsfläche (Anime-Augen liegen vertieft) */
const PUPIL_L = new Vector3(-0.042, 0.0587, -0.085), PUPIL_R = new Vector3(0.042, 0.0587, -0.085);
const anchors = (): Anchors => ({
  earLobe: new Vector3(0.088, 0.02, 0.0), eyeY: EYE_Y, shoulders: [new Vector3(), new Vector3()], faceZ: -0.096, templeX: 0.075, skullX: 0.085, earTopY: 0.08,
  pupilL: PUPIL_L.clone(), pupilR: PUPIL_R.clone(),
});
/** vorderste Fläche vor dem Auge: Prüfkopf plus vorstehende Wimpern (1 cm vor der Hornhaut) */
const front = (x: number, y: number, R: number) => {
  let z = Infinity;
  for (let a = 0; a < Math.PI * 2; a += 0.2) for (const d of [0, R * 0.5, R]) {
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    const th = Math.atan2(px, 0.09);
    z = Math.min(z, -fieldRadius(FIELD, th, py, false) * Math.cos(th));
  }
  return Math.min(z, PUPIL_L.z - 0.01);
};

function eyes() {
  const eL = new Object3D(), eR = new Object3D();
  eL.position.set(-0.0217, 0.0625, -0.031); eR.position.set(0.0217, 0.0625, -0.031);
  return { eL, eR };
}

/** Teile im Kopfraum: Netze mit ihren Weltpunkten */
function meshesOf(parts: Object3D[]): { mesh: Mesh; pts: Vector3[] }[] {
  const out: { mesh: Mesh; pts: Vector3[] }[] = [];
  for (const p of parts) p.updateMatrixWorld(true);
  for (const p of parts) p.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position, pts: Vector3[] = [];
    for (let i = 0; i < pos.count; i++) pts.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
    out.push({ mesh: m, pts });
  });
  return out;
}

// ---------- 1. Hüte am Schädel, keine Stirnglatze ----------

describe('4.6G.3 Hüte sitzen auf dem Kopf (Schädel) statt auf den Haarspitzen', () => {
  const seats = Object.fromEntries(SEATED_HATS.map((h) => [h, seatFromSkull(skullR, 0, SKULL_TOP, EYE_Y, h)])) as Record<string, HatSeat>;

  it('alle Standard-Hüte des Editors sitzen am Schädel', () => {
    for (const h of Object.keys(COSMETIC_HATS)) if (h !== 'keiner') expect(isSeatedHat(h), h).toBe(true);
    expect(isSeatedHat('helm_ritter')).toBe(false);
    expect(isSeatedHat('keiner')).toBe(false);
  });

  it('abgesenkte Passform: Band greift um Stirn und Hinterkopf, vorn knapp über den Brauen, hinten tiefer', () => {
    // Spitzen einer Stachelfrisur liegen gut 2 cm über dem Schädel – der Hut darf dort nicht mehr sitzen
    const hairTop = SKULL_TOP + 0.024;
    for (const [h, s] of Object.entries(seats)) {
      const yFront = bandYAt(s, s.cz - s.b), yBack = bandYAt(s, s.cz + s.b);
      expect(yFront, `${h}: Band vorn auf der Stirn`).toBeLessThan(EYE_Y + 0.075);
      expect(yFront, `${h}: über den Brauen`).toBeGreaterThan(EYE_Y + 0.035);
      expect(yBack, `${h}: hinten tiefer`).toBeLessThan(yFront);
      // satt um den Schädel: Band höchstens 1,4 cm über der Haut (Haarpolster), Krone knapp über dem Scheitel
      expect(s.a - s.sa, h).toBeGreaterThan(0.006);
      expect(s.a - s.sa, h).toBeLessThan(0.014);
      expect(s.b - s.sb, h).toBeLessThan(0.014);
      expect(s.y + s.h, `${h}: Krone`).toBeLessThan(hairTop);
      expect(s.y + s.h, h).toBeGreaterThan(SKULL_TOP);
      // die Sitzhöhe liegt weit unter den Haarspitzen (bis 4.6G.2: Oberkante der Frisur minus 5 bis 8 cm, gemessen an den Spitzen)
      expect(s.y, h).toBeLessThan(hairTop - 0.1);
    }
  });

  it('keine Stirnglatze: Pony und Schläfenhaar unter dem Band bleiben unverändert', () => {
    for (const [h, s] of Object.entries(seats)) {
      // Pony vor der Stirn, von den Brauen bis kurz unter das Band; Schläfen- und Nackenhaar seitlich und hinten
      for (let y = EYE_Y + 0.01; y < bandYAt(s, -0.1) - HAT_FIT.blend - 0.001; y += 0.004) for (const x of [-0.05, -0.02, 0, 0.02, 0.05]) {
        const th = Math.atan2(x, 0.1), r = skullR(th, y) + 0.012;
        const p = { x: Math.sin(th) * r, y, z: -Math.cos(th) * r };
        const before = { ...p };
        expect(squeezeUnderHat(s, p), `${h} Pony ${x}/${y.toFixed(3)}`).toBe(false);
        expect(p).toEqual(before);
      }
      for (const side of [-1, 1]) for (let y = EYE_Y - 0.02; y < bandYAt(s, 0) - HAT_FIT.blend - 0.001; y += 0.005) {
        const p = { x: side * (skullR(Math.PI / 2, y) + 0.02), y, z: 0.0 };
        expect(squeezeUnderHat(s, p), `${h} Schläfe ${y.toFixed(3)}`).toBe(false);
      }
    }
  });

  it('Haarspitzen über dem Band werden in die Krone gedrückt (nie durch den Hut)', () => {
    const q = { x: 0, y: 0, z: 0 };
    for (const [h, s] of Object.entries(seats)) {
      for (let i = 0; i < 400; i++) {
        const a = (i * 2.399) % (Math.PI * 2), el = 0.05 + (i % 20) * 0.075;
        const r = 0.13 + (i % 7) * 0.012;
        const p = { x: Math.sin(a) * Math.cos(el) * r, y: 0.11 + Math.sin(el) * r, z: -Math.cos(a) * Math.cos(el) * r };
        squeezeUnderHat(s, p);
        toSeat(s, p.x, p.y, p.z, q);
        if (q.y < 0) continue;
        const e = Math.hypot(q.x / s.a, q.y / s.h, q.z / s.b);
        expect(e, `${h} Punkt ${i}`).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it('jeder Hut umschließt die Krone, in der das Haar liegt; die haarfarbene Innenkappe liegt darin und reicht unter das Band', () => {
    const look = { main: '#1E1A20', accent: '#E3B04B', hair: '#3A2618' };
    const capColor = shade(look.hair, -0.35).replace('#', '').toLowerCase();
    const q = { x: 0, y: 0, z: 0 };
    for (const [h, s] of Object.entries(seats)) {
      const g = buildSeatedHat(h as (typeof SEATED_HATS)[number], s, look);
      g.updateMatrixWorld(true);
      let inner = 0, innerLow = Infinity;
      // je Richtung (vom Kronen-Mittelpunkt) die äußerste Hutfläche: sie muss überall außerhalb der Krone liegen, in die das Haar gedrückt wird
      const NA = 24, NE = 6, far = new Float32Array(NA * NE).fill(-1);
      g.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const isCap = ((m.material as Material & { color: { getHexString(): string } }).color.getHexString()) === capColor;
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          if (isCap) { inner++; innerLow = Math.min(innerLow, y); expect(Math.hypot(x / s.a, Math.max(0, y) / s.h, z / s.b), `${h} Innenkappe`).toBeLessThan(1.0); continue; }
          if (y < 0.002) continue;
          const e = Math.hypot(x / s.a, y / s.h, z / s.b);
          const az = Math.atan2(x / s.a, -z / s.b), el = Math.atan2(y / s.h, Math.hypot(x / s.a, z / s.b));
          const ai = Math.min(NA - 1, Math.floor(((az + Math.PI) / (2 * Math.PI)) * NA)), ei = Math.min(NE - 1, Math.floor((el / (Math.PI / 2)) * NE));
          far[ei * NA + ai] = Math.max(far[ei * NA + ai], e);
        }
      });
      void q;
      let covered = 0, outerMin = Infinity;
      for (const v of far) if (v >= 0) { covered++; outerMin = Math.min(outerMin, v); }
      expect(covered, `${h}: Hut deckt rundum`).toBeGreaterThan(NA * NE * 0.8);
      expect(inner, `${h}: Innenkappe vorhanden`).toBeGreaterThan(50);
      expect(innerLow, `${h}: Innenkappe reicht unter das Band`).toBeLessThan(-0.01);
      expect(outerMin, `${h}: Hut außen um die Krone`).toBeGreaterThanOrEqual(0.985);
    }
  });
});

// ---------- 2. Mehrlagig: Normalen, Hülle, Kopf-Verankerung ----------

async function loadFrisur(): Promise<{ pos: Float32Array; nor: Float32Array; idx: Uint32Array }> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  const path = new URL('public/models/gear/frisur_mehrlagig.glb', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const doc = await io.read(path);
  const P: number[] = [], N: number[] = [], I: number[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const M = new Matrix4().fromArray(node.getWorldMatrix());
    for (const prim of mesh.listPrimitives()) {
      const base = P.length / 3;
      const pa = prim.getAttribute('POSITION')!, na = prim.getAttribute('NORMAL')!, ia = prim.getIndices()!;
      const v = new Vector3(), n = new Vector3(), el: number[] = [0, 0, 0];
      for (let i = 0; i < pa.getCount(); i++) {
        v.fromArray(pa.getElement(i, el)).applyMatrix4(M); P.push(v.x, v.y, v.z);
        n.fromArray(na.getElement(i, el)).transformDirection(M); N.push(n.x, n.y, n.z);
      }
      for (let i = 0; i < ia.getCount(); i++) I.push(base + ia.getScalar(i));
    }
  }
  return { pos: new Float32Array(P), nor: new Float32Array(N), idx: new Uint32Array(I) };
}

/** Körper mit Kopfknochen an einer Ruhelage (Netzraum) – genügt für die Kopf-Verankerung */
function bodyWithHead(head: [number, number, number]): SkinnedMesh {
  const b = new Bone();
  b.name = 'J_Bip_C_Head';
  b.position.set(...head);
  b.updateMatrixWorld(true);
  const sk = new Skeleton([b]);
  const m = new SkinnedMesh(new BufferGeometry());
  m.bind(sk, new Matrix4());
  return m;
}

describe('4.6G.3 „Mehrlagig“-Frisur: neu gebaut, gültige Normalen, starr am Kopf (Mann und Frau)', () => {
  const FEMALE = { box: { hx: 0.0918, zf: -0.1043, zb: 0.1061, top: 0.2074 }, head: [0.0003, 1.3876, 0.008] as [number, number, number] };

  it('Frisur ersetzt die Grundfrisur vollständig und wird doppelseitig gezeichnet', () => {
    const def = EQUIPMENT.find((e) => e.id === 'frisur_mehrlagig')!;
    const part = def.parts[0] as { hidesHair?: boolean; mode?: string; bone?: string };
    expect(part.hidesHair).toBe(true);
    expect(part.mode).toBe('bone');
    expect(part.bone).toBe('J_Bip_C_Head');
    expect((finishMat('haar', '#3A2618') as Material).side).toBe(DoubleSide);
  });

  it('Modell: geschlossene Strähnen mit nach außen zeigenden Einheits-Normalen, im Dreiecks-Rahmen', async () => {
    const { pos, nor, idx } = await loadFrisur();
    const tris = idx.length / 3;
    expect(tris).toBeGreaterThan(4000);
    expect(tris).toBeLessThan(10000);
    for (let i = 0; i < pos.length / 3; i++) {
      const l = Math.hypot(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
      expect(Number.isFinite(l)).toBe(true);
      expect(Math.abs(l - 1), `Normale ${i}`).toBeLessThan(0.03);
    }
    // Umlaufsinn jedes Dreiecks passt zu seinen Eckpunkt-Normalen (keine nach innen gestülpten Flächen)
    const A = new Vector3(), B = new Vector3(), Cc = new Vector3(), F = new Vector3(), Nv = new Vector3();
    let agree = 0;
    for (let t = 0; t < idx.length; t += 3) {
      A.fromArray(pos, idx[t] * 3); B.fromArray(pos, idx[t + 1] * 3); Cc.fromArray(pos, idx[t + 2] * 3);
      F.subVectors(B, A).cross(Cc.clone().sub(A));
      Nv.set(0, 0, 0);
      for (let k = 0; k < 3; k++) Nv.add(new Vector3().fromArray(nor, idx[t + k] * 3));
      if (F.dot(Nv) > 0) agree++;
    }
    expect(agree / tris).toBeGreaterThan(0.97);
    // geschlossene Körper: kaum offene Kanten (nur der Rand der Haube), Punkte gleicher Lage zählen als einer
    const key = (i: number) => `${Math.round(pos[i * 3] * 2e4)},${Math.round(pos[i * 3 + 1] * 2e4)},${Math.round(pos[i * 3 + 2] * 2e4)}`;
    const edges = new Map<string, number>();
    for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
      const a = key(idx[t + k]), b = key(idx[t + (k + 1) % 3]);
      const e = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(e, (edges.get(e) ?? 0) + 1);
    }
    let open = 0;
    for (const c of edges.values()) if (c === 1) open++;
    expect(open / edges.size).toBeLessThan(0.02);
    // keine entarteten Dreiecke
    let degenerate = 0;
    const a = new Vector3(), b = new Vector3(), c = new Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      a.fromArray(pos, idx[t] * 3); b.fromArray(pos, idx[t + 1] * 3); c.fromArray(pos, idx[t + 2] * 3);
      if (b.clone().sub(a).cross(c.clone().sub(a)).length() < 1e-10) degenerate++;
    }
    expect(degenerate / tris).toBeLessThan(0.01);
  });

  /** Schädel als Ellipsoid aus den Maßen (etwas eingezogen: die Haut ist eiförmig) */
  const inside = (box: { hx: number; zf: number; zb: number; top: number }, h: Vector3) => {
    const zc = (box.zb + box.zf) / 2, rz = (box.zb - box.zf) / 2, ry = box.top - 0.09;
    return Math.hypot(h.x / (box.hx * 0.97), (h.y - 0.09) / (ry * 0.97), (h.z - zc) / (rz * 0.97));
  };

  it('Mann und Frau: Haube liegt überall über dem Schädel, auch am Hinterkopf (keine kahle Stelle)', async () => {
    const { pos, nor, idx } = await loadFrisur();
    const src = new BufferGeometry();
    src.setAttribute('position', new BufferAttribute(pos, 3));
    src.setAttribute('normal', new BufferAttribute(nor, 3));
    src.setIndex(new BufferAttribute(idx, 1));
    for (const [who, head, box] of [['Mann', MALE_SKULL.head, MALE_SKULL], ['Frau', FEMALE.head, FEMALE.box]] as const) {
      const body = bodyWithHead(head as [number, number, number]);
      const g = adaptHead({}, `t/${who}`, src, body, 'J_Bip_C_Head', box);
      const p = g.attributes.position, nr = g.attributes.normal;
      let backMax = -Infinity;
      for (let i = 0; i < p.count; i++) {
        const h = new Vector3(p.getX(i) - head[0], p.getY(i) - head[1], p.getZ(i) - head[2]);
        if (h.y > 0.1) expect(inside(box, h), `${who}: Punkt ${i} im Schädel`).toBeGreaterThan(1);
        if (h.y > 0.1 && h.y < 0.16 && Math.abs(h.x) < 0.03) backMax = Math.max(backMax, h.z);
        const l = Math.hypot(nr.getX(i), nr.getY(i), nr.getZ(i));
        expect(Math.abs(l - 1), `${who}: Normale`).toBeLessThan(0.03);
      }
      // Hinterkopf bedeckt: Haar reicht hinten mindestens 5 mm über die Haut hinaus (4.6G.2: Haube 1,4 cm zu weit vorn)
      expect(backMax, who).toBeGreaterThan(box.zb + 0.005);
    }
  });

  it('Kopf-Verankerung: an der männlichen Grundfigur unverändert, an der weiblichen starr am Kopfknochen', () => {
    const src = new BufferGeometry();
    const P = new Float32Array([MALE_SKULL.head[0], MALE_SKULL.head[1] + 0.2, MALE_SKULL.head[2], MALE_SKULL.head[0] + 0.1, MALE_SKULL.head[1] + 0.1, MALE_SKULL.head[2] - 0.05]);
    src.setAttribute('position', new BufferAttribute(P, 3));
    src.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 1, 0, 0]), 3));
    expect(adaptHead({}, 'm', src, bodyWithHead(MALE_SKULL.head), 'J_Bip_C_Head', MALE_SKULL)).toBe(src);
    const f = adaptHead({}, 'f', src, bodyWithHead(FEMALE.head), 'J_Bip_C_Head', FEMALE.box);
    const p = f.attributes.position;
    // Scheitel folgt dem Kopfknochen der Frau (16 cm tiefer), Abstand zum Knochen wächst mit dem Schädel
    expect(p.getY(0) - FEMALE.head[1]).toBeCloseTo(0.2 * (FEMALE.box.top / MALE_SKULL.top), 4);
    expect(p.getX(1) - FEMALE.head[0]).toBeCloseTo(0.1 * (FEMALE.box.hx / MALE_SKULL.hx), 4);
  });
});

// ---------- 3. Mantel- und Ärmelphysik ----------

describe('4.6G.3 Mäntel, Umhänge und leere Ärmel: schweres Tuch statt „nasser Schwamm“', () => {
  const frame = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z).elements;
  const chain = (t: ChainTuning) => {
    const c = new SpringChains(1, 3, t);
    for (let i = 0; i <= 3; i++) c.setRest(0, i, 0, -0.5 * (i / 3), -0.1);
    c.finishRest();
    return c;
  };
  const tip = (c: SpringChains) => c.pos[3 * 3 + 2];
  /** Gehen, dann stehen bleiben: Nachschwappen (m) und Zeit bis zur Ruhe (s) */
  const stop = (t: ChainTuning) => {
    const c = chain(t);
    let z = 0;
    for (let i = 0; i < 90; i++) { z += 1.6 / 60; c.step(frame(0, 2, z), 1 / 60); }
    let over = 0, settle = 0;
    for (let i = 0; i < 300; i++) {
      c.step(frame(0, 2, z), 1 / 60);
      const d = tip(c) - (z - 0.1);
      over = Math.max(over, d);
      if (Math.abs(d) > 0.01) settle = i / 60;
    }
    return { over, settle };
  };
  const legacy = (k: keyof typeof CLOTH_LEGACY): ChainTuning => ({ ...CLOTH[k], ...CLOTH_LEGACY[k], maxBend: 0, stretch: 1.04 });

  it('Steifigkeit und Dämpfung deutlich erhöht (Dämpfungsgrad = 1 − damping), Figur nimmt den Stoff mehr mit', () => {
    for (const k of ['coat', 'cape', 'sleeve', 'kilt'] as const) {
      const n = CLOTH[k], o = CLOTH_LEGACY[k];
      expect(n.stiffness, k).toBeGreaterThanOrEqual(o.stiffness * 2);
      expect(1 - n.damping, k).toBeGreaterThanOrEqual((1 - o.damping) * 2.5);
      expect(n.inertia, k).toBeLessThan(o.inertia);
      expect(n.maxBend, k).toBeGreaterThan(0.5);
      expect(n.maxBend, k).toBeLessThanOrEqual(1.1);
    }
  });

  it('Anhalten: kaum Nachschwappen, nach gut 0,3 s in Ruhe (vorher über eine Sekunde)', () => {
    for (const k of ['coat', 'cape', 'sleeve'] as const) {
      const a = stop(legacy(k)), b = stop(CLOTH[k]);
      expect(b.over, k).toBeLessThan(a.over * 0.35);
      expect(b.settle, k).toBeLessThan(0.35);
      expect(a.settle, k).toBeGreaterThan(0.9);
    }
  });

  it('Wind und Sprint treiben den Stoff weiter kraftvoll; kein Glied schwenkt über seine Gelenkgrenze', () => {
    for (const k of ['coat', 'cape', 'sleeve'] as const) {
      const dev = (t: ChainTuning, w: number) => { const c = chain(t); c.wind.x = w; for (let i = 0; i < 300; i++) c.step(frame(0, 2, 0), 1 / 60); return { x: c.pos[9], bend: c.maxBendSeen }; };
      const trail = (t: ChainTuning) => { const c = chain(t); let z = 0; for (let i = 0; i < 120; i++) { z += 7 / 60; c.step(frame(0, 2, z), 1 / 60); } return z - tip(c); };
      const storm = dev(CLOTH[k], 9);
      expect(storm.x, k).toBeGreaterThan(dev(legacy(k), 9).x * 0.7);
      expect(storm.bend, k).toBeLessThanOrEqual(CLOTH[k].maxBend + 0.02);
      // die Figur nimmt den Stoff bewusst mehr mit (kleinere Trägheit): drei Viertel des alten Nachwehens bleiben
      expect(trail(CLOTH[k]), k).toBeGreaterThan(trail(legacy(k)) * 0.75);
      // Sturmböe von vorn: das Glied klappt nie über seine Grenze hinaus nach oben
      const c = chain(CLOTH[k]);
      c.wind.z = -30;
      for (let i = 0; i < 200; i++) { c.kick(0, 6, -6); c.step(frame(0, 2, 0), 1 / 60); }
      expect(c.maxBendSeen, k).toBeLessThanOrEqual(CLOTH[k].maxBend + 0.02);
      expect(c.resets).toBe(0);
    }
  });
});

// ---------- 4. Brillen, Monokel, Augenklappe ----------

/** Fassung eines Glases: geschlossener Ring mit über 1,5 cm Halbmesser (nicht der halbe Bogen des Stegs) */
const isLensRing = (m: { mesh: Mesh }) => {
  const g = m.mesh.geometry as unknown as { type: string; parameters: { radius: number; arc: number } };
  return g.type === 'TorusGeometry' && g.parameters.radius > 0.015 && g.parameters.arc > 6;
};
const face = (): FaceParts => ({ beard: null, scar: null, field: { field: FIELD, marks: MARKS }, front: (x, y, R) => front(x, y, R) });
const lookWith = (l: Partial<CharacterLook>): CharacterLook => ({ ...defaultLook('pirat'), hat: 'keiner', earring: false, beard: 'keiner', scar: false, eyepatch: false, glasses: 'keine', ...l } as CharacterLook);

describe('4.6G.3 Brillen und Monokel genau auf der Pupillenmitte, Augenklappe ohne Überschneidung', () => {
  it('Glas-Ebene: 1,35 cm vor der Hornhaut, weiter vorn nur so weit, wie Haut und Wimpern es verlangen', () => {
    expect(LENS_AHEAD).toBeGreaterThanOrEqual(0.012);
    expect(LENS_AHEAD).toBeLessThanOrEqual(0.015);
    expect(lensPlane(-0.085, -0.09)).toBeCloseTo(-0.085 - LENS_AHEAD, 9);
    expect(lensPlane(-0.085, -0.105)).toBeCloseTo(-0.105 - LENS_CLEAR, 9);
  });

  it('runde Brille: Gläser exakt auf Pupillenhöhe und -mitte (nicht auf den Augenknochen, nicht in den Unterlidern)', () => {
    const { eL, eR } = eyes();
    const parts = attachHeadgear(new Object3D(), eL, eR, lookWith({ glasses: 'rund' }), false, null, anchors(), face());
    const rings = meshesOf(parts).filter(isLensRing);
    expect(rings.length).toBe(2);
    for (const r of rings) {
      const c = r.mesh.getWorldPosition(new Vector3());
      const e = c.x < 0 ? PUPIL_L : PUPIL_R;
      expect(c.x).toBeCloseTo(e.x, 6);
      expect(c.y).toBeCloseTo(e.y, 6);
      // vor der Hornhaut (1,2 cm und mehr) und vor der Fläche darunter
      expect(e.z - c.z).toBeGreaterThanOrEqual(0.012);
      expect(c.z).toBeLessThanOrEqual(front(e.x, e.y, LENS_R) - LENS_CLEAR + 1e-9);
    }
  });

  it('Augenklappe + Monokel: das Monokel wechselt aufs freie Auge, kein Riemen kreuzt es', () => {
    const { eL, eR } = eyes();
    const parts = attachHeadgear(new Object3D(), eL, eR, lookWith({ glasses: 'monokel', eyepatch: true }), false, null, anchors(), face());
    const mono = parts.find((p) => p.userData.socket === 'eyeLeft')!;
    const patch = parts.find((p) => p.userData.socket === 'eyeRight')!;
    expect(mono).toBeTruthy();
    expect(patch).toBeTruthy();
    const ring = meshesOf([mono]).find(isLensRing)!;
    const c = ring.mesh.getWorldPosition(new Vector3());
    expect(c.x).toBeCloseTo(PUPIL_L.x, 6);
    expect(c.y).toBeCloseTo(PUPIL_L.y, 6);
    // kein Punkt der Klappe samt Riemen liegt in der Monokel-Scheibe vor dem freien Auge
    for (const m of meshesOf([patch])) for (const p of m.pts) {
      const inDisc = Math.hypot(p.x - PUPIL_L.x, p.y - PUPIL_L.y) < MONO_R + 0.004;
      if (inDisc) expect(p.z, 'Riemen hinter der Monokel-Ebene').toBeGreaterThan(c.z + 0.002);
    }
    // ohne Augenklappe sitzt das Monokel rechts
    const solo = attachHeadgear(new Object3D(), eL, eR, lookWith({ glasses: 'monokel' }), false, null, anchors(), face());
    expect(solo.some((p) => p.userData.socket === 'eyeRight')).toBe(true);
  });

  it('Augenklappe + Vollbrille: Brille sitzt mit Luft vor der flach anliegenden Klappe (kein Z-Fighting)', () => {
    const { eL, eR } = eyes();
    const parts = attachHeadgear(new Object3D(), eL, eR, lookWith({ glasses: 'rund', eyepatch: true }), false, null, anchors(), face());
    const patch = parts.find((p) => p.userData.socket === 'eyeRight')!;
    let patchFront = Infinity;
    for (const m of meshesOf([patch])) for (const p of m.pts) if (Math.hypot(p.x - PUPIL_R.x, p.y - PUPIL_R.y) < 0.03) patchFront = Math.min(patchFront, p.z);
    const glasses = parts.find((p) => p.userData.socket === 'faceFront')!;
    const rings = meshesOf([glasses]).filter(isLensRing);
    for (const r of rings) expect(r.mesh.getWorldPosition(new Vector3()).z).toBeLessThanOrEqual(patchFront - PATCH_GAP + 1e-6);
  });

  it('Klappe liegt flach an: Abstand zur Haut höchstens gut 4 mm, Rand fast auf der Haut', () => {
    const { group, front: f0 } = eyePatch(PUPIL_R, FIELD, anchors(), false);
    expect(Number.isFinite(f0)).toBe(true);
    const shell = meshesOf([group])[0];
    let maxGap = 0;
    for (const p of shell.pts) {
      const th = Math.atan2(p.x, -p.z), r = Math.hypot(p.x, p.z);
      const gap = r - fieldRadius(FIELD, th, p.y, false);
      expect(gap).toBeGreaterThan(-0.0005);
      maxGap = Math.max(maxGap, gap);
    }
    expect(maxGap).toBeLessThan(0.0055);
  });

  it('Augen-Sockets sitzen auf den Pupillen', () => {
    const T = new Object3D();
    const head = new Object3D(); head.name = 'J_Bip_C_Head';
    const eL = new Object3D(); eL.name = 'J_Adj_L_FaceEye'; eL.position.set(-0.0217, 0.0625, -0.031);
    const eR = new Object3D(); eR.name = 'J_Adj_R_FaceEye'; eR.position.set(0.0217, 0.0625, -0.031);
    head.add(eL, eR); T.add(head);
    const m = measureSockets(T, null, [], null, { l: PUPIL_L, r: PUPIL_R });
    expect(m.at.eyeLeft!.pos[0]).toBeCloseTo(PUPIL_L.x, 6);
    expect(m.at.eyeLeft!.pos[1]).toBeCloseTo(PUPIL_L.y, 6);
    expect(m.at.eyeRight!.pos[0]).toBeCloseTo(PUPIL_R.x, 6);
  });
});

// ---------- 5. Drei-Tage-Bart ----------

describe('4.6G.3 Drei-Tage-Bart liegt auf der Haut', () => {
  it('jede Stoppel liegt 1,5 mm über der Haut (Spitzen höchstens knapp darüber), nichts schwebt vor Kinn und Hals', () => {
    const geo = buildBeardGeometry('stoppeln', FIELD, MARKS)!;
    const p = geo.attributes.position;
    expect(p.count).toBeGreaterThan(300);
    let under = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const th = Math.atan2(x, -(z - FIELD.zc)), r = Math.hypot(x, z - FIELD.zc);
      const gap = r - fieldRadius(FIELD, th, y, false);
      expect(gap, `Stoppel ${i}`).toBeGreaterThan(STUBBLE_LIFT - 0.0008);
      expect(gap, `Stoppel ${i}`).toBeLessThan(STUBBLE_LIFT + 0.0009);
      if (y < MARKS.jawY(th)) under++;
      expect(y, `Stoppel ${i} unter dem Kiefer`).toBeGreaterThan(MARKS.jawY(th) - STUBBLE_UNDER_JAW - 0.003);
    }
    // ein schmaler Streifen unter der Kieferlinie bleibt (Bartschatten), aber kein Vorhang vor dem Hals
    expect(under / p.count).toBeLessThan(0.25);
  });
});

// Quelltext-Prüfung: der Haarglanz ist ein weiches Seidenband (kein harter, gezackter weißer Streifen)
describe('4.6G.3 weicher Haarglanz', () => {
  it('Lichtband breit und weich, kaum gezackt', () => {
    const toon = readFileSync(new URL('src/render/toon.ts', ROOT), 'utf8');
    expect(toon).not.toMatch(/skB1 = pow\(sqrt\(max\(1\.0 - skD1 \* skD1, 1e-4\)\), 260\.0\)/);
    const m = toon.match(/skB1 = pow\(sqrt\(max\(1\.0 - skD1 \* skD1, 1e-4\)\), ([\d.]+)\)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeLessThanOrEqual(90);
    expect(toon).toMatch(/skJit \* 0\.07/);
  });
});
