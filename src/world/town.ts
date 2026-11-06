import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  RepeatWrapping,
  SRGBColorSpace,
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
import { crateTexture, deckUV, plankTexture } from '../render/textures';
import { detailCanvas, texDetail } from '../render/texDetail';
import type { WalkIsland } from './islandGround';

// verwitterter Putz und satte, gedeckte Dachfarben (Hafenstadt, kein Ferienort)
const WALLS = ['#E2D6BC', '#D4BF9A', '#C9CFD0', '#DCC4B0', '#CDD2BE'];
const ROOFS = ['#8E2E26', '#2A4766', '#365C46', '#6E4A2A', '#5E2420', '#3E5E74'];

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

/** Handkarren mit zwei Rädern */
function cart(): Group {
  const g = new Group();
  const wood = toon('#7A5232');
  const bed = new Mesh(new BoxGeometry(1.4, 0.5, 2.2), wood);
  bed.position.y = 0.85;
  for (const s of [-1, 1]) {
    const wheel = new Mesh(new CylinderGeometry(0.55, 0.55, 0.12, 12), toon('#4A3220'));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(s * 0.8, 0.55, 0.2);
    g.add(wheel);
  }
  const shaft = new Mesh(new BoxGeometry(0.1, 0.1, 1.8), wood);
  shaft.position.set(0, 0.7, 1.8);
  const load = new Mesh(new BoxGeometry(1, 0.6, 1), toon('#C9A66B'));
  load.position.set(0, 1.4, -0.3);
  load.rotation.y = 0.3;
  g.add(bed, shaft, load);
  return g;
}

/** Kisten und Fässer, gestapelt */
function crateStack(seed: number): Group {
  const g = new Group();
  const crate = toon({ color: '#9A6A3A', map: crateTexture() }), barrel = toon({ color: '#7A5030', map: plankTexture() });
  const n = 2 + (seed % 3);
  for (let i = 0; i < n; i++) {
    const c = new Mesh(new BoxGeometry(0.95, 0.95, 0.95), crate);
    c.position.set((i % 2) * 1.0 - 0.5, 0.48 + Math.floor(i / 2) * 0.95, (i % 3) * 0.2);
    c.rotation.y = (seed + i) * 0.4;
    g.add(c);
  }
  const b = new Mesh(new CylinderGeometry(0.42, 0.38, 1, 10), barrel);
  b.position.set(1.2, 0.5, -0.4);
  g.add(b);
  return g;
}

/** Niedriger Holzzaun */
function fence(len: number): Group {
  const g = new Group();
  const wood = toon('#8A6A44');
  const n = Math.round(len / 1.4);
  for (let i = 0; i <= n; i++) {
    const p = new Mesh(new BoxGeometry(0.14, 1.1, 0.14), wood);
    p.position.set(-len / 2 + (i / n) * len, 0.55, 0);
    g.add(p);
  }
  for (const y of [0.45, 0.85]) {
    const rail = new Mesh(new BoxGeometry(len, 0.1, 0.08), wood);
    rail.position.y = y;
    g.add(rail);
  }
  return g;
}

/** Busch aus ein paar Kugeln */
function bush(seed: number): Group {
  const g = new Group();
  const leaf = toon({ color: seed % 2 ? '#3F7A3A' : '#4E8A3E', flatShading: true });
  for (let i = 0; i < 3; i++) {
    const s = 0.6 + ((seed * 7 + i * 3) % 5) * 0.12;
    const m = new Mesh(new SphereGeometry(s, 7, 5), leaf);
    m.position.set((i - 1) * 0.55, s * 0.7, (i % 2) * 0.4);
    g.add(m);
  }
  return g;
}

/** Wimpelleine zwischen zwei Punkten (bunte Dreiecke an einer durchhängenden Leine) */
function bunting(a: Vector3, b: Vector3): Group {
  const g = new Group();
  const cols = ['#8E2E26', '#C99A3E', '#2A4766', '#DCD0B4'];
  const n = Math.max(4, Math.round(a.distanceTo(b) / 0.9));
  const at = (t: number) => a.clone().lerp(b, t).add(new Vector3(0, -Math.sin(t * Math.PI) * 0.9, 0));
  const dir = b.clone().sub(a).setY(0).normalize();
  const tris: number[][] = cols.map(() => []);
  for (let i = 0; i < n; i++) {
    const p = at((i + 0.5) / n);
    const w = 0.32;
    tris[i % cols.length].push(p.x - dir.x * w, p.y, p.z - dir.z * w, p.x + dir.x * w, p.y, p.z + dir.z * w, p.x, p.y - 0.55, p.z);
  }
  cols.forEach((c, k) => {
    if (!tris[k].length) return;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(tris[k], 3));
    geo.computeVertexNormals();
    const m = new Mesh(geo, toon({ color: c, side: DoubleSide }));
    m.userData.noOutline = true;
    g.add(m);
  });
  // Leine aus kurzen Stücken
  const rope = toon('#3A2A1E');
  for (let i = 0; i < 8; i++) {
    const p0 = at(i / 8), p1 = at((i + 1) / 8);
    const seg = new Mesh(new CylinderGeometry(0.025, 0.025, p0.distanceTo(p1), 4), rope);
    seg.position.copy(p0).lerp(p1, 0.5);
    seg.lookAt(p1);
    seg.rotateX(Math.PI / 2);
    seg.userData.noOutline = true;
    g.add(seg);
  }
  return g;
}

/** Fahnenmast mit Wimpel */
function flagPole(col: string): Group {
  const g = new Group();
  const pole = new Mesh(new CylinderGeometry(0.08, 0.1, 7, 6), toon('#4A3220'));
  pole.position.y = 3.5;
  const cloth = new Mesh(new PlaneGeometry(1.8, 1.1), toon({ color: col, side: DoubleSide }));
  cloth.position.set(0.95, 6.3, 0);
  cloth.userData.noOutline = true;
  const knob = new Mesh(new SphereGeometry(0.14, 8, 6), toon({ color: '#E3B04B', spec: 1 }));
  knob.position.y = 7.05;
  g.add(pole, cloth, knob);
  return g;
}

let cobbleTex: CanvasTexture | null = null;
/** Kopfsteinpflaster: unregelmäßige Steine mit dunklen Fugen (Graustufen, über die Farbe getönt) */
function cobbleTexture(): CanvasTexture {
  if (cobbleTex) return cobbleTex;
  const { c, g } = detailCanvas(256, 256);
  // dunkle Fugen, dicht gesetzte, unregelmäßig eckige Steine mit wenig Kontrast
  g.fillStyle = '#9a9288';
  g.fillRect(0, 0, 256, 256);
  let s = 11;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const rows = 10, cols = 8, cw = 256 / cols, rh = 256 / rows;
  for (let y = 0; y < rows; y++) for (let x = -1; x < cols; x++) {
    const ox = (y % 2) * cw * 0.5;
    const v = Math.round(196 + r() * 40);
    g.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
    const x0 = x * cw + ox + 1.5, y0 = y * rh + 1.5, w = cw - 3, h = rh - 3;
    g.beginPath();
    g.moveTo(x0 + r() * 3, y0 + r() * 2);
    g.lineTo(x0 + w - r() * 3, y0 + r() * 2);
    g.lineTo(x0 + w - r() * 2, y0 + h - r() * 3);
    g.lineTo(x0 + r() * 2, y0 + h - r() * 3);
    g.closePath();
    g.fill();
    // leichte Abnutzung oben hell, unten dunkler
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(x0 + 2, y0 + 1, w - 4, 3);
  }
  cobbleTex = new CanvasTexture(c);
  cobbleTex.wrapS = cobbleTex.wrapT = RepeatWrapping;
  cobbleTex.colorSpace = SRGBColorSpace;
  cobbleTex.anisotropy = texDetail.aniso;
  return cobbleTex;
}

/** Straße als Band, das dem Boden folgt */
function roadMesh(pts: [number, number][], width: number, cx: number, cz: number, groundAt: (x: number, z: number) => number, mat: Material): Mesh {
  // Punkte alle 1,2 m, drei Stützreihen quer – so schaut kein Hügel durch die Mitte
  const path: { x: number; z: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2));
    for (let k = 0; k < n; k++) path.push({ x: ax + (bx - ax) * (k / n), z: az + (bz - az) * (k / n) });
  }
  path.push({ x: pts[pts.length - 1][0], z: pts[pts.length - 1][1] });
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let along = 0;
  path.forEach((p, i) => {
    const q = path[Math.min(path.length - 1, i + 1)], o = path[Math.max(0, i - 1)];
    const dx = q.x - o.x, dz = q.z - o.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    if (i > 0) along += Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z);
    for (const s of [-1, 0, 1]) {
      // Ränder leicht unregelmäßig, damit es nicht wie ein Lineal aussieht
      const w = width / 2 * (1 + Math.sin(along * 0.7 + s) * 0.08);
      const x = cx + p.x + nx * w * s, z = cz + p.z + nz * w * s;
      pos.push(x, groundAt(x, z) + 0.09, z);
      uv.push((s + 1) / 2 * width / 3, along / 3);
    }
    if (i > 0) {
      const b = i * 3, a = b - 3;
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new Mesh(geo, mat);
  m.receiveShadow = true;
  m.userData.noOutline = true;
  return m;
}

/** Runder gepflasterter Platz */
function plazaMesh(r: number, cx: number, cz: number, groundAt: (x: number, z: number) => number, mat: Material): Mesh {
  const rings = 8, segs = 40;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= rings; i++) for (let j = 0; j <= segs; j++) {
    const rr = (i / rings) * r, a = (j / segs) * Math.PI * 2;
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    pos.push(x, groundAt(x, z) + 0.08, z);
    uv.push((x - cx) / 3, (z - cz) / 3);
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = i * (segs + 1) + j, b = a + segs + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new Mesh(geo, mat);
  m.receiveShadow = true;
  m.userData.noOutline = true;
  return m;
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
  const deck = new BoxGeometry(5, 0.3, 46);
  deckUV(deck, 5, 46);
  const plank = new Mesh(deck, toon({ color: '#B08A58', map: plankTexture() }));
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
    const crate = new Mesh(new BoxGeometry(1.1, 1.1, 1.1), toon({ color: '#9A6A3A', map: crateTexture() }));
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

  // ---------- Straßen, zweite Häuserreihe und Leben in den Gassen ----------
  const roads: [number, number][][] = [
    [[0, -def.r + 4], [0, -36], [-3, -14], [0, 0]],          // vom Steg zum Platz
    [[0, 0], [2, 20], [0, 40], [0, 56]],                       // zum Schrein
    [[0, 0], [-16, -1], [-33, -2]],                            // zur Taverne
    [[0, 0], [16, 6], [30, 14]],                               // zur Schmiede
    [[0, -36], [22, -30], [44, -26]],                          // zur Werft
    [[0, -36], [-10, -48], [-14, -54]],                        // zur Hafenmeisterei
  ];
  const segDist = (x: number, z: number) => {
    let best = Infinity;
    for (const road of roads) for (let i = 0; i < road.length - 1; i++) {
      const [ax, az] = road[i], [bx, bz] = road[i + 1];
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
      best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
    }
    return best;
  };
  // Plätze, die frei bleiben müssen: Händler, Puppen, Schrein, Markt, Werft, bestehende Häuser
  const taken: [number, number, number][] = [
    [-26, -2, 6], [26, 14, 6], [4, 26, 6], [0, 52, 6], [40, -26, 6], [-10, -52, 6], [14, -60, 6],
    [-40, -2, 9], [-16, -60, 7], [38, 14, 8], [52, -26, 11], [0, 62, 9], [0, 27, 15], [0, 0, 17], [0, -43, 11],
    ...spots.map(([x, z]) => [x, z, 9] as [number, number, number]),
  ];
  const free = (x: number, z: number, r: number) => Math.hypot(x, z) < def.r * 0.78 && segDist(x, z) > r + 3.2 && taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) > tr + r);
  let hi = 0;
  for (const rad of [22, 32, 44, 54]) {
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2 + rad * 0.13;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      const w = 6.5 + (hi % 3) * 1.4, d = 5.5 + (hi % 2) * 1.6;
      const r = Math.max(w, d) * 0.62;
      if (!free(x, z, r)) continue;
      // Tür zur nächsten Straße statt stur zur Platzmitte
      place(house(w, d, 4.4 + (hi % 3) * 0.9, WALLS[(hi + 2) % WALLS.length], ROOFS[(hi * 5 + 1) % ROOFS.length], windowMat, lights, hi % 4 === 0 ? ROOFS[hi % ROOFS.length] : undefined), x, z, face(x, z), r);
      taken.push([x, z, r + 2]);
      // vor der Tür: Kisten, Fässer oder ein Karren
      const fx = x - Math.sin(face(x, z)) * -(d / 2 + 1.6), fz = z - Math.cos(face(x, z)) * -(d / 2 + 1.6);
      const side = (hi % 2 ? 1 : -1) * (w / 2 - 0.6);
      const px = fx + Math.cos(face(x, z)) * side, pz = fz - Math.sin(face(x, z)) * side;
      if (hi % 3 === 0) place(cart(), px, pz, face(x, z) + 1.2, 1.2);
      else place(crateStack(hi), px, pz, hi, 0.9);
      hi++;
    }
  }
  // Zäune und Büsche an manchen Häusern, Kistenstapel am Steg
  for (let i = 0; i < spots.length; i += 2) {
    const [x, z] = spots[i];
    const a = face(x, z);
    place(fence(7), x + Math.sin(a) * 5.5 + Math.cos(a) * 4, z + Math.cos(a) * 5.5 - Math.sin(a) * 4, a + Math.PI / 2, 0);
  }
  for (let i = 0; i < 18; i++) {
    const a = i * 2.17, rad = 14 + (i * 7) % 46;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (free(x, z, 1)) { place(bush(i), x, z, a, 0); taken.push([x, z, 2]); }
  }
  place(crateStack(1), -3.4, -def.r + 8, 0.3, 1);
  place(crateStack(4), 3.6, -def.r + 12, 1.1, 1);
  // Wimpelleinen über der Hauptstraße, Fahnen am Platz
  for (const [ax, az, bx, bz] of [[-4, -40, 4, -25], [-4, -40, 4, -55], [-10, -10, 10, -10], [-12, 14, 12, 14]] as const) {
    group.add(bunting(new Vector3(cx + ax, groundAt(cx + ax, cz + az) + 2.85, cz + az), new Vector3(cx + bx, groundAt(cx + bx, cz + bz) + 2.85, cz + bz)));
  }
  for (const [x, z, col] of [[-15, 10, '#A8322A'], [15, -9, '#1F4E79'], [-9, -15, '#E3B04B']] as const) place(flagPole(col), x, z, 0.6, 0.3);

  mergeByMaterial(group, new Set([crystal, forge]));
  // Fenster und Laternen: je ein zusammengefasstes Mesh, ohne Kontur und Schatten
  const glow = group.children.filter((c) => (c as Mesh).isMesh && ((c as Mesh).material === windowMat || (c as Mesh).material === lampMat)) as Mesh[];
  for (const m of glow) { m.userData.noOutline = true; m.castShadow = false; m.receiveShadow = false; }
  for (const m of [crystal, forge]) m.userData.noOutline = true;
  addOutlines(group);
  // Straßen und Platz erst nach dem Zusammenfassen (brauchen ihre Texturkoordinaten)
  const cobble = toon({ color: '#A89C88', map: cobbleTexture(), side: DoubleSide });
  for (const road of roads) group.add(roadMesh(road, 5.2, cx, cz, groundAt, cobble));
  group.add(plazaMesh(16, cx, cz, groundAt, cobble));
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
    // Texturkoordinaten nur behalten, wenn das Material eine Textur hat (Kisten, Fässer)
    const keepUv = !!(m.material as Material & { map?: unknown }).map && !!g.attributes.uv;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(keepUv && k === 'uv')) g.deleteAttribute(k);
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
