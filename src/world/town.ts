import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { IslandDef } from '../data/regions';
import { addOutlines } from '../render/outline';
import { toon } from '../render/toon';
import type { WalkIsland } from './islandGround';

const WALLS = ['#F3E6C8', '#E8D2A8', '#D9E4E8', '#F0D8C8', '#E0E8D0'];
const ROOFS = ['#A8322A', '#1F4E79', '#2F6E4F', '#8A5A2B', '#7A1F1A', '#3A6E8C'];

export interface TownBuild {
  group: Group;
  /** Fenster und Laternen leuchten nachts */
  lights: Mesh[];
  crystal: Mesh | null;
  smoke: Vector3[];
}

/** Gebäude: Wände, Satteldach, Tür, Fenster, Fundament */
function house(w: number, d: number, h: number, wall: string, roof: string, windowMat: Material, lights: Mesh[], sign?: string): Group {
  const g = new Group();
  const base = new Mesh(new BoxGeometry(w + 0.4, 3, d + 0.4), toon('#9A8A70'));
  base.position.y = -1.3;
  const walls = new Mesh(new BoxGeometry(w, h, d), toon(wall));
  walls.position.y = h / 2;
  const beams = toon('#6A4426');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const b = new Mesh(new BoxGeometry(0.3, h, 0.3), beams);
    b.position.set(sx * w / 2, h / 2, sz * d / 2);
    g.add(b);
  }
  // Satteldach als Prisma
  const roofGeo = new CylinderGeometry(0.01, 1, 1, 4, 1).rotateY(Math.PI / 4);
  const roofMesh = new Mesh(roofGeo, toon(roof));
  roofMesh.scale.set(w * 0.78, h * 0.55, d * 0.78);
  roofMesh.position.y = h + h * 0.27;
  const door = new Mesh(new BoxGeometry(1.2, 2.1, 0.12), toon('#5A3A22'));
  door.position.set(0, 1.05, d / 2 + 0.03);
  g.add(base, walls, roofMesh, door);
  const nWin = Math.max(1, Math.floor(w / 3));
  for (let i = 0; i < nWin; i++) {
    for (const side of [1, -1]) {
      const win = new Mesh(new PlaneGeometry(0.8, 0.8), windowMat);
      const x = (i - (nWin - 1) / 2) * 2.4 + (side > 0 && nWin === 1 ? 1.6 : 0);
      win.position.set(side > 0 && Math.abs(x) < 1 ? x + 1.6 : x, h * 0.62, side * (d / 2 + 0.02));
      if (side < 0) win.rotation.y = Math.PI;
      win.userData.noOutline = true;
      g.add(win);
      lights.push(win);
    }
  }
  if (sign) {
    const board = new Mesh(new BoxGeometry(2.4, 0.7, 0.1), toon(sign));
    board.position.set(0, 2.7, d / 2 + 0.25);
    g.add(board);
  }
  return g;
}

function lantern(lampMat: Material, lights: Mesh[]): Group {
  const g = new Group();
  const post = new Mesh(new CylinderGeometry(0.08, 0.1, 3, 6), toon('#3A2A1E'));
  post.position.y = 1.5;
  const arm = new Mesh(new BoxGeometry(0.7, 0.08, 0.08), toon('#3A2A1E'));
  arm.position.set(0.3, 2.9, 0);
  const lamp = new Mesh(new SphereGeometry(0.22, 10, 8), lampMat);
  lamp.position.set(0.6, 2.7, 0);
  lamp.userData.noOutline = true;
  lights.push(lamp);
  g.add(post, arm, lamp);
  return g;
}

/** Baut Ankerglück auf der Stadtinsel. Liefert die Gruppe und trägt Hindernisse in die Insel ein. */
export function buildTown(def: IslandDef, walk: WalkIsland, groundAt: (x: number, z: number) => number): TownBuild {
  const group = new Group();
  const lights: Mesh[] = [];
  const smoke: Vector3[] = [];
  const windowMat = new MeshBasicMaterial({ color: new Color(2.6, 1.8, 0.7) });
  const lampMat = new MeshBasicMaterial({ color: new Color(4, 2.6, 1) });
  const cx = def.x, cz = def.z;
  const place = (o: Group | Mesh, x: number, z: number, yaw: number, blockR: number) => {
    const wx = cx + x, wz = cz + z;
    o.position.set(wx, groundAt(wx, wz), wz);
    o.rotation.y = yaw;
    group.add(o);
    if (blockR > 0) walk.blockers.push({ x: wx, z: wz, r: blockR });
  };
  const face = (x: number, z: number) => Math.atan2(-x, -z); // Tür zur Platzmitte

  // Steg nach Süden
  const pier = new Group();
  const plank = new Mesh(new BoxGeometry(5, 0.3, 46), toon('#A8804E'));
  plank.position.set(0, 1.5, 0);
  pier.add(plank);
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) {
    const post = new Mesh(new CylinderGeometry(0.22, 0.25, 5, 6), toon('#5A3A22'));
    post.position.set(s * 2.4, -0.8, -21 + i * 5.2);
    pier.add(post);
  }
  pier.position.set(cx, 0, cz - def.r - 18);
  group.add(pier);
  for (let i = 0; i < 4; i++) {
    const crate = new Mesh(new BoxGeometry(1.1, 1.1, 1.1), toon('#8A5A2B'));
    crate.position.set(cx + (i % 2 ? 1.6 : -1.6), 2.2, cz - def.r - 4 - i * 6);
    crate.rotation.y = i;
    group.add(crate);
  }

  // Wichtige Gebäude
  place(house(12, 10, 5.5, '#E8D2A8', '#7A1F1A', windowMat, lights, '#A8322A'), -40, -2, Math.PI / 2, 7.5); // Taverne
  place(house(8, 7, 4.2, '#D9E4E8', '#1F4E79', windowMat, lights, '#1F4E79'), -16, -60, Math.PI, 5); // Hafenmeisterei
  const smithy = house(9, 8, 4.5, '#C8B8A0', '#3A3A44', windowMat, lights, '#5A4A3A');
  const chimney = new Mesh(new BoxGeometry(1.2, 4, 1.2), toon('#7A6A5A'));
  chimney.position.set(3, 6, -2);
  const forge = new Mesh(new SphereGeometry(0.7, 10, 8), new MeshBasicMaterial({ color: new Color(5, 1.6, 0.3) }));
  forge.position.set(-3, 1, 5);
  forge.userData.noOutline = true;
  const anvil = new Mesh(new BoxGeometry(1.2, 0.8, 0.6), toon({ color: '#3A3A44', spec: 1 }));
  anvil.position.set(-1, 0.4, 6);
  smithy.add(chimney, forge, anvil);
  place(smithy, 38, 14, -Math.PI / 2, 6);
  smoke.push(new Vector3(cx + 38 - 2, groundAt(cx + 38, cz + 14) + 8, cz + 14 + 3));

  // Werft: Schiffsgerippe und Kran
  const yard = new Group();
  for (let i = 0; i < 7; i++) {
    const rib = new Mesh(new TorusGeometry(3, 0.18, 4, 10, Math.PI), toon('#8A5A2B'));
    rib.rotation.z = Math.PI;
    rib.position.set(0, 3.2, -6 + i * 2);
    yard.add(rib);
  }
  const keel = new Mesh(new BoxGeometry(0.4, 0.4, 14), toon('#6A4426'));
  keel.position.y = 0.3;
  const crane = new Mesh(new BoxGeometry(0.5, 9, 0.5), toon('#5A3A22'));
  crane.position.set(5, 4.5, 0);
  const boom = new Mesh(new BoxGeometry(6, 0.4, 0.4), toon('#5A3A22'));
  boom.position.set(2.5, 9, 0);
  yard.add(keel, crane, boom);
  place(yard, 52, -26, 0.3, 7);

  // Markt mit Ständen
  for (let i = 0; i < 4; i++) {
    const stall = new Group();
    const table = new Mesh(new BoxGeometry(3, 1, 1.6), toon('#8A5A2B'));
    table.position.y = 0.5;
    const awning = new Mesh(new BoxGeometry(3.6, 0.15, 2.4), toon(ROOFS[i % ROOFS.length]));
    awning.position.y = 2.6;
    awning.rotation.x = 0.2;
    for (const s of [-1, 1]) { const p = new Mesh(new CylinderGeometry(0.07, 0.07, 2.6, 6), toon('#5A3A22')); p.position.set(s * 1.6, 1.3, -0.9); stall.add(p); }
    for (let k = 0; k < 3; k++) { const goods = new Mesh(new SphereGeometry(0.25, 8, 6), toon(['#E8B33A', '#A8322A', '#6E8B3D'][k])); goods.position.set(-0.9 + k * 0.9, 1.15, 0); stall.add(goods); }
    stall.add(table, awning);
    const a = -0.6 + i * 0.4;
    place(stall, Math.sin(a) * 26, 26 + Math.cos(a) * 2, Math.PI + a, 2);
  }

  // Faji-Schrein mit schwebendem Kristall
  const shrine = new Group();
  const plat = new Mesh(new CylinderGeometry(5, 5.6, 0.8, 16), toon('#D8D0C0'));
  plat.position.y = 0.4;
  shrine.add(plat);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pillar = new Mesh(new CylinderGeometry(0.35, 0.45, 5, 8), toon('#E8E2D4'));
    pillar.position.set(Math.cos(a) * 3.6, 3.2, Math.sin(a) * 3.6);
    const cap = new Mesh(new BoxGeometry(1.1, 0.4, 1.1), toon({ color: '#E3B04B', spec: 1 }));
    cap.position.set(Math.cos(a) * 3.6, 5.8, Math.sin(a) * 3.6);
    shrine.add(pillar, cap);
  }
  const crystal = new Mesh(new OctahedronGeometry(1.1, 0), new MeshBasicMaterial({ color: new Color(1.8, 1.0, 3.2) }));
  crystal.position.y = 4;
  crystal.userData.noOutline = true;
  shrine.add(crystal);
  place(shrine, 0, 62, 0, 5.5);

  // Brunnen auf dem Platz
  const fountain = new Group();
  const basin = new Mesh(new CylinderGeometry(3, 3.3, 0.9, 20), toon('#C8C0B0'));
  basin.position.y = 0.45;
  const water = new Mesh(new CylinderGeometry(2.7, 2.7, 0.1, 20), toon('#33C4D2'));
  water.position.y = 0.85;
  water.userData.noOutline = true;
  const column = new Mesh(new CylinderGeometry(0.35, 0.5, 2.6, 10), toon('#C8C0B0'));
  column.position.y = 1.6;
  fountain.add(basin, water, column);
  place(fountain, 0, 2, 0, 3.4);

  // Wohnhäuser rundherum
  const spots: [number, number][] = [[-30, 34], [-50, 22], [-56, -24], [-30, -34], [24, 44], [46, 40], [58, 2], [22, -40], [-12, 46], [12, 66], [-34, 56], [36, 60]];
  spots.forEach(([x, z], i) => {
    const w = 6 + (i % 3) * 1.5, d = 5 + (i % 2) * 1.5;
    place(house(w, d, 3.6 + (i % 2), WALLS[i % WALLS.length], ROOFS[(i * 3) % ROOFS.length], windowMat, lights), x, z, face(x, z), Math.max(w, d) * 0.6);
  });

  // Laternen am Weg vom Steg zum Platz und um den Platz
  for (const [x, z] of [[-4, -70], [4, -55], [-4, -40], [4, -25], [-10, -10], [10, -10], [-12, 14], [12, 14], [-6, 44], [6, 52]]) {
    place(lantern(lampMat, lights), x, z, 0, 0.3);
  }
  // Fässer und Kisten als Leben
  for (let i = 0; i < 10; i++) {
    const a = i * 2.3;
    const barrel = new Mesh(new CylinderGeometry(0.45, 0.4, 1, 10), toon('#8A5A2B'));
    const x = Math.cos(a) * (18 + (i % 4) * 6), z = Math.sin(a) * (18 + (i % 4) * 6);
    barrel.position.set(cx + x, groundAt(cx + x, cz + z) + 0.5, cz + z);
    group.add(barrel);
    walk.blockers.push({ x: cx + x, z: cz + z, r: 0.5 });
  }

  mergeByMaterial(group, new Set([crystal, forge]));
  // Fenster und Laternen: je ein zusammengefasstes Mesh, ohne Kontur und Schatten
  const glow = group.children.filter((c) => (c as Mesh).isMesh && ((c as Mesh).material === windowMat || (c as Mesh).material === lampMat)) as Mesh[];
  for (const m of glow) { m.userData.noOutline = true; m.castShadow = false; m.receiveShadow = false; }
  for (const m of [crystal, forge]) m.userData.noOutline = true;
  addOutlines(group);
  return { group, lights: glow, crystal, smoke };
}

/** Statische Teile pro Material zusammenfassen (wenige Zeichenaufrufe) */
export function mergeByMaterial(group: Group, keep: Set<Mesh>) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const rel = (m: Mesh) => inv.clone().multiply(m.matrixWorld);
  const buckets = new Map<Material, { geos: BufferGeometry[]; meshes: Mesh[] }>();
  group.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || keep.has(m) || Array.isArray(m.material)) return;
    const b = buckets.get(m.material as Material) ?? { geos: [], meshes: [] };
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g = g.applyMatrix4(rel(m));
    b.geos.push(g);
    b.meshes.push(m);
    buckets.set(m.material as Material, b);
  });
  const kept: Mesh[] = [];
  group.traverse((o) => { if (keep.has(o as Mesh)) kept.push(o as Mesh); });
  for (const [mat, b] of buckets) {
    if (b.meshes.length < 2) continue;
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    for (const m of b.meshes) m.removeFromParent();
    const mesh = new Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // Behaltene Meshes in Weltkoordinaten direkt an die Gruppe hängen
  for (const m of kept) {
    m.updateMatrixWorld(true);
    const wp = new Vector3(), ws = new Vector3();
    rel(m).decompose(wp, m.quaternion, ws);
    m.removeFromParent();
    m.position.copy(wp);
    m.scale.copy(ws);
    group.add(m);
  }
  for (const c of [...group.children]) if (!(c as Mesh).isMesh && c.children.length === 0) c.removeFromParent();
}
