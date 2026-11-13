// Ausrüstung aus echten Modellen (Blender → .glb in public/models/gear/, Werkzeuge in tools/blender/).
//
// Ein Modell besteht aus Netzen, deren Materialname die Rolle ist (main, trim, leather, steel, gold, dark, cloth, skin). Das Spiel
// ersetzt jede Rolle durch eine Oberfläche und Farbe aus der Ausrüstungsdefinition (data/equipment.ts, Teil „glb“).
//
// Zwei Arten, ein Modell am Körper zu befestigen:
// - „skinned“: das Modell ist in der Ruhehaltung der Grundfigur modelliert (Meter, wie base_male.glb). Beim Laden übernimmt jeder
//   Punkt die Skelett-Gewichte der nächsten Hautpunkte – Stiefel, Hose und Rock biegen sich mit den Beinen.
// - „bone“: alle Punkte hängen an einem Knochen (Hut am Kopf, Haare am Kopf).
// - Waffen („held“) sind starre Gruppen im Raum der Handhalterung: Griff am Ursprung, Klinge entlang +Y.
import { BufferAttribute, BufferGeometry, Group, Mesh, SkinnedMesh, Uint16BufferAttribute, Vector3, type Material } from 'three';
import { preload } from '../../../core/preload';
import { markShared } from '../../../render/dispose';
import { finishMat } from './kit';
import type { Finish } from '../../../data/equipment';

export type GlbRole = 'main' | 'trim' | 'leather' | 'steel' | 'gold' | 'dark' | 'cloth' | 'skin';
export interface GlbRoleLook { finish: Finish; color: string }

/** Ein geladenes Modell: je Rolle eine Geometrie (Lage, Normale, UV) */
export interface GlbModel { name: string; roles: Map<string, BufferGeometry> }

const BASE = `${import.meta.env.BASE_URL}models/gear/`;
/** Alle Modelle, die das Spiel kennt (Dateiname ohne .glb) */
export const GLB_MODELS = ['stulpenstiefel', 'stoffhose', 'stoffhose_stiefel', 'gehrock', 'dreispitz', 'frisur_mehrlagig', 'entermesser', 'parierdolch', 'sandalen'];

const models = new Map<string, GlbModel>();

/** Modelle vorab laden (beim Start, über die zentrale Pipeline); fehlende Dateien werden übersprungen */
export async function loadGearModels(names: readonly string[] = GLB_MODELS): Promise<void> {
  await Promise.all(names.map(async (name) => {
    try {
      const g = await preload.loadGltf(`${BASE}${name}.glb`);
      const by = new Map<string, BufferGeometry[]>();
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const role = ((Array.isArray(m.material) ? m.material[0] : m.material) as Material).name.replace(/\.\d+$/, '') || 'main';
        const geo = m.geometry.clone();
        geo.applyMatrix4(m.matrixWorld);
        const l = by.get(role);
        if (l) l.push(geo); else by.set(role, [geo]);
      });
      const roles = new Map<string, BufferGeometry>();
      for (const [role, list] of by) {
        const geo = list.length === 1 ? list[0] : mergeList(list);
        roles.set(role, markShared(geo));
      }
      models.set(name, { name, roles });
    } catch (e) {
      // Modell fehlt oder ist defekt: Figuren ohne dieses Teil weiterspielen
      console.warn(`Ausrüstungsmodell ${name} nicht geladen`, e);
    }
  }));
}

function mergeList(list: BufferGeometry[]): BufferGeometry {
  let n = 0, ni = 0;
  for (const g of list) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(ni);
  let o = 0, io = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + o; else for (let i = 0; i < c; i++) idx[io++] = o + i;
    o += c;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('normal', new BufferAttribute(nor, 3));
  out.setAttribute('uv', new BufferAttribute(uv, 2));
  out.setIndex(new BufferAttribute(idx, 1));
  return out;
}

export const hasGlb = (name: string) => models.has(name);
export const glbModel = (name: string) => models.get(name) ?? null;

/** Spielerfreundliche Zusammenfassung für die Entwicklung: welche Modelle geladen sind */
export const loadedGlbs = () => [...models.keys()];

// ---------- Gewichte ----------

/**
 * Körperseite je Punkt: zusammenhängende Teile (ein Stiefel, ein Hosenbein) gehören ganz zu einer Seite (−1 links, +1 rechts, 0 = Mitte).
 * Punkte nahe der Mittellinie würden sonst Gewichte vom anderen Bein bekommen und beim Gehen in Streifen auseinandergezogen.
 */
function componentSide(geo: BufferGeometry): Int8Array {
  const p = geo.attributes.position, n = p.count;
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const idx = geo.index!;
  for (let t = 0; t < idx.count; t += 3) { const a = find(idx.getX(t)); for (let k = 1; k < 3; k++) { const b = find(idx.getX(t + k)); if (a !== b) parent[b] = a; } }
  // Punkte mit gleicher Lage (Nähte der UV-Inseln) gehören zusammen
  const seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(p.getX(i) * 2e4)},${Math.round(p.getY(i) * 2e4)},${Math.round(p.getZ(i) * 2e4)}`;
    const o = seen.get(key);
    if (o === undefined) seen.set(key, i); else { const a = find(o), b = find(i); if (a !== b) parent[b] = a; }
  }
  const sum = new Float64Array(n), cnt = new Int32Array(n);
  for (let i = 0; i < n; i++) { const r = find(i); sum[r] += p.getX(i); cnt[r]++; }
  const out = new Int8Array(n);
  for (let i = 0; i < n; i++) { const r = find(i), m = sum[r] / cnt[r]; out[i] = Math.abs(m) < 0.03 ? 0 : m > 0 ? 1 : -1; }
  return out;
}

/** Skelett-Gewichte, einmal je Modell und Grundfigur */
interface Fit { skinIndex: Uint16BufferAttribute; skinWeight: BufferAttribute }
const fits = new WeakMap<object, Map<string, Fit>>();

/**
 * Gewichte von der Haut übernehmen: jeder Modellpunkt nimmt die Gewichte der drei nächsten Hautpunkte derselben Körperseite
 * (Normalen zeigen in dieselbe Richtung), gewichtet nach Abstand. So bewegt sich Stoff und Leder wie die Haut darunter.
 */
export function fitToBody(base: object, key: string, geo: BufferGeometry, body: SkinnedMesh): Fit {
  let byBase = fits.get(base);
  if (!byBase) { byBase = new Map(); fits.set(base, byBase); }
  const hit = byBase.get(key);
  if (hit) return hit;
  const bg = body.geometry;
  const bp = bg.attributes.position, bn = bg.attributes.normal, bi = bg.attributes.skinIndex, bw = bg.attributes.skinWeight;
  const cell = 0.03;
  const grid = new Map<number, number[]>();
  const gk = (x: number, y: number, z: number) => (Math.floor(x / cell) * 73856093) ^ (Math.floor(y / cell) * 19349663) ^ (Math.floor(z / cell) * 83492791);
  for (let i = 0; i < bp.count; i++) {
    const k = gk(bp.getX(i), bp.getY(i), bp.getZ(i));
    const l = grid.get(k);
    if (l) l.push(i); else grid.set(k, [i]);
  }
  const p = geo.attributes.position, n = geo.attributes.normal;
  const side = componentSide(geo);
  const si = new Uint16Array(p.count * 4), sw = new Float32Array(p.count * 4);
  const wm = new Map<number, number>();
  const near: [number, number][] = [];
  for (let v = 0; v < p.count; v++) {
    const x = p.getX(v), y = p.getY(v), z = p.getZ(v);
    const nx = n ? n.getX(v) : 0, ny = n ? n.getY(v) : 0, nz = n ? n.getZ(v) : 0;
    near.length = 0;
    for (let r = 1; r <= 3 && near.length < 3; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        const l = grid.get(gk(x + dx * cell, y + dy * cell, z + dz * cell));
        if (!l) continue;
        for (const i of l) {
          // Hautpunkte auf der Gegenseite (anderes Bein, Rücken statt Brust) zählen nicht
          // und auch die andere Körperhälfte nicht: die Innenseite eines Stiefelschafts schaut zum anderen Bein
          const bx = bp.getX(i);
          if (side[v] && Math.abs(bx) > 0.015 && (bx > 0) !== (side[v] > 0)) continue;
          if (n && bn.getX(i) * nx + bn.getY(i) * ny + bn.getZ(i) * nz < -0.2 && Math.abs(x - bx) > 0.04) continue;
          const d2 = (bp.getX(i) - x) ** 2 + (bp.getY(i) - y) ** 2 + (bp.getZ(i) - z) ** 2;
          near.push([d2, i]);
        }
      }
    }
    if (!near.length) {
      // keine passende Haut in der Nähe: nächster Punkt derselben Seite ohne Normalenprüfung
      let bd = Infinity, bi0 = 0;
      for (let i = 0; i < bp.count; i++) {
        if (side[v] && Math.abs(bp.getX(i)) > 0.015 && (bp.getX(i) > 0) !== (side[v] > 0)) continue; const d2 = (bp.getX(i) - x) ** 2 + (bp.getY(i) - y) ** 2 + (bp.getZ(i) - z) ** 2; if (d2 < bd) { bd = d2; bi0 = i; } }
      near.push([bd, bi0]);
    }
    near.sort((a, b) => a[0] - b[0]);
    wm.clear();
    for (const [d2, i] of near.slice(0, 3)) {
      const w = 1 / (d2 + 1e-5);
      for (let k = 0; k < 4; k++) { const ww = bw.getComponent(i, k); if (ww > 0) wm.set(bi.getComponent(i, k), (wm.get(bi.getComponent(i, k)) ?? 0) + ww * w); }
    }
    const top = [...wm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((t, e) => t + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) { si[v * 4 + k] = top[k]?.[0] ?? 0; sw[v * 4 + k] = top[k] ? top[k][1] / sum : 0; }
  }
  smoothWeights(geo, si, sw, 6);
  const fit = { skinIndex: new Uint16BufferAttribute(si, 4), skinWeight: new BufferAttribute(sw, 4) };
  byBase.set(key, fit);
  return fit;
}

/**
 * Gewichte über das Netz glätten: jeder Punkt mischt die Gewichte seiner Nachbarn (Punkte gleicher Lage zählen als einer).
 * Ohne das reißen einzelne Punkte an Achsel und Schulter in Spitzen aus, wo die nächsten Hautpunkte von Brust und Arm wechseln.
 */
function smoothWeights(geo: BufferGeometry, si: Uint16Array, sw: Float32Array, passes: number) {
  const p = geo.attributes.position, n = p.count, idx = geo.index!;
  // Punkte gleicher Lage (Nähte) zusammenfassen
  const weld = new Int32Array(n);
  const seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(p.getX(i) * 2e4)},${Math.round(p.getY(i) * 2e4)},${Math.round(p.getZ(i) * 2e4)}`;
    const o = seen.get(key);
    if (o === undefined) { seen.set(key, i); weld[i] = i; } else weld[i] = o;
  }
  const nb: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let t = 0; t < idx.count; t += 3) for (let k = 0; k < 3; k++) {
    const a = weld[idx.getX(t + k)], b = weld[idx.getX(t + (k + 1) % 3)];
    if (a !== b) { nb[a].add(b); nb[b].add(a); }
  }
  const m = new Map<number, number>();
  for (let pass = 0; pass < passes; pass++) {
    const ni = si.slice(), nw = sw.slice();
    for (let v = 0; v < n; v++) {
      if (weld[v] !== v) continue;
      m.clear();
      for (let k = 0; k < 4; k++) if (sw[v * 4 + k] > 0) m.set(si[v * 4 + k], (m.get(si[v * 4 + k]) ?? 0) + sw[v * 4 + k] * 2);
      let cnt = 2;
      for (const q of nb[v]) { cnt++; for (let k = 0; k < 4; k++) if (sw[q * 4 + k] > 0) m.set(si[q * 4 + k], (m.get(si[q * 4 + k]) ?? 0) + sw[q * 4 + k]); }
      const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = top.reduce((t, e) => t + e[1], 0) || 1;
      for (let k = 0; k < 4; k++) { ni[v * 4 + k] = top[k]?.[0] ?? 0; nw[v * 4 + k] = top[k] ? top[k][1] / sum : 0; }
      void cnt;
    }
    for (let v = 0; v < n; v++) if (weld[v] !== v) { const c = weld[v]; for (let k = 0; k < 4; k++) { ni[v * 4 + k] = ni[c * 4 + k]; nw[v * 4 + k] = nw[c * 4 + k]; } }
    si.set(ni); sw.set(nw);
  }
}

/**
 * Gewichte nach einfacher Regel für Füße (Sandalen): Unterschenkel über dem Knöchel, Fuß, Zehenballen vor dem Zehengelenk – weich überblendet.
 * Feine Riemen reißen bei der Übernahme von der Haut, weil dort jeder Punkt andere Nachbarn hat.
 */
export function fitFoot(base: object, key: string, geo: BufferGeometry, body: SkinnedMesh): Fit {
  let byBase = fits.get(base);
  if (!byBase) { byBase = new Map(); fits.set(base, byBase); }
  const hit = byBase.get(key);
  if (hit) return hit;
  const bones = body.skeleton.bones;
  const idx = (n: string) => Math.max(0, bones.findIndex((b) => b.name === n));
  const rest = (n: string) => { const i = idx(n); const e = body.skeleton.boneInverses[i].clone().invert().elements; return { y: e[13], z: e[14] }; };
  const p = geo.attributes.position, n = p.count;
  const side = componentSide(geo);
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const cache = new Map<number, { leg: number; foot: number; toe: number; ry: number; tz: number }>();
  for (let v = 0; v < n; v++) {
    const s = side[v] || (p.getX(v) < 0 ? -1 : 1);
    let c = cache.get(s);
    if (!c) {
      const L = s < 0 ? 'L' : 'R';
      c = { leg: idx(`J_Bip_${L}_LowerLeg`), foot: idx(`J_Bip_${L}_Foot`), toe: idx(`J_Bip_${L}_ToeBase`), ry: rest(`J_Bip_${L}_Foot`).y, tz: rest(`J_Bip_${L}_ToeBase`).z };
      cache.set(s, c);
    }
    const wLeg = sm(c.ry + 0.01, c.ry + 0.07, p.getY(v));
    const wToe = (1 - wLeg) * sm(-0.012, 0.03, c.tz - p.getZ(v));
    const wFoot = Math.max(0, 1 - wLeg - wToe);
    si[v * 4] = c.leg; sw[v * 4] = wLeg; si[v * 4 + 1] = c.foot; sw[v * 4 + 1] = wFoot; si[v * 4 + 2] = c.toe; sw[v * 4 + 2] = wToe;
  }
  const fit = { skinIndex: new Uint16BufferAttribute(si, 4), skinWeight: new BufferAttribute(sw, 4) };
  byBase.set(key, fit);
  return fit;
}

/** Alle Punkte an einen Knochen hängen (Hut, Haare) */
export function fitToBone(base: object, key: string, geo: BufferGeometry, body: SkinnedMesh, bone: string): Fit {
  let byBase = fits.get(base);
  if (!byBase) { byBase = new Map(); fits.set(base, byBase); }
  const hit = byBase.get(key);
  if (hit) return hit;
  const idx = Math.max(0, body.skeleton.bones.findIndex((b) => b.name === bone));
  const n = geo.attributes.position.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) { si[v * 4] = idx; sw[v * 4] = 1; }
  const fit = { skinIndex: new Uint16BufferAttribute(si, 4), skinWeight: new BufferAttribute(sw, 4) };
  byBase.set(key, fit);
  return fit;
}

// ---------- Anpassung an andere Grundfiguren ----------

/** Maße der männlichen Grundfigur, an der alle Modelle gebaut sind (Meter, y oben; aus den Ruhelagen der Knochen) */
const MALE = { ankle: 0.121, knee: 0.577, hips: 1.008, neck: 1.456, head: 1.545, top: 1.757, upLegX: 0.084, upArmX: 0.147, handX: 0.615, footX: 0.049 };

interface Landmarks { ankle: number; knee: number; hips: number; neck: number; head: number; top: number; upLegX: number; upArmX: number; handX: number; footX: number }

function landmarks(body: SkinnedMesh): Landmarks {
  const sk = body.skeleton;
  const at = (n: string) => { const i = sk.bones.findIndex((b) => b.name === n); const e = sk.boneInverses[Math.max(0, i)].clone().invert().elements; return { x: Math.abs(e[12]), y: e[13] }; };
  const head = at('J_Bip_C_Head').y, neck = at('J_Bip_C_Neck').y;
  return {
    ankle: at('J_Bip_L_Foot').y, knee: at('J_Bip_L_LowerLeg').y, hips: at('J_Bip_C_Hips').y, neck, head,
    // der Kopf schrumpft weniger als der Körper
    top: head + (MALE.top - MALE.head),
    upLegX: at('J_Bip_L_UpperLeg').x, upArmX: at('J_Bip_L_UpperArm').x, handX: at('J_Bip_L_Hand').x, footX: at('J_Bip_L_Foot').x,
  };
}

const lerpKeys = (xs: number[], ys: number[], x: number) => {
  if (x <= xs[0]) return ys[0] + (x - xs[0]) * ((ys[1] - ys[0]) / (xs[1] - xs[0]));
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + ((x - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1]);
  const n = xs.length - 1;
  return ys[n] + (x - xs[n]) * 1;
};

/** Wie lerpKeys, aber außerhalb der Stützstellen konstant (für Verhältnisse) */
const clampKeys = (xs: number[], ys: number[], x: number) => lerpKeys(xs, ys, Math.max(xs[0], Math.min(xs[xs.length - 1], x)));

/**
 * Lage in der Grundfigur: Höhen stückweise von Knöchel, Knie, Hüfte, Hals und Kopf der männlichen Vorlage auf die der anderen
 * Figur abbilden, Breiten nach Höhe skalieren, Arme in der Länge anpassen. Für die männliche Figur bleibt alles unverändert.
 * Ohne das schweben und klaffen die Teile an der kleineren weiblichen Grundfigur (etwa 10 % kleiner, schmale Schultern).
 */
function mapper(body: SkinnedMesh): ((v: Vector3) => void) | null {
  const f = landmarks(body);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.004;
  if (near(f.hips, MALE.hips) && near(f.head, MALE.head) && near(f.upArmX, MALE.upArmX)) return null;
  const my = [0, MALE.ankle, MALE.knee, MALE.hips, MALE.neck, MALE.head, MALE.top];
  const fy = [0, f.ankle, f.knee, f.hips, f.neck, f.head, f.top];
  // Breitenverhältnis je (männlicher) Höhe: Fuß, Hüfte, Schulter, Kopf
  const rk = [MALE.ankle, MALE.hips, 1.405, MALE.head + 0.05];
  const rv = [f.footX / MALE.footX, f.upLegX / MALE.upLegX, f.upArmX / MALE.upArmX, 1.0];
  const depthBody = (f.head - f.ankle) / (MALE.head - MALE.ankle);
  const arm = (f.handX - f.upArmX) / (MALE.handX - MALE.upArmX);
  return (v) => {
    const y = v.y;
    const r = clampKeys(rk, rv, y);
    const ax = Math.abs(v.x), s = v.x < 0 ? -1 : 1;
    // Arme (T-Pose, über dem Schultergelenk nach außen): Länge anpassen
    v.x = y > 1.2 && ax > MALE.upArmX ? s * (f.upArmX + (ax - MALE.upArmX) * arm) : v.x * r;
    // Kopf und Hut behalten ihre Tiefe (der Kopf der weiblichen Figur ist kaum kleiner)
    // Rumpftiefe: unten wie der Körper, ab Brusthöhe unverändert (Brust und Kopf der weiblichen Figur sind kaum flacher)
    v.z *= clampKeys([MALE.hips, MALE.neck - 0.08, MALE.head + 0.03], [depthBody, 1, 1], y);
    v.y = lerpKeys(my, fy, y);
  };
}

const mappedGeo = new WeakMap<object, Map<string, BufferGeometry>>();

/** Modellgeometrie an die Grundfigur angepasst (einmal je Grundfigur und Teil, geteilt); die männliche bleibt unverändert */
function adapt(base: object, key: string, src: BufferGeometry, body: SkinnedMesh): BufferGeometry {
  let m = mappedGeo.get(base);
  if (!m) { m = new Map(); mappedGeo.set(base, m); }
  const hit = m.get(key);
  if (hit) return hit;
  const map = mapper(body);
  let out = src;
  if (map) {
    out = new BufferGeometry();
    const p = src.attributes.position, pos = new Float32Array(p.count * 3), v = new Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); map(v); v.toArray(pos, i * 3); }
    out.setAttribute('position', new BufferAttribute(pos, 3));
    out.setAttribute('normal', src.attributes.normal);
    if (src.attributes.uv) out.setAttribute('uv', src.attributes.uv);
    out.setIndex(src.index);
    out.computeBoundingSphere();
    markShared(out);
  }
  m.set(key, out);
  return out;
}

/** Höhe (y) eines Punkts der männlichen Vorlage in der Lage dieser Grundfigur */
function mappedY(body: SkinnedMesh, y: number): number {
  const map = mapper(body);
  if (!map) return y;
  const v = new Vector3(0, y, 0);
  map(v);
  return v.y;
}

/** Netze eines Modells am Skelett der Figur: je Rolle ein SkinnedMesh mit eigener Oberfläche */
export function buildSkinned(base: object, model: GlbModel, mode: 'skinned' | 'bone' | 'foot', bone: string | undefined, body: SkinnedMesh, look: Record<string, GlbRoleLook>, cutAboveY?: number): SkinnedMesh[] {
  const out: SkinnedMesh[] = [];
  for (const [role, src0] of model.roles) {
    const rl = look[role] ?? look.main;
    if (!rl) continue;
    const key = `${model.name}/${role}/${mode}${bone ?? ''}`;
    const src = adapt(base, key, src0, body);
    const fit = mode === 'bone' ? fitToBone(base, key, src, body, bone ?? 'J_Bip_C_Head') : mode === 'foot' ? fitFoot(base, key, src, body) : fitToBody(base, key, src, body);
    // Lage, Normale, UV und Dreiecksliste teilen sich alle Figuren; Gewichte hängen am Modell und der Grundfigur
    const geo = new BufferGeometry();
    geo.setAttribute('position', src.attributes.position);
    geo.setAttribute('normal', src.attributes.normal);
    if (src.attributes.uv) geo.setAttribute('uv', src.attributes.uv);
    geo.setAttribute('skinIndex', fit.skinIndex);
    geo.setAttribute('skinWeight', fit.skinWeight);
    // Haare unter einem Hut: Dreiecke über dem Hutrand weglassen (eigene Liste, wird mit der Figur freigegeben)
    let own = false;
    if (cutAboveY !== undefined && src.index) {
      const lim = mappedY(body, cutAboveY), p = src.attributes.position, ix = src.index, keep: number[] = [];
      for (let t = 0; t < ix.count; t += 3) {
        const a = ix.getX(t), b = ix.getX(t + 1), c = ix.getX(t + 2);
        if (!(p.getY(a) > lim && p.getY(b) > lim && p.getY(c) > lim)) keep.push(a, b, c);
      }
      geo.setIndex(new BufferAttribute(p.count > 65535 ? Uint32Array.from(keep) : Uint16Array.from(keep), 1));
      own = true;
    } else geo.setIndex(src.index);
    geo.boundingSphere = (src.boundingSphere ?? (src.computeBoundingSphere(), src.boundingSphere))!;
    const m = new SkinnedMesh(geo, finishMat(rl.finish, rl.color, role === 'skin' ? { surface: 'skin' } : {}));
    m.bind(body.skeleton, body.bindMatrix);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.glbRole = role;
    m.userData.ownIndex = own;
    out.push(m);
  }
  return out;
}

/** Starres Modell (Waffe) als Gruppe: Ursprung an der Handhalterung, Klinge entlang +Y */
export function buildHeld(model: GlbModel, look: Record<string, GlbRoleLook>): Group {
  const g = new Group();
  for (const [role, src] of model.roles) {
    const rl = look[role] ?? look.main;
    if (!rl) continue;
    const m = new Mesh(src, finishMat(rl.finish, rl.color));
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

/** Freigeben, was eine Figur an Modell-Netzen besitzt: Lage, Normale, UV, Liste und Gewichte gehören dem Modell */
export function releaseSkinned(m: SkinnedMesh) {
  const g = m.geometry;
  for (const k of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) g.deleteAttribute(k);
  g.setIndex(null);
  g.dispose();
}

void Vector3;
