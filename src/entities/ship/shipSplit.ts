// Phase 4.6B – echte Schiffs-Zweiteilung durch Kataklysmus-Ultimates (Himmelsspalter, Klingen-Zyklon, Iaijutsu, Schwarzes Loch).
// Ohne CSG und ohne neue Shader: jedes große Netz wird entlang einer Schnittebene in zwei Index-Puffer zerlegt (die Eckpunkt-Daten teilen sich
// beide Hälften), kleine Teile und Instanz-Netze wandern ganz auf ihre Seite. Die Hälften hängen an zwei Drehpunkt-Gruppen im Modell; das
// Schiff versinkt wie gewohnt (Ship.render), die Hälften kippen dabei nach innen weg (Bug und Heck), rollen auseinander (der Länge nach),
// gleiten am Schnitt ab (diagonal) oder trudeln in den Abgrund (radial). Materialien bleiben dieselben (gleiche Programme).
import { Box3, BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, Vector3, type Object3D, type ShaderMaterial } from 'three';
import { addOutlines } from '../../render/outline';
import { disposeGeometry } from '../../render/dispose';
import type { ShipCut } from '../../data/actionKit';

export type { ShipCut };

/** Zustand einer Zweiteilung (nur Darstellung) */
export interface ShipSplit {
  cut: Exclude<ShipCut, ''>;
  /** Zeit seit dem Schnitt (s) */
  t: number;
  /** Hälfte A (Bug / Backbord / oberhalb des Schnitts) und B */
  a: Group;
  b: Group;
  /** Schiffslänge und -breite, Deckshöhe über der Wasserlinie (Drehpunkt und diagonaler Schnitt) */
  L: number;
  W: number;
  deckY: number;
  /** Ebene im Schiffsraum: Normale und Abstand */
  nx: number; ny: number; nz: number;
  /** Drehsinn (zufällig je Schiff, deterministisch aus dem Startwert) */
  spin: number;
  /** Anzahl Teile je Seite (Prüfungen) */
  partsA: number;
  partsB: number;
  /** in Dreiecken zerlegte Netze (Prüfungen) */
  sliced: number;
}

const _inv = new Matrix4();
const _rel = new Matrix4();
const _m = new Matrix4();
const _v = new Vector3();
const _box = new Box3();
const _c = new Vector3();
const _s = new Vector3();

/** Schnittebene je Art (Schiffsraum: +Z Bug, +X Backbord, +Y oben) */
export function cutPlane(cut: Exclude<ShipCut, ''>): { nx: number; ny: number; nz: number } {
  switch (cut) {
    case 'length': return { nx: 1, ny: 0, nz: 0 };
    // schräger Schnitt von oben-achtern nach unten-vorn: die obere Hälfte gleitet am Schnitt ab
    case 'diagonal': { const l = Math.hypot(1, 0.8); return { nx: 0, ny: 1 / l, nz: 0.8 / l }; }
    case 'cross': case 'radial': default: return { nx: 0, ny: 0, nz: 1 };
  }
}

/** Seite eines Punkts (Schiffsraum) zur Ebene durch den Ursprung bei Höhe y0 */
const sideOf = (x: number, y: number, z: number, nx: number, ny: number, nz: number, y0: number) => nx * x + ny * (y - y0) + nz * z;

function hasOutlineChild(m: Object3D): ShaderMaterial | null {
  for (const c of m.children) {
    const mat = (c as Mesh).material as ShaderMaterial | undefined;
    if (mat && !Array.isArray(mat) && (mat.userData as { outline?: boolean }).outline) return mat;
  }
  return null;
}

/** Kontur-Kinder eines Netzes auf eine neue Geometrie bzw. Anzahl setzen */
function retargetOutline(m: Mesh, geo: BufferGeometry, count = -1) {
  for (const c of m.children) {
    const cm = c as Mesh;
    const mat = cm.material as ShaderMaterial | undefined;
    if (!mat || Array.isArray(mat) || !(mat.userData as { outline?: boolean }).outline) continue;
    cm.geometry = geo;
    if (count >= 0 && (cm as InstancedMesh).isInstancedMesh) (cm as InstancedMesh).count = count;
  }
}

/** Kontur für ein neues Netz der zweiten Hälfte (gleiche Breite wie beim Original) */
function outlineLike(src: Mesh, twin: Mesh) {
  const mat = hasOutlineChild(src);
  if (!mat) return;
  twin.userData.noOutline = false;
  const w = (mat.uniforms?.uWidth?.value as number | undefined) ?? 1;
  addOutlines(twin, w);
}

/**
 * Geometrie in zwei Index-Puffer zerlegen (Dreiecke nach ihrem Schwerpunkt, im Schiffsraum über `rel`). Liefert null, wenn alles auf einer
 * Seite liegt oder die Geometrie nicht zerlegt werden kann (Morph-Ziele).
 */
function sliceGeometry(g: BufferGeometry, rel: Matrix4, nx: number, ny: number, nz: number, y0: number): [BufferGeometry, BufferGeometry] | null {
  const pos = g.getAttribute('position');
  // Gruppen zählen nur bei mehreren Materialien (der Aufrufer schließt die aus); die Hälften brauchen keine
  if (!pos || Object.keys(g.morphAttributes).length) return null;
  const idx = g.getIndex();
  const tri = idx ? idx.count / 3 : pos.count / 3;
  if (tri < 2) return null;
  const big = pos.count > 65535;
  const A = big ? new Uint32Array(tri * 3) : new Uint16Array(tri * 3);
  const B = big ? new Uint32Array(tri * 3) : new Uint16Array(tri * 3);
  let na = 0, nb = 0;
  const e = rel.elements;
  for (let t = 0; t < tri; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    // Schwerpunkt im Objektraum, dann in den Schiffsraum (affine Matrix, ohne neue Objekte)
    const px = (pos.getX(i0) + pos.getX(i1) + pos.getX(i2)) / 3;
    const py = (pos.getY(i0) + pos.getY(i1) + pos.getY(i2)) / 3;
    const pz = (pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3;
    const x = e[0] * px + e[4] * py + e[8] * pz + e[12];
    const y = e[1] * px + e[5] * py + e[9] * pz + e[13];
    const z = e[2] * px + e[6] * py + e[10] * pz + e[14];
    if (sideOf(x, y, z, nx, ny, nz, y0) >= 0) { A[na++] = i0; A[na++] = i1; A[na++] = i2; }
    else { B[nb++] = i0; B[nb++] = i1; B[nb++] = i2; }
  }
  if (!na || !nb) return null;
  const make = (arr: Uint16Array | Uint32Array, n: number) => {
    const h = new BufferGeometry();
    for (const name in g.attributes) h.setAttribute(name, g.attributes[name]);
    h.setIndex(new BufferAttribute(arr.slice(0, n), 1));
    h.boundingBox = null;
    h.computeBoundingSphere();
    return h;
  };
  return [make(A, na), make(B, nb)];
}

/** Instanz-Netz nach den Lagen seiner Instanzen aufteilen: A behält seine, B bekommt ein neues Netz (gleiche Geometrie, gleiches Material) */
function sliceInstanced(m: InstancedMesh, rel: Matrix4, nx: number, ny: number, nz: number, y0: number): InstancedMesh | null {
  const n = m.count;
  if (n < 2) return null;
  const keep: number[] = [], move: number[] = [];
  for (let i = 0; i < n; i++) {
    m.getMatrixAt(i, _m);
    _v.setFromMatrixPosition(_m).applyMatrix4(rel);
    (sideOf(_v.x, _v.y, _v.z, nx, ny, nz, y0) >= 0 ? keep : move).push(i);
  }
  if (!keep.length || !move.length) return null;
  const twin = new InstancedMesh(m.geometry, m.material, move.length);
  move.forEach((src, k) => {
    m.getMatrixAt(src, _m); twin.setMatrixAt(k, _m);
    if (m.instanceColor) { m.getColorAt(src, _cTmp); twin.setColorAt(k, _cTmp); }
  });
  // A rückt zusammen
  keep.forEach((src, k) => {
    if (src === k) return;
    m.getMatrixAt(src, _m); m.setMatrixAt(k, _m);
    if (m.instanceColor) { m.getColorAt(src, _cTmp); m.setColorAt(k, _cTmp); }
  });
  m.count = keep.length;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.computeBoundingSphere();
  twin.computeBoundingSphere();
  twin.castShadow = m.castShadow; twin.receiveShadow = m.receiveShadow;
  twin.frustumCulled = m.frustumCulled;
  twin.renderOrder = m.renderOrder;
  retargetOutline(m, m.geometry, m.count);
  return twin;
}
const _cTmp = new Color();

/**
 * Modell zerteilen. `root` = Modellgruppe des Schiffs (Ursprung = Schiffsmitte auf Wasserhöhe), `L`/`W` = Maße, `seed` für den Drehsinn.
 * Gibt den Zustand zurück; die Hälften hängen danach als zwei Gruppen in `root` (alles bleibt im selben Baum, nichts wird abgehängt).
 */
export function splitShipModel(root: Group, cut: Exclude<ShipCut, ''>, L: number, W: number, deckY: number, seed = 1): ShipSplit {
  const { nx, ny, nz } = cutPlane(cut);
  // diagonale Schnitte gehen durch die Mitte des Rumpfs (halbe Deckshöhe), die anderen durch die Schiffsmitte
  const y0 = cut === 'diagonal' ? deckY * 0.5 : 0;
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const a = new Group(); a.name = 'split-a';
  const b = new Group(); b.name = 'split-b';
  const st: ShipSplit = { cut, t: 0, a, b, L, W, deckY, nx, ny, nz, spin: seed % 2 ? 1 : -1, partsA: 0, partsB: 0, sliced: 0 };
  const moves: { o: Object3D; to: Group }[] = [];
  const twins: { m: Mesh; to: Group; src: Mesh; world: Matrix4 }[] = [];

  const place = (o: Object3D, to: Group) => { moves.push({ o, to }); if (to === a) st.partsA++; else st.partsB++; };

  const visit = (o: Object3D) => {
    for (const c of [...o.children]) {
      if (c === a || c === b) continue;
      const mesh = c as Mesh;
      const mat = mesh.material as { userData?: { outline?: boolean } } | undefined;
      if (mat && !Array.isArray(mat) && mat.userData?.outline) continue; // Konturen bleiben an ihrem Netz
      if ((c as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh) { placeWhole(c); continue; }
      if (mesh.isMesh) {
        _rel.multiplyMatrices(_inv, mesh.matrixWorld);
        if ((mesh as InstancedMesh).isInstancedMesh) {
          const twin = sliceInstanced(mesh as InstancedMesh, _rel, nx, ny, nz, y0);
          if (twin) { twins.push({ m: twin, to: b, src: mesh, world: mesh.matrixWorld.clone() }); place(mesh, a); st.sliced++; continue; }
          placeWhole(c);
          continue;
        }
        const g = mesh.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        _box.copy(g.boundingBox!).applyMatrix4(_rel);
        _box.getCenter(_c); _box.getSize(_s);
        const ext = Math.abs(nx) * _s.x + Math.abs(ny) * _s.y + Math.abs(nz) * _s.z;
        const d = sideOf(_c.x, _c.y, _c.z, nx, ny, nz, y0);
        // nur Netze, die der Schnitt wirklich durchquert, Dreieck für Dreieck; alles andere wandert ganz
        if (Math.abs(d) < ext * 0.42 && !Array.isArray(mesh.material)) {
          const halves = sliceGeometry(g, _rel, nx, ny, nz, y0);
          if (halves) {
            const twin = new Mesh(halves[1], mesh.material);
            twin.castShadow = mesh.castShadow; twin.receiveShadow = mesh.receiveShadow;
            twin.renderOrder = mesh.renderOrder; twin.frustumCulled = mesh.frustumCulled;
            twin.userData = { ...mesh.userData, noOutline: true };
            mesh.geometry = halves[0];
            retargetOutline(mesh, halves[0]);
            disposeGeometry(g);
            twins.push({ m: twin, to: b, src: mesh, world: mesh.matrixWorld.clone() });
            place(mesh, a);
            st.sliced++;
            continue;
          }
        }
        place(mesh, d >= 0 ? a : b);
        continue;
      }
      // Gruppen: durchquert der Schnitt sie, einzeln weiter; sonst ganz auf eine Seite
      if (c.children.length) {
        _box.setFromObject(c);
        if (_box.isEmpty()) { place(c, a); continue; }
        _box.applyMatrix4(_inv);
        _box.getCenter(_c); _box.getSize(_s);
        const ext = Math.abs(nx) * _s.x + Math.abs(ny) * _s.y + Math.abs(nz) * _s.z;
        const d = sideOf(_c.x, _c.y, _c.z, nx, ny, nz, y0);
        if (Math.abs(d) < ext * 0.42 && !hasSkinned(c)) { visit(c); continue; }
        place(c, d >= 0 ? a : b);
        continue;
      }
      placeWhole(c);
    }
  };
  // Kinder eines Netzes wandern mit ihm (Konturen, Anbauten)
  const placeWhole = (c: Object3D) => {
    c.getWorldPosition(_v).applyMatrix4(_inv);
    place(c, sideOf(_v.x, _v.y, _v.z, nx, ny, nz, y0) >= 0 ? a : b);
  };

  visit(root);
  root.add(a, b);
  a.updateMatrixWorld(true);
  b.updateMatrixWorld(true);
  // umhängen mit gleicher Weltlage (attach rechnet die lokale Matrix um)
  for (const { o, to } of moves) to.attach(o);
  for (const { m, to, src, world } of twins) {
    // der Zwilling liegt genau wie sein Original vor dem Schnitt
    to.add(m);
    _rel.copy(to.matrixWorld).invert().multiply(world);
    _rel.decompose(m.position, m.quaternion, m.scale);
    outlineLike(src, m);
    st.partsB++;
  }
  return st;
}

function hasSkinned(o: Object3D): boolean {
  let s = false;
  o.traverse((c) => { if ((c as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh) s = true; });
  return s;
}

const smooth = (k: number) => { const v = k < 0 ? 0 : k > 1 ? 1 : k; return v * v * (3 - 2 * v); };

/**
 * Je Bild: die Hälften bewegen. Bug und Heck kippen nach innen (V-Form, die Bruchstelle sackt zuerst), der Länge nach rollen sie
 * auseinander, diagonal gleitet die obere Hälfte am Schnitt ab, radial trudeln beide und schrumpfen in den Abgrund.
 */
export function updateShipSplit(st: ShipSplit, dt: number) {
  st.t += Math.max(0, Math.min(0.1, dt));
  const t = st.t;
  const a = st.a, b = st.b;
  const ky = st.deckY * 0.15;
  switch (st.cut) {
    case 'cross':
    case 'radial': {
      // Drehpunkt an der Bruchstelle über dem Kiel; Bug (A) dreht nose-up, Heck (B) ebenso nach oben
      const th = Math.min(0.95, 0.06 + t * 0.32 + t * t * 0.05) * smooth(t / 0.4);
      const gap = Math.min(st.L * 0.16, t * 1.6);
      rotX(a, -th, ky, gap);
      rotX(b, th, ky, -gap);
      if (st.cut === 'radial') {
        const sp = st.spin * t * t * 0.6;
        a.rotation.y = sp; b.rotation.y = sp;
        const k = Math.max(0.15, 1 - t * 0.16);
        a.scale.setScalar(k); b.scale.setScalar(k);
      }
      break;
    }
    case 'length': {
      const ph = Math.min(1.15, 0.05 + t * 0.36 + t * t * 0.05) * smooth(t / 0.4);
      const gap = Math.min(st.W * 0.9, t * 1.4);
      rotZ(a, -ph, ky, gap);
      rotZ(b, ph, ky, -gap);
      break;
    }
    case 'diagonal': {
      // obere Hälfte gleitet entlang der Schnittebene nach unten und kippt, die untere bleibt
      const s = Math.min(st.L * 0.35, t * t * 2.2 + t * 0.4);
      // Richtung in der Ebene, die nach unten zeigt: (0, −nz, ny)
      a.position.set(0, -st.nz * s, st.ny * s);
      a.rotation.set(Math.min(0.6, t * 0.18) * st.spin, 0, Math.min(0.4, t * 0.1) * st.spin);
      b.rotation.set(0, 0, 0);
      break;
    }
  }
}

/** Drehung um die Querachse durch (0, y, 0) samt Versatz entlang z */
function rotX(g: Group, ang: number, y: number, dz: number) {
  g.rotation.set(ang, 0, 0);
  // Position so, dass der Punkt (0, y, 0) fest bleibt: p' = R·p + t ⇒ t = (0,y,0) − R·(0,y,0)
  const c = Math.cos(ang), s = Math.sin(ang);
  g.position.set(0, y - (y * c), dz - (y * s));
}
/** Drehung um die Längsachse durch (0, y, 0) samt Versatz entlang x */
function rotZ(g: Group, ang: number, y: number, dx: number) {
  g.rotation.set(0, 0, ang);
  const c = Math.cos(ang), s = Math.sin(ang);
  g.position.set(dx + y * s, y - y * c, 0);
}
