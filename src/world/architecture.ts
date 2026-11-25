import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  type Material,
  type Object3D,
  CanvasTexture,
  SRGBColorSpace,
} from 'three';
import type { StructureType } from '../data/settlements';
import { markShared } from '../render/dispose';
import { toonPbr } from '../render/pbrMaps';
import { crateTexture, deckUV, plankTexture } from '../render/textures';
import { toon } from '../render/toon';
import { coalMaterial, lanternCoal, lanternGlass } from '../render/lampMaterials';
import { boxBlocker, type Blocker } from './islandGround';
import { hasProp, propGroup, type PropId } from './worldProps';
import { archGroup, archParts, hasArch } from './envModels';
import { buildRoofField, placeRoof, roofMinOver, type Roof, type RoofField } from './roofFields';
import type { GlowSpec } from '../render/glow';
import type { FactionId } from '../data/factions';
import { factionRole, setFactionNight } from './factionMats';
import { pickOne } from '../core/mathUtil';

/**
 * Bauten für Dörfer, Höfe und Ruinen: jedes Modell kommt mit seinem Kollisions-Gitter
 * (gedrehte Rechtecke für Wände, Zäune und Stapel, Kreise für Rundes) im eigenen Objektraum.
 * „Vorn“ ist +z (Tür), die Aufstellung übernimmt world/settlement.ts.
 */
export interface Built {
  g: Group;
  /** Rechteck-Kollider: Breite (x), Tiefe (z), Versatz x/z, Drehung in Grad */
  boxes: [w: number, d: number, ox?: number, oz?: number, yaw?: number][];
  /** Kreis-Kollider: Radius, Versatz x/z */
  circles: [r: number, ox?: number, oz?: number][];
  /** Rauch (Schornstein) bzw. Feuer mit Glut: Punkt im Objektraum */
  smoke?: [number, number, number];
  fire?: [number, number, number];
  /** Lampen und Fackeln (Objektraum): bekommen Lichthof, Bodenlicht und Flamme aus render/glow.ts */
  glows?: GlowSpec[];
  /** Steg: Länge ab Ursprung in +z (Schiffe prallen daran ab) */
  pier?: number;
  /** Feld: Reihen im Objektraum, auf denen Halme wachsen (Start x, z, Länge entlang x) */
  rows?: [number, number, number][];
}

// Fenster und Lampen aller Siedlungen teilen sich je ein Material: nachts leuchten sie, tags sind sie dunkel.
const WINDOW_ON = new Color(2.6, 1.8, 0.7), LAMP_ON = new Color(4, 2.6, 1), FIRE_ON = new Color(4, 1.4, 0.3);
/** Fenster: warmer Innenraum mit Sprossenkreuz und Vorhang-Schatten (leuchtet nachts), davor eine spiegelnde Scheibe */
function windowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 38, 2, 32, 32, 44);
  gr.addColorStop(0, '#fff2c8'); gr.addColorStop(0.6, '#ffc870'); gr.addColorStop(1, '#c8782a');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(90,40,20,0.35)';
  g.fillRect(0, 0, 11, 64); g.fillRect(53, 0, 11, 64);
  g.fillStyle = 'rgba(30,18,10,0.9)';
  g.fillRect(29, 0, 6, 64); g.fillRect(0, 29, 64, 6);
  g.fillRect(0, 0, 64, 3); g.fillRect(0, 61, 64, 3); g.fillRect(0, 0, 3, 64); g.fillRect(61, 0, 3, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return markShared(t);
}
function glassTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 64, 64);
  gr.addColorStop(0, 'rgba(210,235,255,0.95)'); gr.addColorStop(0.45, 'rgba(150,190,225,0.55)'); gr.addColorStop(1, 'rgba(90,130,170,0.35)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath(); g.moveTo(6, 4); g.lineTo(22, 4); g.lineTo(6, 34); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(30, 4); g.lineTo(38, 4); g.lineTo(14, 44); g.lineTo(10, 44); g.closePath(); g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return markShared(t);
}
const windowMat = markShared(new MeshBasicMaterial({ color: WINDOW_ON.clone(), map: windowTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
const glassMat = markShared(new MeshBasicMaterial({ map: glassTexture(), transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
const lampMat = markShared(new MeshBasicMaterial({ color: LAMP_ON.clone() }));
const emberMat = markShared(new MeshBasicMaterial({ color: FIRE_ON.clone() }));
for (const m of [windowMat, lampMat, emberMat]) m.userData.glow = true;

/** Helligkeit der Fenster und Laternen (night 0 … 1) – einmal je Bild für alle Siedlungen */
export function setSiteNight(night: number) {
  windowMat.color.copy(WINDOW_ON).multiplyScalar(0.1 + 0.9 * Math.min(1, night * 1.4));
  // Scheibe spiegelt tagsüber den Himmel, nachts bleibt nur ein Hauch
  glassMat.opacity = 0.12 + 0.48 * (1 - Math.min(1, night * 1.3));
  lampMat.color.copy(LAMP_ON).multiplyScalar(0.22 + 0.78 * Math.min(1, night * 1.4));
  setFactionNight(night);
}

// Oberflächen aus der PBR-Schmiede (4.4A): Hafenholz, Fachwerkbalken, Mauerquader, Dachziegel, Eisen
const plank = (color: string) => toon({ color, map: plankTexture(), forge: 'hafenholz', ...toonPbr(plankTexture(), { strength: 1.2, rough: 0.82, roughVar: 0.2, ao: 0.7 }) });
const M = {
  get wood() { return toon({ color: '#8A6A44', forge: 'fachwerk' }); },
  get darkWood() { return toon({ color: '#4A3220', forge: 'fachwerk' }); },
  get planks() { return plank('#A07C50'); },
  get planksGrey() { return plank('#8C8474'); },
  get deck() { return toon({ color: '#A8804E', map: plankTexture(), puddles: 0.6, forge: 'hafenholz', ...toonPbr(plankTexture(), { strength: 1.2, rough: 0.82, roughVar: 0.2, ao: 0.7 }) }); },
  get stone() { return toon({ color: '#A8A092', detail: 'stone', forge: 'mauerwerk' }); },
  get stoneDark() { return toon({ color: '#908A7E', flatShading: true, detail: 'stone', forge: 'mauerwerk' }); },
  get stoneLight() { return toon({ color: '#D0C8B6', flatShading: true, detail: 'stone', forge: 'mauerwerk' }); },
  get ruin() { return toon({ color: '#9C978A', flatShading: true, detail: 'stone', forge: 'mauerwerk' }); },
  get moss() { return toon({ color: '#5E7A4A', flatShading: true }); },
  get plaster() { return toon({ color: '#E2D6BC', detail: 'plaster' }); },
  get thatch() { return toon({ color: '#A8904E', flatShading: true }); },
  get shingle() { return toon({ color: '#6E4A2E', flatShading: true, detail: 'tile', forge: 'ziegel' }); },
  get slate() { return toon({ color: '#46525E', flatShading: true, detail: 'tile', forge: 'ziegel' }); },
  get tile() { return toon({ color: '#8E3A2A', flatShading: true, detail: 'tile', forge: 'ziegel' }); },
  get barnRed() { return toon('#7E2E24'); },
  get soil() { return toon({ color: '#5A4430', flatShading: true }); },
  get straw() { return toon({ color: '#C9A94E', flatShading: true }); },
  get iron() { return toon({ color: '#3A3C40', spec: 0.6, forge: 'kanonenstahl' }); },
  get crate() { return toon({ color: '#9A6A3A', map: crateTexture(), ...toonPbr(crateTexture(), { strength: 1.2, rough: 0.82, roughVar: 0.2, ao: 0.7 }) }); },
  get barrel() { return plank('#7A5030'); },
  get net() { return toon({ color: '#6E7A6A', side: DoubleSide }); },
  get hull() { return toon({ color: '#7A5232', side: DoubleSide }); },
};

const box = (w: number, h: number, d: number, mat: Material, x = 0, y = 0, z = 0) => {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};
const cyl = (rt: number, rb: number, h: number, seg: number, mat: Material, x = 0, y = 0, z = 0) => {
  const m = new Mesh(new CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
};

/** Satteldach als Prisma: First entlang x, Breite w, Tiefe d, Höhe h, Unterkante bei y = 0 */
function gable(w: number, h: number, d: number): BufferGeometry {
  const A = [-w / 2, 0, -d / 2], B = [w / 2, 0, -d / 2], C = [w / 2, 0, d / 2], D = [-w / 2, 0, d / 2], E = [-w / 2, h, 0], F = [w / 2, h, 0];
  const tris = [D, C, F, D, F, E, B, A, E, B, E, F, A, D, E, C, B, F, A, B, C, A, C, D];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  return g;
}
const roofOn = (w: number, h: number, d: number, mat: Material, y: number) => {
  const m = new Mesh(gable(w, h, d), mat);
  m.position.y = y;
  return m;
};

function windowAt(g: Group, x: number, y: number, z: number, yaw = 0, w = 0.8, h = 0.9) {
  const win = new Mesh(new PlaneGeometry(w, h), windowMat);
  win.position.set(x, y, z);
  win.rotation.y = yaw;
  win.userData.noOutline = true;
  // Scheibe davor (spiegelt den Himmel), Rahmen und Sims aus Holz
  const fx = Math.sin(yaw) * 0.015, fz = Math.cos(yaw) * 0.015;
  const glass = new Mesh(new PlaneGeometry(w, h), glassMat);
  glass.position.set(x + fx, y, z + fz);
  glass.rotation.y = yaw;
  glass.userData.noOutline = true;
  glass.renderOrder = 2;
  const frame = M.darkWood;
  const off = 0.02;
  const ox = Math.sin(yaw) * off, oz = Math.cos(yaw) * off;
  const bar = box(w + 0.16, 0.08, 0.06, frame, x + ox, y - h / 2 - 0.04, z + oz);
  const top = box(w + 0.16, 0.08, 0.06, frame, x + ox, y + h / 2 + 0.04, z + oz);
  const sill = box(w + 0.3, 0.07, 0.16, M.stoneLight, x + Math.sin(yaw) * 0.06, y - h / 2 - 0.1, z + Math.cos(yaw) * 0.06);
  bar.rotation.y = top.rotation.y = sill.rotation.y = yaw;
  g.add(win, glass, bar, top, sill);
  // Lichtschein des Fensters: kleiner Hof, bei Fenstern im Erdgeschoss ein Lichtfleck auf dem Boden davor
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  (g.userData.winGlows ??= [] as GlowSpec[]).push({ kind: 'window', x, y, z, gy: y < 2.7 ? 0 : null, size: Math.max(0.45, w * 0.6), px: nx * 1.3, pz: nz * 1.3, pool: 2.4 + w });
  for (const sx of [-1, 1]) {
    const side = box(0.08, h, 0.06, frame, x + Math.cos(yaw) * sx * (w / 2 + 0.04) + ox, y, z - Math.sin(yaw) * sx * (w / 2 + 0.04) + oz);
    side.rotation.y = yaw;
    g.add(side);
  }
}

/**
 * Farbwelt einer Weltmacht für die Blender-Bauten (nur während `build`, nur für diese Bauarten): Tore, Türme, Mauern, Bergfried, Kran,
 * Lagerhaus und Kapelle einer Macht sehen so aus wie ihre Festungen (Kalkstein, Backstein, Granit, Sandstein, Schwarzholz, Weiß).
 */
let archTheme: FactionId | null = null;
export const THEMED_TYPES = new Set<StructureType>(['torhaus', 'zinnenturm', 'zinnenmauer', 'bergfried', 'kran', 'lagerhaus', 'kapelle']);

/** Material der Blender-Bauten: Farbe und Oberfläche wie die Eigenbau-Fassung, dazu Eckpunktfarben für die Ambient-Occlusion */
const AM = (color: string, detail?: 'stone' | 'plaster' | 'tile') => toon({ color, detail, vertexColors: true, forge: detail === 'stone' ? 'mauerwerk' : detail === 'tile' ? 'ziegel' : undefined });
type ArchSet = { wall?: string; wallDetail?: 'stone' | 'plaster' | 'tile'; roof: string; roofDetail?: 'tile'; cloth?: string };
/** Rollen→Material eines Hauses; Dach und Wand je Haustyp */
const houseMats = (s: ArchSet) => (role: string) => {
  // Festungsbauten einer Weltmacht (data/factions.ts): Mauerwerk, Dach und Tuch in der Farbwelt der Macht
  if (archTheme) return factionRole(archTheme, role);
  switch (role) {
    case 'wall': return AM(s.wall ?? '#E2D6BC', s.wallDetail);
    case 'stone': return AM('#A8A092', 'stone');
    case 'stonelight': return AM('#C4BCAC', 'stone');
    case 'wood': return AM('#8A6A44');
    case 'darkwood': return AM('#4A3220');
    case 'roof': return AM(s.roof, s.roofDetail);
    case 'iron': return AM('#3A3C40');
    case 'rope': return AM('#B8A070');
    case 'gold': return AM('#C9A24E');
    case 'greenery': return AM('#4F7A3A');
    case 'flower': return AM('#D4505C');
    case 'cloth': return AM(s.cloth ?? '#A8322A');
    case 'cloth2': return AM('#E8DFC8');
    case 'fruit1': return AM('#D94A2B');
    case 'fruit2': return AM('#E8B33A');
    case 'fruit3': return AM('#6E8B3D');
    case 'paint': return AM('#8E2A24');
    default: return AM('#8A6A44');
  }
};

/** Materialien der Licht-Bausätze (Feuerstelle, Feuerkorb, Fackel, Laternenpfahl); die Glut leuchtet selbst */
/** Wie `lightMats`, aber mit Flammenkern, der nur nachts leuchtet (Laternen brennen nicht am Tag) */
export const lanternMats = (role: string): Material => role === 'ember' ? lanternCoal : lightMats(role);
export const lightMats = (role: string): Material => {
  switch (role) {
    case 'ember': return coalMaterial;
    case 'glass': return lanternGlass;
    case 'stone': return toon({ color: '#6E6A64', flatShading: true, vertexColors: true });
    case 'log': return AM('#3A2A1E');
    case 'charcoal': return AM('#1A1614');
    case 'iron': return AM('#3A3C40');
    case 'darkwood': return AM('#4A3220');
    case 'brass': return AM('#C9A24E');
    default: return AM('#6A5038');
  }
};

/** Fundament, das auch am Hang bis in den Boden reicht */
const footing = (w: number, d: number, mat: Material) => box(w, 2.4, d, mat, 0, -1.05, 0);

function holzhuettePlain(rnd: () => number): Built {
  const g = new Group();
  const w = 5 + rnd() * 0.8, d = 4, h = 2.6;
  g.add(footing(w + 0.5, d + 0.5, M.stoneDark), box(w, h, d, M.planks, 0, 0.15 + h / 2, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.26, h + 0.1, 0.26, M.darkWood, sx * w / 2, 0.15 + h / 2, sz * d / 2));
  g.add(roofOn(w + 1, 1.9, d + 1.3, rnd() < 0.5 ? M.thatch : M.shingle, 0.15 + h));
  g.add(box(1, 1.9, 0.1, M.darkWood, -w * 0.2, 1.1, d / 2 + 0.03));
  windowAt(g, w * 0.22, 1.75, d / 2 + 0.03);
  windowAt(g, 0, 1.75, -d / 2 - 0.03, Math.PI);
  // Vordach über der Tür und eine Bank
  const porch = box(1.8, 0.08, 0.9, M.shingle, -w * 0.2, 2.25, d / 2 + 0.45);
  porch.rotation.x = 0.22;
  g.add(porch, box(1.6, 0.1, 0.4, M.wood, w * 0.22, 0.5, d / 2 + 0.35), box(0.1, 0.5, 0.36, M.wood, w * 0.22 - 0.7, 0.25, d / 2 + 0.35), box(0.1, 0.5, 0.36, M.wood, w * 0.22 + 0.7, 0.25, d / 2 + 0.35));
  return { g, boxes: [[w + 0.3, d + 0.3], [1.7, 0.5, w * 0.22, d / 2 + 0.35]], circles: [] };
}

function stelzenhuette(rnd: () => number): Built {
  const g = new Group();
  const w = 4.6, d = 3.8, fl = 1.25, h = 2.3;
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) g.add(cyl(0.13, 0.15, fl + 4.6, 6, M.darkWood, sx * (w / 2 + 0.25), (fl - 4.6) / 2, sz * (d / 2 + 0.25)));
  const floor = new BoxGeometry(w + 1.2, 0.22, d + 2);
  g.add(new Mesh(floor, M.planksGrey));
  g.children[g.children.length - 1].position.set(0, fl, 0.5);
  g.add(box(w, h, d, M.planks, 0, fl + 0.1 + h / 2, 0));
  // Palmstroh-Walmdach
  const roof = new Mesh(new ConeGeometry(Math.hypot(w, d) * 0.72, 2.2, 4), M.thatch);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, d / w + 0.12);
  roof.position.y = fl + 0.1 + h + 1.05;
  g.add(roof, box(0.9, 1.75, 0.1, M.darkWood, -0.9, fl + 1, d / 2 + 0.03));
  windowAt(g, 1, fl + 1.35, d / 2 + 0.03, 0, 0.7, 0.7);
  // Geländer der Veranda und Leiter
  for (const sx of [-1, 1]) g.add(box(0.1, 0.9, 0.1, M.wood, sx * (w / 2 + 0.5), fl + 0.55, d / 2 + 1.4));
  g.add(box(w + 1.1, 0.08, 0.08, M.wood, 0, fl + 0.95, d / 2 + 1.4));
  const ladder = new Group();
  for (const sx of [-1, 1]) ladder.add(box(0.08, 2, 0.08, M.wood, sx * 0.35, 0, 0));
  for (let i = 0; i < 5; i++) ladder.add(box(0.7, 0.06, 0.06, M.wood, 0, -0.8 + i * 0.4, 0));
  ladder.position.set(w / 2 - 0.4, fl / 2 + 0.1, d / 2 + 1.75);
  ladder.rotation.x = -0.32;
  g.add(ladder);
  if (rnd() < 0.6) g.add(cyl(0.3, 0.27, 0.7, 8, M.barrel, -w / 2 + 0.2, fl + 0.46, d / 2 + 0.9));
  return { g, boxes: [[w + 1.3, d + 2.2, 0, 0.5]], circles: [] };
}

function steinhausPlain(rnd: () => number): Built {
  const g = new Group();
  const w = 6.2 + rnd() * 0.8, d = 5, h = 3.1;
  g.add(footing(w + 0.5, d + 0.5, M.stoneDark), box(w, h, d, M.stone, 0, h / 2, 0));
  // helle Ecksteine
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let k = 0; k < 4; k++) g.add(box(0.5, 0.42, 0.5, M.stoneLight, sx * (w / 2 - 0.2), 0.4 + k * 0.78, sz * (d / 2 - 0.2)));
  const roofMat = rnd() < 0.5 ? M.slate : M.tile;
  g.add(roofOn(w + 0.9, 2.3, d + 1.1, roofMat, h));
  // Schornstein am Giebel
  const cx = w * 0.3;
  g.add(box(0.8, 2.6, 0.8, M.stoneDark, cx, h + 1.5, -0.6), box(0.96, 0.18, 0.96, M.stoneLight, cx, h + 2.85, -0.6));
  g.add(box(1.15, 2.05, 0.12, M.darkWood, 0, 1.02, d / 2 + 0.03), box(1.5, 0.22, 0.3, M.stoneLight, 0, 2.18, d / 2 + 0.06), box(1.6, 0.16, 0.7, M.stoneLight, 0, 0.02, d / 2 + 0.4));
  windowAt(g, -w * 0.3, 1.8, d / 2 + 0.03);
  windowAt(g, w * 0.3, 1.8, d / 2 + 0.03);
  windowAt(g, 0, 1.8, -d / 2 - 0.03, Math.PI);
  // Fensterläden
  for (const s of [-1, 1]) for (const e of [-1, 1]) g.add(box(0.34, 0.9, 0.05, M.wood, s * w * 0.3 + e * 0.6, 1.8, d / 2 + 0.05));
  return { g, boxes: [[w + 0.3, d + 0.3]], circles: [], smoke: [cx, h + 3.1, -0.6] };
}

function gasthausPlain(): Built {
  const g = new Group();
  const w = 9.2, d = 6.2, h1 = 3, h2 = 2.6;
  g.add(footing(w + 0.5, d + 0.5, M.stoneDark), box(w, h1, d, M.stone, 0, h1 / 2, 0));
  // Obergeschoss: Fachwerk, kragt etwas vor
  g.add(box(w + 0.5, h2, d + 0.5, M.plaster, 0, h1 + h2 / 2, 0));
  for (let i = 0; i <= 6; i++) g.add(box(0.2, h2, 0.08, M.darkWood, -(w + 0.5) / 2 + (i / 6) * (w + 0.5), h1 + h2 / 2, (d + 0.5) / 2 + 0.02), box(0.2, h2, 0.08, M.darkWood, -(w + 0.5) / 2 + (i / 6) * (w + 0.5), h1 + h2 / 2, -(d + 0.5) / 2 - 0.02));
  for (const y of [h1 + 0.1, h1 + h2 - 0.1]) g.add(box(w + 0.6, 0.2, d + 0.6, M.darkWood, 0, y, 0));
  fachwerk(g, w, d, h1, h2);
  g.add(roofOn(w + 1.5, 2.9, d + 1.8, M.tile, h1 + h2));
  g.add(box(1, 3, 1, M.stoneDark, -w * 0.3, h1 + h2 + 1.9, 0.4), box(1.2, 0.2, 1.2, M.stoneLight, -w * 0.3, h1 + h2 + 3.4, 0.4));
  g.add(box(1.5, 2.2, 0.14, M.darkWood, 0, 1.1, d / 2 + 0.04), box(2.2, 0.18, 1, M.stoneLight, 0, 0.02, d / 2 + 0.5));
  for (const sx of [-1, 1]) { windowAt(g, sx * 2.9, 1.75, d / 2 + 0.03, 0, 1, 1); windowAt(g, sx * 2.9, h1 + 1.3, d / 2 + 0.3, 0, 0.9, 0.9); windowAt(g, sx * 2.9, h1 + 1.3, -d / 2 - 0.3, Math.PI, 0.9, 0.9); }
  windowAt(g, 0, h1 + 1.3, d / 2 + 0.3, 0, 0.9, 0.9);
  // Wirtshausschild am Ausleger
  g.add(box(0.1, 0.1, 1.5, M.iron, 2, 3.3, d / 2 + 0.9), box(0.08, 0.8, 1.1, toon('#C9A24E'), 2, 2.8, d / 2 + 1.05));
  // Bänke und Tisch vor dem Haus
  g.add(box(2, 0.1, 0.8, M.wood, -3, 0.8, d / 2 + 1.6), box(0.12, 0.8, 0.7, M.wood, -3.8, 0.4, d / 2 + 1.6), box(0.12, 0.8, 0.7, M.wood, -2.2, 0.4, d / 2 + 1.6));
  return { g, boxes: [[w + 0.6, d + 0.6], [2.1, 0.9, -3, d / 2 + 1.6]], circles: [], smoke: [-w * 0.3, h1 + h2 + 3.7, 0.4] };
}

function scheune(): Built {
  const g = new Group();
  const w = 8, d = 6, h = 3.6;
  g.add(footing(w + 0.4, d + 0.4, M.stoneDark), box(w, h, d, M.barnRed, 0, h / 2, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.3, h, 0.3, M.darkWood, sx * w / 2, h / 2, sz * d / 2));
  // Dach quer: First entlang z, Giebel mit Luke zur Vorderseite
  const roof = roofOn(d + 1.2, 2.6, w + 0.9, M.shingle, h);
  roof.rotation.y = Math.PI / 2;
  g.add(roof);
  // großes zweiflügliges Tor mit Querbalken
  g.add(box(3.2, 2.9, 0.12, M.planks, 0, 1.45, d / 2 + 0.03));
  for (const s of [-1, 1]) {
    const brace = box(0.14, 3.3, 0.06, M.darkWood, s * 0.8, 1.45, d / 2 + 0.1);
    brace.rotation.z = s * 0.5;
    g.add(brace);
  }
  g.add(box(3.5, 0.2, 0.2, M.darkWood, 0, 3, d / 2 + 0.06), box(1, 1, 0.1, M.darkWood, 0, h + 1, d / 2 + 0.2));
  return { g, boxes: [[w + 0.3, d + 0.3]], circles: [] };
}

/** Hölzerner Wachturm: vier Stützen mit Kreuzstreben, Plattform mit Geländer, Dach und Leiter */
function wachturm(): Built {
  const g = new Group();
  const s = 1.5, ph = 6.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.28, ph + 2.2, 0.28, M.darkWood, sx * s, (ph - 2.2) / 2, sz * s));
  for (const y of [1.6, 4.2]) for (const k of [0, 1, 2, 3]) {
    const brace = box(Math.hypot(s * 2, 2.4), 0.12, 0.12, M.wood, 0, y, 0);
    const side = new Group();
    brace.position.z = s;
    brace.rotation.z = (k % 2 ? 1 : -1) * Math.atan2(2.4, s * 2);
    side.add(brace);
    side.rotation.y = (k * Math.PI) / 2;
    g.add(side);
  }
  g.add(box(4.4, 0.24, 4.4, M.planks, 0, ph, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.16, 3, 0.16, M.darkWood, sx * 2, ph + 1.5, sz * 2));
  for (const k of [0, 1, 2, 3]) {
    const side = new Group();
    side.add(box(4.1, 0.1, 0.1, M.wood, 0, ph + 1.05, 2), box(4.1, 0.1, 0.1, M.wood, 0, ph + 0.55, 2));
    side.rotation.y = (k * Math.PI) / 2;
    g.add(side);
  }
  const roof = new Mesh(new ConeGeometry(3.7, 1.9, 4), M.shingle);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = ph + 3.9;
  g.add(roof);
  const ladder = new Group();
  for (const sx of [-1, 1]) ladder.add(box(0.1, ph + 0.6, 0.1, M.wood, sx * 0.4, 0, 0));
  for (let i = 0; i < 14; i++) ladder.add(box(0.8, 0.07, 0.07, M.wood, 0, -ph / 2 + 0.3 + i * 0.46, 0));
  ladder.position.set(0, ph / 2, s + 0.75);
  ladder.rotation.x = -0.09;
  g.add(ladder);
  const lamp = new Mesh(new SphereGeometry(hasProp('laterne') ? 0.05 : 0.24, 10, 8), lampMat);
  lamp.position.set(1.7, ph + 2.3, 1.7);
  lamp.userData.noOutline = true;
  g.add(lamp);
  if (hasProp('laterne')) { const h = harborProp('laterne', crateWood); h.scale.setScalar(0.9); h.position.copy(lamp.position); g.add(h); }
  return { g, boxes: [[3.5, 3.5], [1, 0.8, 0, s + 0.8]], circles: [] };
}

/** Runder Steinturm mit Zinnen, Schießscharten und Leuchtfeuer */
function steinturm(): Built {
  const g = new Group();
  const h = 11, r = 2.7;
  g.add(cyl(r, r * 1.14, h + 2.4, 14, M.stone, 0, (h - 2.4) / 2, 0), cyl(r * 1.22, r * 1.05, 0.9, 14, M.stoneLight, 0, h + 0.2, 0));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const m = box(1, 0.9, 0.5, M.stoneLight, Math.sin(a) * r * 1.12, h + 1.1, Math.cos(a) * r * 1.12);
    m.rotation.y = a;
    g.add(m);
  }
  for (let k = 0; k < 5; k++) {
    const a = 0.9 + (k / 5) * Math.PI * 2;
    const slit = box(0.24, 1.1, 0.2, toon('#1C1A1A'), Math.sin(a) * r * 1.05, 3.2 + (k % 3) * 2.4, Math.cos(a) * r * 1.05);
    slit.rotation.y = a;
    slit.userData.noOutline = true;
    g.add(slit);
  }
  g.add(box(1.3, 2.2, 0.3, M.darkWood, 0, 1.1, r * 1.1), box(1.7, 0.3, 0.5, M.stoneLight, 0, 2.35, r * 1.1));
  // Feuerkorb als Leuchtfeuer
  if (hasArch('feuerkorb')) {
    const kb = archGroup('feuerkorb', lightMats)!;
    kb.position.y = h + 0.06;
    g.add(kb);
  } else {
    g.add(cyl(0.7, 0.45, 0.6, 8, M.iron, 0, h + 1, 0), cyl(0.07, 0.07, 1, 5, M.iron, 0, h + 0.4, 0));
    const coals = new Mesh(new CylinderGeometry(0.55, 0.6, 0.12, 8), emberMat);
    coals.position.y = h + 1.27;
    coals.userData.noOutline = true;
    g.add(coals);
  }
  return { g, boxes: [], circles: [[r * 1.16]], fire: [0, h + 1.35, 0], glows: [{ kind: 'fire', x: 0, y: h + 1.35, z: 0, gy: null, size: 2.1 }] };
}

/** Ruine eines Steinhauses: zerbrochene Mauern unterschiedlicher Höhe, Fensterlücke, Schutt */
function ruine(rnd: () => number): Built {
  const g = new Group();
  const W = 10, D = 8, t = 0.9;
  const boxes: Built['boxes'] = [];
  const circles: Built['circles'] = [];
  const wall = (len: number, h: number, x: number, z: number, along: 'x' | 'z') => {
    const m = along === 'x' ? box(len, h + 1.6, t, M.ruin, x, (h - 1.6) / 2, z) : box(t, h + 1.6, len, M.ruin, x, (h - 1.6) / 2, z);
    g.add(m);
    // abgebrochene Mauerkrone: ein schiefer Stein obenauf
    const cap = new Mesh(new DodecahedronGeometry(t * 0.62, 0), M.ruin);
    cap.position.set(x + (rnd() - 0.5) * (along === 'x' ? len * 0.6 : 0), h + 0.1, z + (rnd() - 0.5) * (along === 'z' ? len * 0.6 : 0));
    cap.scale.set(1.3, 0.7, 1);
    cap.rotation.set(rnd(), rnd() * 3, rnd());
    g.add(cap);
    boxes.push(along === 'x' ? [len, t, x, z] : [t, len, x, z]);
  };
  // Rückwand in drei Stufen
  wall(3.6, 4.4, -W / 2 + 1.8, -D / 2, 'x'); wall(3.2, 2.9, -W / 2 + 5.2, -D / 2, 'x'); wall(3.2, 1.3, W / 2 - 1.6, -D / 2, 'x');
  // linke Wand mit Fensterlücke und Sturz
  wall(2.6, 3.8, -W / 2, -D / 2 + 1.3, 'z'); wall(2.4, 3.8, -W / 2, D / 2 - 1.2, 'z');
  g.add(box(t, 0.6, 3.2, M.ruin, -W / 2, 3.5, 0.05), box(t, 1.2 + 1.6, 3, M.ruin, -W / 2, (1.2 - 1.6) / 2, 0.05));
  boxes.push([t, 3, -W / 2, 0.05]);
  // rechte Wand: nur noch ein Stumpf
  wall(3, 1.6, W / 2, -D / 2 + 1.5, 'z');
  // Vorderseite: zwei Türpfosten
  wall(1.4, 3.2, -1.9, D / 2, 'x'); wall(1.2, 2.2, 1.8, D / 2, 'x'); wall(2.4, 0.9, W / 2 - 1.2, D / 2, 'x');
  // Schutt und umgestürzte Quader
  for (let i = 0; i < 9; i++) {
    const s = 0.5 + rnd() * 0.7;
    const b = box(s * 1.4, s * 0.7, s, M.ruin, (rnd() - 0.5) * (W + 4), s * 0.25, (rnd() - 0.5) * (D + 4));
    b.rotation.set((rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.5);
    g.add(b);
    if (s > 0.8) circles.push([s * 0.7, b.position.x, b.position.z]);
  }
  // Moospolster auf den Mauerkronen
  for (let i = 0; i < 5; i++) {
    const m = new Mesh(new SphereGeometry(0.5 + rnd() * 0.3, 6, 4), M.moss);
    m.scale.y = 0.35;
    m.position.set(-W / 2 + rnd() * 6, [4.4, 2.9, 3.8][i % 3] + 0.05, i % 2 ? -D / 2 : -D / 2 + rnd() * 2);
    g.add(m);
  }
  return { g, boxes, circles };
}

function ruinenbogenPlain(): Built {
  const g = new Group();
  for (const s of [-1, 1]) g.add(box(1.2, 5.6 + 1.6, 1.2, M.ruin, s * 2.6, (5.6 - 1.6) / 2, 0), box(1.6, 0.4, 1.6, M.ruin, s * 2.6, 0.2, 0));
  const top = new Mesh(new TorusGeometry(2.6, 0.6, 4, 10, Math.PI), M.ruin);
  top.position.y = 5.6;
  g.add(top);
  return { g, boxes: [], circles: [[0.95, -2.6, 0], [0.95, 2.6, 0]] };
}

function saeulen(rnd: () => number): Built {
  const g = new Group();
  const boxes: Built['boxes'] = [];
  const circles: Built['circles'] = [];
  for (let i = 0; i < 4; i++) {
    const h = i === 1 ? 1.2 + rnd() : 3.6 + rnd() * 2.2;
    const x = -4.5 + i * 3;
    g.add(cyl(0.5, 0.58, h + 1.4, 9, M.ruin, x, (h - 1.4) / 2, 0), box(1.5, 0.45, 1.5, M.ruin, x, 0.22, 0));
    if (h > 4) g.add(box(1.4, 0.4, 1.4, M.ruin, x, h + 0.2, 0));
    circles.push([0.85, x, 0]);
  }
  // eine umgestürzte Säule davor
  const fallen = cyl(0.5, 0.5, 4, 9, M.ruin, 0.5, 0.45, 2.6);
  fallen.rotation.set(0, 0.3, Math.PI / 2);
  g.add(fallen);
  boxes.push([4, 1, 0.5, 2.6, (0.3 * 180) / Math.PI]);
  return { g, boxes, circles };
}

function zaun(len: number): Built {
  const g = new Group();
  const n = Math.max(1, Math.round(len / 1.5));
  const yard: Object3D[] = [];
  const add = (o: Object3D) => { g.add(o); yard.push(o); return o; };
  for (let i = 0; i <= n; i++) add(box(0.14, 1.9, 0.14, M.wood, -len / 2 + (i / n) * len, 0.2, 0));
  // Latten je Feld zwischen zwei Pfosten (nicht ein langer Balken): `settleYard` legt jedes Feld in die Neigung des Bodens
  for (let i = 0; i < n; i++) {
    const x0 = -len / 2 + (i / n) * len, x1 = -len / 2 + ((i + 1) / n) * len;
    for (const y of [0.45, 0.85]) { const r = add(box(x1 - x0 + 0.02, 0.1, 0.08, M.wood, (x0 + x1) / 2, y, 0)); r.userData.seg = [x0, x1]; }
  }
  g.userData.yard = yard;
  return { g, boxes: [[len, 0.3]], circles: [] };
}

/** Trockenmauer aus Feldsteinen */
function mauer(len: number, rnd: () => number): Built {
  const g = new Group();
  const n = Math.max(1, Math.round(len / 1.7));
  const yard: Object3D[] = [];
  for (let i = 0; i < n; i++) {
    const h = 0.95 + rnd() * 0.35;
    const seg = box(len / n + 0.06, h + 1.4, 0.62 + rnd() * 0.12, M.stoneDark, -len / 2 + (i + 0.5) * (len / n), (h - 1.4) / 2, (rnd() - 0.5) * 0.08);
    g.add(seg);
    yard.push(seg);
    if (rnd() < 0.5) {
      const cap = new Mesh(new DodecahedronGeometry(0.34, 0), M.stoneLight);
      cap.position.set(seg.position.x + (rnd() - 0.5) * 0.6, h + 0.1, 0);
      cap.scale.y = 0.6;
      cap.rotation.y = rnd() * 3;
      g.add(cap);
      yard.push(cap);
    }
  }
  // jedes Mauerstück folgt dem Boden (Trockenmauer auf dem Hang stuft sich ab); die Steine reichen 1,4 m in den Boden
  g.userData.yard = yard;
  return { g, boxes: [[len, 0.8]], circles: [] };
}

/** Steg: Bohlen auf Pfählen, Poller und Laterne am Ende. Ursprung an der Wasserlinie, verläuft nach +z. */
function steg(len: number): Built {
  const g = new Group();
  const glbPier = hasArch('steg_modul');
  if (glbPier) {
    // Blender-Steg: Module von 4,5 m mit einzelnen Bohlen, Längsträgern, Pfählen und umwickelten Tauen
    for (let i = 0; i * 4.5 < len + 6; i++) {
      const mod = archGroup('steg_modul', pierMats)!;
      mod.position.z = -3 + i * 4.5;
      g.add(mod);
    }
  } else {
    const deck = new BoxGeometry(3, 0.36, len + 6);
    deckUV(deck, 3, len + 6);
    const pier = new Mesh(deck, M.deck);
    pier.position.set(0, 1.27, len / 2 - 3);
    g.add(pier);
  }
  // Pfähle, Poller, Laternenmast und Fass sind fest (Kollisionsprüfung 2.9.33: vorher ging man durch sie hindurch)
  const circles: Built['circles'] = [];
  // Pfähle: im Modul bei z = 1 (Modulanfang -3 + 4,5·i, also z = -2 + 4,5·i); sonst Zylinder wie früher
  if (glbPier) { for (let z = -2; z <= len - 0.5; z += 4.5) if (z > 0) for (const sx of [-1, 1]) circles.push([0.22, sx * 1.55, z]); }
  else for (let z = 1; z <= len - 0.5; z += 4.5) for (const sx of [-1, 1]) { g.add(cyl(0.17, 0.19, 4.4, 6, M.darkWood, sx * 1.55, -0.6, z)); circles.push([0.22, sx * 1.55, z]); }
  for (const sx of [-1, 1]) { g.add(cyl(0.2, 0.22, 1.1, 6, M.darkWood, sx * 1.2, 1.9, len - 0.6)); circles.push([0.26, sx * 1.2, len - 0.6]); }
  g.add(cyl(0.08, 0.1, 2.6, 6, M.darkWood, 1.25, 2.7, len * 0.5));
  circles.push([0.18, 1.25, len * 0.5], [0.32, -0.9, len * 0.72]);
  const lamp = new Mesh(new SphereGeometry(hasProp('laterne') ? 0.05 : 0.24, 10, 8), lampMat);
  lamp.position.set(1.25, 4.05, len * 0.5);
  lamp.userData.noOutline = true;
  g.add(lamp);
  if (hasProp('fass')) {
    const b = harborProp('fass', barrelWood);
    b.position.set(-0.9, 1.45, len * 0.72);
    g.add(b);
  } else g.add(cyl(0.3, 0.27, 0.7, 8, M.barrel, -0.9, 1.8, len * 0.72));
  if (hasProp('kiste')) {
    const k = harborProp('kiste', crateWood);
    k.scale.setScalar(0.9);
    k.position.set(-0.95, 1.45, len * 0.4);
    k.rotation.y = 0.3;
    g.add(k);
    circles.push([0.55, -0.95, len * 0.4]);
  }
  if (hasProp('laterne')) {
    const h = harborProp('laterne', crateWood);
    h.scale.setScalar(0.9);
    h.position.copy(lamp.position);
    g.add(h);
  }
  // Taurolle
  const rope = new Mesh(new TorusGeometry(0.34, 0.1, 5, 10), toon('#B8A070'));
  rope.rotation.x = Math.PI / 2;
  rope.position.set(0.8, 1.52, len * 0.86);
  g.add(rope);
  return { g, boxes: [], circles, pier: len, glows: [{ kind: 'lamp', x: 1.25, y: 4.05, z: len * 0.5, gy: 1.45, size: 1.0, pool: 6.5, glint: true }] };
}

function kisten(rnd: () => number): Built {
  const g = new Group();
  const n = 3 + Math.floor(rnd() * 3);
  const sizes: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = 0.8 + rnd() * 0.3;
    sizes.push(s);
    const lift = i >= 2 && i < 4 ? 0.85 * sizes[i - 2] : 0;     // obere Kiste steht auf der darunter
    const px = (i % 2) * 1.05 - 0.52, pz = i >= 4 ? 1.05 : (i % 3) * 0.12;
    if (hasProp('kiste')) {
      const c = harborProp('kiste', crateWood);
      c.scale.setScalar(s);
      c.position.set(px, lift, pz);
      c.rotation.y = (rnd() - 0.5) * 0.5;
      g.add(c);
      continue;
    }
    const c = box(s, s, s, M.crate, px, s / 2 + (i >= 2 && i < 4 ? 0.92 : 0), pz);
    c.rotation.y = (rnd() - 0.5) * 0.5;
    g.add(c);
  }
  return { g, boxes: [[2.2, n > 4 ? 2.3 : 1.3, 0, n > 4 ? 0.5 : 0.05]], circles: [] };
}

/** Blender-Prop mit den Materialien der Hafenbauten (ohne Textur: die gepackten UV-Inseln taugen nicht für Kachel-Holz) */
const harborProp = (id: PropId, wood: () => Material) => propGroup(id, (role) => {
  switch (role) {
    case 'iron': return M.iron;
    case 'brass': return toon({ color: '#E3B04B', spec: 1, metalness: 1, roughness: 0.4 });
    case 'darkwood': return M.darkWood;
    case 'glass': return lanternGlass;
    case 'ember': return lampMat;
    default: return wood();
  }
});
const barrelWood = () => toon({ color: '#7A5030', roughness: 0.85 });
const crateWood = () => toon({ color: '#9A6A3A', roughness: 0.85 });
const barrelMesh = (x: number, z: number, s = 1) => {
  if (hasProp('fass')) {
    const b = harborProp('fass', barrelWood);
    b.scale.setScalar(1.2 * s);
    b.position.set(x, 0, z);
    return b;
  }
  const b = new Group();
  b.add(cyl(0.4 * s, 0.36 * s, 1 * s, 10, M.barrel, 0, 0.5 * s, 0));
  for (const y of [0.22, 0.78]) b.add(cyl(0.415 * s, 0.4 * s, 0.07 * s, 10, M.iron, 0, y * s, 0));
  b.position.set(x, 0, z);
  return b;
};
function fass(): Built {
  const g = new Group();
  g.add(barrelMesh(0, 0));
  return { g, boxes: [], circles: [[0.5]] };
}
function faesser(rnd: () => number): Built {
  const g = new Group();
  g.add(barrelMesh(-0.5, 0), barrelMesh(0.45, 0.15, 0.92));
  const lying = barrelMesh(0, 0, 0.95);
  lying.rotation.set(Math.PI / 2, 0, rnd() * 0.6);
  lying.position.set(0.1, 0.38, 1);
  g.add(lying);
  return { g, boxes: [[2, 1.8, 0, 0.45]], circles: [] };
}

function brunnen(): Built {
  const g = new Group();
  g.add(new Mesh(new CylinderGeometry(1.1, 1.2, 0.95, 12, 1, true), toon({ color: '#A8A092', detail: 'rock', side: DoubleSide })));
  g.children[0].position.y = 0.47;
  const rim = new Mesh(new TorusGeometry(1.1, 0.14, 5, 12), M.stoneLight);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.95;
  const water = cyl(1, 1, 0.05, 12, toon({ color: '#2A5A6E', spec: 0.8 }), 0, 0.55, 0);
  g.add(rim, water);
  for (const s of [-1, 1]) g.add(box(0.16, 2.4, 0.16, M.darkWood, s * 1.05, 1.2, 0));
  g.add(roofOn(2.9, 0.8, 1.9, M.shingle, 2.4), cyl(0.07, 0.07, 2.1, 6, M.wood, 0, 2.05, 0), cyl(0.2, 0.16, 0.34, 8, M.wood, 0, 1.25, 0));
  (g.children[g.children.length - 2] as Mesh).rotation.z = Math.PI / 2;
  return { g, boxes: [], circles: [[1.35]] };
}

function laterne(): Built {
  const g = new Group();
  const glbPost = hasArch('laternenpfahl');
  if (glbPost) g.add(archGroup('laternenpfahl', lanternMats)!);
  else g.add(cyl(0.08, 0.1, 3, 6, M.darkWood, 0, 1.5, 0), box(0.7, 0.08, 0.08, M.darkWood, 0.3, 2.9, 0));
  const lamp = new Mesh(new SphereGeometry(glbPost || hasProp('laterne') ? 0.05 : 0.22, 10, 8), lampMat);
  lamp.position.set(0.6, 2.7, 0);
  lamp.userData.noOutline = true;
  g.add(lamp);
  if (!glbPost && hasProp('laterne')) {
    const h = harborProp('laterne', crateWood);
    h.scale.setScalar(0.8);
    h.position.copy(lamp.position);
    g.add(h);
  }
  return { g, boxes: [], circles: [[0.22]], glows: [{ kind: 'lamp', x: 0.6, y: 2.7, z: 0, gy: 0, size: 0.9, pool: 6 }] };
}

/** Acker: gepflügte Furchen – die Halme darauf setzt die Siedlung als instanzierte Pflanzen */
function feld(len: number): Built {
  const g = new Group();
  const rows: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const z = -3.75 + i * 1.5;
    const ridge = box(len, 0.5, 0.9, M.soil, 0, -0.1, z);
    ridge.userData.noOutline = true;
    g.add(ridge);
    rows.push([-len / 2 + 0.4, z, len - 0.8]);
  }
  return { g, boxes: [], circles: [], rows };
}

function heu(rnd: () => number): Built {
  const g = new Group();
  const bale = cyl(0.9, 0.9, 1.4, 12, M.straw, 0, 0.9, 0);
  bale.rotation.set(0, rnd() * 3, Math.PI / 2);
  g.add(bale);
  return { g, boxes: [], circles: [[1.05]] };
}

function boot(): Built {
  const g = new Group();
  const hull = new Mesh(new SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.hull);
  hull.scale.set(0.8, 0.45, 2);
  hull.position.y = 0.45;
  hull.rotation.z = 0.15;
  g.add(hull, box(1.3, 0.06, 0.3, M.wood, 0, 0.4, 0.3), box(1.2, 0.06, 0.3, M.wood, 0, 0.4, -0.7));
  const oar = box(0.07, 0.07, 2.6, M.wood, 0.95, 0.2, 0);
  oar.rotation.y = 0.2;
  g.add(oar);
  return { g, boxes: [[1.7, 4]], circles: [] };
}

function netz(): Built {
  const g = new Group();
  for (const s of [-1, 1]) g.add(cyl(0.06, 0.07, 3.4, 4, M.darkWood, s * 1.4, 0.3, 0));
  const net = new Mesh(new PlaneGeometry(2.8, 1.4, 6, 3), M.net);
  net.position.y = 1.2;
  net.userData.noOutline = true;
  g.add(net);
  return { g, boxes: [[3, 0.4]], circles: [] };
}

function feuer(): Built {
  const g = new Group();
  const glbFire = hasArch('feuerstelle');
  if (glbFire) g.add(archGroup('feuerstelle', lightMats)!);
  const stone = toon({ color: '#6E6A64', flatShading: true });
  for (let i = 0; !glbFire && i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new Mesh(new DodecahedronGeometry(0.22, 0), stone);
    s.position.set(Math.cos(a) * 0.75, 0.12, Math.sin(a) * 0.75);
    g.add(s);
  }
  for (let i = 0; !glbFire && i < 4; i++) {
    const log = cyl(0.08, 0.1, 1.1, 5, toon('#3A2A1E'), 0, 0.3, 0);
    log.rotation.set(0.5, (i / 4) * Math.PI * 2, 0);
    g.add(log);
  }
  // Glutbett: flache glühende Scheibe zwischen den Holzscheiten; die Flamme darüber zeichnet das GlowSystem
  const ember = new Mesh(new CylinderGeometry(0.5, 0.58, 0.1, 9), emberMat);
  ember.position.y = 0.2;
  ember.userData.noOutline = true;
  if (!glbFire) g.add(ember);
  // Sitzbalken
  const seat = cyl(0.2, 0.22, 2.2, 6, toon('#6A5038'), 0, 0.2, 1.9);
  seat.rotation.z = Math.PI / 2;
  g.add(seat);
  return { g, boxes: [[2.2, 0.5, 0, 1.9]], circles: [[1]], fire: [0, 0.4, 0], glows: [{ kind: 'fire', x: 0, y: 0.26, z: 0, gy: 0, size: 1.25, pool: 9 }] };
}

/** Kollisions-Gitter eines aufgestellten Bauwerks in Weltkoordinaten (wx, wz = Standort, yaw = rotation.y) */
/**
 * Umgebungs-Props an Wohnhäusern (alles im Objektraum des Hauses, Tür vorn bei +z):
 * Pflasterweg von der Tür, Hängelaterne und Laternenpfahl, Holzstapel mit Hackklotz, Wäscheleine hinter dem Haus
 * und ein Lattenzaun mit Lücke für den Weg. Jedes Stück bringt seine Kollision mit.
 */
/**
 * Enge Höfe (Stadt): Die Häuser stehen nur 1 bis 2,7 m hinter dem Straßenrand. Mit dem normalen Vorgarten (Zaun 3,4 m, Pfahl 5,2 m, Weg
 * 6 m vor der Tür) lag das alles mitten auf der Straße. Im engen Hof sind Weg, Zaun und Hofpfahl kurz, die Straße hat eigene Laternen.
 */
let yardCompact = false;
export function setYardCompact(on: boolean) { yardCompact = on; }

/** Bauten mit Grundfläche, die auf Hängen auf Türhöhe stehen und einen Sockel bekommen */
export const SETTLES = new Set<StructureType>(['holzhuette', 'steinhaus', 'gasthaus', 'scheune', 'fachwerkhaus', 'kolonialhaus', 'lagerhaus', 'kapelle']);
/** Grundfläche eines Baus einebnen (größter Kollisionsquader, etwas größer): Weltmitte, Drehung; `addPad` kommt von der Insel (WalkIsland.addPad) */
export function levelFootprint(b: Built, wx: number, wz: number, yaw: number, addPad: ((x: number, z: number, w: number, d: number, yaw: number, blend?: number, round?: boolean) => number) | undefined, margin = 0.9, blend = 2.6) {
  if (!addPad || !b.boxes.length) return;
  const big = b.boxes.reduce((m, q) => (q[0] * q[1] > m[0] * m[1] ? q : m), b.boxes[0]);
  const c = Math.cos(yaw), s = Math.sin(yaw), ox = big[2] ?? 0, oz = big[3] ?? 0;
  addPad(wx + ox * c + oz * s, wz - ox * s + oz * c, big[0] + margin, big[1] + margin, yaw, blend);
}

const plinthMat = markShared(toon('#8E8576'));
/**
 * Bau auf einem Hang aufstellen: der Fußboden liegt auf Höhe des Bodens vor der Tür (Tür bei +z), nicht in der Mitte – sonst schwebt das
 * Haus auf der einen Seite und versinkt auf der anderen. Fällt das Gelände dahinter ab, trägt ein Steinsockel bis zum tiefsten Punkt.
 * `hAt` in denselben Koordinaten wie x/z. Liefert die Höhe des Fußbodens; setzt Position und Drehung von `b.g`.
 */
export function settleOnSlope(b: Built, x: number, z: number, yaw: number, hAt: (x: number, z: number) => number): number {
  const big = b.boxes.reduce((m, q) => (q[0] * q[1] > m[0] * m[1] ? q : m), b.boxes[0] ?? [4, 4, 0, 0]);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const ox = big[2] ?? 0, oz = big[3] ?? 0;
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const lx = ox + (i / 4 - 0.5) * big[0], lz = oz + (j / 4 - 0.5) * big[1];
    const h = hAt(x + lx * c + lz * s, z - lx * s + lz * c);
    if (h < mn) mn = h;
    if (h > mx) mx = h;
  }
  let y = hAt(x, z);
  if (mx - mn > 0.45) {
    const fz = oz + big[1] / 2 + 0.7;
    const frontY = hAt(x + ox * c + fz * s, z - ox * s + fz * c);
    y = Math.max(mn + 0.05, Math.min(frontY, mn + 1.6));
    const drop = y - mn + 0.35;
    if (drop > 0.4 && big[0] > 3) {
      const plinth = new Mesh(new BoxGeometry(big[0] + 0.25, drop, big[1] + 0.25), plinthMat);
      plinth.position.set(ox, 0.1 - drop / 2, oz);
      b.g.add(plinth);
    }
  }
  b.g.position.set(x, y, z);
  b.g.rotation.y = yaw;
  return y;
}

/**
 * Teile eines Bauwerks, die dem Boden folgen sollen (Zaunfelder, Mauerstücke, Trittsteine, Holzstapel): nach dem Aufstellen jedes einzelne
 * auf die Höhe des Bodens an seiner Stelle setzen (Verschiebung gegenüber dem Ursprung des Baus, höchstens ±1,5 m). Zaunfelder (`seg`) legen
 * sich zusätzlich in die Neigung zwischen ihren Pfosten. Vorher standen Zaun, Weg und Mauer auf der Höhe des Ursprungs: auf Hängen
 * schwebten Latten und Trittsteine, oder sie steckten im Hang. `hAt` in denselben Koordinaten wie x/z.
 */
export function settleYard(b: Built, x: number, z: number, yaw: number, hAt: (x: number, z: number) => number) {
  const yard = b.g.userData.yard as Object3D[] | undefined;
  if (!yard?.length) return;
  const c = Math.cos(yaw), s = Math.sin(yaw), y0 = b.g.position.y;
  const at = (lx: number, lz: number) => hAt(x + lx * c + lz * s, z - lx * s + lz * c);
  const lim = (v: number) => Math.max(-1.5, Math.min(1.5, v));
  for (const o of yard) {
    const p = o.position;
    const seg = o.userData.seg as [number, number] | undefined;
    if (seg) {
      const d0 = lim(at(seg[0], p.z) - y0), d1 = lim(at(seg[1], p.z) - y0);
      p.y += (d0 + d1) / 2;
      o.rotation.z = Math.atan2(d1 - d0, seg[1] - seg[0]);
      continue;
    }
    const dy = lim(at(p.x, p.z) - y0);
    if (Math.abs(dy) < 0.005) continue;
    p.y += dy;
    const mate = o.userData.mate as Object3D | undefined;
    if (mate) mate.position.y += dy;
  }
}

/** Steinbauten ohne Einebnung (Festungstore, Türme), die auf Hängen einen Steinsockel bis zum Boden bekommen */
export const PLINTHED = new Set<StructureType>(['torhaus', 'zinnenturm', 'bergfried', 'steinturm', 'wachturm', 'kran']);

/**
 * Steinsockel unter jedem Kollisionsquader eines Baus: reicht von der Unterkante des Baus bis zum tiefsten Boden darunter. Der Bau selbst
 * bleibt, wo er ist; auf der Talseite eines Hangs sieht man so keinen Spalt mehr unter dem Fundament (Torhäuser schwebten bis 2,5 m).
 * Muss nach dem Setzen von Position und Drehung von `b.g` aufgerufen werden; `hAt` in denselben Koordinaten wie x/z.
 */
export function addPlinths(b: Built, x: number, z: number, yaw: number, hAt: (x: number, z: number) => number) {
  const c = Math.cos(yaw), s = Math.sin(yaw), y0 = b.g.position.y;
  for (const [w, d, ox = 0, oz = 0, by = 0] of b.boxes) {
    if (w < 3 || d < 3) continue;
    const cb = Math.cos((by * Math.PI) / 180), sb = Math.sin((by * Math.PI) / 180);
    let mn = Infinity;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      // Punkt im Quader (Objektraum, Quader um `by` gedreht), dann in die Welt (um yaw)
      const u = (i / 4 - 0.5) * w, v = (j / 4 - 0.5) * d;
      const lx = ox + u * cb + v * sb, lz = oz - u * sb + v * cb;
      const h = hAt(x + lx * c + lz * s, z - lx * s + lz * c);
      if (h < mn) mn = h;
    }
    const drop = y0 - mn + 0.35;
    if (drop < 0.4 || drop > 9) continue;
    const plinth = new Mesh(new BoxGeometry(w + 0.25, drop, d + 0.25), plinthMat);
    plinth.position.set(ox, 0.1 - drop / 2, oz);
    plinth.rotation.y = (by * Math.PI) / 180;
    b.g.add(plinth);
  }
}

function dress(b: Built, rnd: () => number, w: number, d: number, wide = false): Built {
  const g = b.g;
  const front = d / 2;
  const tight = yardCompact;
  // gepflasterter Steinweg: unregelmäßige Platten, leicht schlängelnd
  const n = tight ? 2 : wide ? 11 : 9;
  // Teile des Vorgartens, die dem Boden folgen (settleYard): Trittsteine, Holzstapel, Zaun
  const yard: Object3D[] = [];
  for (let i = 0; i < n; i++) {
    const z = front + 0.8 + i * 0.62;
    const cx = Math.sin(i * 0.8 + 1) * 0.3;
    for (const dx of wide ? [-0.55, 0.55] : [0]) {
      const r = 0.3 + rnd() * 0.12;
      const st = new Mesh(new DodecahedronGeometry(r, 0), i % 3 ? M.stoneLight : M.stoneDark);
      st.scale.set(1.15, 0.16, 1);
      st.position.set(cx + dx + (rnd() - 0.5) * 0.18, 0.03, z + (rnd() - 0.5) * 0.14);
      st.rotation.y = rnd() * 3;
      g.add(st);
      yard.push(st);
    }
  }
  // Hängelaterne neben der Tür
  const lx = w * 0.22 + 1.1;
  g.add(box(0.06, 0.06, 0.5, M.iron, lx, 2.5, front + 0.25));
  const lamp = new Mesh(new SphereGeometry(0.15, 8, 6), lampMat);
  lamp.position.set(lx, 2.28, front + 0.5);
  lamp.userData.noOutline = true;
  g.add(lamp, cyl(0.08, 0.14, 0.08, 6, M.iron, lx, 2.46, front + 0.5), cyl(0.14, 0.08, 0.08, 6, M.iron, lx, 2.1, front + 0.5));
  // Laternenpfahl am Wegrand
  const px = 1.5, pz = front + 5.2;
  const circles: Built['circles'] = [];
  if (!tight) {
    g.add(cyl(0.07, 0.1, 2.5, 6, M.darkWood, px, 1.25, pz), box(0.5, 0.06, 0.06, M.iron, px - 0.22, 2.4, pz));
    const post = new Mesh(new SphereGeometry(0.17, 8, 6), lampMat);
    post.position.set(px - 0.45, 2.22, pz);
    post.userData.noOutline = true;
    g.add(post);
    circles.push([0.2, px, pz]);
  }
  const boxes: Built['boxes'] = [];
  // Holzstapel mit Hackklotz an der Seitenwand
  const sx = rnd() < 0.5 ? -1 : 1;
  const wx = sx * (w / 2 + 0.85), wz = -d * 0.1;
  const logs = new Group();
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 5 - row; i++) {
      const log = cyl(0.13, 0.13, 1.5, 6, row % 2 ? M.planksGrey : M.wood, (i - (4 - row) / 2) * 0.28, 0.14 + row * 0.24, 0);
      log.rotation.x = Math.PI / 2;
      logs.add(log);
    }
  }
  logs.position.set(wx, 0, wz);
  logs.rotation.y = Math.PI / 2;
  g.add(logs);
  yard.push(logs);
  const block = cyl(0.26, 0.28, 0.4, 8, M.wood, wx + sx * 0.2, 0.2, wz + 1.3);
  const axe = box(0.05, 0.5, 0.05, M.darkWood, wx + sx * 0.2, 0.6, wz + 1.3);
  g.add(block, axe);
  yard.push(block, axe);
  boxes.push([1.6, 0.8, wx, wz, 0]);
  boxes.push([0.6, 0.6, wx + sx * 0.2, wz + 1.3]);
  // Wäscheleine hinter dem Haus mit bunten Tüchern
  if (rnd() < 0.7) {
    const z0 = -d / 2 - 1.8, half = Math.min(2.4, w * 0.4);
    for (const e of [-1, 1]) { g.add(cyl(0.05, 0.06, 2.2, 5, M.darkWood, e * half, 1.1, z0)); circles.push([0.15, e * half, z0]); }
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const x0 = -half + t0 * 2 * half, x1 = -half + t1 * 2 * half;
      const y0 = 2.05 - Math.sin(t0 * Math.PI) * 0.32, y1 = 2.05 - Math.sin(t1 * Math.PI) * 0.32;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const seg = box(len, 0.025, 0.025, M.darkWood, (x0 + x1) / 2, (y0 + y1) / 2, z0);
      seg.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      g.add(seg);
    }
    const cols = ['#E8E2D0', '#C0453A', '#3C6EA8', '#E0B040', '#8A9E5A'];
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.7) / 4.4;
      const cx = -half + t * 2 * half, cy = 2.05 - Math.sin(t * Math.PI) * 0.32;
      const ch = 0.5 + rnd() * 0.4, cw = 0.4 + rnd() * 0.3;
      const cloth = new Mesh(new PlaneGeometry(cw, ch), toon({ color: cols[Math.floor(rnd() * cols.length)], side: DoubleSide }));
      cloth.position.set(cx, cy - ch / 2, z0);
      cloth.rotation.set(0, (rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.12);
      g.add(cloth);
    }
  }
  // Lattenzaun vor dem Haus, Lücke für den Weg
  if (rnd() < 0.8) {
    const fz = front + (tight ? 0.75 : 3.4);
    for (const e of [-1, 1]) {
      const x0 = e * 1.2, x1 = e * (w / 2 + 1.8);
      const len = Math.abs(x1 - x0), mid = (x0 + x1) / 2;
      const pk = Math.max(3, Math.round(len / 0.3));
      for (let i = 0; i <= pk; i++) {
        const x = x0 + (x1 - x0) * (i / pk);
        // Latte und Spitze folgen zusammen dem Boden: ein Paar bekommt dieselbe Verschiebung (Spitze = Kind-Eintrag der Latte)
        const paling = box(0.1, 0.9, 0.05, M.planksGrey, x, 0.43, fz), tip = cyl(0.0, 0.07, 0.12, 4, M.planksGrey, x, 0.94, fz);
        g.add(paling, tip);
        yard.push(paling);
        paling.userData.mate = tip;
      }
      for (const y of [0.3, 0.68]) { const rail = box(len, 0.07, 0.05, M.wood, mid, y, fz - 0.05); g.add(rail); yard.push(rail); }
      boxes.push([len, 0.12, mid, fz]);
    }
  }
  b.boxes.push(...boxes);
  b.circles.push(...circles);
  g.userData.yard = yard;
  (b.glows ??= []).push({ kind: 'lamp', x: lx, y: 2.28, z: front + 0.5, gy: 0, size: 0.7, pool: 4.8 });
  if (!tight) b.glows.push({ kind: 'lamp', x: px - 0.45, y: 2.22, z: pz, gy: 0, size: 0.8, pool: 5.5 });
  return b;
}

/** Fachwerk am Obergeschoss: Schwellen, Streben und Diagonalen zwischen den Pfosten */
function fachwerk(g: Group, w: number, d: number, y0: number, h: number) {
  const bays = 6, bw = (w + 0.5) / bays;
  for (const sz of [-1, 1]) {
    const z = sz * ((d + 0.5) / 2 + 0.05);
    g.add(box(w + 0.5, 0.14, 0.1, M.darkWood, 0, y0 + h * 0.5, z));
    for (let i = 0; i < bays; i++) {
      if (i % 2 === 1) continue;
      const dx = -(w + 0.5) / 2 + (i + 0.5) * bw;
      const len = Math.hypot(bw, h * 0.5);
      const diag = box(len, 0.13, 0.08, M.darkWood, dx, y0 + h * 0.25, z);
      diag.rotation.z = Math.atan2(h * 0.5, bw) * (i % 4 === 0 ? 1 : -1);
      const diag2 = box(len, 0.13, 0.08, M.darkWood, dx, y0 + h * 0.75, z);
      diag2.rotation.z = -diag.rotation.z;
      g.add(diag, diag2);
    }
  }
}

// ---------- Bauten der zweiten Welt-Fassung (tools/blender/build_arch2.py) ----------
const WALL_TINTS = ['#E2D6BC', '#D9C08E', '#C9CFD0', '#DCC4B0', '#D8D2C2'];
const COLONIAL_TINTS = ['#EBC86A', '#E39A7A', '#9CCBC0', '#EAD9B0', '#D98AA0', '#8EBBD8', '#EDD2A2', '#B5D58C'];
const ROOF_TINTS = ['#6E4A2E', '#46525E', '#8E3A2A', '#5A4A3A'];

function fachwerkhaus(rnd: () => number): Built {
  const g = new Group();
  const w = 6.4, d = 5.2, h1 = 2.7, h2 = 2.5, ov = 0.45;
  g.add(archGroup('haus_fachwerk', houseMats({ wall: pickOne(WALL_TINTS, rnd), wallDetail: 'plaster', roof: pickOne(ROOF_TINTS, rnd), roofDetail: 'tile' }))!);
  windowAt(g, w * 0.25, 1.75, d / 2 + 0.03);
  for (const sx of [-1, 1]) {
    windowAt(g, sx * w * 0.25, h1 + 1.3, d / 2 + ov + 0.03, 0, 0.8, 0.9);
    windowAt(g, sx * w * 0.25, h1 + 1.3, -d / 2 - ov - 0.03, Math.PI, 0.8, 0.9);
  }
  windowAt(g, w * 0.25, 1.75, -d / 2 - 0.03, Math.PI);
  return { g, boxes: [[w + 0.4, d + 0.4]], circles: [], smoke: [-w * 0.28, h1 + h2 + 3.6, -0.3] };
}

function kolonialhaus(rnd: () => number): Built {
  const g = new Group();
  const w = 7.2, d = 5.8, h1 = 3.1;
  g.add(archGroup('haus_kolonial', houseMats({ wall: pickOne(COLONIAL_TINTS, rnd), wallDetail: 'plaster', roof: '#B5502E', roofDetail: 'tile' }))!);
  for (const x of [-2.3, 2.3]) windowAt(g, x, 1.65, d / 2 + 0.04, 0, 0.7, 1.05);
  for (const x of [-w * 0.28, 0, w * 0.28]) windowAt(g, x, h1 + 1.2, d / 2 + 0.05, 0, 0.7, 1.5);
  for (const x of [-w * 0.25, w * 0.25]) { windowAt(g, x, 2.0, -d / 2 - 0.03, Math.PI, 0.8, 1.0); windowAt(g, x, h1 + 1.3, -d / 2 - 0.03, Math.PI, 0.8, 1.0); }
  return { g, boxes: [[w + 0.4, d + 0.4], [w + 0.9, 0.5, 0, d / 2 + 1.5]], circles: [], smoke: [w * 0.28, 9.0, -0.5] };
}

function lagerhaus(rnd: () => number): Built {
  const g = new Group();
  const w = 10.4, d = 7;
  g.add(archGroup('lagerhaus', houseMats({ wall: pickOne(['#C9B890', '#B8A47C', '#C4C0B0'], rnd), wallDetail: 'plaster', roof: pickOne(['#5A4A3A', '#46525E', '#6E4A2E'], rnd), roofDetail: 'tile' }))!);
  windowAt(g, 3.6, 2.6, d / 2 + 0.03, 0, 0.7, 0.9);
  windowAt(g, -4, 2.6, -d / 2 - 0.03, Math.PI, 0.7, 0.9); windowAt(g, 0, 2.6, -d / 2 - 0.03, Math.PI, 0.7, 0.9);
  return { g, boxes: [[w + 0.4, d + 0.4], [4.2, 2.4, 3.2, d / 2 + 1.3]], circles: [], smoke: [w * 0.33, 7.0, -0.5], glows: [{ kind: 'lamp', x: -3.6, y: 3.0, z: d / 2 + 0.5, gy: 0, size: 0.7, pool: 5 }] };
}

function kapelle(): Built {
  const g = new Group();
  const w = 6.2, L = 10, tw = 3, tz = L / 2 + tw / 2 - 0.1;
  g.add(archGroup('kapelle', houseMats({ roof: '#46525E', roofDetail: 'tile' }))!);
  for (const sx of [-1, 1]) for (const z of [-2.0, 1.6]) windowAt(g, sx * (w / 2 + 0.2), 2.4, z, sx * Math.PI / 2, 0.8, 1.9);
  return { g, boxes: [[w + 0.9, L + 0.3], [tw + 0.3, tw + 0.2, 0, tz]], circles: [], glows: [{ kind: 'lamp', x: 1.6, y: 2.9, z: tz + tw / 2 + 0.5, gy: 0, size: 0.7, pool: 5 }, { kind: 'lamp', x: -1.6, y: 2.9, z: tz + tw / 2 + 0.5, gy: 0, size: 0.7, pool: 5 }] };
}

function marktstand(rnd: () => number): Built {
  const g = new Group();
  g.add(archGroup('marktstand', houseMats({ roof: '#7A1F1A', cloth: pickOne(['#A8322A', '#1F4E79', '#365C46', '#C98A2A', '#6A3A78'], rnd) }))!);
  return { g, boxes: [[3.5, 2.5, 0, 0.1]], circles: [] };
}

function kran(): Built {
  const g = new Group();
  g.add(archGroup('kran', houseMats({ roof: '#6E4A2E' }))!);
  return { g, boxes: [[3.8, 3.8]], circles: [] };
}

function zinnenturm(): Built {
  const g = new Group();
  g.add(archGroup('turm_zinnen', houseMats({ wall: '#8E8A80', roof: '#3C4654', cloth: '#1F4E79' }))!);
  return { g, boxes: [], circles: [[3.5]] };
}

function zinnenmauer(): Built {
  const g = new Group();
  g.add(archGroup('mauer_zinnen', houseMats({ roof: '#3C4654' }))!);
  return { g, boxes: [[6.1, 2.2]], circles: [] };
}

function torhaus(): Built {
  const g = new Group();
  g.add(archGroup('torhaus', houseMats({ roof: '#3C4654', cloth: '#1F4E79' }))!);
  const off = 15 / 2 - 4.6 / 2;
  // Wandfackeln mit Eisenhalter, leicht nach außen geneigt (Kopf bei den Flammenpunkten)
  if (hasArch('fackel')) {
    for (const sx of [-1, 1]) {
      const t = archGroup('fackel', lightMats)!;
      const tilt = 0.25;
      t.rotation.x = tilt;
      t.position.set(sx * 2.6, 3.2 - 1.18 * Math.cos(tilt), 3.4 - 1.18 * Math.sin(tilt));
      g.add(t);
      g.add(box(0.1, 0.1, 0.5, M.iron, sx * 2.6, 2.1, 3.15));
    }
  }
  return { g, boxes: [[4.9, 6.8, -off, 0], [4.9, 6.8, off, 0]], circles: [], glows: [{ kind: 'torch', x: -2.6, y: 3.2, z: 3.4, gy: 0, size: 0.62, pool: 5 }, { kind: 'torch', x: 2.6, y: 3.2, z: 3.4, gy: 0, size: 0.62, pool: 5 }] };
}

function leuchtturm(): Built {
  const g = new Group();
  g.add(archGroup('leuchtturm', houseMats({ roof: '#6E4A2E', wall: '#EDE6D6', wallDetail: 'plaster' }))!);
  // Laternenraum: leuchtende Glasfläche, nachts weit sichtbar
  const lamp = new Mesh(new CylinderGeometry(1.42, 1.42, 1.9, 12, 1, true), lampMat);
  lamp.position.y = 21 + 1.4;
  lamp.userData.noOutline = true;
  g.add(lamp);
  return { g, boxes: [], circles: [[4.1]], glows: [{ kind: 'lamp', x: 0, y: 22.5, z: 0, gy: null, size: 5, pool: 14 }, { kind: 'lamp', x: 0, y: 22.5, z: 0, gy: null, size: 3, pool: 6 }] };
}

function bergfried(): Built {
  const g = new Group();
  g.add(archGroup('bergfried', houseMats({ roof: '#3C4654', cloth: '#1F4E79' }))!);
  return { g, boxes: [[14.2, 14.2]], circles: [] };
}

export function colliders(b: Built, wx: number, wz: number, yaw: number, roofs: readonly Roof[] = []): Blocker[] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const out: Blocker[] = [];
  // Quader eng an der sichtbaren Wand: die Bau-Daten tragen 30 bis 40 cm Zugabe; mit dem Figurenradius (0,38 m) wirkte das wie eine unsichtbare Wand
  // vor jeder Hauswand. Große Quader (Häuser) verlieren 14 cm in jeder Richtung, dünne (Zäune) bleiben dünn.
  for (const [w, d, ox = 0, oz = 0, by = 0] of b.boxes) {
    const shrink = (v: number) => (v > 2.4 ? v - 0.14 : v);
    out.push(boxBlocker(wx + ox * c + oz * s, wz - ox * s + oz * c, shrink(w), shrink(d), yaw + (by * Math.PI) / 180));
  }
  for (const [r, ox = 0, oz = 0] of b.circles) out.push({ x: wx + ox * c + oz * s, z: wz - ox * s + oz * c, r });
  // 4.6H: Traufe über jedem Kollider (niedrigste Dachfläche darüber) – darüber sperrt er die Spielfigur nicht mehr
  if (roofs.length) for (const bl of out) annotateTop(bl, roofs);
  return out;
}

/** 4.6H: Traufe (Welt-y) eines Kolliders aus den Dachfeldern seines Baus; ohne Dachfläche darüber bleibt er eine volle Wand */
export function annotateTop(bl: Blocker, roofs: readonly Roof[]) {
  let top = Infinity;
  for (const r of roofs) {
    const y = bl.hw !== undefined ? roofMinOver(r, bl.x, bl.z, bl.hw, bl.hd ?? 0, bl.yaw ?? 0) : roofMinOver(r, bl.x, bl.z, bl.r, bl.r, 0, true);
    if (y === y && y < top) top = y;
  }
  if (top < Infinity) bl.top = top;
}

/** 4.6H: Dachfelder der Blender-Bauten (je Modell einmal gerechnet und geteilt) */
const roofFieldCache = new Map<string, RoofField | null>();
export function archRoofField(name: string): RoofField | null {
  if (!roofFieldCache.has(name)) {
    const parts = archParts(name);
    roofFieldCache.set(name, parts ? buildRoofField(parts) : null);
  }
  return roofFieldCache.get(name) ?? null;
}

const nearZero = (v: number) => Math.abs(v) < 1e-5;

/**
 * 4.6H: Dachfelder eines aufgestellten Bauwerks (Welt): die Gruppe selbst, wenn sie ein Blender-Bau ist (Bausteine der Weltmächte), sonst ihre
 * Blender-Teile im Ursprung (Häuser, Mauern, Türme, Tore). `wx/wy/wz` = Weltlage des Ursprungs, `yaw` = Drehung; der Maßstab kommt aus `b.g`.
 */
export function roofsOf(b: Built, wx: number, wy: number, wz: number, yaw: number): Roof[] {
  const out: Roof[] = [];
  const sc = b.g.scale;
  const add = (name: unknown) => {
    if (typeof name !== 'string') return;
    const f = archRoofField(name);
    if (f) out.push(placeRoof(f, wx, wy, wz, yaw, sc.x, sc.y, sc.z));
  };
  if (b.g.userData.archModel) add(b.g.userData.archModel);
  else for (const ch of b.g.children) {
    if (!ch.userData.archModel) continue;
    const p = ch.position, r = ch.rotation, s = ch.scale;
    if (!nearZero(p.x) || !nearZero(p.y) || !nearZero(p.z) || !nearZero(r.x) || !nearZero(r.y) || !nearZero(r.z) || !nearZero(s.x - 1) || !nearZero(s.y - 1) || !nearZero(s.z - 1)) continue;
    add(ch.userData.archModel);
  }
  return out;
}

/** Materialien des Blender-Stegs: Bohlen und Balken aus Holz, Taue, Klampen aus Eisen */
const pierMats = (role: string) => role === 'rope' ? AM('#B8A070') : role === 'iron' ? AM('#3A3C40') : role === 'darkwood' ? AM('#4A3220') : AM('#A8804E');

function holzhuette(rnd: () => number): Built {
  if (!hasArch('haus_huette')) return holzhuettePlain(rnd);
  const g = new Group();
  const w = 5.4, d = 4;
  const thatch = rnd() < 0.5;
  g.add(archGroup('haus_huette', houseMats({ wall: '#A07C50', roof: thatch ? '#A8904E' : '#6E4A2E', roofDetail: thatch ? undefined : 'tile' }))!);
  windowAt(g, w * 0.22, 1.75, d / 2 + 0.03);
  windowAt(g, 0, 1.75, -d / 2 - 0.03, Math.PI);
  g.add(box(1.6, 0.1, 0.4, M.wood, w * 0.22, 0.5, d / 2 + 0.35), box(0.1, 0.5, 0.36, M.wood, w * 0.22 - 0.7, 0.25, d / 2 + 0.35), box(0.1, 0.5, 0.36, M.wood, w * 0.22 + 0.7, 0.25, d / 2 + 0.35));
  return { g, boxes: [[w + 0.3, d + 0.3], [1.7, 0.5, w * 0.22, d / 2 + 0.35]], circles: [] };
}

function steinhaus(rnd: () => number): Built {
  if (!hasArch('haus_stein')) return steinhausPlain(rnd);
  const g = new Group();
  const w = 6.6, d = 5, h = 3.1;
  const slate = rnd() < 0.5;
  g.add(archGroup('haus_stein', houseMats({ roof: slate ? '#46525E' : '#8E3A2A', roofDetail: 'tile' }))!);
  windowAt(g, -w * 0.3, 1.8, d / 2 + 0.03);
  windowAt(g, w * 0.3, 1.8, d / 2 + 0.03);
  windowAt(g, 0, 1.8, -d / 2 - 0.03, Math.PI);
  return { g, boxes: [[w + 0.3, d + 0.3]], circles: [], smoke: [w * 0.3, h + 3.1, -0.6] };
}

function gasthaus(): Built {
  if (!hasArch('haus_taverne')) return gasthausPlain();
  const g = new Group();
  const w = 9.2, d = 6.2, h1 = 3, h2 = 2.6;
  g.add(archGroup('haus_taverne', houseMats({ wall: '#E2D6BC', wallDetail: 'plaster', roof: '#8E3A2A', roofDetail: 'tile' }))!);
  for (const sx of [-1, 1]) { windowAt(g, sx * 2.9, 1.75, d / 2 + 0.03, 0, 1, 1); windowAt(g, sx * 2.9, h1 + 1.3, d / 2 + 0.3, 0, 0.9, 0.9); windowAt(g, sx * 2.9, h1 + 1.3, -d / 2 - 0.3, Math.PI, 0.9, 0.9); }
  windowAt(g, 0, h1 + 1.3, d / 2 + 0.3, 0, 0.9, 0.9);
  // Bänke und Tisch vor dem Haus
  g.add(box(2, 0.1, 0.8, M.wood, -3, 0.8, d / 2 + 1.6), box(0.12, 0.8, 0.7, M.wood, -3.8, 0.4, d / 2 + 1.6), box(0.12, 0.8, 0.7, M.wood, -2.2, 0.4, d / 2 + 1.6));
  // Wandfackeln links und rechts der Tür (Eisenhalter, Holzschaft mit Pechkopf); Flamme und Lichtschein kommen aus render/glow.ts
  for (const sx of [-1, 1]) {
    g.add(box(0.1, 0.1, 0.5, M.iron, sx * 1.55, 2.35, d / 2 + 0.25));
    if (hasArch('fackel')) { const t = archGroup('fackel', lightMats)!; t.position.set(sx * 1.55, 1.58, d / 2 + 0.5); g.add(t); }
    else g.add(cyl(0.05, 0.07, 0.34, 6, toon('#3A2A1E'), sx * 1.55, 2.5, d / 2 + 0.5), cyl(0.08, 0.05, 0.1, 6, M.iron, sx * 1.55, 2.7, d / 2 + 0.5));
  }
  return { g, boxes: [[w + 0.6, d + 0.6], [2.1, 0.9, -3, d / 2 + 1.6]], circles: [], smoke: [-w * 0.3, h1 + h2 + 3.7, 0.4], glows: [{ kind: 'torch', x: -1.55, y: 2.78, z: d / 2 + 0.5, gy: 0, size: 0.62, pool: 4.8 }, { kind: 'torch', x: 1.55, y: 2.78, z: d / 2 + 0.5, gy: 0, size: 0.62, pool: 4.8 }] };
}

function ruinenbogen(): Built {
  if (!hasArch('bogen')) return ruinenbogenPlain();
  const g = new Group();
  g.add(archGroup('bogen', (role) => role === 'stonelight' ? AM('#5E7A4A') : AM('#9C978A', 'stone'))!);
  return { g, boxes: [], circles: [[0.95, -2.6, 0], [0.95, 2.6, 0]] };
}

// ---------- Mega-Inseln (4.3.6): Brücke, Statue, Dojo-Halle, Fahnenmast ----------

const BRIDGE_LOOK: Record<string, { deck: string; stone: string; rail: 'stein' | 'holz' | 'ruine'; glow: boolean }> = {
  stein: { deck: '#B8B0A0', stone: '#A8A092', rail: 'stein', glow: true },
  marmor: { deck: '#EDE8E0', stone: '#DCD6CA', rail: 'stein', glow: true },
  obsidian: { deck: '#2A2530', stone: '#1E1A22', rail: 'stein', glow: false },
  holz: { deck: '#8A6A44', stone: '#8C847A', rail: 'holz', glow: true },
  ruine: { deck: '#9C978A', stone: '#8E8A7E', rail: 'ruine', glow: false },
};

/**
 * Brücke über eine Spalte (Länge entlang +z, Breite 4,6 m): ebene Fahrbahn knapp über dem Boden, Geländer beiderseits (Kollision), darunter zwei Bögen,
 * die in die Spalte hinabreichen, und Widerlager an den Enden. Obsidianbrücken tragen glühende Fugen, Ruinenbrücken haben Lücken im Geländer.
 */
function bruecke(len: number, variant: string): Built {
  // „stein:breit“: breite Brücke der Kaiser-Inseln (doppelte Fahrbahn, zwei Bögen mehr)
  const wide = variant.endsWith(':breit');
  const v = wide ? variant.slice(0, -6) : variant;
  const L = BRIDGE_LOOK[v] ?? BRIDGE_LOOK.stein;
  const g = new Group();
  const deckMat = L.rail === 'holz' ? plank(L.deck) : AM(L.deck, 'stone');
  const stoneMat = AM(L.stone, 'stone');
  const W = wide ? 9.2 : 4.6;
  g.add(box(W, 0.55, len, deckMat, 0, -0.16, 0));
  const boxes: Built['boxes'] = [];
  for (const sx of [-1, 1]) {
    if (L.rail === 'holz') {
      const n = Math.max(2, Math.round(len / 2.2));
      for (let i = 0; i <= n; i++) g.add(box(0.18, 1.1, 0.18, M.darkWood, sx * (W / 2 - 0.12), 0.55, -len / 2 + (i / n) * len));
      g.add(box(0.12, 0.12, len, M.wood, sx * (W / 2 - 0.12), 1.0, 0), box(0.1, 0.1, len, M.wood, sx * (W / 2 - 0.12), 0.55, 0));
    } else {
      // Brüstung in Stücken (Ruine: jedes dritte fehlt)
      const n = Math.max(2, Math.round(len / 2.6));
      for (let i = 0; i < n; i++) {
        if (L.rail === 'ruine' && i % 3 === 1) continue;
        g.add(box(0.5, 0.95, len / n - 0.08, stoneMat, sx * (W / 2 - 0.25), 0.42, -len / 2 + (i + 0.5) * (len / n)));
      }
    }
    boxes.push([0.6, len, sx * (W / 2 - 0.25), 0]);
    // Bogen unter der Fahrbahn: halber Ring in der z-y-Ebene, Scheitel knapp unter dem Deck
    const R = len * 0.46;
    const arch = new Mesh(new TorusGeometry(R, 0.75, 6, 18, Math.PI), stoneMat);
    arch.rotation.y = Math.PI / 2;
    arch.position.set(sx * (W / 2 - 0.75), -0.45 - R, 0);
    g.add(arch);
    if (wide) { const a2 = arch.clone(); a2.position.x = sx * (W / 2 - 3.1); g.add(a2); }
  }
  // Widerlager
  for (const sz of [-1, 1]) g.add(box(W + 1.2, 4.2, 2.4, stoneMat, 0, -2.2, sz * (len / 2 - 0.4)));
  // Obsidian: glühende Fugen entlang der Fahrbahn
  if (v === 'obsidian') for (let i = 1; i < 6; i++) { const f = box(W - 0.6, 0.06, 0.12, emberMat, 0, 0.13, -len / 2 + (i / 6) * len); f.userData.noOutline = true; g.add(f); }
  const glows: GlowSpec[] = [];
  if (L.glow) for (const sz of [-1, 1]) for (const sx of [-1, 1]) { g.add(laterneMesh(sx * (W / 2 + 0.25), sz * (len / 2 - 0.2))); glows.push({ kind: 'lamp', x: sx * (W / 2 + 0.25), y: 2.3, z: sz * (len / 2 - 0.2), gy: 0, size: 0.5, pool: 3.5 }); }
  else if (v === 'obsidian') for (const sz of [-1, 1]) glows.push({ kind: 'fire', x: 0, y: 0.3, z: sz * (len / 2 + 1.2), gy: 0, size: 0.6, pool: 4 });
  return { g, boxes, circles: [], glows };
}

/** Kleine Laterne auf einem Pfosten (Brückenköpfe) */
function laterneMesh(x: number, z: number): Group {
  const g = new Group();
  g.add(box(0.16, 2, 0.16, M.iron, 0, 1, 0));
  const lamp = box(0.34, 0.42, 0.34, lampMat, 0, 2.25, 0);
  lamp.userData.noOutline = true;
  g.add(lamp, box(0.46, 0.08, 0.46, M.iron, 0, 2.5, 0));
  g.position.set(x, 0, z);
  return g;
}

const STATUE_LOOK: Record<string, { body: string; trim: string; held: 'schwert' | 'zepter' | 'speer' | 'krone' }> = {
  koenig: { body: '#E8E2D6', trim: '#C9A24E', held: 'zepter' },
  koenigin: { body: '#EEE8DE', trim: '#C9A24E', held: 'krone' },
  krieger: { body: '#8A6A3A', trim: '#C9A24E', held: 'schwert' },
  kaiser: { body: '#6E7A74', trim: '#9FE8D8', held: 'zepter' },
  waechter: { body: '#8C8A7E', trim: '#5E7A4A', held: 'speer' },
};

/** Monumentalstatue auf einem Sockel (etwa 8 m): König, Königin, Krieger (Bronze), Kaiser (grüner Stein mit leuchtender Krone), Wächter (bemoost) */
function statue(v: string): Built {
  const L = STATUE_LOOK[v] ?? STATUE_LOOK.waechter;
  const g = new Group();
  const stone = AM('#A8A092', 'stone');
  const body = toon({ color: L.body, detail: 'stone', flatShading: true });
  const trim = v === 'kaiser' ? lampMat : toon({ color: L.trim, spec: 0.8, metalness: 0.6, roughness: 0.45 });
  g.add(box(3.4, 1.6, 3.4, stone, 0, 0.3, 0), box(2.8, 0.4, 2.8, stone, 0, 1.3, 0));
  // Beine, Gewand, Rumpf, Schultern, Kopf
  g.add(cyl(0.32, 0.38, 2.2, 8, body, -0.45, 2.6, 0), cyl(0.32, 0.38, 2.2, 8, body, 0.45, 2.6, 0));
  g.add(cyl(0.75, 1.15, 1.6, 10, body, 0, 3.0, 0));
  g.add(cyl(0.9, 0.7, 2.2, 10, body, 0, 4.7, 0));
  g.add(box(2.3, 0.55, 0.9, body, 0, 5.75, 0));
  const head = new Mesh(new SphereGeometry(0.55, 12, 10), body);
  head.position.set(0, 6.45, 0);
  g.add(head);
  // Arme: einer hängt, einer hält das Zeichen nach oben
  const armL = cyl(0.2, 0.24, 2, 8, body, -1.25, 4.8, 0); armL.rotation.z = 0.12; g.add(armL);
  const armR = cyl(0.2, 0.24, 1.9, 8, body, 1.3, 5.35, 0.25); armR.rotation.z = -0.5; armR.rotation.x = -0.4; g.add(armR);
  if (L.held === 'schwert') {
    const bl = box(0.14, 3.2, 0.45, trim, 1.95, 7.1, 0.6); bl.rotation.z = -0.25;
    g.add(bl, box(0.9, 0.16, 0.2, trim, 1.7, 5.9, 0.55));
  } else if (L.held === 'speer') {
    const tip = new Mesh(new ConeGeometry(0.22, 0.9, 6), trim);
    tip.position.set(1.6, 9.2, 0.4);
    g.add(cyl(0.07, 0.07, 6.5, 6, M.darkWood, 1.6, 5.6, 0.4), tip);
  } else if (L.held === 'zepter') {
    const orb = new Mesh(new SphereGeometry(0.28, 10, 8), trim);
    orb.position.set(1.7, 7.7, 0.5);
    g.add(cyl(0.08, 0.08, 2.4, 6, trim, 1.7, 6.4, 0.5), orb);
  }
  // Krone oder Helm
  g.add(cyl(0.5, 0.42, 0.42, 8, trim, 0, 7.05, 0));
  if (v === 'waechter') g.add(box(0.9, 0.5, 0.9, AM('#5E7A4A'), 0, 1.75, 0.6));
  g.traverse((o) => { if ((o as Mesh).material === lampMat) o.userData.noOutline = true; });
  const glows: GlowSpec[] = v === 'kaiser' ? [{ kind: 'lamp', x: 0, y: 7.1, z: 0, gy: null, size: 0.9, pool: 0 }] : [];
  return { g, boxes: [], circles: [[1.9]], glows };
}

/** Dojo-Halle der Kurogane: Steinsockel, dunkle Holzwände, rote Säulen und drei geschwungene Dachstufen */
function pagode(): Built {
  const g = new Group();
  const base = AM('#5A5650', 'stone');
  const red = toon({ color: '#8E2A24' });
  const roof = toon({ color: '#2A2C34', flatShading: true, detail: 'tile' });
  g.add(box(13, 0.9, 11, base, 0, 0.1, 0));
  g.add(box(10, 3.8, 8, M.darkWood, 0, 2.45, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.28, 0.32, 4.4, 8, red, sx * 5.4, 2.6, sz * 4.4));
  // Tür und Fensterbänder
  g.add(box(2.6, 2.6, 0.12, red, 0, 1.85, 4.05), box(8.4, 0.5, 0.1, red, 0, 3.6, 4.05));
  const tiers: [number, number, number][] = [[9.2, 2.2, 5.1], [6.6, 1.8, 7.0], [4.2, 2.2, 8.6]];
  for (const [rr, h, y] of tiers) {
    const t = new Mesh(new ConeGeometry(rr, h, 4, 1), roof);
    t.rotation.y = Math.PI / 4;
    t.scale.set(1.25, 1, 1);
    t.position.set(0, y, 0);
    g.add(t);
    g.add(box(rr * 1.55, 0.18, rr * 1.25, red, 0, y - h / 2 + 0.05, 0));
    if (y < 8) g.add(box(rr * 0.95, 1.1, rr * 0.8, M.darkWood, 0, y + h / 2 - 0.2, 0));
  }
  g.add(cyl(0.06, 0.12, 1.6, 6, M.iron, 0, 10.3, 0));
  const glows: GlowSpec[] = [{ kind: 'torch', x: -1.9, y: 2.2, z: 4.6, gy: 0, size: 0.6, pool: 4.5 }, { kind: 'torch', x: 1.9, y: 2.2, z: 4.6, gy: 0, size: 0.6, pool: 4.5 }];
  return { g, boxes: [[13.2, 11.2]], circles: [], glows };
}

const FLAG_COLOR: Record<string, [string, string]> = { krone: ['#1F4E79', '#E8E2D4'], lilie: ['#2E4FA8', '#F4EEDC'], kurogane: ['#1E1A20', '#A8322A'], korsar: ['#1A1614', '#E8E2D4'], kompanie: ['#E07A1F', '#F4EEDC'], hanse: ['#7A7E86', '#1A1614'] };

/** Fahnenmast mit zweifarbiger Fahne (Exerzierplätze, Paläste, Lager) */
function fahne(v: string): Built {
  const [a, b] = FLAG_COLOR[v] ?? FLAG_COLOR.krone;
  const g = new Group();
  const knob = new Mesh(new SphereGeometry(0.18, 8, 6), toon({ color: '#C9A24E', spec: 1 }));
  knob.position.set(0, 10.1, 0);
  g.add(cyl(0.1, 0.14, 10, 8, M.darkWood, 0, 5, 0), knob);
  const f = new Mesh(new PlaneGeometry(3.2, 2), toon({ color: a, side: DoubleSide }));
  f.position.set(1.65, 8.8, 0);
  const s2 = new Mesh(new PlaneGeometry(3.2, 0.5), toon({ color: b, side: DoubleSide }));
  s2.position.set(1.65, 8.8, 0.03);
  f.userData.noOutline = true; s2.userData.noOutline = true;
  g.add(f, s2);
  return { g, boxes: [], circles: [[0.35]] };
}

/** Bauwerk nach Art erzeugen (rnd: fester Zufall der Insel, len: Länge für Zaun, Mauer, Steg, Feld, Brücke; v: Bauart von Brücke, Statue, Fahne) */
export function build(t: StructureType, rnd: () => number, len = 8, theme: FactionId | null = null, v = ''): Built {
  archTheme = theme && THEMED_TYPES.has(t) ? theme : null;
  let b: Built;
  try {
    if (t === 'bruecke') b = bruecke(len, v);
    else if (t === 'statue') b = statue(v);
    else if (t === 'pagode') b = pagode();
    else if (t === 'fahne') b = fahne(v);
    else b = buildInner(t, rnd, len);
  } finally { archTheme = null; }
  // Fensterlichter (von windowAt am Gruppenobjekt gesammelt) gehören zu den Lichtquellen des Baus
  const wg = b.g.userData.winGlows as GlowSpec[] | undefined;
  if (wg) (b.glows ??= []).push(...wg);
  return b;
}

function buildInner(t: Exclude<StructureType, 'bruecke' | 'statue' | 'pagode' | 'fahne'>, rnd: () => number, len: number): Built {
  switch (t) {
    case 'holzhuette': { const b = holzhuette(rnd); return dress(b, rnd, b.boxes[0][0] - 0.3, 4); }
    case 'stelzenhuette': return stelzenhuette(rnd);
    case 'steinhaus': { const b = steinhaus(rnd); return dress(b, rnd, b.boxes[0][0] - 0.3, 5); }
    case 'gasthaus': return dress(gasthaus(), rnd, 9.2, 6.2, true);
    case 'scheune': return scheune();
    case 'wachturm': return wachturm();
    case 'steinturm': return steinturm();
    case 'ruine': return ruine(rnd);
    case 'ruinenbogen': return ruinenbogen();
    case 'saeulen': return saeulen(rnd);
    case 'fachwerkhaus': { if (!hasArch('haus_fachwerk')) return steinhaus(rnd); const b = fachwerkhaus(rnd); return dress(b, rnd, 6.4, 5.2); }
    case 'kolonialhaus': { if (!hasArch('haus_kolonial')) return steinhaus(rnd); const b = kolonialhaus(rnd); return dress(b, rnd, 7.2, 5.8 + 1.6); }
    case 'lagerhaus': return hasArch('lagerhaus') ? lagerhaus(rnd) : scheune();
    case 'kapelle': return hasArch('kapelle') ? kapelle() : steinhaus(rnd);
    case 'marktstand': return hasArch('marktstand') ? marktstand(rnd) : kisten(rnd);
    case 'kran': return hasArch('kran') ? kran() : kisten(rnd);
    case 'zinnenturm': return hasArch('turm_zinnen') ? zinnenturm() : steinturm();
    case 'zinnenmauer': return hasArch('mauer_zinnen') ? zinnenmauer() : mauer(len, rnd);
    case 'torhaus': return hasArch('torhaus') ? torhaus() : steinturm();
    case 'bergfried': return hasArch('bergfried') ? bergfried() : steinturm();
    case 'leuchtturm': return hasArch('leuchtturm') ? leuchtturm() : steinturm();
    case 'zaun': return zaun(len);
    case 'mauer': return mauer(len, rnd);
    case 'steg': return steg(len);
    case 'kisten': return kisten(rnd);
    case 'fass': return fass();
    case 'faesser': return faesser(rnd);
    case 'brunnen': return brunnen();
    case 'laterne': return laterne();
    case 'feld': return feld(len);
    case 'heu': return heu(rnd);
    case 'boot': return boot();
    case 'netz': return netz();
    case 'feuer': return feuer();
  }
}
