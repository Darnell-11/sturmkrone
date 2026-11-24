import {
  BoxGeometry,
  BufferAttribute,
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
import { cloneToon, toon } from '../render/toon';
import { crateTexture, deckUV, plankTexture } from '../render/textures';
import { detailCanvas, texDetail } from '../render/texDetail';
import { boxBlocker, type WalkIsland } from './islandGround';
import { auditPlacement } from './placeAudit';
import { hasProp, propGroup } from './worldProps';
import { markShared } from '../render/dispose';
import { toonPbr } from '../render/pbrMaps';
import { waveFlag } from '../render/flags';
import { build as buildStruct, colliders as structColliders, lanternMats, levelFootprint, setYardCompact, settleYard } from './architecture';
import type { StructureType } from '../data/settlements';
import type { GlowPlaced } from '../render/glow';
import { hasArch as hasArchModel, hasArch, archGroup } from './envModels';
import { buildFountain } from './fountain';
import { clamp01 } from '../core/mathUtil';

// verwitterter Putz und satte, gedeckte Dachfarben (Hafenstadt, kein Ferienort)
const WALLS = ['#E2D6BC', '#D4BF9A', '#C9CFD0', '#DCC4B0', '#CDD2BE'];
const ROOFS = ['#8E2E26', '#2A4766', '#365C46', '#6E4A2A', '#5E2420', '#3E5E74'];

export interface TownBuild {
  group: Group;
  /** Fenster und Laternen leuchten nachts */
  lights: Mesh[];
  crystal: Mesh | null;
  smoke: Vector3[];
  /** Lichthöfe und Bodenlicht der Bauten (Inselkoordinaten) für das GlowSystem */
  glows: GlowPlaced[];
  /** Straßen in Weltkoordinaten (Mittellinie, Breite): Bewohner gehen darauf spazieren */
  streets: { pts: [number, number][]; w: number }[];
}

/** Gebäude: Wände, Satteldach, Tür, Fenster, Fundament */
function house(w: number, d: number, h: number, wall: string, roof: string, windowMat: Material, lights: Mesh[], sign?: string): Group {
  const g = new Group();
  const base = new Mesh(new BoxGeometry(w + 0.4, 3, d + 0.4), toon({ color: '#9A8A70', detail: 'stone' }));
  base.position.y = -1.3;
  const walls = new Mesh(new BoxGeometry(w, h, d), toon({ color: wall, detail: 'plaster' }));
  walls.position.y = h / 2;
  const beams = toon('#6A4426');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const b = new Mesh(new BoxGeometry(0.3, h, 0.3), beams);
    b.position.set(sx * w / 2, h / 2, sz * d / 2);
    g.add(b);
  }
  // Satteldach als Prisma
  const roofGeo = new CylinderGeometry(0.01, 1, 1, 4, 1).rotateY(Math.PI / 4);
  const roofMesh = new Mesh(roofGeo, toon({ color: roof, flatShading: true, detail: 'tile' }));
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
  const glb = hasArch('laternenpfahl');
  const lamp = new Mesh(new SphereGeometry(glb ? 0.05 : 0.22, 10, 8), lampMat);
  lamp.position.set(0.6, 2.7, 0);
  lamp.userData.noOutline = true;
  lights.push(lamp);
  if (glb) {
    // Blender-Laternenpfahl: Eisenarm, Käfig mit Glasscheiben, Messingbänder; die Kugel ist nur der Kern (und der Anker des Lichthofs)
    g.add(archGroup('laternenpfahl', lanternMats)!, lamp);
    return g;
  }
  const post = new Mesh(new CylinderGeometry(0.08, 0.1, 3, 6), toon('#3A2A1E'));
  post.position.y = 1.5;
  const arm = new Mesh(new BoxGeometry(0.7, 0.08, 0.08), toon('#3A2A1E'));
  arm.position.set(0.3, 2.9, 0);
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
  const crate = toon({ color: '#9A6A3A', map: crateTexture(), ...toonPbr(crateTexture(), { strength: 1.2, rough: 0.82, roughVar: 0.2, ao: 0.7 }) }), barrel = toon({ color: '#7A5030', map: plankTexture(), ...toonPbr(plankTexture(), { strength: 1.2, rough: 0.82, roughVar: 0.2, ao: 0.7 }) });
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
  const clothGeo = new PlaneGeometry(1.8, 1.1, 10, 3);
  clothGeo.translate(0.9, 0, 0); // Mastkante bei x = 0
  const cloth = waveFlag(new Mesh(clothGeo, toon({ color: col, side: DoubleSide })), 'x', 1.8);
  cloth.position.set(0.06, 6.3, 0);
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
  cobbleTex = markShared(new CanvasTexture(c));
  cobbleTex.wrapS = cobbleTex.wrapT = RepeatWrapping;
  cobbleTex.colorSpace = SRGBColorSpace;
  cobbleTex.anisotropy = texDetail.aniso;
  return cobbleTex;
}

let dirtTex: CanvasTexture | null = null;
/** Festgetretene Erde mit Kieseln und Spuren (Dorfwege, Ränder der Pflasterstraßen) */
function dirtTexture(): CanvasTexture {
  if (dirtTex) return dirtTex;
  const { c, g } = detailCanvas(256, 256);
  g.fillStyle = '#8c7856';
  g.fillRect(0, 0, 256, 256);
  let sd = 23;
  const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  // weiche Flecken
  for (let i = 0; i < 70; i++) {
    const x = r() * 256, y = r() * 256, rr = 10 + r() * 28;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    const dark = r() < 0.5;
    gr.addColorStop(0, dark ? 'rgba(60,44,28,0.28)' : 'rgba(200,176,132,0.26)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // Wagenspuren längs (v-Richtung): zwei dunklere Bänder
  for (const bx of [70, 186]) { const gr = g.createLinearGradient(bx - 14, 0, bx + 14, 0); gr.addColorStop(0, 'rgba(50,36,22,0)'); gr.addColorStop(0.5, 'rgba(50,36,22,0.22)'); gr.addColorStop(1, 'rgba(50,36,22,0)'); g.fillStyle = gr; g.fillRect(bx - 14, 0, 28, 256); }
  // Kiesel
  for (let i = 0; i < 160; i++) {
    const x = r() * 256, y = r() * 256, rr = 1.2 + r() * 3.2, v = Math.round(150 + r() * 70);
    g.fillStyle = `rgba(${v},${v - 8},${v - 20},0.9)`;
    g.beginPath(); g.ellipse(x, y, rr, rr * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + 0.8, y + 0.9, rr, rr * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
  }
  // feine Körnung
  for (let i = 0; i < 1800; i++) { const v = r() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},0.06)`; g.fillRect(r() * 256, r() * 256, 1.5, 1.5); }
  dirtTex = markShared(new CanvasTexture(c));
  dirtTex.wrapS = dirtTex.wrapT = RepeatWrapping;
  dirtTex.colorSpace = SRGBColorSpace;
  dirtTex.anisotropy = texDetail.aniso;
  return dirtTex;
}

/** Erdweg-Material (Dörfer, Außenposten, Wegränder); k = Tiefenschicht */
export function dirtMaterial(k = 0, tint = '#C4A676'): Material {
  const m = cloneToon(toon({ color: tint, map: dirtTexture(), side: DoubleSide, puddles: 1, ...toonPbr(dirtTexture(), { strength: 1.1, rough: 0.92, roughVar: 0.3, ao: 0.85 }) }));
  m.polygonOffset = true; m.polygonOffsetFactor = -1 - k * 0.5; m.polygonOffsetUnits = -2 - k;
  return m;
}

/** Pflaster-Material für Wege außerhalb der Stadt (Burghöfe, Dörfer); k = Tiefenschicht gegen Flackern bei Überlappung */
export function cobbleMaterial(k = 1, tint = '#A89C88'): Material {
  const m = cloneToon(toon({ color: tint, map: cobbleTexture(), side: DoubleSide, puddles: 1, ...toonPbr(cobbleTexture(), { strength: 1.6, rough: 0.7, roughVar: 0.3, ao: 0.9 }) }));
  m.polygonOffset = true; m.polygonOffsetFactor = -1 - k; m.polygonOffsetUnits = -2 - k * 2;
  return m;
}

/** Straße als Band, das dem Boden folgt */
export function roadMesh(pts: [number, number][], width: number, cx: number, cz: number, groundAt: (x: number, z: number) => number, mat: Material, lift = 0.09): Mesh {
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
      pos.push(x, groundAt(x, z) + lift, z);
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
  setYardCompact(true); // enge Höfe: nichts ragt von den Häusern in die Straße
  const group = new Group();
  const lights: Mesh[] = [];
  const smoke: Vector3[] = [];
  // Fenster liegen 2 cm vor der Wand: Tiefenverschiebung, damit sie in der Ferne nicht mit der Wand flackern
  const windowMat = new MeshBasicMaterial({ color: new Color(2.6, 1.8, 0.7), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const lampMat = new MeshBasicMaterial({ color: new Color(4, 2.6, 1) });
  const plinthMat = toon('#8E8576');
  const cx = def.x, cz = def.z;
  // Marktplatz: runde, eingeebnete Fläche (Radius 16,5) mit weichem Übergang in den Hang
  walk.addPad?.(cx, cz, 33, 33, 0, 7, true);
  /**
   * Objekt aufstellen. Kollider: Zahl = Kreisradius, [Breite, Tiefe, Versatz x, Versatz z] = gedrehtes Rechteck
   * (Häuser, Stände, Karren, Zäune: Kreise ließen Ecken frei und standen als unsichtbare Wand vor den Seiten).
   */
  /** Bodenhöhen auf einem gedrehten Rechteck (5 × 5 Proben): tiefster und höchster Punkt */
  const rectRange = (wx: number, wz: number, yaw: number, w: number, d: number, ox = 0, oz = 0) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const lx = ox + (i / 4 - 0.5) * w, lz = oz + (j / 4 - 0.5) * d;
      const h = groundAt(wx + lx * c + lz * s, wz - lx * s + lz * c);
      if (h < mn) mn = h;
      if (h > mx) mx = h;
    }
    return { mn, mx };
  };
  const place = (o: Group | Mesh, x: number, z: number, yaw: number, block: number | [number, number, number?, number?]) => {
    const wx = cx + x, wz = cz + z;
    // Größere Dinge (Stände, Schrein) stehen auf einer eingeebneten Fläche
    if (Array.isArray(block) && block[0] * block[1] >= 6) {
      const c1 = Math.cos(yaw), s1 = Math.sin(yaw), px = block[2] ?? 0, pz = block[3] ?? 0;
      walk.addPad?.(wx + px * c1 + pz * s1, wz - px * s1 + pz * c1, block[0] + 0.6, block[1] + 0.6, yaw, 2);
    }
    // Auf dem Hang steht ein Ding mit Grundfläche auf dem tiefsten Punkt darunter (nichts schwebt, nur die Bergseite steckt im Boden)
    const rr = Array.isArray(block) ? rectRange(wx, wz, yaw, block[0], block[1], block[2] ?? 0, block[3] ?? 0) : { mn: groundAt(wx, wz), mx: groundAt(wx, wz) };
    o.position.set(wx, rr.mn, wz);
    o.rotation.y = yaw;
    auditPlacement?.('ankerglueck', 'place', o, groundAt);
    group.add(o);
    if (Array.isArray(block)) walk.blockers.push(boxBlocker(wx, wz, block[0], block[1], yaw, block[2] ?? 0, block[3] ?? 0));
    else if (block > 0) walk.blockers.push({ x: wx, z: wz, r: block });
  };
  /** Zusätzlicher Kreis-Kollider an einem Punkt im Objektraum (Amboss, Kran) */
  const extra = (x: number, z: number, yaw: number, lx: number, lz: number, r: number) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    walk.blockers.push({ x: cx + x + lx * c + lz * s, z: cz + z - lx * s + lz * c, r });
  };
  const face = (x: number, z: number) => Math.atan2(-x, -z); // Tür zur Platzmitte
  // fester Zufall der Stadt (gleiche Farben und Bauten bei jedem Start)
  let seed = 90210;
  const trnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  /** Blender-Bau (world/architecture.ts) aufstellen: mit Kollisionsgitter, Rauch und seinen Fenstern */
  let smokeN = 0;
  const townGlows: TownBuild['glows'] = [];
  let windowGlows = 0;
  const placeB = (t: StructureType, x: number, z: number, yaw: number, len = 8) => {
    const b = buildStruct(t, trnd, len);
    const wx = cx + x, wz = cz + z;
    if (t !== 'zinnenmauer' && t !== 'zinnenturm' && t !== 'torhaus' && t !== 'kran') levelFootprint(b, wx, wz, yaw, walk.addPad);
    // Fußboden auf Höhe des Bodens vor der Tür (Tür liegt bei +z), nicht in der Mitte: sonst schwebt das Haus auf der einen Seite und
    // versinkt auf der anderen. Fällt das Gelände dahinter ab, trägt ein Steinsockel das Haus bis zum tiefsten Punkt.
    const big = b.boxes.reduce((m, q) => (q[0] * q[1] > m[0] * m[1] ? q : m), b.boxes[0] ?? [4, 4, 0, 0]);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const fz = (big[3] ?? 0) + big[1] / 2 + 0.7, fx = big[2] ?? 0;
    const frontY = groundAt(wx + fx * cy + fz * sy, wz - fx * sy + fz * cy);
    const rr = rectRange(wx, wz, yaw, big[0], big[1], big[2] ?? 0, big[3] ?? 0);
    const baseY = Math.max(rr.mn + 0.05, Math.min(frontY, rr.mn + 1.6));
    b.g.position.set(wx, baseY, wz);
    b.g.rotation.y = yaw;
    settleYard(b, wx, wz, yaw, groundAt);
    auditPlacement?.('ankerglueck', t, b.g, groundAt);
    group.add(b.g);
    const drop = baseY - rr.mn + 0.35;
    if (drop > 0.4 && big[0] > 3) {
      const plinth = new Mesh(new BoxGeometry(big[0] + 0.25, drop, big[1] + 0.25), plinthMat);
      plinth.position.set(big[2] ?? 0, 0.1 - drop / 2, big[3] ?? 0);
      b.g.add(plinth);
    }
    for (const c of structColliders(b, wx, wz, yaw)) walk.blockers.push(c);
    if (b.smoke && smokeN++ % 3 === 0) smoke.push(new Vector3(wx + b.smoke[0] * Math.cos(yaw) + b.smoke[2] * Math.sin(yaw), baseY + b.smoke[1], wz - b.smoke[0] * Math.sin(yaw) + b.smoke[2] * Math.cos(yaw)));
    const c0 = Math.cos(yaw), s0 = Math.sin(yaw), gy0 = baseY;
    for (const gl of b.glows ?? []) {
      if (gl.kind === 'window' && windowGlows++ > 140) continue;   // Obergrenze: das GlowSystem zeichnet nur die nächsten
      townGlows.push({ kind: gl.kind, x: x + gl.x * c0 + gl.z * s0, y: gy0 + gl.y, z: z - gl.x * s0 + gl.z * c0, ground: gl.gy == null ? null : gy0 + gl.gy, size: gl.size, pool: gl.pool, pdx: (gl.px ?? 0) * c0 + (gl.pz ?? 0) * s0, pdz: -(gl.px ?? 0) * s0 + (gl.pz ?? 0) * c0, glint: gl.glint });
    }
    return b;
  };

  // Steg nach Süden
  const pier = new Group();
  const deck = new BoxGeometry(5, 0.3, 80);
  deckUV(deck, 5, 80);
  const plank = new Mesh(deck, toon({ color: '#B08A58', map: plankTexture(), puddles: 0.6, ...toonPbr(plankTexture(), { strength: 1.2, rough: 0.82, roughVar: 0.2, ao: 0.7 }) }));
  plank.position.set(0, 1.5, 0);
  pier.add(plank);
  for (let i = 0; i < 16; i++) for (const s of [-1, 1]) {
    const post = new Mesh(new CylinderGeometry(0.22, 0.25, 5, 6), toon('#5A3A22'));
    post.position.set(s * 2.4, -0.8, -38 + i * 5.2);
    pier.add(post);
  }
  pier.position.set(cx, 0, cz - def.r - 35);
  group.add(pier);
  for (let i = 0; i < 4; i++) {
    if (hasProp('kiste')) {
      // Blender-Kiste mit Eisenecken, Brettern und Schloss; Boden auf der Stegoberkante (1,65 m)
      const crate = propGroup('kiste', (role) => role === 'iron' ? toon('#3A3C40') : role === 'brass' ? toon({ color: '#E3B04B', spec: 1, metalness: 1, roughness: 0.4 }) : role === 'darkwood' ? toon('#5A3A22') : toon({ color: '#9A6A3A', roughness: 0.85 }));
      crate.scale.setScalar(1.1);
      crate.position.set(cx + (i % 2 ? 1.6 : -1.6), 1.65, cz - def.r - 4 - i * 6);
      crate.rotation.y = i;
      group.add(crate);
      continue;
    }
    const crate = new Mesh(new BoxGeometry(1.1, 1.1, 1.1), toon({ color: '#9A6A3A', map: crateTexture(), ...toonPbr(crateTexture(), { strength: 1.2, rough: 0.82, roughVar: 0.2, ao: 0.7 }) }));
    crate.position.set(cx + (i % 2 ? 1.6 : -1.6), 2.2, cz - def.r - 4 - i * 6);
    crate.rotation.y = i;
    group.add(crate);
  }

  // Wichtige Gebäude
  placeB('gasthaus', -40, -2, Math.PI / 2); // Taverne
  placeB('kolonialhaus', -16, -55.5, Math.PI); // Hafenmeisterei an der Kaistraße, Tür zur Straße
  const smithy = buildStruct('steinhaus', trnd).g;
  const chimney = new Mesh(new BoxGeometry(0.01, 0.01, 0.01), toon('#7A6A5A'));
  chimney.position.set(3, 6, -2);
  const forge = new Mesh(new SphereGeometry(0.7, 10, 8), new MeshBasicMaterial({ color: new Color(5, 1.6, 0.3) }));
  forge.position.set(-3, 1, 5);
  forge.userData.noOutline = true;
  const anvil = new Mesh(new BoxGeometry(1.2, 0.8, 0.6), toon({ color: '#3A3A44', spec: 1 }));
  anvil.position.set(-1, 0.4, 6);
  smithy.add(chimney, forge, anvil);
  place(smithy, 38, 14, -Math.PI / 2, [7.4, 5.6]);
  extra(38, 14, -Math.PI / 2, -1, 6, 0.75);
  extra(38, 14, -Math.PI / 2, -3, 5, 0.75);
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
  yard.add(keel);
  if (hasArchModel('kran')) { const k = buildStruct('kran', trnd).g; k.position.set(6.5, 0, 0); k.rotation.y = -Math.PI / 2; yard.add(k); } else yard.add(crane, boom);
  // Rumpfgerippe (6 m breit, 14 m lang) und Kran daneben
  place(yard, 52, -26, 0.3, [6.6, 14.4]);
  extra(52, -26, 0.3, 5, 0, 0.5);

  // Markt mit Ständen
  for (let i = 0; i < 4; i++) {
    if (hasArchModel('marktstand')) {
      // Marktstände stehen im Ring zwischen Platz (Radius 16) und Ringstraße (Radius 28), nicht auf der Straße, Tür zur Platzmitte
      const a = [-0.33, 0.33, -0.95, 0.95][i];
      const sx = Math.sin(a) * 22, sz = Math.cos(a) * 22;
      placeB('marktstand', sx, sz, face(sx, sz));
      continue;
    }
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
    place(stall, Math.sin(a) * 26, 26 + Math.cos(a) * 2, Math.PI + a, [3.5, 2.1, 0, -0.1]);
  }

  if (hasArchModel('marktstand')) {
    for (const [x, z, y] of [[-13, 18, 0.5], [13, 19, -0.5], [-20, 8, 1.2], [18, 15, -1.2]] as const) placeB('marktstand', x, z, Math.PI + y);
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

  // Brunnen auf dem Platz: dreistufiger Steinbrunnen aus Blender mit bewegtem Wasser (world/fountain.ts); ohne Modell der alte Eigenbau
  const modelFountain = hasArchModel('brunnen') ? buildFountain() : null;
  if (modelFountain) {
    place(modelFountain, 0, 2, 0, 3.55);
  } else {
    const fountain = new Group();
    const basin = new Mesh(new CylinderGeometry(3, 3.3, 0.9, 20), toon('#C8C0B0'));
    basin.position.y = 0.45;
    const water = new Mesh(new CylinderGeometry(2.7, 2.7, 0.1, 20), toon('#33C4D2'));
    water.position.y = 0.88;
    water.userData.noOutline = true;
    const column = new Mesh(new CylinderGeometry(0.22, 0.42, 2.0, 10), toon('#C8C0B0'));
    column.position.y = 1.4;
    const bowl = new Mesh(new CylinderGeometry(1.15, 0.5, 0.34, 16), toon('#C8C0B0'));
    bowl.position.y = 2.5;
    const bowlWater = new Mesh(new CylinderGeometry(0.98, 0.98, 0.04, 16), toon('#33C4D2'));
    bowlWater.position.y = 2.68;
    bowlWater.userData.noOutline = true;
    const finial = new Mesh(new SphereGeometry(0.2, 10, 8), toon('#D8CFA8'));
    finial.position.y = 2.95;
    fountain.add(basin, water, column, bowl, bowlWater, finial);
    place(fountain, 0, 2, 0, 3.4);
  }

  // Hafentor und Hafenmauer: Torhaus über der Hauptstraße, Zinnenmauern und Rundtürme links und rechts
  if (hasArchModel('torhaus')) {
    const gz = -def.r + 16;
    placeB('torhaus', 0, gz, Math.PI);
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 3; k++) placeB('zinnenmauer', sd * (10.5 + 3 + k * 6), gz + 0.4 * k, Math.PI);
      placeB('zinnenturm', sd * (10.5 + 3 + 3 * 6 + 1.5), gz + 1.6, sd * 0.7);
    }
    // Hebekräne und Lagerhäuser am Kai
    placeB('kran', -9, -def.r + 6, 0);
    placeB('kran', 9.5, -def.r + 6.5, 0.15);
    // Lagerhäuser an der Kaistraße: Tore zur Straße (Süden), davor die Ladefläche
    placeB('lagerhaus', -34, -55, Math.PI);
    placeB('lagerhaus', 17, -55, Math.PI);
    placeB('lagerhaus', 38, -55, Math.PI);
  }
  // Kapelle hinter dem Schrein-Platz
  if (hasArchModel('kapelle')) placeB('kapelle', -24, 56, face(-24, 56) + Math.PI);

  // ---------- Straßennetz und Viertel ----------
  // Eine echte Hafenstadt: Hauptstraße vom Steg durchs Hafentor zum Platz und weiter zum Schrein, Kaistraße mit Lagerhäusern,
  // Ringstraße um den Platz, Gassen in die Außenviertel. Die Wohnhäuser stehen entlang der Straßen, die Türen zur Straße,
  // mit Vorgarten; Werft, Taverne, Schmiede und Hafenmeisterei sitzen an den Enden der Wege.
  type Street = { pts: [number, number][]; w: number; houses: boolean; tier: 0 | 1 | 2 };
  const ring: [number, number][] = [];
  for (let i = 0; i <= 40; i++) { const an = (i / 40) * Math.PI * 2 + 0.3; ring.push([Math.cos(an) * 28, Math.sin(an) * 28]); }
  // Außenring (nur die nördliche Hälfte; im Süden liegen Kai und Hafentor): verbindet die Gassen, Häuser an beiden Seiten
  const ring2: [number, number][] = [];
  for (let i = 0; i <= 34; i++) { const an = -0.35 + (i / 34) * (Math.PI + 0.7); ring2.push([Math.cos(an) * 53, Math.sin(an) * 53]); }
  const STREETS: Street[] = [
    { pts: [[0, -def.r + 4], [0, -68], [0, -48], [-3, -22], [0, 0]], w: 5.4, houses: false, tier: 0 },     // Hauptstraße vom Steg
    { pts: [[0, 0], [2, 20], [0, 40], [0, 54]], w: 5.0, houses: true, tier: 0 },                          // zum Schrein
    { pts: [[0, 0], [-16, -1], [-31, -2]], w: 4.6, houses: true, tier: 1 },                               // West: Taverne
    { pts: [[0, 0], [16, 6], [28, 12]], w: 4.6, houses: true, tier: 1 },                                  // Ost: Schmiede
    { pts: [[-56, -62], [-28, -65], [0, -64], [28, -65], [56, -62]], w: 4.8, houses: false, tier: 1 },     // Kaistraße
    { pts: [[0, -36], [24, -32], [42, -27]], w: 4.0, houses: false, tier: 2 },                            // zur Werft
    { pts: ring, w: 4.2, houses: true, tier: 1 },                                                         // Ringstraße um den Platz
    { pts: [[-22, 24], [-40, 44], [-52, 62]], w: 3.8, houses: true, tier: 2 },                            // Gasse Nordwest
    { pts: [[22, 26], [40, 44], [52, 60]], w: 3.8, houses: true, tier: 2 },                               // Gasse Nordost
    { pts: [[-14, -34], [-32, -40], [-52, -38]], w: 3.8, houses: true, tier: 2 },                         // Gasse Südwest (Hafenviertel)
    { pts: [[15, -34], [34, -44], [54, -46]], w: 3.8, houses: true, tier: 2 },                            // Gasse Südost
    { pts: ring2, w: 4.0, houses: true, tier: 2 },                                                       // Außenring
  ];
  const sampleAt = (pts: [number, number][], sd: number) => {
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (sd <= acc + len || i === pts.length - 2) {
        const t = clamp01((sd - acc) / (len || 1));
        return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / (len || 1), tz: (bz - az) / (len || 1) };
      }
      acc += len;
    }
    return { x: 0, z: 0, tx: 1, tz: 0 };
  };
  const polyLen = (pts: [number, number][]) => { let L2 = 0; for (let i = 0; i < pts.length - 1; i++) L2 += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); return L2; };
  /** Abstand zu den Straßen außer der eigenen (ein Haus darf nicht auf einer Querstraße stehen) */
  const distToStreets = (x: number, z: number, skip: number) => {
    let best = Infinity;
    STREETS.forEach((st, si) => {
      if (si === skip) return;
      for (let i = 0; i < st.pts.length - 1; i++) {
        const [ax, az] = st.pts[i], [bx, bz] = st.pts[i + 1];
        const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
        const t = clamp01(((x - ax) * vx + (z - az) * vz) / L2);
        best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t) - st.w / 2);
      }
    });
    return best;
  };
  // Plätze, die frei bleiben müssen: Händler, Schrein, Markt, Werft, Platz, Hafentor und die bestehenden Gebäude
  const taken: [number, number, number][] = [
    [-26, -2, 6], [26, 14, 6], [4, 26, 6], [0, 52, 6], [40, -26, 6], [-10, -52, 6], [14, -60, 6],
    [-40, -2, 9], [-16, -56, 7], [38, 14, 8], [52, -26, 11], [0, 62, 9], [0, 27, 15], [0, 0, 19], [0, -43, 9],
    [0, -def.r + 16, 12], [-13, -def.r + 16, 9], [13, -def.r + 16, 9], [-24, 56, 9],
    [-34, -55, 7], [17, -55, 7], [38, -55, 7],
  ];
  const free = (x: number, z: number, r: number) => Math.hypot(x, z) < def.r * 0.8 && taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) > tr + r);
  const HOUSE_SPEC: Record<string, { w: number; d: number; extra: number }> = {
    fachwerkhaus: { w: 6.8, d: 5.6, extra: 0.2 }, kolonialhaus: { w: 7.6, d: 5.8, extra: 1.7 }, steinhaus: { w: 6.9, d: 5.0, extra: 0.5 }, holzhuette: { w: 6.0, d: 4.3, extra: 0.5 },
  };
  const TIER_TYPES: StructureType[][] = [
    ['kolonialhaus', 'fachwerkhaus', 'kolonialhaus', 'fachwerkhaus', 'steinhaus'],
    ['fachwerkhaus', 'steinhaus', 'kolonialhaus', 'fachwerkhaus', 'steinhaus'],
    ['holzhuette', 'fachwerkhaus', 'steinhaus', 'holzhuette', 'fachwerkhaus'],
  ];
  const useBlender = hasArchModel('haus_fachwerk') && hasArchModel('haus_kolonial');
  let hi = 0;
  STREETS.forEach((st, si) => {
    if (!st.houses) return;
    const total = polyLen(st.pts);
    for (const side of [1, -1]) {
      let sd = 3 + trnd() * 3;
      while (sd < total - 3) {
        const type = TIER_TYPES[st.tier][Math.floor(trnd() * TIER_TYPES[st.tier].length)];
        const sp = HOUSE_SPEC[type];
        const mid = sampleAt(st.pts, sd + sp.w / 2);
        const nx = -mid.tz * side, nz = mid.tx * side;                               // Normale, weg von der Straße
        const off = st.w / 2 + 1.0 + sp.extra + sp.d / 2;
        const x = mid.x + nx * off, z = mid.z + nz * off;
        const r = Math.max(sp.w, sp.d) * 0.56;
        const yaw = Math.atan2(-nx, -nz);                                            // Tür zur Straße
        if (free(x, z, r) && distToStreets(x, z, si) > r * 0.9) {
          if (useBlender) placeB(type, x, z, yaw);
          else place(house(sp.w, sp.d, 3.6 + (hi % 2), WALLS[hi % WALLS.length], ROOFS[(hi * 3) % ROOFS.length], windowMat, lights), x, z, yaw, [sp.w + 0.6, sp.d + 0.6]);
          taken.push([x, z, r]);
          // vor der Tür am Straßenrand: Kisten oder ein Karren, nur wo zwischen Straße und Haus Platz ist (Kolonialhäuser mit Veranda),
          // längs zur Straße ausgerichtet; vorher ragte der Karren 3,9 m quer in den Weg
          if (hi % 3 === 1 && sp.extra >= 1.5) {
            const px = mid.x + nx * (st.w / 2 + 1.5) + mid.tx * (sp.w / 2 - 1.2), pz = mid.z + nz * (st.w / 2 + 1.5) + mid.tz * (sp.w / 2 - 1.2);
            const along = Math.atan2(-mid.tz, mid.tx);
            if (hi % 2) place(crateStack(hi), px, pz, along, [2.7, 1.7, 0.55, 0]);
            else place(cart(), px, pz, along + Math.PI / 2, [1.9, 3.9, 0, 0.8]);
          }
          hi++;
          sd += sp.w + 1.0 + trnd() * 1.2;
        } else sd += 2.2;
      }
    }
  });
  // Straßenlaternen: abwechselnd links und rechts alle 13 m (Lichthof und Spiegelung kommen aus dem GlowSystem)
  STREETS.forEach((st, si) => {
    const total = polyLen(st.pts);
    let side = 1;
    for (let sd = 6 + si; sd < total - 4; sd += 13) {
      const q = sampleAt(st.pts, sd);
      const lx = q.x + -q.tz * side * (st.w / 2 + 0.6), lz = q.z + q.tx * side * (st.w / 2 + 0.6);
      side = -side;
      if (Math.hypot(lx, lz) > def.r * 0.8 || taken.some(([tx, tz, tr]) => Math.hypot(lx - tx, lz - tz) < tr * 0.55 + 0.5)) continue;
      if (distToStreets(lx, lz, si) < 0.6) continue;
      place(lantern(lampMat, lights), lx, lz, 0, 0.3);
    }
  });
  // Fässer, Kisten, Bänke und Büsche als Leben in Gassen und Höfen
  for (let i = 0; i < 26; i++) {
    const st = STREETS[i % STREETS.length];
    const q = sampleAt(st.pts, (0.13 + (i * 0.37) % 0.8) * polyLen(st.pts));
    const sdn = i % 2 ? 1 : -1;
    const x = q.x - q.tz * sdn * (st.w / 2 + 1.0), z = q.z + q.tx * sdn * (st.w / 2 + 1.0);
    // Kistenstapel sind 2,7 m lang: auch von Querstraßen genug Abstand, sonst stehen sie mitten im Weg
    if (!free(x, z, 0.8) || distToStreets(x, z, STREETS.indexOf(st)) < 1.6) continue;
    if (i % 3 === 0) {
      const barrel = new Mesh(new CylinderGeometry(0.45, 0.4, 1, 10), toon('#8A5A2B'));
      barrel.position.set(cx + x, groundAt(cx + x, cz + z) + 0.5, cz + z);
      group.add(barrel);
      walk.blockers.push({ x: cx + x, z: cz + z, r: 0.5 });
    } else if (i % 3 === 1) place(crateStack(i), x, z, i, [2.7, 1.7, 0.55, 0]);
    else place(bush(i), x, z, i, 0);
    taken.push([x, z, 1.2]);
  }
  // am Kai, nördlich der Kaistraße (z ≈ −64) und beiderseits der Hauptstraße
  place(crateStack(1), -9.5, -def.r + 31, 0.3, [2.7, 1.7, 0.55, 0]);
  place(crateStack(4), 9.5, -def.r + 32, 1.1, [2.7, 1.7, 0.55, 0]);
  // Wimpelleinen über der Hauptstraße und am Platz, Fahnen
  for (const [ax, az, bx, bz] of [[-4, -52, 4, -40], [-4, -40, 4, -26], [-10, -10, 10, -10], [-12, 14, 12, 14], [-6, 34, 6, 46]] as const) {
    // Die Leine hängt zwischen zwei Masten (vorher schwebte sie frei in der Luft)
    const top = 3.1;
    for (const [px, pz] of [[ax, az], [bx, bz]] as const) {
      const gy = groundAt(cx + px, cz + pz);
      const mast = new Mesh(new CylinderGeometry(0.09, 0.12, top + 0.4, 6), toon('#4A3220'));
      mast.position.set(cx + px, gy + (top + 0.4) / 2 - 0.2, cz + pz);
      group.add(mast);
      walk.blockers.push({ x: cx + px, z: cz + pz, r: 0.18 });
    }
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
  const cobble = toon({ color: '#A89C88', map: cobbleTexture(), side: DoubleSide, puddles: 1, ...toonPbr(cobbleTexture(), { strength: 1.6, rough: 0.7, roughVar: 0.3, ao: 0.9 }) });
  // Straßen überlappen sich an Kreuzungen und mit dem Platz auf gleicher Höhe: jede Fläche bekommt eine eigene
  // Tiefenverschiebung (polygonOffset), sonst flackern die Pflastersteine dort (Z-Fighting)
  const layered = (k: number) => {
    const m = cloneToon(cobble);
    m.polygonOffset = true; m.polygonOffsetFactor = -1 - k; m.polygonOffsetUnits = -2 - k * 2;
    return m;
  };
  // Randstreifen aus festgetretener Erde unter dem Pflaster: die Straße wirkt eingebettet statt aufgeklebt
  STREETS.forEach((st) => group.add(roadMesh(st.pts, st.w + 1.7, cx, cz, groundAt, dirtMaterial(0), 0.075)));
  STREETS.forEach((st, i) => group.add(roadMesh(st.pts, st.w, cx, cz, groundAt, layered(i + 1))));
  group.add(plazaMesh(16, cx, cz, groundAt, layered(0)));
  setYardCompact(false);
  return { group, lights: glow, crystal, smoke, glows: townGlows, streets: STREETS.map((st) => ({ pts: st.pts.map(([px, pz]) => [cx + px, cz + pz] as [number, number]), w: st.w })) };
}

/** Statische Teile pro Material zusammenfassen (wenige Zeichenaufrufe) */
export function mergeByMaterial(group: Group, keep: Set<Mesh>) {
  for (const _ of mergeByMaterialSteps(group, keep)) { /* in einem Zug */ }
}

/** Dasselbe in Teilschritten (Streaming, Phase 4.3A): gibt nach je zehn Netzen und nach jedem Material ab; das Ergebnis ist dasselbe */
export function* mergeByMaterialSteps(group: Group, keep: Set<Mesh>): Generator<void> {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const rel = (m: Mesh) => inv.clone().multiply(m.matrixWorld);
  const buckets = new Map<Material, { geos: BufferGeometry[]; meshes: Mesh[] }>();
  const list: Mesh[] = [];
  group.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || keep.has(m) || Array.isArray(m.material)) return;
    list.push(m);
  });
  let count = 0;
  for (const m of list) {
    if (++count % 10 === 0) yield;
    const b = buckets.get(m.material as Material) ?? { geos: [], meshes: [] };
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    // Texturkoordinaten nur behalten, wenn das Material eine Textur hat (Kisten, Fässer)
    const keepUv = !!(m.material as Material & { map?: unknown }).map && !!g.attributes.uv;
    // Eckpunktfarben (Ambient-Occlusion der Blender-Bauten) bleiben, wenn das Material sie nutzt
    const keepCol = !!(m.material as Material & { vertexColors?: boolean }).vertexColors;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'aWind' && k !== 'aEdge' && k !== 'aFlag' && !(keepUv && k === 'uv') && !(keepCol && k === 'color')) g.deleteAttribute(k);
    g = g.applyMatrix4(rel(m));
    b.geos.push(g);
    b.meshes.push(m);
    buckets.set(m.material as Material, b);
  }
  const kept: Mesh[] = [];
  group.traverse((o) => { if (keep.has(o as Mesh)) kept.push(o as Mesh); });
  for (const [mat, b] of buckets) {
    if (b.meshes.length < 2) continue;
    // Windgewichte: Teile ohne Gewicht (z. B. Stamm-Material an Zäunen) bekommen 0, damit alle zusammenpassen
    if (b.geos.some((g) => g.attributes.aWind)) {
      for (const g of b.geos) if (!g.attributes.aWind) g.setAttribute('aWind', new Float32BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    }
    if (b.geos.some((g) => g.attributes.aFlag)) {
      for (const g of b.geos) if (!g.attributes.aFlag) g.setAttribute('aFlag', new Float32BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    }
    if (b.geos.some((g) => g.attributes.aEdge)) {
      for (const g of b.geos) if (!g.attributes.aEdge) g.setAttribute('aEdge', new Float32BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    }
    // Eckpunktfarben: Teile ohne Farben (eigene Netze neben Blender-Bauten mit Ambient-Occlusion) bekommen Weiß, sonst schlägt das Zusammenfassen fehl
    const refCol = b.geos.find((g) => g.attributes.color)?.attributes.color as BufferAttribute | undefined;
    if (refCol) {
      // gleiche Bauart wie die vorhandenen Farben (Blender: oft normierte Ganzzahlen, RGB oder RGBA)
      const Arr = refCol.array.constructor as new (n: number) => Float32Array | Uint8Array | Uint16Array;
      const one = refCol.normalized ? (refCol.array instanceof Uint8Array ? 255 : refCol.array instanceof Uint16Array ? 65535 : 1) : 1;
      for (const g of b.geos) if (!g.attributes.color) g.setAttribute('color', new BufferAttribute(new Arr(g.attributes.position.count * refCol.itemSize).fill(one), refCol.itemSize, refCol.normalized));
    }
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    for (const m of b.meshes) m.removeFromParent();
    const mesh = new Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    yield;
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
