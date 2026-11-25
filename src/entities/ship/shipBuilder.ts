import {
  BoxGeometry,
  ExtrudeGeometry,
  BufferGeometry,
  CanvasTexture,
  type Texture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  type InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Path,
  PointLight,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  Object3D,
} from 'three';
import { LightAnchor } from '../../render/shipLights';
import type { FigureheadId, FlagId, ShipClass, ShipLook } from '../../data/ships';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutlinesSteps } from '../../render/outline';
import { lanternGlass } from '../../render/lampMaterials';
import { cachedSailTexture, plankTexture, sailTexture } from '../../render/textures';
import { sharedGeo } from '../../render/geoCache';
import { disposeGeometry, markShared } from '../../render/dispose';
import { toon } from '../../render/toon';
import { forgeSet, hullForgeKind } from '../../graphics/pbrMaterialForge';
import { toonPbr } from '../../render/pbrMaps';
import { deckTexture } from '../../render/shipTextures';
import { makeSailUniforms, sailMaterial } from '../../render/flags';
import { clothGeometry, clothMaterial, clothTextures, makeClothUniforms, type ClothFlag, type FlagSpec } from '../../render/flagCloth';
import { FIGUREHEAD_DEFS, figureheadModel, figureheadScale } from '../../data/figureheads';
import { buildFigurehead } from './figureheads';
import { factionFlagTexture, sailHeraldry } from '../../render/heraldry';
import { FACTIONS } from '../../data/factions';
import { hullGeometry2, hullSideX } from './shipHull2';
import { archParts, hasArch } from '../../world/envModels';
import { hasProp, placeMatrix, PropBatch, propRoles, type PropId } from '../../world/worldProps';
import { neutralEvolution, type ShipEvolution } from '../../data/shipEvolution';
import { lowerOpenIndices, pickSwivelZ, shipVisual, tierHullColor } from '../../data/shipVisuals';
import { addBelt, addBoardedPort, addGunRing, addIronwork, addPatches, addPortLid, addRam, addRustBarrel, addSwivels, type EvoCtx, type SwivelMount } from './shipEvoParts';
import { deckGates } from '../../world/docking';

/** Anfang des Vorderkastells als Anteil der halben Länge (t = 2·z / L) */
const FORE_T0 = 0.46;

/** Achsenparalleler fester Block im Schiffskoordinatensystem */
export interface Blocker { cx: number; cz: number; hx: number; hz: number; /** Kajütenmöbel: nur im Innenraum fest */ cabin?: boolean }

export interface ShipModel {
  group: Group;
  /** Segel (zum Blähen, Reffen und Zerreißen) */
  sails: Mesh[];
  /** Mündungen der Kanonen (lokal), links = +X, rechts = −X */
  muzzlesL: Vector3[];
  muzzlesR: Vector3[];
  lanterns: Mesh[];
  windows: Mesh[];
  flag: Mesh;
  /** Wehende Tuchflaggen (Mast und Heck): `ship.ts` treibt sie je Bild mit Wind und Fahrt */
  flags: ClothFlag[];
  deckY: number;
  helm: Vector3;
  /** Steuerrad (Drehpunkt in der Mitte; dreht mit dem Ruder) */
  wheel: Group;
  /**
   * Achterdeck und Treppen (Schiffskoordinaten; Höhen relativ zum Hauptdeck): für Begehen und Kollision.
   * `flare`: Schwung der Treppen (m): unten rücken sie um so viel nach außen, oben liegen sie an der Tür; 0 = gerade
   */
  quarter: { z0: number; z1: number; top: number; stairX: number[]; stairW: number; stairLen: number; flare: number; doorHalf: number; cabin: { zA: number; zB: number } };
  /** Dach der Kapitänskajüte (Deck des Achterdecks): wird ausgeblendet, sobald die Figur drinnen steht */
  cabinRoof: Group;
  /** Fülllicht in der Kajüte (nur Spielerschiff), das Spiel schaltet es ein, wenn man drinnen ist */
  cabinLight: LightAnchor | null;
  /** Vorderkastell (begehbares Vordeck bis zum Bug, Treppen an der Rückwand), null = keins */
  fore: { z0: number; z1: number; top: number; stairX: number[]; stairW: number; stairLen: number } | null;
  /** Obere Mastteile samt Rahen, Korb und Segeln je Mast (eigene Gruppe, Ursprung 0): knicken in der Enterphase an der Höhe `pivotY` um */
  masts: { up: Group; z: number; pivotY: number }[];
  /** Takelage (Linien), fällt mit geknickten Masten weg */
  rigging: LineSegments;
  /** Rumpf (Verkohlen durch Ultimates, 4.6D: bekommt dann eine eigene Materialkopie) */
  hull?: Mesh;
  /** Feste Aufbauten an Deck (Mitte, halbe Ausdehnung, Schiffskoordinaten): Masten, Luke, Fässer, Möbel … */
  blockers: Blocker[];
  /** Deck-Material und Grundfarbe (Nässe dunkelt das Holz ab) */
  deckMat: Mesh['material'];
  deckBase: Color;
  /** Laternen-Lichter (nur Spielerschiff): warmes Punktlicht, Stärke nach Tageszeit */
  lights: LightAnchor[];
  /** Halbe Breite an Position z (für Treffer und Löcher) */
  halfWidth(z: number): number;
  /** Teile der Seitenreling am Hauptdeck (Holme, Docken, Pfosten) mit Lage: Gangway und Leitern öffnen sie dort, wo sie ans Deck kommen */
  railParts: { m: Object3D; x: number; z: number }[];
  /** Deck-Drehbassen (Kanonen-Stufe ≥ 4) auf der Hauptdeck-Reling: je ein drehbarer Halter, das Spiel richtet sie aus und feuert von ihrer Mündung */
  swivels: SwivelMount[];
  /** Sichtbarer Ausbauzustand, aus dem das Modell gebaut wurde (`visualKey` aus data/shipVisuals.ts) */
  evoKey: string;
}

/** Breite des Rumpfs entlang der Länge: vorn spitz, hinten breit */
/** Grundrissform je Klasse (Bugschärfe, Völligkeit, Heckbreite); gesetzt zu Beginn von buildShip (läuft ohne Unterbrechung) */
const HULL_VARIANTS: Record<string, { e: number; p: number; s: number }> = {
  schaluppe: { e: 2.1, p: 0.62, s: 0.8 }, brigg: { e: 2.3, p: 0.6, s: 0.78 }, korvette: { e: 2.7, p: 0.58, s: 0.76 }, fregatte: { e: 2.9, p: 0.55, s: 0.74 },
  galeone: { e: 2.0, p: 0.7, s: 0.84 }, linienschiff: { e: 2.4, p: 0.65, s: 0.8 }, leviathan: { e: 2.2, p: 0.72, s: 0.86 },
};
const HULL_DEFAULT = { e: 2.3, p: 0.6, s: 0.78 };
function widthWith(hullVar: { e: number; p: number; s: number }, t: number): number {
  // t: −1 Heck … +1 Bug. Durchgehend geschwungen wie ein echter Rumpf (vorher über 2/3 der Länge kastenförmig):
  // fein zulaufender Bug, größte Breite etwas hinter der Mitte, breiter Heckspiegel
  if (t >= 0) return Math.pow(Math.max(0, 1 - Math.pow(t, hullVar.e)), hullVar.p);
  const u = -t;
  return hullVar.s + (1 - hullVar.s) * Math.pow(Math.max(0, 1 - Math.pow(u, 3)), 0.5);
}

/** Deckssprung: Bug und Heck steigen an (bei großen Schiffen begrenzt) */
export function sheerAt(t: number, L: number): number {
  const k = Math.min(1.6, L / 15) * 0.55;
  // stärkerer, weich auslaufender Deckssprung (Bug steigt kräftig, Heck sanfter)
  return (t > 0 ? Math.pow(t, 2.4) * 1.75 : t * t * 0.95) * k;
}

/** Vorsprung des Stevens: der Bug neigt sich oben nach vorn (geschwungener Vorsteven statt senkrechter Wand) */
export function rakeAt(t: number, L: number): number {
  const u = Math.max(0, (t - 0.72) / 0.28);
  return L * 0.075 * u * u;
}

export function flagTexture(flag: FlagId, color: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 80;
  const g = c.getContext('2d')!;
  g.fillStyle = color; g.fillRect(0, 0, 128, 80);
  g.fillStyle = '#F3E6C8'; g.strokeStyle = '#F3E6C8'; g.lineWidth = 6; g.lineCap = 'round';
  const cx = 64, cy = 40;
  switch (flag) {
    case 'totenkopf':
      g.beginPath(); g.moveTo(34, 62); g.lineTo(94, 18); g.moveTo(34, 18); g.lineTo(94, 62); g.stroke();
      g.beginPath(); g.arc(cx, cy - 4, 17, 0, Math.PI * 2); g.fill();
      g.fillRect(cx - 9, cy + 8, 18, 9);
      g.fillStyle = color; g.beginPath(); g.arc(cx - 7, cy - 6, 5, 0, Math.PI * 2); g.arc(cx + 7, cy - 6, 5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(cx - 7, cy + 5); g.quadraticCurveTo(cx, cy + 10, cx + 7, cy + 5); g.lineWidth = 2; g.strokeStyle = color; g.stroke();
      break;
    case 'krone':
      g.beginPath(); g.moveTo(40, 58); g.lineTo(36, 26); g.lineTo(50, 40); g.lineTo(64, 20); g.lineTo(78, 40); g.lineTo(92, 26); g.lineTo(88, 58); g.closePath(); g.fill();
      g.fillStyle = '#9FE8FF'; g.beginPath(); g.moveTo(66, 28); g.lineTo(58, 44); g.lineTo(65, 44); g.lineTo(61, 56); g.lineTo(72, 40); g.lineTo(65, 40); g.closePath(); g.fill();
      break;
    case 'anker':
      g.beginPath(); g.moveTo(cx, 16); g.lineTo(cx, 62); g.moveTo(cx - 14, 26); g.lineTo(cx + 14, 26); g.stroke();
      g.beginPath(); g.arc(cx, 46, 18, 0.1, Math.PI - 0.1); g.stroke();
      g.beginPath(); g.arc(cx, 13, 5, 0, Math.PI * 2); g.stroke();
      break;
    case 'welle':
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(16, 30 + i * 14); g.bezierCurveTo(40, 18 + i * 14, 56, 42 + i * 14, 80, 30 + i * 14); g.bezierCurveTo(96, 22 + i * 14, 104, 34 + i * 14, 114, 30 + i * 14); g.stroke(); }
      break;
    case 'stern':
      g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 24; const a = (i / 10) * Math.PI * 2 - Math.PI / 2; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.fill();
      break;
    case 'marine':
      g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 128, 80);
      g.fillStyle = color; g.beginPath(); g.moveTo(cx, 14); g.lineTo(cx + 22, 24); g.lineTo(cx + 18, 52); g.lineTo(cx, 66); g.lineTo(cx - 18, 52); g.lineTo(cx - 22, 24); g.closePath(); g.fill();
      g.strokeStyle = '#FFFFFF'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, 24); g.lineTo(cx, 56); g.moveTo(cx - 10, 32); g.lineTo(cx + 10, 32); g.stroke();
      break;
  }
  const t = new CanvasTexture(c);
  return t;
}

function figurehead(id: FigureheadId, scale: number): Group {
  const g = new Group();
  const gold = toon({ color: '#E3B04B', spec: 1 });
  const wood = toon('#C8A27A');
  switch (id) {
    case 'loewe': {
      const head = new Mesh(new SphereGeometry(0.5, 12, 10), gold); g.add(head);
      for (let i = 0; i < 10; i++) { const m = new Mesh(new ConeGeometry(0.16, 0.6, 5), gold); const a = (i / 10) * Math.PI * 2; m.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45, -0.15); m.rotation.z = a - Math.PI / 2; g.add(m); }
      break;
    }
    case 'drache': {
      if (hasProp('galionsfigur_drache')) {
        // geschnitzter Drache aus Blender: Hals, Kopf mit Kiefern und Zähnen, Hörner, Kamm; Eckpunkt-AO färbt Hals und Kiefer tiefer ein
        const mats: Record<string, Mesh['material']> = {
          paint: toon({ color: '#2F6E4F', vertexColors: true }), gold: toon({ color: '#E3B04B', spec: 1, vertexColors: true }),
          wood: toon({ color: '#C8A27A', vertexColors: true }), dark: toon({ color: '#1A1410', vertexColors: true }),
        };
        for (const [role, geo] of propRoles('galionsfigur_drache')) g.add(new Mesh(geo, mats[role] ?? mats.paint));
        break;
      }
      const head = new Mesh(new ConeGeometry(0.35, 1.4, 8), toon('#2F6E4F')); head.rotation.x = Math.PI / 2; head.position.z = 0.4; g.add(head);
      for (const s of [-1, 1]) { const h = new Mesh(new ConeGeometry(0.08, 0.6, 5), gold); h.position.set(s * 0.2, 0.35, -0.1); h.rotation.x = -0.6; g.add(h); }
      break;
    }
    case 'adler': {
      const head = new Mesh(new SphereGeometry(0.38, 12, 10), toon('#F3E6C8')); g.add(head);
      const beak = new Mesh(new ConeGeometry(0.14, 0.5, 6), gold); beak.rotation.x = Math.PI / 2; beak.position.z = 0.42; g.add(beak);
      for (const s of [-1, 1]) { const w = new Mesh(new BoxGeometry(1.2, 0.08, 0.5), gold); w.position.set(s * 0.6, -0.2, -0.3); w.rotation.z = s * 0.4; g.add(w); }
      break;
    }
    case 'meerfrau': {
      const body = new Mesh(new CylinderGeometry(0.18, 0.3, 1.1, 8), wood); body.rotation.x = -0.6; g.add(body);
      const head = new Mesh(new SphereGeometry(0.22, 10, 8), wood); head.position.set(0, 0.55, 0.35); g.add(head);
      const hair = new Mesh(new ConeGeometry(0.25, 0.9, 6), gold); hair.position.set(0, 0.3, 0.15); hair.rotation.x = Math.PI - 0.4; g.add(hair);
      break;
    }
    case 'kraken': {
      const head = new Mesh(new SphereGeometry(0.45, 12, 10), toon('#7A3FA8')); g.add(head);
      for (let i = 0; i < 6; i++) { const t = new Mesh(new CylinderGeometry(0.06, 0.12, 0.9, 6), toon('#7A3FA8')); const a = (i / 6) * Math.PI * 2; t.position.set(Math.cos(a) * 0.3, -0.4, Math.sin(a) * 0.3); t.rotation.set(Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6); g.add(t); }
      break;
    }
    default: break;
  }
  g.scale.setScalar(scale);
  return g;
}

// ---------- Bausteine für Details (geteilte Netze, werden zu je einem Netz pro Material verschmolzen) ----------
const _up = new Vector3(0, 1, 0), _dir = new Vector3(), _q = new Quaternion();
// Metalle aus der PBR-Schmiede (4.4A): gehämmerter Kanonenstahl für Eisen und Bronze, gebürstetes Messing für Gold
const IRON = () => toon({ color: '#4A3326', spec: 0.9, metalness: 0.85, roughness: 0.78, forge: 'kanonenstahl' });
const COPPER = () => toon({ color: '#B8683A', spec: 1, metalness: 1, roughness: 0.38, forge: 'kanonenstahl' });
const ROPE = () => toon({ color: '#3D2F20', roughness: 0.95 });
/**
 * Leuchtflächen (Fenster, Laternenflamme, Glas): ein Material für alle Schiffe. Gehörte jedes Schiff sein eigenes, gab three.js
 * das Shader-Programm beim Abbau des alten Schiffs frei, und das nächste Schiff übersetzte es neu (rund 100 ms Ruckler beim
 * Schiffswechsel und bei jeder neuen Begegnung). Die Farbe ist für alle Schiffe gleich, nur die Helligkeit folgt der Tageszeit (ship.ts).
 */
export const GLOW_WINDOW = markShared(new MeshBasicMaterial({ color: new Color(2.4, 1.6, 0.6) }));
/** Fenster der Kapitänskajüte von innen: tagsüber hell (Himmel), nachts dunkel; ship.ts setzt die Helligkeit */
export const CABIN_WINDOW = markShared(new MeshBasicMaterial({ color: new Color(0.8, 0.95, 1.2) }));
export const GLOW_LAMP = markShared(new MeshBasicMaterial({ color: new Color(4, 2.4, 0.9) }));
const GLOW_LAMPGLASS = markShared(new MeshBasicMaterial({ color: new Color(1.5, 0.95, 0.42) }));
const PROP_GOLD = () => toon({ color: '#E3B04B', spec: 1, metalness: 1, roughness: 0.4, forge: 'messing' });

function box(w: number, h: number, d: number): BufferGeometry {
  return sharedGeo(`ship-box-${w.toFixed(3)}-${h.toFixed(3)}-${d.toFixed(3)}`, () => new BoxGeometry(w, h, d));
}
function cyl(r0: number, r1: number, h: number, seg = 8): BufferGeometry {
  return sharedGeo(`ship-cyl-${r0.toFixed(3)}-${r1.toFixed(3)}-${h.toFixed(3)}-${seg}`, () => new CylinderGeometry(r0, r1, h, seg));
}
function cone(r: number, h: number): BufferGeometry {
  return sharedGeo(`ship-cone-${r.toFixed(3)}-${h.toFixed(3)}`, () => new ConeGeometry(r, h, 6));
}
function torus(r: number, t: number, seg = 6, arc = Math.PI * 2): BufferGeometry {
  return sharedGeo(`ship-tor-${r.toFixed(3)}-${t.toFixed(3)}-${seg}-${arc.toFixed(2)}`, () => new TorusGeometry(r, t, 5, seg, arc));
}
function put(group: Group, geo: BufferGeometry, mat: Mesh['material'], x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  group.add(m);
  return m;
}
/** Holm von a nach b (Länge aus den Endpunkten), um hy angehoben, Stärke th */
function railSeg(group: Group, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, hy: number, th: number, mat: Mesh['material'], h = th * 0.9): Mesh | undefined {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return undefined;
  const m = new Mesh(box(th, h, len), mat);
  m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + hy, (a.z + b.z) / 2);
  m.rotation.order = 'YXZ';
  m.rotation.set(-Math.asin(dy / len), Math.atan2(dx, dz), 0);
  group.add(m);
  return m;
}
/** Tau von a nach b, in der Mitte durchhängend (sag Meter), aus kurzen Zylindern */
function rope(group: Group, a: Vector3, b: Vector3, r: number, sag: number, segs = 6) {
  const mat = ROPE();
  const geo = cyl(1, 1, 1, 4);
  let px = a.x, py = a.y, pz = a.z;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const nx = a.x + (b.x - a.x) * t, nz = a.z + (b.z - a.z) * t;
    const ny = a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t);
    _dir.set(nx - px, ny - py, nz - pz);
    const len = _dir.length();
    if (len > 1e-4) {
      _dir.multiplyScalar(1 / len);
      _q.setFromUnitVectors(_up, _dir);
      const m = new Mesh(geo, mat);
      m.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
      m.quaternion.copy(_q);
      m.scale.set(r, len, r);
      group.add(m);
    }
    px = nx; py = ny; pz = nz;
  }
}
/**
 * Belegungsraster eines Deckbereichs: Zellen sind belegt, wo ein Läufer (Radius 0,3) nicht stehen kann. `ok()` prüft per
 * Flutfüllung, ob zwischen zwei Punkten noch ein Weg besteht. So bleibt beim Aufstellen von Fässern, Geschützen und Beiboot
 * immer ein durchgehender Gang offen (vorher sperrte eine Reihe aus Boot, Geschützen und Fässern bei der Fregatte das Deck ab).
 */
class Occ {
  private nx: number;
  private nz: number;
  private cnt: Uint8Array;
  private seen: Uint8Array;
  private stack: number[] = [];
  constructor(private x0: number, private z0: number, private cs: number, w: number, h: number, walk: (z: number) => number, private q: { ax: number; az: number; bx: number; bz: number }) {
    this.nx = Math.ceil(w / cs) + 1;
    this.nz = Math.ceil(h / cs) + 1;
    this.cnt = new Uint8Array(this.nx * this.nz);
    this.seen = new Uint8Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) if (Math.abs(x0 + i * cs) > walk(z0 + j * cs)) this.cnt[j * this.nx + i] = 1;
  }
  private apply(b: Blocker, d: number) {
    const R = 0.3, cs = this.cs;
    const i0 = Math.max(0, Math.ceil((b.cx - b.hx - R - this.x0) / cs)), i1 = Math.min(this.nx - 1, Math.floor((b.cx + b.hx + R - this.x0) / cs));
    const j0 = Math.max(0, Math.ceil((b.cz - b.hz - R - this.z0) / cs)), j1 = Math.min(this.nz - 1, Math.floor((b.cz + b.hz + R - this.z0) / cs));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.cnt[j * this.nx + i] += d;
  }
  add(b: Blocker) { this.apply(b, 1); }
  remove(b: Blocker) { this.apply(b, -1); }
  private cell(x: number, z: number): number {
    // nächste freie Zelle im Umkreis von drei Zellen
    const ci = Math.round((x - this.x0) / this.cs), cj = Math.round((z - this.z0) / this.cs);
    for (let r = 0; r <= 3; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
      if (this.cnt[j * this.nx + i] === 0) return j * this.nx + i;
    }
    return -1;
  }
  /** Besteht ein Weg vom Start zum Ziel? (Ist Start oder Ziel selbst versperrt, gilt der Test als bestanden.) */
  ok(): boolean {
    const a = this.cell(this.q.ax, this.q.az), b = this.cell(this.q.bx, this.q.bz);
    if (a < 0 || b < 0) return true;
    this.seen.fill(0);
    const st = this.stack;
    st.length = 0;
    st.push(a);
    this.seen[a] = 1;
    const nx = this.nx, nz = this.nz;
    while (st.length) {
      const k = st.pop()!;
      if (k === b) return true;
      const i = k % nx, j = (k - i) / nx;
      if (i > 0 && !this.seen[k - 1] && this.cnt[k - 1] === 0) { this.seen[k - 1] = 1; st.push(k - 1); }
      if (i < nx - 1 && !this.seen[k + 1] && this.cnt[k + 1] === 0) { this.seen[k + 1] = 1; st.push(k + 1); }
      if (j > 0 && !this.seen[k - nx] && this.cnt[k - nx] === 0) { this.seen[k - nx] = 1; st.push(k - nx); }
      if (j < nz - 1 && !this.seen[k + nx] && this.cnt[k + nx] === 0) { this.seen[k + nx] = 1; st.push(k + nx); }
    }
    return false;
  }
}

/** Baut ein Schiff einer Klasse im eigenen Look. Bug zeigt nach +Z. */
export function buildShip(c: ShipClass, look: ShipLook, hero = false, evo: ShipEvolution = neutralEvolution()): ShipModel {
  const it = buildShipSteps(c, look, hero, evo);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/**
 * Derselbe Bau in Teilschritten (Phase 4.3C): gibt nach jedem Bauabschnitt (Rumpf, Reling, Kastelle, Takelage, Kanonen, Kajüte, Ausstattung), beim
 * Verschmelzen je Material und bei den Konturen ab. Ereignis-Schiffe auf See entstehen so über mehrere Bilder mit Zeitbudget statt in einem Block
 * von 50 bis 100 ms (world/worldEventsLive.ts). Das Modell hängt erst am Ende in der Szene (`Ship`), Halbfertiges ist nie sichtbar.
 */
/**
 * Deckplanken aller Schiffe: eine gedrehte, gekachelte Kopie der Decktextur samt passender Relief- und Rauheitskarten, einmal angelegt und geteilt (Phase 4.3D).
 * Früher bekam jedes Schiff eigene Kopien; ein `clone()` erhöht in three.js die Version der gemeinsamen Bildquelle, und so lud jedes neue Schiff die
 * 4096²-Decktextur erneut hoch (180 – 210 ms im ersten Bild, in dem es erschien).
 */
let deckKitCache: { src: Texture; tex: Texture; pbr: ReturnType<typeof toonPbr> } | null = null;
function shipDeckKit() {
  const src = deckTexture();
  if (deckKitCache && deckKitCache.src === src) return deckKitCache;
  const tex = markShared(src.clone());
  tex.center.set(0.5, 0.5);
  tex.rotation = Math.PI / 2;
  tex.repeat.set(0.3, 0.3);
  const pbr = toonPbr(tex, { strength: 0.3, rough: 0.77, roughVar: 0.1, ao: 0.8 }, src);
  for (const v of Object.values(pbr)) if (v && (v as Texture).isTexture) markShared(v as Texture);
  deckKitCache = { src, tex, pbr };
  return deckKitCache;
}

export function* buildShipSteps(c: ShipClass, look: ShipLook, hero = false, evo: ShipEvolution = neutralEvolution()): Generator<void, ShipModel> {
  // Der Bau läuft rein aus (Klasse, Aussehen, Ausbaustufen): alle Anbauten kommen aus dem deterministischen Plan (data/shipVisuals.ts)
  const vis = shipVisual(c, evo);
  // je Schiff eigene Grundrissform (die Funktion lebt in den Hüllen von halfWidth und Kollision weiter)
  const hv0 = HULL_VARIANTS[c.id] ?? HULL_DEFAULT;
  // Niederländische Galleonen sind bauchig: vollerer Bug und breiteres Heck (Rumpfform der Macht, data/factions.ts `fullness`)
  const fullK = look.power ? FACTIONS[look.power].ship.fullness : 0;
  const hv = fullK ? { e: hv0.e * 0.86, p: Math.min(0.9, hv0.p * 1.16), s: Math.min(0.95, hv0.s + 0.07) } : hv0;
  const widthAt = (t: number) => widthWith(hv, t);
  const group = new Group();
  // Bordwandhöhe wächst mit der Schiffsgröße (große Schiffe ragen hoch aus dem Wasser)
  const hk = Math.pow(Math.max(1, c.L / 24), 0.6);
  const D = (1.4 + c.decks * 0.75) * hk;
  const sc = c.L / 15;
  const halfWidth = (z: number) => Math.max(0.05, widthAt(z / (c.L / 2))) * c.W / 2;
  const blockers: Blocker[] = [];
  /** Blender-Props (Kanonen, Fässer, Kisten, Laternen, Anker): je Modell und Rolle ein InstancedMesh, siehe world/worldProps.ts */
  const batch = new PropBatch();
  /** Zusatzteile, die nicht mit dem Rest verschmolzen werden */
  const keepExtra: Mesh[] = [];
  const occs: Occ[] = [];
  const block = (cx: number, cz: number, hx: number, hz: number) => { const b = { cx, cz, hx, hz }; blockers.push(b); for (const o of occs) o.add(b); };
  /** Dekor an der Reling (Fässer, Kisten): zählt nur gegen anderes Dekor, nie gegen Läufer und Kämpfer (es steht im Randstreifen) */
  const decor: Blocker[] = [];
  const soft = (cx: number, cz: number, hx: number, hz: number) => { decor.push({ cx, cz, hx, hz }); };
  /** Platz frei UND bleibt danach an Deck ein durchgehender Weg (Treppenfuß hinten bis Treppenfuß vorn, Treppe bis Steuerrad)? */
  const canAdd = (cx: number, cz: number, hx: number, hz: number, margin = 0.1) => {
    if (!fits(cx, cz, hx, hz, margin)) return false;
    const b = { cx, cz, hx, hz };
    for (const o of occs) o.add(b);
    const ok = occs.every((o) => o.ok());
    for (const o of occs) o.remove(b);
    return ok;
  };
  /** Ist an dieser Stelle (Mitte, halbe Ausdehnung) noch Platz, ohne in schon Gebautes zu ragen? */
  const fits = (cx: number, cz: number, hx: number, hz: number, margin = 0.1) => !blockers.some((b) => Math.abs(cx - b.cx) < hx + b.hx + margin && Math.abs(cz - b.cz) < hz + b.hz + margin) && !decor.some((b) => Math.abs(cx - b.cx) < hx + b.hx + margin && Math.abs(cz - b.cz) < hz + b.hz + margin);
  /** Oberkante des Rumpfs bei t (−1 Heck … +1 Bug): Breite und Länge samt Vorsteven-Neigung, damit Deck und Reling bis zur Spitze passen */
  const edge = (t: number) => ({ x: (t >= 0.999 ? 0.004 : Math.max(0.04, widthAt(t))) * c.W / 2 * 0.9, z: t * c.L / 2 + rakeAt(t, c.L) });

  const planksTex = plankTexture();
  // beidseitig: auch die Innenseite der Bordwand (vom Deck aus) und der Heckspiegel von hinten bleiben sichtbar
  // Rumpf-Stufe: Holzton (1 ausgeblichen … 5 Ebenholz, die gewählte Farbe bleibt Grundton) und Rauheit des Holzes
  const hullLook: ShipLook = { ...look, hull: tierHullColor(look.hull, evo.hullTier) };
  // Planken aus der PBR-Schmiede (4.4A): Albedo, Normalkarte und ORM je Güte (1–2 verwittert, 3 geölt, 4–5 seidenmatt); gleiche UV-Kachel wie zuvor (4 m × 1,8 m,
  // acht Gänge). Die Rauheit der Stufe skaliert die Karte, die Rumpffarbe kommt weiter aus den Eckpunktfarben.
  const hullForge = forgeSet(hullForgeKind(evo.hullTier));
  const hullMat = toon({ color: 0xffffff, vertexColors: true, map: hullForge.albedo, side: DoubleSide, roughness: Math.min(1.6, vis.hull.roughness / hullForge.recipe.rough), normalMap: hullForge.normal, normalScale: 1, roughnessMap: hullForge.orm, aoMap: hullForge.orm, aoMapIntensity: 0.85 });
  const hull = new Mesh(hullGeometry2(c, D, hullLook, { widthAt, sheerAt, rakeAt }), hullMat);
  group.add(hull);

  // Deck
  const deckShape = new Shape();
  const N = 24;
  const deckT = (i: number) => -0.98 + (i / N) * 1.98;
  for (let i = 0; i <= N; i++) { const e = edge(deckT(i)); i === 0 ? deckShape.moveTo(e.x * 0.99, e.z) : deckShape.lineTo(e.x * 0.99, e.z); }
  for (let i = N; i >= 0; i--) { const e = edge(deckT(i)); deckShape.lineTo(-e.x * 0.99, e.z); }
  const deckGeo = new ShapeGeometry(deckShape).rotateX(Math.PI / 2);
  const deckKit = shipDeckKit();
  const deckTex = deckKit.tex;
  // Deckplanken: warmes, verwittertes Eichenholz mit dunklen Teerfugen (Textur trägt die Farbe, das Material färbt nur leicht und dunkelt bei
  // Nässe ab). Relief und Rauheit schwach (Normalkarte aus der Textur), damit nichts glitzert; Rauheit 0,68 bis 0,85. Pfützen nur sehr zurückhaltend.
  const deckBase = new Color('#F2E4CE');
  const deckMat = toon({ color: deckBase, side: DoubleSide, map: deckTex, unique: true, puddles: 0.3, ...deckKit.pbr });
  const deck = new Mesh(deckGeo, deckMat);
  deck.position.y = D - 0.05;
  deck.userData.noOutline = true;
  group.add(deck);
  const wood = toon({ color: '#7A5030', map: planksTex });
  const darkWood = toon('#4A2E1A');
  const gold = toon({ color: '#E3B04B', spec: 0.9, forge: 'messing' });
  // Anbauten der Rumpf-Stufe (Flickbretter, Eisenbänder, Panzergürtel, Rammsporn): sitzen über `hullSideX` bündig auf der Bordwand, ohne Blocker und Reling zu berühren
  const evoCtx: EvoCtx = {
    c, D, group, vis,
    sideX: (z, ya) => hullSideX(c, D, { widthAt, sheerAt, rakeAt }, z, ya),
    sheer: (z) => sheerAt(z / (c.L / 2), c.L),
    mats: { iron: IRON(), copper: COPPER(), gold, darkWood, wood },
  };
  if (vis.hull.patches) addPatches(evoCtx);
  if (vis.hull.bands) addIronwork(evoCtx);
  else if (vis.hull.reinforced) addIronwork(evoCtx);
  addBelt(evoCtx);
  addRam(evoCtx);
  // Reling: Handlauf, Zwischenholm, Pfosten, Docken (gedrechselte Stäbe) und Handlauf-Kappen; Heckreling und Bugreling schließen sie ringsum
  const railParts: ShipModel['railParts'] = [];
  {
    const RN = 18;
    const railMat = darkWood;
    const rpFull: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i <= RN; i++) {
      const t = -0.96 + (i / RN) * 1.94;
      const e = edge(t);
      rpFull.push({ x: e.x * 0.985, y: D + sheerAt(t, c.L), z: e.z });
    }
    // Reling nur bis zum Vorderkastell (dort übernimmt dessen eigene Reling oben); Zierleiste läuft ganz durch
    const rp: { x: number; y: number; z: number }[] = [];
    {
      const tEnd = c.L > 20 ? FORE_T0 : 0.98;
      for (let i = 0; i <= RN; i++) {
        const t = -0.96 + (i / RN) * (tEnd + 0.96);
        const e = edge(t);
        rp.push({ x: e.x * 0.985, y: D + sheerAt(t, c.L), z: e.z });
      }
    }
    const seg = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, hy: number, th: number, mat: Mesh['material']) => railSeg(group, a, b, hy, th, mat);
    for (const sd of [-1, 1]) {
      const pts = rp.map((p) => ({ x: p.x * sd, y: p.y, z: p.z }));
      for (let i = 0; i < pts.length - 1; i++) {
        const a0 = pts[i], b0 = pts[i + 1];
        const mx = (a0.x + b0.x) / 2, mz = (a0.z + b0.z) / 2;
        for (const m of [seg(a0, b0, 0.88, 0.1, railMat), seg(a0, b0, 0.46, 0.06, railMat)]) if (m) railParts.push({ m, x: mx, z: mz });
        // gedrechselte Docken zwischen den Pfosten
        for (const f of [0.33, 0.66]) {
          const bx = a0.x + (b0.x - a0.x) * f, bz = a0.z + (b0.z - a0.z) * f, by = a0.y + (b0.y - a0.y) * f;
          railParts.push({ m: put(group, cyl(0.025, 0.03, 0.42, 5), wood, bx, by + 0.67, bz), x: bx, z: bz });
        }
      }
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        railParts.push({ m: put(group, box(0.08, 0.9, 0.08), wood, p.x, p.y + 0.45, p.z), x: p.x, z: p.z });
        railParts.push({ m: put(group, cyl(0.06, 0.06, 0.05, 6), gold, p.x, p.y + 0.93, p.z), x: p.x, z: p.z });
      }
    }
    // Goldene Zierleiste entlang der Oberkante des Rumpfes (außen) und am Vorsteven
    {
      const trimMat = toon({ color: '#E3B04B', spec: 0.9 });
      for (const sd of [-1, 1]) {
        for (let i = 0; i < rpFull.length - 1; i++) {
          const a0 = { x: rpFull[i].x * sd * 1.03, y: rpFull[i].y - 0.04, z: rpFull[i].z }, b0 = { x: rpFull[i + 1].x * sd * 1.03, y: rpFull[i + 1].y - 0.04, z: rpFull[i + 1].z };
          railSeg(group, a0, b0, 0, 0.07, trimMat, 0.14);
        }
      }
      const e1 = edge(0.5), e2 = edge(1);
      railSeg(group, { x: 0, y: D * 0.35, z: c.L / 2 * 0.98 }, { x: 0, y: D + sheerAt(1, c.L), z: e2.z }, 0, 0.09, trimMat, 0.09);
      void e1;
    }
    // Heckreling quer über das Heck, Bugreling vorn
    const sternP = rp[0], bowP = rpFull[rpFull.length - 1];
    seg({ x: -sternP.x, y: sternP.y, z: sternP.z }, { x: sternP.x, y: sternP.y, z: sternP.z }, 0.88, 0.1, railMat);
    seg({ x: -sternP.x, y: sternP.y, z: sternP.z }, { x: sternP.x, y: sternP.y, z: sternP.z }, 0.46, 0.06, railMat);
    for (let k = 1; k < 6; k++) put(group, cyl(0.025, 0.03, 0.42, 5), wood, -sternP.x + (2 * sternP.x * k) / 6, sternP.y + 0.67, sternP.z);
    void bowP;
  }
  yield;
  // Achterkastell mit Fenstern
  const windows: Mesh[] = [];
  let transomWin: Mesh | null = null;
  const sternLen = c.L * 0.22;
  // Mindesthöhe 2,55 m: darunter liegt die begehbare Kapitänskajüte (Figur 1,75 m)
  const castleH = Math.max(2.55, (1.2 + c.decks * 0.5) * hk);
  // Achterkastell: folgt der Rumpfkurve statt eines Quaders, mit goldener Zierleiste
  const castleZ0 = -c.L / 2 + c.L * 0.02, castleZ1 = castleZ0 + sternLen;
  const cs = new Shape();
  const CN = 8;
  // Die Heckwand des Kastells wölbt sich nach hinten (Heckgalerie wie bei Galeonen) statt einer flachen Platte
  const xmC = halfWidth(castleZ0) * 0.9;
  const BULGE = Math.min(1.7, 0.026 * c.L + 0.16);
  const rearZ = (x: number, off = 0) => castleZ0 - off - BULGE * Math.pow(Math.max(0, 1 - (x / xmC) * (x / xmC)), 0.7);
  const RM = 14;
  /** Punkte der gewölbten Heckkante von +x nach −x (ohne die Endpunkte) */
  const rearArc = (off = 0, grow = 1) => { const a: { x: number; z: number }[] = []; for (let j = 1; j < RM; j++) { const x = xmC * (1 - (2 * j) / RM); a.push({ x: x * grow, z: rearZ(x, off) }); } return a; };
  for (let i = 0; i <= CN; i++) { const z = castleZ0 + (i / CN) * sternLen; const x = halfWidth(z) * 0.9; if (i === 0) cs.moveTo(x, -z); else cs.lineTo(x, -z); }
  for (let i = CN; i >= 0; i--) { const z = castleZ0 + (i / CN) * sternLen; cs.lineTo(-halfWidth(z) * 0.9, -z); }
  for (const p of rearArc().reverse()) cs.lineTo(p.x, -p.z);
  // Hohles Achterkastell: Wandring von 0,16 m um die Kapitänskajüte, vorn mit Türlücke (die Tür ist begehbar, siehe DeckGround).
  // Eine einzige Umrisslinie führt außen herum und an der Tür nach innen (wie ein Schlüsselloch), so bleibt die Form einfach.
  const wallT = 0.16;
  const doorWC = Math.min(1.7, 0.95 + c.W * 0.035), doorHC = Math.min(2.3, castleH * 0.8);
  const xOut = (z: number) => halfWidth(z) * 0.9;
  const xIn = (z: number) => Math.max(0.3, halfWidth(z) * 0.9 - wallT);
  const zA = castleZ0 + wallT, zB = castleZ1 - wallT;
  {
    const ring = new Shape();
    let started = false;
    const to = (x: number, z: number) => { if (started) ring.lineTo(x, -z); else { ring.moveTo(x, -z); started = true; } };
    to(doorWC / 2, castleZ1);
    to(xOut(castleZ1), castleZ1);
    for (let i = CN - 1; i >= 0; i--) { const z = castleZ0 + (i / CN) * sternLen; to(xOut(z), z); }
    for (const p of rearArc()) to(p.x, p.z);
    for (let i = 0; i <= CN; i++) { const z = castleZ0 + (i / CN) * sternLen; to(-xOut(z), z); }
    to(-doorWC / 2, castleZ1);
    to(-doorWC / 2, zB);
    for (let k = 0; k <= CN; k++) { const z = zB - (k / CN) * (zB - zA); to(-xIn(z), z); }
    for (let k = CN; k >= 0; k--) { const z = zB - (k / CN) * (zB - zA); to(xIn(z), z); }
    to(doorWC / 2, zB);
    const castle = new Mesh(new ExtrudeGeometry(ring, { depth: castleH, bevelEnabled: false }).rotateX(-Math.PI / 2), wood);
    castle.position.y = D;
    group.add(castle);
    // Sturz über der Tür
    put(group, box(doorWC + 0.04, castleH - doorHC, wallT + 0.02), wood, 0, D + doorHC + (castleH - doorHC) / 2, castleZ1 - wallT / 2);
  }
  const castleTop = new Mesh(new ExtrudeGeometry(cs, { depth: 0.14, bevelEnabled: false }).rotateX(-Math.PI / 2), toon({ color: deckBase, map: deckTex, unique: true, puddles: 0.3, ...deckKit.pbr }));
  castleTop.position.y = D + castleH;
  castleTop.scale.set(1.06, 1, 1.02);
  group.add(castleTop);
  keepExtra.push(castleTop);
  // Zierleiste etwas größer in allen Richtungen: gleiche Flächen wie der Kastell-Körper flackerten (Tiefenkonflikt)
  const ts = new Shape();
  for (let i = 0; i <= CN; i++) { const z = castleZ0 - 0.07 + (i / CN) * (sternLen + 0.14); const x = halfWidth(z) * 0.9 * 1.035 + 0.04; if (i === 0) ts.moveTo(x, -z); else ts.lineTo(x, -z); }
  for (let i = CN; i >= 0; i--) { const z = castleZ0 - 0.07 + (i / CN) * (sternLen + 0.14); ts.lineTo(-halfWidth(z) * 0.9 * 1.035 - 0.04, -z); }
  for (const p of rearArc(0.07).reverse()) ts.lineTo(p.x * 1.035 + Math.sign(p.x) * 0.04, -p.z);
  // Ring statt Platte: die Zierleiste liegt nur außen um die Wand, der Raum darunter ist die begehbare Kajüte
  {
    const hole = new Path();
    for (let i = 0; i <= CN; i++) { const z = castleZ0 + (i / CN) * sternLen; if (i === 0) hole.moveTo(-xOut(z) * 0.995, -z); else hole.lineTo(-xOut(z) * 0.995, -z); }
    for (let i = CN; i >= 0; i--) { const z = castleZ0 + (i / CN) * sternLen; hole.lineTo(xOut(z) * 0.995, -z); }
    for (const p of rearArc(0, 0.995)) hole.lineTo(p.x, -p.z);
    ts.holes.push(hole);
  }
  const trim = new Mesh(new ExtrudeGeometry(ts, { depth: 0.12, bevelEnabled: false }).rotateX(-Math.PI / 2), gold);
  trim.position.y = D + castleH * 0.86;
  group.add(trim);
  yield;
  // ---- Treppe(n) zum Achterdeck, Kapitänskajüte und Reling rund um das Achterdeck ----
  const topY = castleH + 0.14;
  const xfront = halfWidth(castleZ1) * 0.9 * 1.04;
  const stairW = Math.min(2.4, 0.9 + c.W * 0.075);
  const stairLen = topY / 0.58;
  // Das größte Schiff bekommt eine Doppeltreppe (beidseits der Kajütentür), alle anderen eine Treppe an Steuerbord
  // Das größte Schiff: Doppeltreppe wie ein Prunkaufgang – oben liegen die Läufe beidseits der Kajütentür, unten schwingen sie in
  // einer Trompetenkurve nach außen und enden in runden Antrittsstufen mit Schnecken
  const doorW = Math.min(1.7, 0.95 + c.W * 0.035);
  const grand = c.L >= 70;
  const stairX = grand ? [-1, 1].map((sd) => sd * (doorW / 2 + 0.95 + stairW / 2)) : [-(xfront - stairW / 2 - 0.35)];
  const doorLamps: number[][] = [];
  const flare = grand ? Math.max(0, Math.min(3.6, halfWidth(castleZ1 + stairLen) * 0.8 - (doorW / 2 + 0.95 + stairW / 2) - stairW / 2 - 0.2)) : 0;
  /** Mittellinie einer Treppe an Position t (0 unten … 1 oben): sanft nach außen ausschwingend */
  const stairXc = (xs: number, t: number) => xs + Math.sign(xs) * flare * (1 - t) * (1 - t);
  /** Querrichtung (Einheitsvektor in x/z, senkrecht zur Lauflinie) bei t */
  const stairN = (xs: number, t: number) => {
    const dx = -2 * Math.sign(xs) * flare * (1 - t), dz = -stairLen, l = Math.hypot(dx, dz);
    return { nx: -dz / l, nz: dx / l, yaw: Math.atan2(dx, dz) };
  };
  {
    const treadMat = toon({ color: '#A67C4E', roughness: 0.85 });
    const riserMat = toon({ color: '#5E3A22', roughness: 0.9 });
    const zBot = castleZ1 + stairLen;
    const n = Math.max(6, Math.ceil(topY / 0.24));
    const run = stairLen / n, rise = topY / n;
    const K = flare > 0 ? 16 : 1;
    for (const xs of stairX) {
      for (const e of [-1, 1]) {
        const pt = (t: number) => { const N = stairN(xs, t), o = e * (stairW / 2 - 0.05); return { x: stairXc(xs, t) + N.nx * o, y: D + topY * t, z: zBot - stairLen * t + N.nz * o }; };
        // Wange (Seitenbrett) und Handlauf mit Zwischenholm, Docken und Pfosten mit goldener Kappe
        for (let j = 0; j < K; j++) {
          const a0 = pt(j / K), b0 = pt((j + 1) / K);
          railSeg(group, a0, b0, 0.14, 0.09, wood, 0.34);
          railSeg(group, a0, b0, 0.98, 0.07, darkWood);
          railSeg(group, a0, b0, 0.52, 0.05, darkWood);
        }
        const nb = Math.max(3, Math.floor(stairLen / 0.5));
        for (let i = 1; i < nb; i++) {
          const p = pt(i / nb);
          put(group, cyl(0.024, 0.03, 0.8, 5), wood, p.x, p.y + 0.5, p.z);
        }
        for (const t of [0, 1]) {
          const p = pt(t);
          put(group, box(0.1, 1.12, 0.1), wood, p.x, p.y + 0.56, p.z);
          put(group, cyl(0.07, 0.07, 0.07, 6), gold, p.x, p.y + 1.15, p.z);
        }
        // Prunkaufgang: unten dicker Pfosten mit goldener Kugel (Schnecke) und ein zweiter Zierpfosten an der Rundung
        if (flare > 0) {
          const p = pt(0);
          put(group, cyl(0.12, 0.16, 1.15, 10), darkWood, p.x, p.y + 0.57, p.z + 0.1);
          put(group, cyl(0.2, 0.2, 0.06, 10), gold, p.x, p.y + 1.17, p.z + 0.1);
          put(group, new SphereGeometry(0.2, 12, 10), gold, p.x, p.y + 1.36, p.z + 0.1);
          const q2 = pt(0.14);
          put(group, cyl(0.07, 0.09, 1.0, 8), wood, q2.x, q2.y + 0.5, q2.z);
          put(group, new SphereGeometry(0.1, 8, 6), gold, q2.x, q2.y + 1.05, q2.z);
        }
      }
      for (let k = 1; k <= n; k++) {
        const t = (k - 0.5) / n;
        const z = zBot - (k - 0.5) * run, y = D + k * rise;
        const yaw = flare > 0 ? stairN(xs, t).yaw : 0;
        const x = stairXc(xs, t);
        // untere Antrittsstufen etwas breiter: die Rundung des Aufgangs
        const wide = flare > 0 && k <= 3 ? 1 + (4 - k) * 0.1 : 1;
        put(group, box((stairW - 0.14) * wide, 0.07, run + 0.07), treadMat, x, y - 0.035, z, 0, yaw, 0);
        put(group, box((stairW - 0.14) * wide, rise, 0.04), riserMat, stairXc(xs, (k - 1) / n), y - rise / 2, zBot - (k - 1) * run - 0.03, 0, yaw, 0);
      }
    }
    // Kapitänskajüte: Tür in der Vorderwand des Achterkastells, Goldrahmen, Messingknauf, Oberlicht, Wandlaternen
    const dw = Math.min(1.7, 0.95 + c.W * 0.035), dh = Math.min(2.3, castleH * 0.8);
    const zd = castleZ1 + 0.03;
    const frame = toon({ color: '#E3B04B', spec: 0.9 });
    // Die Tür steht offen: ein Flügel schwingt nach außen, dahinter liegt die Kajüte
    {
      const leafW = dw * 0.5, th = 1.15;
      const leaf = new Mesh(new BoxGeometry(leafW, dh - 0.1, 0.07), toon('#3A2214'));
      leaf.position.set(-dw / 2 + Math.cos(th) * leafW / 2, D + dh / 2, zd + 0.04 + Math.sin(th) * leafW / 2);
      leaf.rotation.y = -th;
      group.add(leaf);
      for (const y of [0.35, dh - 0.4]) {
        const strap = new Mesh(new BoxGeometry(leafW * 0.9, 0.07, 0.085), toon('#1B100A'));
        strap.position.copy(leaf.position); strap.position.y = D + y;
        strap.rotation.y = -th;
        group.add(strap);
      }
    }
    for (const e of [-1, 1]) put(group, box(0.1, dh + 0.12, 0.12), frame, e * (dw / 2 + 0.05), D + dh / 2 + 0.04, zd + 0.03);
    put(group, box(dw + 0.3, 0.14, 0.14), frame, 0, D + dh + 0.1, zd + 0.03);
    put(group, box(dw + 0.5, 0.06, 0.2), frame, 0, D + dh + 0.2, zd + 0.04);
    put(group, new SphereGeometry(0.06, 8, 6), frame, dw * 0.32, D + dh * 0.48, zd + 0.1);
    put(group, new SphereGeometry(0.06, 8, 6), frame, -dw * 0.32, D + dh * 0.48, zd + 0.1);
    // Oberlicht über der Tür (leuchtet nachts)
    const th = Math.max(0.28, castleH - dh - 0.4);
    const tw = new Mesh(new PlaneGeometry(dw * 0.7, th), GLOW_WINDOW);
    tw.position.set(0, D + dh + 0.35 + th / 2, zd + 0.02);
    tw.userData.noOutline = true;
    group.add(tw);
    transomWin = tw;
    doorLamps.push([-(dw / 2 + 0.45), D + dh * 0.78, zd + 0.25], [dw / 2 + 0.45, D + dh * 0.78, zd + 0.25]);
  }
  {
    const ry = D + topY;
    const x0 = (z: number) => halfWidth(z) * 0.9 * 1.04;
    const zs = [castleZ0 + 0.1, (castleZ0 + castleZ1) / 2, castleZ1 - 0.1];
    const pt = (x: number, z: number) => ({ x, y: ry, z });
    for (const sd of [-1, 1]) {
      for (let i = 0; i < zs.length - 1; i++) {
        const a0 = pt(sd * x0(zs[i]), zs[i]), b0 = pt(sd * x0(zs[i + 1]), zs[i + 1]);
        railSeg(group, a0, b0, 0.8, 0.08, darkWood);
        railSeg(group, a0, b0, 0.42, 0.05, darkWood);
        for (const f of [0.3, 0.7]) put(group, cyl(0.022, 0.026, 0.36, 5), wood, a0.x + (b0.x - a0.x) * f, ry + 0.6, a0.z + (b0.z - a0.z) * f);
      }
      for (const z of zs) put(group, box(0.07, 0.82, 0.07), wood, sd * x0(z), ry + 0.41, z);
    }
    // Querreling vorn mit Öffnungen für die Treppen
    const zf = zs[2], xf = x0(zf);
    const gaps = stairX.map((xs) => [xs - stairW / 2, xs + stairW / 2]).sort((p, q) => p[0] - q[0]);
    let cur = -xf;
    const seg = (xa: number, xb: number) => {
      if (xb - xa < 0.2) return;
      railSeg(group, pt(xa, zf), pt(xb, zf), 0.8, 0.08, darkWood);
      railSeg(group, pt(xa, zf), pt(xb, zf), 0.42, 0.05, darkWood);
      for (const x of [xa, xb]) put(group, box(0.07, 0.82, 0.07), wood, x, ry + 0.41, zf);
      const m = Math.floor((xb - xa) / 0.5);
      for (let i = 1; i < m; i++) put(group, cyl(0.022, 0.026, 0.36, 5), wood, xa + ((xb - xa) * i) / m, ry + 0.6, zf);
    };
    for (const gp of gaps) { seg(cur, gp[0]); cur = gp[1]; }
    seg(cur, xf);
    const zb = zs[0], xb = x0(zb);
    railSeg(group, pt(-xb, zb), pt(xb, zb), 0.8, 0.08, darkWood);
    railSeg(group, pt(-xb, zb), pt(xb, zb), 0.42, 0.05, darkWood);
    const mb = Math.floor((2 * xb) / 0.5);
    for (let i = 1; i < mb; i++) put(group, cyl(0.022, 0.026, 0.36, 5), wood, -xb + ((2 * xb) * i) / mb, ry + 0.6, zb);
  }
  const castleMid = (castleZ0 + castleZ1) / 2;
  const winMat = GLOW_WINDOW;
  const sternLampSpots: number[][] = [];
  /**
   * Schiffe 2: Heckgalerie. Bogenfenster in goldenen Rahmen (ein oder zwei Reihen), Zwischenpfeiler, Balkone mit Geländer
   * auf der Wölbung der Heckwand, Sockel- und Kranzleiste, kleine Bogenfenster an den Seiten des Kastells.
   */
  function buildSternGallery() {
    const rows = castleH >= 3.3 || vis.hull.galleryRows === 2 ? 2 : 1;
    const ww = Math.min(0.78, 0.4 + castleH * 0.075), hh = Math.min(1.5, castleH * (rows === 2 ? 0.27 : 0.4));
    const nT = Math.round((2 * xmC * 0.8) / (ww * 1.75));
    const n = Math.max(3, nT % 2 ? nT : nT + 1);
    const span = 2 * xmC * 0.8;
    const glassDay = toon({ color: '#1B2430', spec: 0.9, roughness: 0.25 });
    const pil = toon('#4A2E1A');
    const archShape = (w: number, h: number) => { const s = new Shape(); const r = w / 2; s.moveTo(-r, -h / 2); s.lineTo(r, -h / 2); s.lineTo(r, h / 2 - r); s.absarc(0, h / 2 - r, r, 0, Math.PI, false); s.lineTo(-r, -h / 2); return s; };
    const arch = (w: number, h: number) => sharedGeo(`ship-arch-${w.toFixed(3)}-${h.toFixed(3)}`, () => new ShapeGeometry(archShape(w, h), 8));
    const wput = (geo: BufferGeometry, mat: Mesh['material'], cx: number, cy: number, cz: number, th: number, lx: number, ly: number, lz: number) =>
      put(group, geo, mat, cx + lx * Math.cos(th) + lz * Math.sin(th), cy + ly, cz - lx * Math.sin(th) + lz * Math.cos(th), 0, th, 0);
    /** Bogenfenster samt Rahmen an Stelle (cx, cy, cz) mit Blickrichtung th; glow = nachts leuchtende Scheibe */
    const archWindow = (cx: number, cy: number, cz: number, th: number, w: number, h: number, glow: boolean, halo = true) => {
      wput(arch(w, h), glassDay, cx, cy, cz, th, 0, 0, 0.012);
      if (glow) {
        const g = new Mesh(arch(w, h), winMat);
        g.position.set(cx + Math.sin(th) * 0.024, cy, cz + Math.cos(th) * 0.024);
        g.rotation.y = th;
        g.userData.noOutline = true;
        if (!halo) g.userData.noHalo = true;   // nur Glas, ohne eigenen Lichthof (spart Leuchtstellen im GlowSystem)
        group.add(g);
        windows.push(g);
      }
      wput(torus(w / 2 + 0.02, 0.026, 10, Math.PI), gold, cx, cy, cz, th, 0, h / 2 - w / 2, 0.035);
      for (const e of [-1, 1]) wput(box(0.05, h - w / 2, 0.07), gold, cx, cy, cz, th, e * (w / 2 + 0.02), -w / 4, 0.035);
      wput(box(w + 0.16, 0.06, 0.15), gold, cx, cy, cz, th, 0, -h / 2 - 0.02, 0.06);
      wput(box(0.03, h - w / 2, 0.03), gold, cx, cy, cz, th, 0, -w / 4, 0.04);
      wput(box(w, 0.03, 0.03), gold, cx, cy, cz, th, 0, -h * 0.1, 0.04);
    };
    const slope = (x: number) => (rearZ(x + 0.01) - rearZ(x - 0.01)) / 0.02;
    const centers = rows === 2 ? [0.28, 0.66] : [0.56];
    centers.forEach((rc, r) => {
      const cy = D + castleH * rc;
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * (span / (n - 1));
        archWindow(x, cy, rearZ(x), Math.atan2(slope(x), -1), ww, hh, true, r === 0 && (n <= 5 || i % 2 === 0));
      }
      // Pfeiler zwischen den Fenstern (und an den Enden)
      for (let i = 0; i <= n; i++) {
        const x = (i - n / 2) * (span / (n - 1));
        if (Math.abs(x) > xmC * 0.97) continue;
        const th = Math.atan2(slope(x), -1);
        wput(cyl(0.05, 0.06, hh * 1.12, 6), pil, x, cy, rearZ(x), th, 0, 0, 0.05);
      }
      // Balkon unter der Reihe: Bohlen auf der Wölbung, Geländer mit Docken
      const ly = cy - hh / 2 - 0.07, proj = 0.34 + (r === 0 ? 0.08 : 0);
      const ls = new Shape();
      for (let j = 0; j <= RM; j++) { const x = xmC * (1 - (2 * j) / RM); if (j === 0) ls.moveTo(x, -rearZ(x, proj)); else ls.lineTo(x, -rearZ(x, proj)); }
      for (let j = RM; j >= 0; j--) { const x = xmC * (1 - (2 * j) / RM); ls.lineTo(x, -rearZ(x, -0.04)); }
      const ledge = new Mesh(new ExtrudeGeometry(ls, { depth: 0.09, bevelEnabled: false }).rotateX(-Math.PI / 2), wood);
      ledge.position.y = ly;
      group.add(ledge);
      keepExtra.push(ledge);
      const pts: { x: number; y: number; z: number }[] = [];
      for (let j = 0; j <= RM; j++) { const x = xmC * (1 - (2 * j) / RM); pts.push({ x, y: ly + 0.09, z: rearZ(x, proj - 0.05) }); }
      for (let j = 0; j < RM; j++) {
        const a = pts[j], b = pts[j + 1];
        railSeg(group, a, b, 0.62, 0.07, gold);
        railSeg(group, a, b, 0.1, 0.045, darkWood);
        put(group, cyl(0.02, 0.026, 0.52, 6), darkWood, (a.x + b.x) / 2, a.y + 0.34, (a.z + b.z) / 2);
      }
      for (let j = 0; j <= RM; j += 2) put(group, cyl(0.045, 0.055, 0.7, 6), gold, pts[j].x, pts[j].y + 0.35, pts[j].z);
    });
    // Sockelleiste und Kranzleiste rund um das Kastell
    for (const [yy, hgt] of [[-0.02, 0.12], [castleH - 0.17, 0.1]] as const) {
      const rb = new Mesh(new ExtrudeGeometry(ts, { depth: hgt, bevelEnabled: false }).rotateX(-Math.PI / 2), gold);
      rb.position.y = D + yy;
      group.add(rb);
    }
    // Seitenfenster des Kastells (Bogenfenster, nur Zierde; Innenraum hat eigene Fenster nach hinten)
    {
      const w2 = ww * 0.8, h2 = hh * 0.92, cy = D + castleH * (rows === 2 ? 0.5 : 0.56);
      const cnt = Math.max(2, Math.min(5, Math.round(sternLen / (w2 * 2.6))));
      for (const sd of [-1, 1]) for (let k = 0; k < cnt; k++) {
        const z = castleZ0 + sternLen * (0.12 + 0.76 * ((k + 0.5) / cnt)) * 0.9 + 0.2;
        archWindow(sd * (xOut(z) + 0.004), cy, z, sd * Math.PI / 2, w2, h2, true, false);
      }
    }
    // Hecklaternen (Rumpf-Stufe 4: zwei, Stufe 5: drei) über der Kranzleiste der Galerie; die Laternen-Schleife unten setzt sie
    for (let i = 0; i < vis.hull.sternLamps; i++) {
      const x = vis.hull.sternLamps === 2 ? (i === 0 ? -1 : 1) * xmC * 0.9 : (i - 1) * xmC * 0.9;
      sternLampSpots.push([x, D + castleH + 0.55, rearZ(x, 0.5)]);
    }
    return { ww, hh, n, span, centers, arch };
  }
  const gal = buildSternGallery();
  yield;
  // Vorderkastell (ab Brigg): begehbares Vordeck bis in die Bugspitze. Zwei Treppen beidseits der Doppeltür an der Rückwand führen hinauf;
  // oben Plankendeck, Reling rundum, Goldleisten, Buggeschütze (ab Korvette), Poller und Tauwerk
  let fore: { z0: number; z1: number; top: number; stairX: number[]; stairW: number; stairLen: number } | null = null;
  if (c.L > 20) {
    const f0 = FORE_T0 * c.L / 2;
    const fh = 0.9 + c.decks * 0.2;
    const topF = fh + 0.12;
    const tipZ = edge(1).z;
    // Grundriss aus der Rumpfkante (wie das Deck): Seiten bündig mit der Bordwand bis zur Spitze
    const NF = 12;
    const plan: { x: number; z: number }[] = [];
    for (let i = 0; i <= NF; i++) { const t = FORE_T0 + (i / NF) * (1 - FORE_T0); const e = edge(t); plan.push({ x: e.x * 0.99 + 0.03, z: e.z }); }
    const fs = new Shape();
    plan.forEach((p, i) => (i === 0 ? fs.moveTo(p.x, -p.z) : fs.lineTo(p.x, -p.z)));
    for (let i = NF; i >= 0; i--) fs.lineTo(-plan[i].x, -plan[i].z);
    const foreBody = new Mesh(new ExtrudeGeometry(fs, { depth: fh, bevelEnabled: false }).rotateX(-Math.PI / 2), wood);
    foreBody.position.y = D;
    group.add(foreBody);
    const foreTop = new Mesh(new ExtrudeGeometry(fs, { depth: 0.12, bevelEnabled: false }).rotateX(-Math.PI / 2), toon({ color: deckBase, map: deckTex, unique: true, puddles: 0.3, ...deckKit.pbr }));
    foreTop.position.y = D + fh;
    foreTop.scale.set(1.04, 1, 1.0);
    group.add(foreTop);
    // Goldleiste unter der Deckplatte
    const ftr = new Shape();
    plan.forEach((p, i) => (i === 0 ? ftr.moveTo(p.x + 0.05, -p.z) : ftr.lineTo(p.x + 0.05, -p.z)));
    for (let i = NF; i >= 0; i--) ftr.lineTo(-plan[i].x - 0.05, -plan[i].z);
    const foreTrim = new Mesh(new ExtrudeGeometry(ftr, { depth: 0.1, bevelEnabled: false }).rotateX(-Math.PI / 2), gold);
    foreTrim.position.y = D + fh * 0.72;
    group.add(foreTrim);
    // Rückwand zum Hauptdeck: Doppeltür, Bullaugen, dazu die beiden Treppen
    const stairLenF = topF / 0.58;
    const dwF = Math.min(1.5, 0.8 + c.W * 0.03);
    const stairWF = Math.min(1.6, 0.8 + c.W * 0.04);
    const xsF = dwF / 2 + 0.4 + stairWF / 2;
    const stairXF = [-xsF, xsF];
    const zb = f0 - stairLenF;
    {
      const zw = f0 - 0.03;
      const dh = Math.min(fh * 0.85, 1.8);
      put(group, box(dwF, dh, 0.07), toon('#2B1A10'), 0, D + dh / 2, zw);
      put(group, box(0.03, dh - 0.08, 0.03), toon('#1B100A'), 0, D + dh / 2, zw - 0.05);
      const fr = toon({ color: '#E3B04B', spec: 0.9 });
      for (const e of [-1, 1]) put(group, box(0.09, dh + 0.1, 0.1), fr, e * (dwF / 2 + 0.05), D + dh / 2 + 0.03, zw - 0.02);
      put(group, box(dwF + 0.28, 0.12, 0.12), fr, 0, D + dh + 0.08, zw - 0.02);
      // Bullaugen mit Goldring außen neben den Treppen
      for (const e of [-1, 1]) {
        const px = e * (xsF + stairWF / 2 + 0.4);
        if (Math.abs(px) < plan[0].x - 0.3) {
          put(group, cyl(0.2, 0.2, 0.06, 12), fr, px, D + fh * 0.5, zw - 0.02, Math.PI / 2, 0, 0);
          put(group, cyl(0.15, 0.15, 0.07, 12), toon('#1B2A3A'), px, D + fh * 0.5, zw - 0.03, Math.PI / 2, 0, 0);
        }
      }
      // Treppen (Stufen, Wangen, Handläufe, Pfosten)
      const treadMat = toon({ color: '#A67C4E', roughness: 0.85 });
      const riserMat = toon({ color: '#5E3A22', roughness: 0.9 });
      const n = Math.max(5, Math.ceil(topF / 0.24));
      const run = stairLenF / n, rise = topF / n;
      for (const xs of stairXF) {
        for (let k = 1; k <= n; k++) {
          const z = zb + (k - 0.5) * run, y = D + k * rise;
          put(group, box(stairWF - 0.12, 0.07, run + 0.07), treadMat, xs, y - 0.035, z);
          put(group, box(stairWF - 0.12, rise, 0.04), riserMat, xs, y - rise / 2, zb + (k - 1) * run + 0.03);
        }
        for (const e of [-1, 1]) {
          const x = xs + e * (stairWF / 2 - 0.05);
          const a0 = { x, y: D, z: zb }, b0 = { x, y: D + topF, z: f0 };
          railSeg(group, a0, b0, 0.14, 0.09, wood, 0.34);
          railSeg(group, a0, b0, 0.92, 0.07, darkWood);
          railSeg(group, a0, b0, 0.48, 0.05, darkWood);
          const nb = Math.max(3, Math.floor(stairLenF / 0.5));
          for (let i = 1; i < nb; i++) put(group, cyl(0.022, 0.028, 0.74, 5), wood, x, D + (topF * i) / nb + 0.46, zb + (stairLenF * i) / nb);
          for (const t of [0, 1]) { put(group, box(0.1, 1.05, 0.1), wood, x, D + topF * t + 0.52, zb + stairLenF * t); put(group, cyl(0.065, 0.065, 0.07, 6), gold, x, D + topF * t + 1.08, zb + stairLenF * t); }
        }
        // Wangen als feste Wände (Begrenzung beim Laufen)
        for (const e of [-1, 1]) block(xs + e * (stairWF / 2 + 0.04), zb + stairLenF / 2, 0.06, stairLenF / 2);
      }
    }
    // Reling oben: Seiten, vorn um die Spitze und hinten mit Lücken an den Treppen
    const ry = D + topF;
    const rail = (a: { x: number; z: number }, b: { x: number; z: number }) => {
      const a0 = { x: a.x, y: ry, z: a.z }, b0 = { x: b.x, y: ry, z: b.z };
      railSeg(group, a0, b0, 0.78, 0.08, darkWood);
      railSeg(group, a0, b0, 0.4, 0.05, darkWood);
      const len = Math.hypot(b.x - a.x, b.z - a.z), m = Math.floor(len / 0.5);
      for (let i = 1; i < m; i++) put(group, cyl(0.022, 0.026, 0.34, 5), wood, a.x + ((b.x - a.x) * i) / m, ry + 0.58, a.z + ((b.z - a.z) * i) / m);
    };
    const post = (x: number, z: number) => { put(group, box(0.07, 0.8, 0.07), wood, x, ry + 0.4, z); put(group, cyl(0.05, 0.05, 0.05, 6), gold, x, ry + 0.83, z); };
    const rp2: { x: number; z: number }[] = plan.filter((_, i) => i % 2 === 0 || i === NF);
    for (const sd of [-1, 1]) {
      for (let i = 0; i < rp2.length - 1; i++) rail({ x: sd * rp2[i].x * 0.97, z: rp2[i].z }, { x: sd * rp2[i + 1].x * 0.97, z: rp2[i + 1].z });
      for (const p of rp2) post(sd * p.x * 0.97, p.z);
    }
    {
      // hintere Kante (Rückseite der Deckplatte) mit Öffnungen an den Treppen
      const xe = plan[0].x * 0.97, gaps = stairXF.map((xs) => [xs - stairWF / 2, xs + stairWF / 2]);
      let cur = -xe;
      for (const g2 of gaps) { if (g2[0] - cur > 0.25) { rail({ x: cur, z: f0 + 0.15 }, { x: g2[0], z: f0 + 0.15 }); post(cur, f0 + 0.15); post(g2[0], f0 + 0.15); } cur = g2[1]; }
      if (xe - cur > 0.25) { rail({ x: cur, z: f0 + 0.15 }, { x: xe, z: f0 + 0.15 }); post(cur, f0 + 0.15); post(xe, f0 + 0.15); }
    }
    // Ausstattung oben: Poller, Tauwerk, Buggeschütze (ab Korvette)
    {
      const ir = IRON(), cu = COPPER(), rp3 = ROPE();
      const zf = f0 + (tipZ - f0) * 0.3, zg = f0 + (tipZ - f0) * 0.62;
      for (const sd of [-1, 1]) {
        const hx = edge(FORE_T0 + (1 - FORE_T0) * 0.3).x * 0.8;
        put(group, cyl(0.1, 0.12, 0.4, 8), ir, sd * hx, ry + 0.2, zf);
        put(group, cyl(0.15, 0.1, 0.08, 8), ir, sd * hx, ry + 0.42, zf);
        block(sd * hx, zf, 0.2, 0.2);
        for (let i = 0; i < 3; i++) put(group, new TorusGeometry(0.28 - i * 0.02, 0.05, 5, 12), rp3, sd * hx * 0.6, ry + 0.06 + i * 0.07, zf + 0.7, Math.PI / 2, 0, 0);
      }
      if (c.L >= 30) {
        for (const sd of [-1, 1]) {
          const gx = sd * Math.max(0.5, Math.min(edge(0.8).x * 0.5, 1.4 + c.W * 0.06));
          put(group, cyl(0.1, 0.12, 0.5, 6), darkWood, gx, ry + 0.25, zg);
          const barrel = put(group, cyl(0.12, 0.17, 1.15, 10), cu, gx, ry + 0.58, zg + 0.35, Math.PI / 2, 0, 0);
          barrel.scale.setScalar(Math.min(1.2, sc * 0.7 + 0.4));
          put(group, cyl(0.19, 0.19, 0.06, 10), ir, gx, ry + 0.58, zg + 0.1, Math.PI / 2, 0, 0);
          put(group, box(0.5, 0.1, 0.4), ir, gx, ry + 0.52, zg + 0.1);
          block(gx, zg + 0.2, 0.3, 0.55);
        }
      }
    }
    // Rückwand als feste Wand (Lücken an den Treppen): man steigt nur über die Treppen hinauf
    {
      const gaps = stairXF.map((xs) => [xs - stairWF / 2, xs + stairWF / 2]);
      let cur = -c.L;
      for (const g2 of gaps) { if (g2[0] > cur) block((cur + g2[0]) / 2, f0, (g2[0] - cur) / 2, 0.07); cur = g2[1]; }
      if (c.L > cur) block((cur + c.L) / 2, f0, (c.L - cur) / 2, 0.07);
    }
    fore = { z0: f0, z1: tipZ, top: topF, stairX: stairXF, stairW: stairWF, stairLen: stairLenF };
  }

  yield;
  // Steuerrad
  const helm = new Vector3(0, D + castleH + 0.14, castleMid + sternLen * 0.15);
  const wheel = new Group();
  if (hasProp('steuerrad')) {
    // Blender-Steuerrad (Felge, acht Speichen mit gedrehten Griffen, Messingnabe): Netze bleiben getrennt, damit sich das Rad dreht
    for (const [role, geo] of propRoles('steuerrad')) {
      const wm = new Mesh(geo, role === 'brass' ? PROP_GOLD() : wood);
      wm.userData.wheelMesh = true;
      wheel.add(wm);
    }
  } else {
    // Rad aus einem Stück (Felge, Speichen, Griffe, Nabe): wird nicht mit dem Schiff verschmolzen, damit es sich drehen kann
    const parts: BufferGeometry[] = [];
    const add = (g: BufferGeometry, mat: 'wood' | 'gold', x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const c2 = g.index ? g.toNonIndexed() : g.clone();
      for (const k of Object.keys(c2.attributes)) if (k !== 'position' && k !== 'normal') c2.deleteAttribute(k);
      c2.rotateX(rx); c2.rotateY(ry); c2.rotateZ(rz); c2.translate(x, y, z);
      parts.push(c2);
      void mat;
    };
    add(new TorusGeometry(0.45, 0.05, 6, 20), 'wood');
    for (let i = 0; i < 4; i++) add(new BoxGeometry(1.15, 0.05, 0.05), 'wood', 0, 0, 0, 0, 0, (i / 4) * Math.PI);
    for (let i = 0; i < 8; i++) { const a2 = (i / 8) * Math.PI * 2; add(new SphereGeometry(0.06, 6, 5), 'wood', Math.cos(a2) * 0.62, Math.sin(a2) * 0.62, 0); }
    add(new CylinderGeometry(0.1, 0.1, 0.14, 8), 'gold', 0, 0, 0, Math.PI / 2);
    const mg = mergeGeometries(parts, false);
    if (mg) { const wm = new Mesh(mg, wood); wm.userData.wheelMesh = true; wheel.add(wm); }
  }
  wheel.position.set(0, helm.y + 0.88, helm.z + 0.5);
  wheel.scale.setScalar(0.85);
  const stand = new Mesh(new BoxGeometry(0.15, 1, 0.15), darkWood);
  stand.position.set(0, helm.y + 0.44, helm.z + 0.55);
  group.add(wheel, stand);

  yield;
  // Masten, Rahen, Segel
  const sails: Mesh[] = [];
  // Flagge einmal malen: dieselbe Leinwand dient als Wappen auf dem Großsegel
  // Schiffe der Weltmächte tragen ihre geteilte Flaggen-Textur und Segelmuster (render/heraldry.ts)
  const flagTex = look.power ? factionFlagTexture(look.power) : flagTexture(look.flag, look.flagColor);
  const emblem = flagTex.image as HTMLCanvasElement;
  // Tuchflaggen (hochaufgelöst, geteilte Texturen je Aussehen): Wappen der Macht oder Flaggenart und -farbe des Spielers
  const flagSpec: FlagSpec = { flag: look.flag, color: look.flagColor, power: look.power ?? null };
  const clothTex = clothTextures(flagSpec);
  const clothFlags: ClothFlag[] = [];
  const addCloth = (mesh: Mesh, u: ReturnType<typeof makeClothUniforms>, mat: ReturnType<typeof clothMaterial>) => { mesh.userData.noOutline = true; mesh.castShadow = false; mesh.receiveShadow = true; clothFlags.push({ mesh, u, mat, ang: 0, ph: Math.random() * 6 }); };
  const heraldry = look.power ? sailHeraldry(look.power) : null;
  const mainMast = c.masts.length > 1 ? 1 : 0;
  let sailSeed = 1;
  const rig: number[] = [];
  const mastTops: { z: number; h: number }[] = [];
  const mastParts: { up: Group; z: number; pivotY: number; h: number; ext: number }[] = [];
  const sv = vis.sail;
  const shroudKs = Array.from({ length: sv.shrouds }, (_, i) => i - (sv.shrouds - 1) / 2);
  const accent = look.power ? FACTIONS[look.power].palette.accent : look.flagColor;
  const sailLook = { wear: sv.wear, border: sv.border ? { double: sv.border.double, accent } : null };
  // geteilte Segeltexturen: gleiches Aussehen, gleicher Zufallswert = gleiches Bild (render/textures.ts `cachedSailTexture`)
  const sailBase = `${look.sail}|${look.power ?? '-'}|${look.flag}:${look.flagColor}|${JSON.stringify(sailLook)}`;
  const sailTex = (withEmblem: boolean, seed: number, tattered: boolean) => cachedSailTexture(`${sailBase}|${withEmblem ? 1 : 0}|${seed}|${tattered ? 1 : 0}`,
    () => sailTexture(look.sail, withEmblem ? emblem : null, seed, tattered, heraldry ? { pattern: heraldry.pattern, emblem: withEmblem ? heraldry.emblem : () => {} } : null, sailLook));
  c.masts.forEach((mz, mi) => {
    const z = mz * c.L;
    const h = c.mh * (mi === 0 && c.masts.length > 1 ? 0.92 : mi === c.masts.length - 1 && c.masts.length > 2 ? 0.8 : 1);
    // Untermast und schlankere Stenge darüber (statt eines dicken Pfahls)
    const ms = Math.min(sc, 3.2);
    const lower = new Mesh(new CylinderGeometry(0.13 * ms, 0.19 * ms, h * 0.64, 10), darkWood);
    lower.position.set(0, D + h * 0.32, z);
    const upper = new Mesh(new CylinderGeometry(0.06 * ms, 0.1 * ms, h * 0.42, 8), darkWood);
    upper.position.set(0, D + h * 0.79, z);
    // der obere Teil mit Rahen, Korb und Segeln ist eine eigene Gruppe: in der Enterphase knickt er ab
    const mUp = new Group();
    group.add(mUp);
    // Stufe 4 – 5: Mast um eine Bramstenge verlängert (trägt das Topp-/Bramsegel)
    const ext = sv.topgallants ? h * 0.2 : 0;
    mastParts.push({ up: mUp, z, pivotY: D + h * 0.64, h, ext });
    if (ext) put(mUp, cyl(0.04 * ms, 0.065 * ms, ext + 0.3, 6), darkWood, 0, D + h + ext / 2 - 0.05, z);
    group.add(lower);
    mUp.add(upper);
    if (c.L < 24) block(0, z, 0.19 * ms + 0.1, 0.19 * ms + 0.1);
    const nest = new Mesh(new CylinderGeometry(0.45 * Math.min(sc, 3), 0.35 * Math.min(sc, 3), 0.4, 10), wood);
    nest.position.set(0, D + h * 0.78, z);
    mUp.add(nest);
    // Mastkorb: Reling aus Ring, Pfosten und Handlauf, goldene Kugel an der Mastspitze (große Schiffe)
    if (c.L >= 24) {
      const ns = Math.min(sc, 3), top = D + h * 0.78 + 0.2;
      put(mUp, torus(0.5 * ns, 0.025, 14), darkWood, 0, top + 0.5, z, Math.PI / 2, 0, 0);
      put(mUp, torus(0.5 * ns, 0.02, 14), darkWood, 0, top + 0.22, z, Math.PI / 2, 0, 0);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; put(mUp, cyl(0.02, 0.02, 0.55, 4), wood, Math.cos(a) * 0.5 * ns, top + 0.27, Math.sin(a) * 0.5 * ns + z); }
      put(mUp, new SphereGeometry(0.11 * Math.min(sc, 2.4), 8, 6), gold, 0, D + h + ext + 0.12, z);
    }
    const yards = c.L > 16 ? 3 : 2;
    for (let k = 0; k < yards; k++) {
      const y = D + h * (0.3 + k * 0.24);
      const w = c.W * (1.15 - k * 0.22);
      const yard = new Mesh(new CylinderGeometry(0.06 * Math.min(sc, 3), 0.06 * Math.min(sc, 3), w, 6), darkWood);
      yard.rotation.z = Math.PI / 2;
      yard.position.set(0, y + h * 0.2, z);
      mUp.add(yard);
      // Segel-Stufe: Stufe 1 trägt nur ~72 % der Fläche (0,85 in Breite und Höhe), höhere Stufen straffere, weniger gebauchte Tücher
      const sw = w * 0.95 * sv.dimK;
      const sh = h * 0.235 * sv.dimK;
      const sg = new PlaneGeometry(sw, sh, 26, 16);
      const sp = sg.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const x = sp.getX(i), yy = sp.getY(i);
        // kräftig gebläht, unten etwas mehr Bauch
        sp.setZ(i, Math.cos((x / sw) * Math.PI) * 1.05 * sc * sv.billow * (1 - Math.abs(yy) / sh * 0.35) * (1.1 - (yy / sh + 0.5) * 0.3));
      }
      sg.computeVertexNormals();
      const withEmblem = mi === mainMast && k === (yards > 2 ? 1 : 0);
      const sailU = makeSailUniforms(sw, sh, (y + h * 0.1) * 0.7);
      const sailMat = sailMaterial(toon({ color: 0xffffff, side: DoubleSide, map: sailTex(withEmblem, sailSeed++, sv.tattered), unique: true, micro: 'cloth', forge: 'segeltuch', roughness: 0.92, normalMap: forgeSet('segeltuch').normal, normalScale: 0.55 }), sailU);
      sailMat.alphaTest = 0.5; // ausgefranste Ränder und Risse
      const sail = new Mesh(sg, sailMat);
      sail.userData.sailU = sailU;
      sail.userData.sw = sw;
      sail.userData.sh = sh;
      sail.position.set(0, y + h * 0.1, z + 0.15);
      sail.userData.noOutline = true;
      sail.userData.base = sail.position.y;
      mUp.add(sail);
      sails.push(sail);
      // Takelage: Rah-Enden zur Bordwand
      if (sv.yardLifts) for (const s of [-1, 1]) rig.push(s * w / 2, y + h * 0.2, z, s * halfWidth(z) * 0.95, D + 0.8, z - 1.5);
    }
    // Topp-/Bramsegel über den Hauptrahen (Segel-Stufe 4 – 5): eine eigene Rah mit schmalem Segel an der verlängerten Stenge
    if (ext) {
      const tw = c.W * 0.5, tsh = ext * 1.05, ty = D + h + ext * 0.78;
      const yardT = new Mesh(new CylinderGeometry(0.045 * Math.min(sc, 3), 0.045 * Math.min(sc, 3), tw, 6), darkWood);
      yardT.rotation.z = Math.PI / 2;
      yardT.position.set(0, ty, z);
      mUp.add(yardT);
      const tg = new PlaneGeometry(tw * 0.95, tsh, 20, 10);
      const tp = tg.attributes.position;
      for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), yy = tp.getY(i); tp.setZ(i, Math.cos((x / (tw * 0.95)) * Math.PI) * 0.8 * sc * sv.billow * (1 - Math.abs(yy) / tsh * 0.3)); }
      tg.computeVertexNormals();
      const tU = makeSailUniforms(tw * 0.95, tsh, ty * 0.7);
      const tMat = sailMaterial(toon({ color: 0xffffff, side: DoubleSide, map: sailTex(false, sailSeed++, false), unique: true, micro: 'cloth', forge: 'segeltuch', roughness: 0.92, normalMap: forgeSet('segeltuch').normal, normalScale: 0.55 }), tU);
      tMat.alphaTest = 0.5;
      const top = new Mesh(tg, tMat);
      top.userData.sailU = tU;
      top.userData.sw = tw * 0.95;
      top.userData.sh = tsh;
      top.position.set(0, ty - tsh / 2 + 0.04, z + 0.3);
      top.userData.noOutline = true;
      top.userData.base = top.position.y;
      mUp.add(top);
      sails.push(top);
      if (sv.yardLifts) for (const s of [-1, 1]) rig.push(0, D + h + ext * 0.95, z, s * tw / 2, ty, z);
    }
    mastTops.push({ z, h });
    // Wanten vom Mast zur Bordwand, dazu Webleinen (Sprossen) zwischen den Wanten zum Aufentern
    for (const s of [-1, 1]) {
      for (const k of shroudKs) rig.push(0, D + h * 0.95, z, s * halfWidth(z + k) * 0.95, D + 0.8, z + k * 1.2);
      const bx = s * halfWidth(z) * 0.95;
      if (sv.ratlineStep > 0) for (let t = 0.12; t < 0.62; t += sv.ratlineStep) {
        // Punkt auf der vorderen und hinteren Want in Höhe t (0 = Bordwand, 1 = Mast)
        rig.push(bx * (1 - t), D + 0.8 + (h * 0.95 - 0.8) * t, z - 1.2 * (1 - t), bx * (1 - t), D + 0.8 + (h * 0.95 - 0.8) * t, z + 1.2 * (1 - t));
      }
    }
    // Rah-Hängetaue vom Mastkopf zu den Rahnocken
    if (sv.yardLifts) for (let k = 0; k < yards; k++) for (const s of [-1, 1]) rig.push(0, D + h * 0.88, z, s * c.W * (1.15 - k * 0.22) / 2, D + h * (0.3 + k * 0.24) + h * 0.2, z);
  });
  // Klüver (Dreieckssegel am Bug)
  const bowZ = c.L / 2 + rakeAt(1, c.L);
  const bowTop = D + sheerAt(1, c.L);
  const jibShape = new Shape();
  jibShape.moveTo(0, 0); jibShape.lineTo(0, c.mh * 0.6); jibShape.lineTo(c.L * 0.22, 0); jibShape.closePath();
  const jibGeo = new ShapeGeometry(jibShape);
  // Tuch-Textur über die Dreiecksfläche legen
  const juv = jibGeo.attributes.uv;
  for (let i = 0; i < juv.count; i++) juv.setXY(i, juv.getX(i) / (c.L * 0.22), juv.getY(i) / (c.mh * 0.6));
  const jibMat = toon({ color: 0xffffff, side: DoubleSide, map: sailTex(false, 99, sv.tattered), unique: true, micro: 'cloth', forge: 'segeltuch', roughness: 0.92, normalMap: forgeSet('segeltuch').normal, normalScale: 0.55 });
  jibMat.alphaTest = 0.5;
  const jib = new Mesh(jibGeo, jibMat);
  jib.rotation.y = -Math.PI / 2;
  jib.position.set(0, D + 1, c.masts[0] * c.L + 1);
  jib.userData.noOutline = true;
  jib.userData.base = jib.position.y;
  group.add(jib);
  sails.push(jib);
  const bowsprit = new Mesh(new CylinderGeometry(0.08 * sc, 0.12 * sc, c.L * 0.25, 6), darkWood);
  bowsprit.rotation.x = Math.PI / 2 - 0.25;
  bowsprit.position.set(0, bowTop - 0.15, bowZ + c.L * 0.08);
  group.add(bowsprit);
  // Weitere Vorstagsegel (Segel-Stufe 2: 1, 3: 2, 5: 3 zusätzlich): Dreiecke zwischen Stag und Bugspriet, je eines weiter vorn
  {
    const f0 = mastTops[0];
    const stayA = { z: f0 ? f0.z : 0, y: f0 ? D + f0.h * 0.94 : D + c.mh * 0.9 }, stayB = { z: bowZ + c.L * 0.18, y: bowTop + 0.3 };
    const sprA = { z: bowZ - c.L * 0.02, y: bowTop - 0.1 }, sprB = stayB;
    for (let j = 1; j < sv.jibs; j++) {
      const u = 0.5 + 0.17 * j, v = 0.38 + 0.2 * j;
      const head = { z: stayA.z + (stayB.z - stayA.z) * u, y: stayA.y + (stayB.y - stayA.y) * u };
      const tack = { z: sprA.z + (sprB.z - sprA.z) * Math.min(1, v), y: sprA.y + (sprB.y - sprA.y) * Math.min(1, v) };
      const clew = { z: head.z + (tack.z - head.z) * 0.18 - 0.2, y: tack.y + (head.y - tack.y) * 0.2 };
      const shp = new Shape();
      shp.moveTo(head.z, head.y); shp.lineTo(tack.z, tack.y); shp.lineTo(clew.z, clew.y); shp.closePath();
      const jg = new ShapeGeometry(shp);
      const jp = jg.attributes.position, ju = jg.attributes.uv;
      const zs0 = Math.min(head.z, tack.z, clew.z), zs1 = Math.max(head.z, tack.z, clew.z), ys0 = Math.min(head.y, tack.y, clew.y), ys1 = Math.max(head.y, tack.y, clew.y);
      for (let i = 0; i < ju.count; i++) ju.setXY(i, (jp.getX(i) - zs0) / (zs1 - zs0), (jp.getY(i) - ys0) / (ys1 - ys0));
      const jm = toon({ color: 0xffffff, side: DoubleSide, map: sailTex(false, 99 + j, sv.tattered), unique: true, micro: 'cloth', forge: 'segeltuch', roughness: 0.92, normalMap: forgeSet('segeltuch').normal, normalScale: 0.55 });
      jm.alphaTest = 0.5;
      const jb = new Mesh(jg, jm);
      jb.rotation.y = -Math.PI / 2;
      jb.position.x = (j % 2 ? 1 : -1) * 0.03 * j;
      jb.userData.noOutline = true;
      jb.userData.base = 0;
      group.add(jb);
      sails.push(jb);
    }
  }
  // Besansegel am Heck (Segel-Stufe 4 – 5): Gaffelsegel mit Baum und Gaffel hinter dem achtersten Mast, über dem Achterdeck (Kopfhöhe frei)
  if (sv.spanker && mastParts.length) {
    const mp = mastParts[mastParts.length - 1];
    const span = Math.max(2.2, Math.min(13, c.L * 0.2));
    const yb = D + Math.max(mp.h * 0.2, castleH + 2.7), yp = yb + Math.max(2.4, mp.h * 0.5);
    const z0 = mp.z - 0.35, z1 = mp.z - span, zg = mp.z - span * 0.62;
    const shp = new Shape();
    shp.moveTo(z0, yb); shp.lineTo(z1, yb); shp.lineTo(zg, yp); shp.lineTo(z0, yp * 0.995 - 0.05 * yb); shp.closePath();
    const sg2 = new ShapeGeometry(shp);
    const su = sg2.attributes.uv, spp = sg2.attributes.position;
    for (let i = 0; i < su.count; i++) su.setXY(i, (spp.getX(i) - z1) / (z0 - z1), (spp.getY(i) - yb) / (yp - yb));
    const sm = toon({ color: 0xffffff, side: DoubleSide, map: sailTex(false, 120, false), unique: true, micro: 'cloth', forge: 'segeltuch', roughness: 0.92, normalMap: forgeSet('segeltuch').normal, normalScale: 0.55 });
    sm.alphaTest = 0.5;
    const sp2 = new Mesh(sg2, sm);
    sp2.rotation.y = -Math.PI / 2;
    sp2.userData.noOutline = true;
    sp2.userData.base = 0;
    group.add(sp2);
    sails.push(sp2);
    // Baum und Gaffel
    const boom = new Mesh(new CylinderGeometry(0.05 * Math.min(sc, 2.4), 0.06 * Math.min(sc, 2.4), z0 - z1, 6), darkWood);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, yb, (z0 + z1) / 2);
    group.add(boom);
    const gl = Math.hypot(z0 - zg, yp - yb);
    const gaff = new Mesh(new CylinderGeometry(0.04 * Math.min(sc, 2.4), 0.05 * Math.min(sc, 2.4), gl, 6), darkWood);
    gaff.position.set(0, (yb + yp) / 2, (z0 + zg) / 2);
    gaff.rotation.x = Math.atan2(zg - z0, yp - yb);
    group.add(gaff);
  }
  rig.push(0, D + c.mh * 0.95, c.masts[0] * c.L, 0, bowTop + 0.3, bowZ + c.L * 0.18);
  const rigging = new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(rig, 3)), new LineBasicMaterial({ color: '#2A1E14' }));
  group.add(rigging);
  // Dicke Taue: Stage zwischen den Masten, Stag zum Bugspriet, Pardunen zum Heck – hängen leicht durch
  const rp = Math.min(0.05 * Math.max(1, sc * 0.8), 0.09);
  const va = new Vector3(), vb = new Vector3();
  for (let i = 0; i < mastTops.length - 1; i++) {
    const a = mastTops[i], b = mastTops[i + 1];
    rope(group, va.set(0, D + a.h * 0.94, a.z), vb.set(0, D + b.h * 0.58, b.z), rp, 0.35 + sc * 0.1);
    rope(group, va.set(0, D + a.h * 0.62, a.z), vb.set(0, D + b.h * 0.34, b.z), rp * 0.8, 0.25 + sc * 0.08);
  }
  if (mastTops.length) {
    const f = mastTops[0];
    rope(group, va.set(0, D + f.h * 0.94, f.z), vb.set(0, bowTop + 0.3, bowZ + c.L * 0.18), rp * 1.2, 0.5 + sc * 0.1, 8);
    const b2 = mastTops[mastTops.length - 1];
    for (const s of [-1, 1]) rope(group, va.set(0, D + b2.h * 0.9, b2.z), vb.set(s * c.W * 0.36, D + castleH + 0.2, -c.L / 2 + 0.8), rp, 0.3 + sc * 0.08);
  }

  yield;
  // Kanonen: Kupferrohre mit Eisenbändern auf Holzlafetten, Stückpforten mit Eisenrahmen
  const muzzlesL: Vector3[] = [], muzzlesR: Vector3[] = [];
  const copper = COPPER(), iron = IRON();
  const cs1 = Math.min(1.4, sc);
  const portFrame = (x: number, y: number, z: number, sd: number, pw = 0.7, ph2 = 0.6) => {
    const fx = x + sd * 0.05;
    put(group, box(0.1, 0.07, pw + 0.16), iron, fx, y + ph2 / 2 + 0.03, z);
    put(group, box(0.1, 0.07, pw + 0.16), iron, fx, y - ph2 / 2 - 0.03, z);
    for (const e of [-1, 1]) put(group, box(0.1, ph2 + 0.1, 0.07), iron, fx, y, z + e * (pw / 2 + 0.04));
    put(group, box(0.12, 0.09, 0.09), iron, fx, y + ph2 / 2 + 0.15, z); // Ringschraube für das Brooktau
  };
  // Kanonen-Stufe: Pforten der Hauptreihe offen und bestückt (Stufe 1: 50 %, 2: 75 %, ab 3 alle) oder mit gekreuzten Brettern vernagelt;
  // dieselbe Auswahl (`portIndices`) trifft `Ship.portsOf` beim Feuern, die Mündungslisten enthalten weiter alle Pforten
  const cv = vis.cannon;
  const openPorts = new Set(cv.open);
  const gunScale = cs1 * (cv.barrel === 'bronzelang' ? 1.15 : cv.barrel === 'schwarz' ? 1.22 : 1);
  for (let i = 0; i < c.can; i++) {
    const z = c.can === 1 ? 0 : ((i / (c.can - 1)) - 0.5) * c.L * 0.55;
    for (const s of [-1, 1]) {
      const cy = D - 0.7;
      const x = s * (hullSideX(c, D, { widthAt, sheerAt, rakeAt }, z, cy) + 0.01);
      if (!openPorts.has(i)) {
        addBoardedPort(evoCtx, s, x, cy, z, 0.7, 0.6);
      } else if (cv.barrel === 'rost') {
        addRustBarrel(evoCtx, s, x, cy, z, cs1);
      } else if (hasProp('kanone')) {
        // Blender-Kanone auf Holzlafette (Mündung bei +Z des Modells, 0,7 m vor dem Ursprung): Mündung bleibt 0,82 m vor der Bordwand
        batch.add('kanone', placeMatrix(x + s * (0.82 - 0.7 * gunScale), cy, z, s * Math.PI / 2, gunScale));
        if (cv.goldRing) addGunRing(evoCtx, s, x, cy, z, gunScale);
      } else {
        put(group, cyl(0.16 * gunScale, 0.2 * gunScale, 1.1 * cv.lengthK, 10), copper, x + s * 0.25, cy, z, 0, 0, Math.PI / 2);
        for (const bx of [-0.25, 0.2]) put(group, cyl(0.215 * gunScale, 0.215 * gunScale, 0.07, 10), iron, x + s * (0.25 + bx), cy, z, 0, 0, Math.PI / 2); // Eisenbänder
        put(group, cyl(0.22 * gunScale, 0.17 * gunScale, 0.12, 10), copper, x + s * 0.82, cy, z, 0, 0, Math.PI / 2); // Mündungswulst
        put(group, box(0.6, 0.16, 0.55), darkWood, x + s * 0.3, cy - 0.27, z); // Lafette
      }
      put(group, box(0.06, 0.6, 0.7), toon('#1E1410'), x + s * 0.02, cy, z);
      portFrame(x, cy, z, s);
      // hochgeklappter Pfortendeckel ab Stufe 2 über jeder offenen Pforte
      if (cv.lids && openPorts.has(i)) addPortLid(evoCtx, s, x, cy, z, 0.7, 0.6, look.stripe);
      (s > 0 ? muzzlesL : muzzlesR).push(new Vector3(x + s * 0.8, cy, z));
    }
  }

  // zweite (und dritte) Reihe Stückpforten bei mehrdeckigen Schiffen
  if (c.decks >= 2) {
    const portMat = toon('#1E1410'), lidMat = toon(look.stripe);
    const lowerOpen = new Set(lowerOpenIndices(c, cv.lowerOpenK));
    for (let row = 1; row < c.decks; row++) {
      const y = D * (0.62 - row * 0.2);
      for (let i = 0; i < c.can + 1; i++) {
        const z = ((i / c.can) - 0.5) * c.L * 0.62;
        for (const s of [-1, 1]) {
          const x = s * (hullSideX(c, D, { widthAt, sheerAt, rakeAt }, z, y) + 0.01);
          const port = new Mesh(new BoxGeometry(0.06, 0.55, 0.65), portMat);
          port.position.set(x + s * 0.02, y, z);
          portFrame(x, y, z, s, 0.65, 0.55);
          if (!lowerOpen.has(i)) { group.add(port); addBoardedPort(evoCtx, s, x, y, z, 0.65, 0.55); continue; }
          const lid = new Mesh(new BoxGeometry(0.05, 0.12, 0.75), lidMat);
          lid.position.set(x + s * 0.05, y + 0.36, z);
          group.add(port, lid);
          // nachts leuchtet das Innere der Stückpforten (Laternen im Geschützdeck)
          const glow = new Mesh(new PlaneGeometry(0.5, 0.42), winMat);
          glow.position.set(x + s * 0.085, y, z);
          glow.rotation.y = s * Math.PI / 2;
          glow.userData.noOutline = true;
          group.add(glow);
          windows.push(glow);
        }
      }
    }
  }

  yield;
  // Laternen: Eisengehäuse mit Glas und Aufhängering; auf dem Spielerschiff wirft jede ein warmes Punktlicht
  const lanterns: Mesh[] = [];
  const lights: LightAnchor[] = [];
  const lampMat = GLOW_LAMP;
  const lampIron = IRON();
  if (look.lanterns) {
    const mainTop = mastTops[Math.min(mastTops.length - 1, c.masts.length > 1 ? 1 : 0)];
    const spots: number[][] = [[c.W * 0.35, D + castleH + 0.6, -c.L / 2 + 0.6], [-c.W * 0.35, D + castleH + 0.6, -c.L / 2 + 0.6], [0, Math.max(bowTop + 0.7, D + (fore ? fore.top : 0) + 0.8), bowZ - 1.4]];
    for (const sl of sternLampSpots) spots.push(sl);
    if (mainTop) spots.push([0, D + mainTop.h * 0.78 + 0.75, mainTop.z + 0.9]);
    for (const dl of doorLamps) spots.push(dl);
    // Lichtquellen: Heck (mittig) und Mastkorb
    const lightSpots = new Set<number[]>([spots[0], spots[spots.length - 1]]);
    for (const p of spots) {
      const ls = Math.min(1.5, sc);
      const l = new Mesh(new SphereGeometry(hasProp('laterne') ? 0.045 * ls : 0.22 * ls, 10, 8), lampMat);
      l.position.set(p[0], p[1], p[2]);
      l.userData.noOutline = true;
      group.add(l);
      lanterns.push(l);
      // Gehäuse: Blender-Laterne mit Dach, Streben, Boden und Aufhängering (Flamme = die Kugel oben)
      if (hasProp('laterne')) batch.add('laterne', placeMatrix(p[0], p[1], p[2], 0, ls));
      else {
        const r = 0.27 * ls, hh = 0.34 * ls;
        put(group, cyl(r * 0.5, r * 1.05, 0.12 * ls, 8), lampIron, p[0], p[1] + hh + 0.06 * ls, p[2]);
        put(group, cyl(r * 0.95, r * 0.8, 0.1 * ls, 8), lampIron, p[0], p[1] - hh - 0.05 * ls, p[2]);
        for (let k = 0; k < 4; k++) {
          const a2 = (k / 4) * Math.PI * 2 + Math.PI / 4;
          put(group, box(0.035 * ls, hh * 2, 0.035 * ls), lampIron, p[0] + Math.cos(a2) * r * 0.92, p[1], p[2] + Math.sin(a2) * r * 0.92);
        }
        put(group, torus(0.1 * ls, 0.02 * ls, 8), lampIron, p[0], p[1] + hh + 0.22 * ls, p[2], 0, Math.PI / 2, 0);
      }
      if (hero && lightSpots.has(p) && lights.length < 2) {
        // nur zwei Lichter (Heck, Mastkorb) – jedes Licht kostet jedes beleuchtete Pixel der Szene etwas
        // nur ein Anker: das echte Licht steht fest in der Szene (render/shipLights.ts, 4.4B)
        const pl = new LightAnchor(0xffa24a, 60 * Math.min(1.6, 0.7 + sc * 0.4), 1.4);
        pl.position.set(0, p[1] + 0.3, p[2]);
        group.add(pl);
        lights.push(pl);
      }
    }
  }

  yield;
  // ---- Kapitänskajüte einrichten: Möbel aus Blender (tools/blender/build_kajuete.py), Größe und Auswahl nach der Raumlänge.
  // Alle Teile werden mit ihren Rollenfarben und der Ambient-Occlusion zu EINEM Netz zusammengefasst (ein Zeichenaufruf, keine Kontur).
  const cabinBlockers: Blocker[] = [];
  let cabinLight: LightAnchor | null = null;
  {
    const ROLE_HEX: Record<string, string> = { wood: '#8A5A30', darkwood: '#4A2E1A', brass: '#D9B24C', iron: '#3A3C40', paper: '#E8DCB8', cloth: '#7A1F1A', bedding: '#DCD4BC', leather: '#4A2E1C', book1: '#7A1A1A', book2: '#245234', book3: '#5A3A20', book4: '#28407A', globe: '#3A7390', rug: '#7A1F1A', rugtrim: '#C9A24E', velvet: '#6A1424', paint1: '#2F6A86', paint2: '#D6A868', steel: '#C4CAD2', glass: '#8FB8C6' };
    const geos: BufferGeometry[] = [];
    const m4 = new Matrix4(), qf = new Quaternion(), ef = new Euler(), pv = new Vector3(), sv = new Vector3(), rc = new Color();
    const flameGeos: BufferGeometry[] = [];
    const furn = (name: string, x: number, z: number, yaw: number, s: number, hx = 0, hz = 0, y = 0) => {
      const parts = archParts(name);
      if (!parts) return;
      m4.compose(pv.set(x, D + y, z), qf.setFromEuler(ef.set(0, yaw, 0)), sv.set(s, s, s));
      for (const p of parts) {
        if (p.role === 'glow') continue;
        if (p.role === 'flame') {
          // Kerzenflammen: eigenes leuchtendes Netz (GLOW_LAMP), ohne Vertexfarbe
          const fg = p.geo.clone().applyMatrix4(m4);
          fg.deleteAttribute('color'); fg.deleteAttribute('uv');
          flameGeos.push(fg.index ? fg.toNonIndexed() : fg);
          continue;
        }
        const g = p.geo.clone().applyMatrix4(m4);
        const n = g.attributes.position.count, ao = g.attributes.color;
        rc.set(ROLE_HEX[p.role] ?? '#8A5A30');
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { const k = ao ? ao.getX(i) : 1; col[i * 3] = rc.r * k; col[i * 3 + 1] = rc.g * k; col[i * 3 + 2] = rc.b * k; }
        g.deleteAttribute('color'); g.deleteAttribute('uv');
        g.setAttribute('color', new Float32BufferAttribute(col, 3));
        geos.push(g.index ? g.toNonIndexed() : g);
      }
      if (hx > 0) cabinBlockers.push({ cx: x, cz: z, hx, hz, cabin: true });
    };
    /** Beliebiges Teil (Box, Ring …) mit fester Farbe in die zusammengefasste Einrichtung aufnehmen (Wände, Leisten, Parkett) */
    const addGeo = (g0: BufferGeometry, hex: string, ao = 1) => {
      const g = g0.index ? g0.toNonIndexed() : g0;
      const n = g.attributes.position.count;
      rc.set(hex);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = rc.r * ao; col[i * 3 + 1] = rc.g * ao; col[i * 3 + 2] = rc.b * ao; }
      g.deleteAttribute('uv');
      g.setAttribute('color', new Float32BufferAttribute(col, 3));
      geos.push(g);
    };
    if (hasArch('kajuete_schreibtisch')) {
      const R = zB - zA, zm = (zA + zB) / 2;
      const k = Math.min(1.12, Math.max(0.7, R / 7.5));
      const wAt = (z: number) => xIn(z);
      const palatial = R >= 8 && hasArch('kajuete_himmelbett') && hasArch('kajuete_tafel');
      {
        // ---- Raumschale: Parkett, Sockel, Wandvertäfelung mit Füllungen, Zierleiste, Pilaster und Kranzleiste ----
        const upperHex = R >= 12 ? '#F2E2B8' : R >= 8 ? '#E0CB9A' : '#B8905F';
        const hW = Math.min(1.15, castleH * 0.36), top = castleH - 0.17;
        {
          const pos: number[] = [], nor: number[] = [], col: number[] = [];
          const cell = 0.42 * Math.min(1.35, Math.max(1, castleH / 3));
          const rowsN = Math.max(3, Math.round(R / cell)), dzr = R / rowsN, yF = D + 0.006;
          // gleiche Spaltenzahl in jeder Reihe (nach der engsten), damit das Muster durchläuft statt zu zacken
          const cols = Math.max(2, Math.round((2 * (Math.min(wAt(zA), wAt(zB)) - 0.02)) / cell));
          for (let r = 0; r < rowsN; r++) {
            const z0 = zA + r * dzr, z1 = z0 + dzr;
            const half = Math.min(wAt(z0), wAt(z1)) - 0.02;
            const cw = (2 * half) / cols;
            for (let q = 0; q < cols; q++) {
              const x0 = -half + q * cw, x1 = x0 + cw;
              rc.set(((r + q) & 1) ? '#946739' : '#B28850');
              const v = 0.9 + ((r * 7 + q * 13) % 5) * 0.03;
              for (const [px, pz] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]] as const) {
                pos.push(px, yF, pz); nor.push(0, 1, 0); col.push(rc.r * v, rc.g * v, rc.b * v);
              }
            }
          }
          const pg = new BufferGeometry();
          pg.setAttribute('position', new Float32BufferAttribute(pos, 3));
          pg.setAttribute('normal', new Float32BufferAttribute(nor, 3));
          pg.setAttribute('color', new Float32BufferAttribute(col, 3));
          geos.push(pg);
        }
        /** Leiste an der Innenwand von (ax,az) nach (bx,bz) zwischen den Höhen y0 und y1, th dick, nach innen versetzt */
        const wallStrip = (ax: number, az: number, bx: number, bz: number, y0: number, y1: number, th: number, hex: string, ao = 1) => {
          const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
          if (len < 0.02) return;
          const cx = (ax + bx) / 2, cz = (az + bz) / 2;
          let nx = -dz / len, nz = dx / len;
          if (nx * (0 - cx) + nz * (zm - cz) < 0) { nx = -nx; nz = -nz; }
          const g = new BoxGeometry(th, y1 - y0, len);
          g.rotateY(Math.atan2(dx, dz));
          g.translate(cx + nx * (th / 2 + 0.004), D + (y0 + y1) / 2, cz + nz * (th / 2 + 0.004));
          addGeo(g, hex, ao);
        };
        const GOLD = '#D9B24C', DARK = '#4E3019', DARKER = '#33200F';
        const NS = 8;
        type Seg = { a: [number, number]; b: [number, number]; rear?: boolean };
        const segs: Seg[] = [];
        for (const sd of [-1, 1]) for (let i = 0; i < NS; i++) {
          const z0 = zA + (i / NS) * R, z1 = zA + ((i + 1) / NS) * R;
          segs.push({ a: [sd * wAt(z0), z0], b: [sd * wAt(z1), z1] });
        }
        segs.push({ a: [-wAt(zA), zA], b: [wAt(zA), zA], rear: true });
        const dh = doorWC / 2 + 0.05;
        segs.push({ a: [-wAt(zB), zB], b: [-dh, zB] }, { a: [dh, zB], b: [wAt(zB), zB] });
        for (const sg of segs) {
          const [ax, az] = sg.a, [bx, bz] = sg.b;
          wallStrip(ax, az, bx, bz, 0, 0.14, 0.07, DARKER);
          wallStrip(ax, az, bx, bz, top - 0.03, top, 0.07, DARK);
          wallStrip(ax, az, bx, bz, top, castleH - 0.03, 0.1, GOLD);
          if (sg.rear) {
            wallStrip(ax, az, bx, bz, 0.14, top - 0.03, 0.02, upperHex);
            continue;
          }
          wallStrip(ax, az, bx, bz, 0.14, hW, 0.04, DARK);
          wallStrip(ax, az, bx, bz, hW - 0.04, hW + 0.04, 0.075, GOLD);
          wallStrip(ax, az, bx, bz, hW + 0.04, top - 0.03, 0.02, upperHex);
          const len = Math.hypot(bx - ax, bz - az), np = Math.max(1, Math.round(len / 1.0));
          for (let i = 0; i < np; i++) {
            const t0 = (i + 0.07) / np, t1 = (i + 0.93) / np;
            wallStrip(ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, 0.26, hW - 0.12, 0.062, '#6B4424');
          }
        }
        // Pilaster an den Seitenwänden und in den Ecken
        const npil = Math.max(2, Math.round(R / 2.2));
        for (const sd of [-1, 1]) for (let i = 0; i <= npil; i++) {
          const z = zA + 0.14 + (i / npil) * (R - 0.28);
          const x = sd * wAt(z), u = 0.075;
          wallStrip(x, z - u, x, z + u, 0, top, 0.11, DARKER);
          wallStrip(x, z - u * 1.25, x, z + u * 1.25, top - 0.2, top, 0.14, GOLD);
          wallStrip(x, z - u * 1.25, x, z + u * 1.25, 0, 0.2, 0.14, GOLD);
        }
      }
      if (palatial) {
        // ---- Prunkkajüte (ab 8 m Raumlänge): Schreibtisch vor den Heckfenstern mit Fensterbänken, lange Tafel mit Stühlen, Himmelbett,
        // Anrichten mit Spiegel, Bücherregale, Waffenwände, Gemälde, Kajütenofen, Truhen und Kronleuchter ----
        const sc = Math.min(1.5, Math.max(1, castleH / 3.3));
        const grandR = R >= 12;
        furn('kajuete_teppich', 0, zm + 0.1, 0, Math.min(2.1, (2 * wAt(zm) - 1.6) / 2.6, (R * 0.62) / 1.9));
        const ds = Math.min(1.3 * sc, (2 * wAt(zA + 0.6) - 2.0) / 1.7);
        const dz = zA + 0.43 * ds + 0.05;
        furn('kajuete_schreibtisch', 0, dz, 0, ds, 0.85 * ds, 0.43 * ds);
        furn('kajuete_stuhl', 0, dz + 0.425 * ds + 0.5 * ds * 0.9, Math.PI, ds * 0.95, 0.28 * ds, 0.26 * ds);
        const bs = sc * 0.95;
        const nb = Math.max(0, Math.floor((wAt(zA + 0.3) - 0.85 * ds - 0.15) / (1.4 * bs)));
        for (const sdn of [-1, 1]) for (let i = 0; i < nb; i++) furn('kajuete_fensterbank', sdn * (0.85 * ds + 0.12 + 0.7 * bs + i * 1.4 * bs), zA + 0.21 * bs + 0.035, 0, bs, 0.7 * bs, 0.21 * bs);
        // lange Tafel in der Raummitte (ab 9 m), sonst Kartentisch
        const tz = zm + 0.2;
        if (R >= 9) {
          const ts = Math.min(1.25, 0.55 + (R - 8) * 0.15), cs = ts * 0.95 + 0.05;
          furn('kajuete_tafel', 0, tz, 0, ts, 0.56 * ts, 1.62 * ts);
          for (const sdn of [-1, 1]) for (const dzz of [-1.1, 0, 1.1]) furn('kajuete_stuhl', sdn * (0.55 * ts + 0.28 * cs), tz + dzz * ts, sdn > 0 ? -Math.PI / 2 : Math.PI / 2, cs, 0.25 * cs, 0.25 * cs);
          furn('kajuete_stuhl', 0, tz - (1.6 * ts + 0.32 * cs), 0, cs, 0.26 * cs, 0.25 * cs);
          furn('kajuete_stuhl', 0, tz + (1.6 * ts + 0.32 * cs), Math.PI, cs, 0.26 * cs, 0.25 * cs);
        } else {
          const kt = Math.min(1.2, sc);
          furn('kajuete_kartentisch', 0.25 * wAt(zm), zm + 0.2, 0, kt, 0.68 * kt, 0.47 * kt);
          furn('kajuete_stuhl', 0.25 * wAt(zm) - 0.3 * kt, zm + 0.2 + 0.72 * kt, Math.PI, kt * 0.95, 0.24 * kt, 0.23 * kt);
          furn('kajuete_stuhl', 0.25 * wAt(zm) + 0.3 * kt, zm + 0.2 - 0.72 * kt, 0, kt * 0.95, 0.24 * kt, 0.23 * kt);
        }
        const sr = sc * 0.9, as = sc * 0.9;
        const zr1 = zA + 0.2 * R + 0.3;
        // Backbordwand: Regale, Anrichte mit Spiegel, Himmelbett vorn
        furn('kajuete_regal', -(wAt(zr1) - 0.19 * sr - 0.02), zr1, Math.PI / 2, sr, 0.19 * sr, 0.5 * sr);
        if (R >= 9) furn('kajuete_regal', -(wAt(zr1 + 1.02 * sr) - 0.19 * sr - 0.02), zr1 + 1.02 * sr, Math.PI / 2, sr, 0.19 * sr, 0.5 * sr);
        const za2 = zm + 0.1 + (R >= 9 ? 0.1 * R : 0.05 * R);
        furn('kajuete_anrichte', -(wAt(za2) - 0.28 * as - 0.02), za2, Math.PI / 2, as, 0.28 * as, 0.85 * as);
        const bb = sc * 0.95, bz = zB - 0.45 - 1.05 * bb;
        furn('kajuete_himmelbett', -(wAt(bz) - 0.75 * bb - 0.04), bz, 0, bb, 0.75 * bb, 1.05 * bb);
        // Steuerbordwand: Globus, Regal, Waffenwand, Anrichte, Truhen mit Gemälde, Ofen vorn
        furn('kajuete_globus', wAt(zA + 1.7) - 0.5, zA + 1.7, 0, Math.min(1.25, sc), 0.3 * sc, 0.3 * sc);
        furn('kajuete_regal', wAt(zr1) - 0.19 * sr - 0.02, zr1, -Math.PI / 2, sr, 0.19 * sr, 0.5 * sr);
        const zw = zr1 + 1.3 * sr + 0.2;
        furn('kajuete_waffenwand', wAt(zw) - 0.03, zw, -Math.PI / 2, sc, 0, 0, 1.05 * sc);
        const zan = zm + 0.1 + (R >= 9 ? 0.1 * R : 0.05 * R);
        furn('kajuete_anrichte', wAt(zan) - 0.28 * as - 0.02, zan, -Math.PI / 2, as, 0.28 * as, 0.85 * as);
        furn('kajuete_ofen', wAt(zB - 0.8) - 0.42 * sc, zB - 0.8, 0, sc * 0.95, 0.34 * sc, 0.34 * sc);
        for (let i = 0; i < 2; i++) { const tzz = zB - 1.9 - i * 1.0 * sc; furn('kajuete_truhe', wAt(tzz) - 0.31, tzz, -Math.PI / 2, 0.95 * sc, 0.3 * sc, 0.48 * sc); }
        const zg = zB - 1.9 - 0.5 * sc;
        furn('kajuete_gemaelde', wAt(zg) - 0.03, zg, -Math.PI / 2, sc * 0.95, 0, 0, 1.25 * sc);
        // Vorderwand: Gemälde neben der Tür
        const fx = wAt(zB) * 0.5 + doorWC / 4;
        furn('kajuete_gemaelde', fx, zB - 0.03, Math.PI, sc * 0.95, 0, 0, 1.3 * sc);
        if (grandR || wAt(zB) > 4.4) furn('kajuete_gemaelde', -fx, zB - 0.03, Math.PI, sc * 0.95, 0, 0, 1.3 * sc);
        if (grandR) {
          furn('kajuete_globus', -(wAt(zA + 1.7) - 0.5), zA + 1.7, 0, Math.min(1.25, sc), 0.3 * sc, 0.3 * sc);
          furn('kajuete_waffenwand', -(wAt(zw + 2.2) - 0.03), zw + 2.2, Math.PI / 2, sc, 0, 0, 1.05 * sc);
        }
        // Kajütenofen: Rauchrohr bis zur Decke
        {
          const ox = wAt(zB - 0.8) - 0.42 * sc, oz = zB - 0.8, y0 = 1.3 * sc * 0.95;
          const pg = new CylinderGeometry(0.055 * sc, 0.055 * sc, castleH - y0, 8).translate(ox, D + y0 + (castleH - y0) / 2, oz);
          addGeo(pg, '#3A3C40');
        }
      } else {
      furn('kajuete_teppich', 0, zm, 0, Math.min(k, Math.max(0.5, (2 * wAt(zm) - 0.5) / 2.6)));
      // Schreibtisch am Heck (Rücken an der Wand), Kapitänsstuhl davor
      const sd = Math.min(k, (2 * wAt(zA + 0.6) - 0.15) / 1.7);
      const dz = zA + 0.43 * sd + 0.02;
      furn('kajuete_schreibtisch', 0, dz, 0, sd, 0.85 * sd, 0.43 * sd);
      furn('kajuete_stuhl', 0, dz + 0.425 * sd + 0.5 * k, Math.PI, k, 0.28 * k, 0.26 * k);
      // Koje an der Backbordwand vorn, Kopf zum Heck
      const sb = Math.min(k, 1.0), bz = zB - 0.3 - 1.02 * sb;
      furn('kajuete_koje', -(wAt(bz) - 0.46 * sb - 0.02), bz, 0, sb, 0.46 * sb, 1.03 * sb);
      // Truhe an der Steuerbordwand vorn, Deckel zum Raum
      const st = Math.min(k, 0.95), tz = zB - 0.55 - 0.475 * st;
      furn('kajuete_truhe', wAt(tz) - 0.29 * st - 0.02, tz, -Math.PI / 2, st, 0.3 * st, 0.48 * st);
      if (R >= 5.2) furn('kajuete_regal', wAt(zA + 1.6) - 0.19 * Math.min(k, 1) - 0.02, zA + 1.6, -Math.PI / 2, Math.min(k, 1), 0.19, 0.5 * Math.min(k, 1));
      if (R >= 6.6) furn('kajuete_kartentisch', 0.3 * wAt(zm), zm + 0.2, 0, Math.min(k, 1), 0.68 * Math.min(k, 1), 0.47 * Math.min(k, 1));
      if (R >= 7.8) furn('kajuete_globus', -(wAt(zA + 1.2) - 0.4), zA + 1.2, 0, Math.min(k, 1), 0.3, 0.3);
      // Sitzplätze an den Kartentischen; große Räume bekommen eine zweite Tafel und eine Truhenreihe an der Backbordwand
      const dining = (tx: number, tz: number, ts: number) => {
        furn('kajuete_stuhl', tx - 0.3 * ts, tz + 0.72 * ts, Math.PI, ts * 0.9, 0.24 * ts, 0.23 * ts);
        furn('kajuete_stuhl', tx + 0.3 * ts, tz - 0.72 * ts, 0, ts * 0.9, 0.24 * ts, 0.23 * ts);
      };
      if (R >= 6.6) dining(0.3 * wAt(zm), zm + 0.2, Math.min(k, 1));
      if (R >= 10) {
        const tx2 = -0.34 * wAt(zm + 1.8), tz2 = zm + 1.8, ts2 = Math.min(k, 1.1);
        furn('kajuete_kartentisch', tx2, tz2, 0, ts2, 0.68 * ts2, 0.47 * ts2);
        dining(tx2, tz2, ts2);
        for (let i = 0; i < 3; i++) furn('kajuete_truhe', wAt(zm - 1.5 + i * 2.2) - 0.31, zm - 1.5 + i * 2.2, -Math.PI / 2, 0.9, 0.28, 0.45);
      }
      if (R >= 12.5) {
        furn('kajuete_globus', wAt(zA + 2.4) - 0.5, zA + 2.4, 0, 1.0, 0.3, 0.3);
        furn('kajuete_regal', -(wAt(zm - 2.5) - 0.21), zm - 2.5, Math.PI / 2, 1.0, 0.19, 0.5);
        furn('kajuete_regal', -(wAt(zm - 3.7) - 0.21), zm - 3.7, Math.PI / 2, 1.0, 0.19, 0.5);
      }
      if (R >= 9) {
        const sb2 = Math.min(k, 1.05);
        furn('kajuete_koje', wAt(zm - 0.3) - 0.46 * sb2 - 0.02, zm - 0.3, 0, sb2, 0.46 * sb2, 1.03 * sb2);
        furn('kajuete_regal', -(wAt(zA + 1.6) - 0.21), zA + 1.6, Math.PI / 2, Math.min(k, 1), 0.19, 0.5);
      }
      }
      // Hängelampe an der Decke; die Flamme ist ein leuchtender Kern (Lichthof und Spiegelung kommen aus render/glow.ts)
      if (palatial) {
        const sc2 = Math.min(1.5, Math.max(1, castleH / 3.3));
        const spots = R >= 12 ? [zA + 0.28 * R, zA + 0.72 * R] : [zm + 0.2];
        const cs3 = Math.min(1.6, sc2 * (0.85 + R / 40));
        for (const cz of spots) {
          furn('kajuete_kronleuchter', 0, cz, 0, cs3, 0, 0, castleH);
          const fl = new Mesh(new SphereGeometry(0.1, 10, 8), GLOW_LAMP);
          fl.position.set(0, D + castleH - 0.78 * cs3, cz);
          fl.userData.noOutline = true;
          fl.userData.glowSize = 0.55;
          group.add(fl);
          lanterns.push(fl);
        }
      } else {
        furn('kajuete_lampe', 0, zm, 0, 0.6, 0, 0, castleH);
        const flame = new Mesh(new SphereGeometry(0.07, 10, 8), GLOW_LAMP);
        flame.position.set(0, D + castleH - 0.4, zm);
        flame.userData.noOutline = true;
        flame.userData.glowSize = 0.3;
        group.add(flame);
        lanterns.push(flame);
      }
      // Heckfenster von innen: Himmelslicht am Tag, nachts dunkel, mit Rahmen
      {
        const { ww, hh, n, span, centers, arch } = gal;
        const FR = '#D9B24C';
        for (const rcn of centers) for (let i = 0; i < n; i++) {
          const wx = (i - (n - 1) / 2) * (span / (n - 1)), wy = D + castleH * rcn;
          if (Math.abs(wx) > xIn(zA) - ww / 2 - 0.12) continue;
          const iw = new Mesh(arch(ww, hh), CABIN_WINDOW);
          iw.position.set(wx, wy, zA + 0.03);
          iw.userData.noOutline = true;
          group.add(iw);
          for (const e of [-1, 1]) addGeo(new BoxGeometry(0.05, hh - ww / 2, 0.05).translate(wx + e * (ww / 2 + 0.02), wy - ww / 4, zA + 0.05), FR);
          addGeo(new BoxGeometry(ww + 0.14, 0.06, 0.1).translate(wx, wy - hh / 2 - 0.02, zA + 0.07), FR);
          addGeo(new TorusGeometry(ww / 2 + 0.02, 0.025, 4, 10, Math.PI).translate(wx, wy + hh / 2 - ww / 2, zA + 0.05), FR);
          addGeo(new BoxGeometry(0.03, hh - ww / 2, 0.03).translate(wx, wy - ww / 4, zA + 0.055), FR);
          addGeo(new BoxGeometry(ww, 0.03, 0.03).translate(wx, wy - hh * 0.1, zA + 0.055), FR);
        }
      }
      if (hero) {
        cabinLight = new LightAnchor(0xffc27a, 12 + R * 0.8, 1.6);
        cabinLight.position.set(0, D + castleH - 0.65, zm);
        group.add(cabinLight);
      }
    }
    if (geos.length) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (merged) {
        const fm = new Mesh(merged, toon({ color: 0xffffff, vertexColors: true }));
        fm.userData.noOutline = true;
        group.add(fm);
        keepExtra.push(fm);
      }
    }
    if (flameGeos.length) {
      const fmerged = mergeGeometries(flameGeos, false);
      for (const g of flameGeos) g.dispose();
      if (fmerged) {
        const ff = new Mesh(fmerged, GLOW_LAMP);
        ff.userData.noOutline = true;
        group.add(ff);
        keepExtra.push(ff);
      }
    }
  }

  yield;
  // Deck-Ausstattung: Luke, Ankerwinde, Fässer, Kisten, Ankerkette und Anker – feste Positionen, damit jedes Schiff gleich aussieht
  {
    const iron = IRON();
    const kk = Math.min(1.6, 0.7 + sc * 0.35);
    // Standflächen erst hinter dem Treppenfuß des Achterdecks und vor dem Treppenfuß des Vordecks
    const castleEnd = castleZ1 + stairLen + 0.8;
    const foreStart = fore ? fore.z0 - fore.stairLen - 0.9 : c.L * 0.34;
    // Masten (Nagelbank-Ring) sind feste Hindernisse; dazu das Belegungsraster für den Hauptgang vom Treppenfuß hinten zum Treppenfuß vorn
    if (c.L >= 24) for (const m of c.masts) { const rr0 = 0.19 * Math.min(sc, 3.2) + 0.1; block(0, m * c.L, rr0 + 0.04, rr0 + 0.04); }
    if (fore) {
      const za = castleZ1 + stairLen + 0.6, zb2 = fore.z0 - fore.stairLen - 0.6;
      const xa = stairXc(stairX[0], 0);
      const o = new Occ(-(c.W / 2 + 1), za - 0.8, 0.35, c.W + 2, zb2 - za + 1.6, (z) => halfWidth(z) * 0.85 - 0.35, { ax: xa, az: za, bx: fore.stairX[0], bz: zb2 });
      for (const b of blockers) o.add(b);
      occs.push(o);
    }
    // Gitterluke mittschiffs
    const hs = 0.75 * kk;
    // Luke mittschiffs, aber nicht in einem Mast: nächster freier Platz zur Mitte zwischen den Treppen
    const ringR = 0.19 * Math.min(sc, 3.2) + 0.55;
    const hMid = (castleEnd + foreStart) / 2 - c.L * 0.02;
    let hz = hMid, hBest = 1e9;
    for (let z = castleEnd + hs * 1.1 + 0.3; z <= foreStart - hs * 1.1 - 0.3; z += 0.2) {
      if (c.masts.some((m) => Math.abs(m * c.L - z) < hs * 1.1 + ringR + 0.3)) continue;
      if (Math.abs(z - hMid) < hBest) { hBest = Math.abs(z - hMid); hz = z; }
    }
    put(group, box(hs * 2.2, 0.16, hs * 2.2), darkWood, 0, D + 0.08, hz);
    // die Gitterluke liegt flach im Deck (16 cm): man geht darüber, sie nimmt keine Kampffläche
    for (let i = -3; i <= 3; i++) put(group, box(0.05, 0.06, hs * 2), iron, i * hs * 0.3, D + 0.19, hz);
    for (let i = -3; i <= 3; i++) put(group, box(hs * 2, 0.06, 0.05), iron, 0, D + 0.17, hz + i * hs * 0.3);
    // Ankerwinde vorn
    const wz = Math.min(foreStart - 0.5, c.L * 0.3);
    put(group, cyl(0.28 * kk, 0.34 * kk, 0.7 * kk, 10), wood, 0, D + 0.35 * kk, wz);
    block(0, wz, 0.4 * kk, 0.4 * kk);
    for (let i = 0; i < 4; i++) put(group, box(1.5 * kk, 0.07, 0.07), darkWood, 0, D + 0.62 * kk, wz).rotation.y = (i / 4) * Math.PI;
    // Deckkanonen an den Bordwänden (Blender-Modell auf Lafette): ab der Korvette, höchstens vier je Seite; nur wo der Weg frei bleibt
    if (hasProp('kanone') && c.L >= 30) {
      const nGun = c.L < 46 ? 2 : 3;
      const gs = Math.min(1.1, 0.75 + sc * 0.1);
      const gLo = castleEnd + 1.2, gHi = Math.max(gLo + 1, foreStart - 1.6);
      for (let i = 0; i < nGun; i++) {
        const z = gLo + (i + 0.5) / nGun * (gHi - gLo);
        if (c.masts.some((m) => Math.abs(m * c.L - z) < 1.8)) continue;
        for (const sd of [-1, 1]) {
          // Das Geschütz steht in der Bordwand (Rohr durch die Stückpforte, Rad und Lafette im Randstreifen): nur der Verschluss ragt ins Deck
          const x = sd * (halfWidth(z) * 0.9 - 0.55 * gs);
          if (!canAdd(x - sd * 0.45 * gs, z, 0.4 * gs, 0.45 * gs)) continue;
          // Rohr zeigt nach außen; die Räder stehen auf dem Deck (Rohrachse 0,57 m darüber)
          batch.add('kanone', placeMatrix(x, D + 0.57 * gs, z, sd * Math.PI / 2, gs));
          block(x - sd * 0.45 * gs, z, 0.4 * gs, 0.45 * gs);
        }
      }
    }
    // Fässer und Kisten an den Bordwänden
    let seed = 5;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const barrelMat = toon({ color: '#6F4A2B', roughness: 0.85 });
    const crateMat = toon({ color: '#8A6840', roughness: 0.9 });
    const props = 2 + c.decks + Math.floor(c.L / 22);
    const zLo = castleEnd, zHi = Math.max(zLo + 1, foreStart - 0.3);
    for (let i = 0; i < props; i++) {
      const z = zLo + (i + 0.5) / props * (zHi - zLo) + (rnd() - 0.5) * 0.6;
      if (c.masts.some((m) => Math.abs(m * c.L - z) < 1.4)) continue;
      const sd = i % 2 ? 1 : -1;
      // dicht an der Bordwand (im Randstreifen außerhalb der begehbaren Fläche): Dekor, kein Hindernis
      const x = sd * (halfWidth(z) * 0.95 - 0.3 * kk);
      if (!canAdd(x, z, 0.5 * kk, 0.75 * kk)) continue;
      if (rnd() < 0.55) {
        const br = 0.3 * kk, bh = 0.74 * kk;
        const barrelAt = (bx: number, bz: number) => {
          if (hasProp('fass')) { batch.add('fass', placeMatrix(bx, D, bz, rnd() * 6.28, kk * 0.9)); return; }
          put(group, cyl(br * 0.92, br * 0.92, bh, 10), barrelMat, bx, D + bh / 2, bz);
          put(group, cyl(br * 1.06, br * 1.06, 0.05, 10), barrelMat, bx, D + bh / 2, bz);
          for (const hy of [0.18, 0.5, 0.82]) put(group, cyl(br * 1.08, br * 1.08, 0.05, 10), iron, bx, D + bh * hy, bz);
        };
        barrelAt(x, z);
        soft(x, z, br * 1.05, br * 1.05);
        if (rnd() < 0.4 && canAdd(x, z + br * 2.1, br * 1.05, br * 1.05)) { const bz = z + br * 2.1; barrelAt(x, bz); soft(x, bz, br * 1.05, br * 1.05); }
      } else {
        const cw = (0.5 + rnd() * 0.2) * kk;
        const yaw = rnd() * 0.5;
        if (hasProp('kiste')) batch.add('kiste', placeMatrix(x, D, z, yaw, cw));
        else {
          put(group, box(cw, cw * 0.85, cw), crateMat, x, D + cw * 0.425, z, 0, yaw, 0);
          put(group, box(cw * 1.02, 0.05, cw * 1.02), iron, x, D + cw * 0.2, z);
        }
        soft(x, z, cw * 0.62, cw * 0.62);
        if (rnd() < 0.35) {
          const y2 = rnd();
          if (hasProp('kiste')) batch.add('kiste', placeMatrix(x, D + cw * 0.85, z, y2, cw * 0.7));
          else put(group, box(cw * 0.7, cw * 0.6, cw * 0.7), crateMat, x, D + cw * 0.85 + cw * 0.3, z, 0, y2, 0);
        }
      }
    }
    // Ankerkette (Glieder) und Anker an der Steuerbord-Bugseite, aufgerollte Kette am Deck
    const az = c.L * 0.36;
    const ax = -(hullSideX(c, D, { widthAt, sheerAt, rakeAt }, az, D * 0.85) + 0.07 + 0.12);
    const links = 10;
    for (let i = 0; i < links; i++) {
      const lk = put(group, torus(0.11 * kk, 0.028 * kk, 8), iron, ax, D * 0.85 - i * 0.26 * kk, az, 0, i % 2 ? Math.PI / 2 : 0, 0);
      lk.scale.set(1, 1.5, 1);
    }
    const ay = D * 0.85 - links * 0.26 * kk - 0.5 * kk;
    if (hasProp('anker')) {
      // Blender-Anker (Admiralitätsform): Ring oben hängt am letzten Kettenglied, die Arme zeigen längs zur Bordwand
      batch.add('anker', placeMatrix(ax, ay - 0.5 * kk, az, 0, kk));
    } else {
      put(group, cyl(0.06 * kk, 0.07 * kk, 1.5 * kk, 6), iron, ax, ay, az);
      put(group, box(0.9 * kk, 0.07 * kk, 0.07 * kk), iron, ax, ay + 0.6 * kk, az);
      const arms = put(group, torus(0.5 * kk, 0.06 * kk, 10, Math.PI), iron, ax, ay - 0.55 * kk, az, 0, 0, Math.PI);
      arms.rotation.y = Math.PI / 2;
      for (const e of [-1, 1]) put(group, cone(0.14 * kk, 0.3 * kk), iron, ax, ay - 0.35 * kk, az + e * 0.5 * kk, 0, 0, e * -0.6);
    }
    const cz = Math.min(c.L * 0.3, foreStart - 0.5);
    for (let i = 0; i < 4; i++) put(group, torus((0.3 - i * 0.04) * kk, 0.05 * kk, 8), iron, halfWidth(cz) * 0.55, D + 0.04 + i * 0.07, cz, Math.PI / 2, 0, 0);
  }

  yield;
  // ---- Ausstattung großer Schiffe: Achterdeck, Masten, Geschütze, Beiboot, Heckgalerie ----
  if (c.L >= 24) {
    const iron = IRON(), cu = COPPER(), rp2 = ROPE();
    const chestMat = toon({ color: '#6A4426', roughness: 0.85 });
    const lampGlass = GLOW_LAMPGLASS;
    const skyGlass = toon({ color: '#7FB6CC', roughness: 0.2 });
    const qy = D + topY; // Oberfläche des Achterdecks
    const xr = (z: number) => halfWidth(z) * 0.9 * 1.04 - 0.3; // nutzbare halbe Breite auf dem Achterdeck
    const coil = (x: number, y: number, z: number, r = 0.26) => { for (let i = 0; i < 3; i++) put(group, torus(r - i * 0.015, 0.045, 10), rp2, x, y + 0.05 + i * 0.07, z, Math.PI / 2, 0, 0); };
    const brandX = c.L >= 70 ? 0 : xr(castleZ1) * 0.35;
    // Achterdeck: Weg von der Treppe zum Steuerrad muss frei bleiben
    {
      const oq = new Occ(-(c.W / 2 + 1), castleZ0 + 0.4, 0.3, c.W + 2, sternLen - 0.4, (z) => halfWidth(z) * 0.86 - 0.35, { ax: stairX[0], az: castleZ1 - 0.7, bx: 0, bz: helm.z });
      for (const b of blockers) oq.add(b);
      occs.push(oq);
    }
    /** Karronade auf Lafette mit Rädern: Rohr zeigt nach außen (sd), y = Standfläche */
    const carr = (gx: number, gy: number, gz: number, sd: number) => {
      put(group, box(1.2, 0.28, 0.7), darkWood, gx, gy + 0.28, gz);
      for (const e of [-1, 1]) for (const f of [-0.38, 0.38]) put(group, cyl(0.2, 0.2, 0.1, 10), iron, gx + e * 0.38, gy + 0.2, gz + f, Math.PI / 2, 0, 0);
      put(group, cyl(0.15, 0.22, 1.4, 10), cu, gx + sd * 0.1, gy + 0.62, gz, 0, 0, Math.PI / 2);
      put(group, cyl(0.235, 0.235, 0.07, 10), iron, gx - sd * 0.25, gy + 0.62, gz, 0, 0, Math.PI / 2);
      put(group, cyl(0.25, 0.2, 0.14, 10), cu, gx + sd * 0.8, gy + 0.62, gz, 0, 0, Math.PI / 2);
      put(group, torus(0.22, 0.03, 8), rp2, gx - sd * 0.5, gy + 0.62, gz, 0, Math.PI / 2, 0);
      // nur der Verschluss (innen) nimmt Platz; Rohr und Räder stehen im Randstreifen an der Bordwand
      block(gx - sd * 0.4, gz, 0.4, 0.4);
    };

    // Achterdeck: Kompasshaus (Nachthaus) vor dem Steuerrad, Oberlicht, Heckflagge, Truhen, Schiffsglocke, Drehgeschütze
    if (c.L >= 30) {
      const bz = helm.z + 1.35;
      put(group, box(0.56, 0.8, 0.56), darkWood, 0, qy + 0.4, bz);
      put(group, box(0.66, 0.08, 0.66), gold, 0, qy + 0.82, bz);
      put(group, new SphereGeometry(0.22, 10, 8), lampGlass, 0, qy + 1.0, bz);
      put(group, cyl(0.24, 0.3, 0.1, 10), iron, 0, qy + 0.88, bz);
      block(0, bz, 0.4, 0.4);
      const sz = castleZ0 + 1.3;
      put(group, box(1.9, 0.4, 1.1), darkWood, 0, qy + 0.2, sz);
      put(group, new ConeGeometry(0.85, 0.5, 4), skyGlass, 0, qy + 0.65, sz, 0, Math.PI / 4, 0).scale.set(1.1, 1, 0.62);
      for (const e of [-1, 1]) put(group, box(0.06, 0.06, 1.1), gold, e * 0.95, qy + 0.42, sz);
      block(0, sz, 1.0, 0.6);
      // Heckflagge: Fahnenstock mit goldener Kugel und Wappentuch (Schwalbenschwanz), weht mit Wind und Fahrt
      const px = 0, pz = castleZ0 + 0.4;
      const stk = Math.min(1.5, sc * 0.5 + 0.4);
      put(group, cyl(0.04, 0.05, 3.4 * stk, 6), wood, px, qy + 1.7 * stk, pz);
      put(group, new SphereGeometry(0.1, 10, 8), gold, px, qy + 3.45 * stk, pz);
      for (const yy of [2.55, 3.4]) put(group, torus(0.07, 0.014, 8), gold, px, qy + yy * stk, pz, Math.PI / 2, 0, 0);
      const em = Math.min(1.8, sc * 0.55);
      const ensU = makeClothUniforms(1.5 * em, 0.95 * em);
      const ensMat = clothMaterial(clothTex, ensU);
      const ens = new Mesh(clothGeometry({ len: 1.5 * em, height: 0.95 * em, taper: 0.08, swallow: 0.2 }), ensMat);
      // das Tuch ist um 90 Grad gedreht: seine +x-Richtung zeigt nach achtern (−z), und die Mastkante liegt am Stock
      ens.rotation.y = Math.PI / 2;
      ens.position.set(px, qy + 3.0 * stk, pz - 0.03 * em);
      addCloth(ens, ensU, ensMat);
      group.add(ens);
      keepExtra.push(ens);
      // Truhen an den Seiten (gewölbter Deckel, Eisenbänder)
      for (const sd of [-1, 1]) {
        const cz2 = castleZ0 + sternLen * 0.55, cx2 = sd * xr(cz2) * 0.82;
        put(group, box(0.95, 0.5, 0.55), chestMat, cx2, qy + 0.25, cz2, 0, sd * 0.12, 0);
        put(group, cyl(0.28, 0.28, 0.95, 10), chestMat, cx2, qy + 0.5, cz2, 0, 0, Math.PI / 2).rotation.y = sd * 0.12;
        for (const e of [-0.3, 0.3]) put(group, box(0.06, 0.62, 0.6), iron, cx2 + e, qy + 0.28, cz2);
        block(cx2, cz2, 0.55, 0.4);
        // Drehgeschütz am Heckgeländer
        const gz = castleZ0 + 0.55, gx = sd * xr(gz) * 0.72;
        put(group, cyl(0.07, 0.09, 0.55, 6), darkWood, gx, qy + 0.28, gz);
        put(group, cyl(0.09, 0.12, 0.9, 8), cu, gx, qy + 0.68, gz - 0.3, -Math.PI / 2, 0, 0);
        put(group, box(0.34, 0.08, 0.3), iron, gx, qy + 0.58, gz);
        block(gx, gz, 0.25, 0.25);
      }
      coil(xr(castleZ1 - 0.6) * 0.6, qy, castleZ1 - 0.9);
      // Kompassrose als Intarsie im Deck vor dem Steuerrad (Goldring und achtzackiger Stern)
      {
        const rz = castleZ0 + sternLen * 0.33, rr = Math.min(2.2, c.W * 0.11);
        const star = new Shape();
        for (let i = 0; i < 16; i++) { const r = i % 2 ? rr * 0.22 : (i % 4 === 0 ? rr * 0.95 : rr * 0.62); const a = (i / 16) * Math.PI * 2; if (i === 0) star.moveTo(Math.sin(a) * r, Math.cos(a) * r); else star.lineTo(Math.sin(a) * r, Math.cos(a) * r); }
        star.closePath();
        const sg = new ShapeGeometry(star).rotateX(-Math.PI / 2);
        const sm = new Mesh(sg, gold);
        sm.position.set(0, qy + 0.025, rz);
        group.add(sm);
        put(group, torus(rr, 0.035, 28), gold, 0, qy + 0.04, rz, Math.PI / 2, 0, 0);
        put(group, torus(rr * 0.5, 0.025, 20), gold, 0, qy + 0.04, rz, Math.PI / 2, 0, 0);
      }
      // Fernrohr auf Dreibein neben dem Kompasshaus
      {
        const tz = helm.z + 1.2, tx = Math.min(1.6, xr(tz) * 0.4);
        for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; put(group, cyl(0.018, 0.022, 1.0, 5), wood, tx + Math.cos(a) * 0.22, qy + 0.5, tz + Math.sin(a) * 0.22, Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22); }
        put(group, cyl(0.05, 0.06, 0.8, 8), gold, tx, qy + 1.08, tz, Math.PI / 2 - 0.4, 0, 0);
        put(group, cyl(0.075, 0.06, 0.12, 8), iron, tx, qy + 1.0, tz - 0.05);
        block(tx, tz, 0.3, 0.3);
      }
      // Kartentisch mit Hocker an Backbord, Karronaden und Tonnen an den Seiten (ab Galeone)
      if (c.L >= 46) {
        const tz = castleZ0 + sternLen * 0.5, tx = -xr(tz) * 0.8;
        put(group, box(1.4, 0.08, 0.9), wood, tx, qy + 0.82, tz);
        put(group, box(1.5, 0.05, 1.0), darkWood, tx, qy + 0.76, tz);
        for (const ex of [-0.6, 0.6]) for (const ez of [-0.38, 0.38]) put(group, box(0.07, 0.78, 0.07), darkWood, tx + ex, qy + 0.39, tz + ez);
        put(group, box(1.1, 0.012, 0.7), toon('#E8D7A6'), tx, qy + 0.87, tz);
        put(group, cyl(0.2, 0.2, 0.5, 8), wood, tx + 0.2, qy + 0.25, tz + 0.95);
        block(tx, tz, 0.85, 0.65);
        for (const sd of [-1, 1]) {
          for (const f of [0.22, 0.78]) { const gz2 = castleZ0 + sternLen * f; if (canAdd(sd * xr(gz2) * 0.9 - sd * 0.4, gz2, 0.4, 0.4)) carr(sd * xr(gz2) * 0.9, qy, gz2, sd); }
          // Tonnen nie an den Treppenaustritt stellen (bei der Einzeltreppe die Seite der Treppe auslassen); sonst am Heckrand, wo Platz ist
          const stairSide = !grand && Math.sign(stairX[0]) === sd;
          const bz2 = castleZ0 + sternLen * 0.4, bx2 = sd * xr(bz2) * 0.9;
          if (!stairSide && canAdd(bx2 - sd * 0.35, bz2 + 0.1, 0.8, 0.5)) {
            const bm = toon({ color: '#6F4A2B', roughness: 0.85 });
            put(group, cyl(0.32, 0.32, 0.8, 10), bm, bx2, qy + 0.4, bz2);
            for (const hy of [0.18, 0.5, 0.82]) put(group, cyl(0.345, 0.345, 0.05, 10), iron, bx2, qy + 0.8 * hy, bz2);
            put(group, cyl(0.32, 0.32, 0.8, 10), bm, bx2 - sd * 0.7, qy + 0.4, bz2 + 0.2);
            block(bx2 - sd * 0.35, bz2 + 0.1, 0.8, 0.5);
          }
        }
        coil(-xr(castleZ0 + 2.2) * 0.35, qy, castleZ0 + 2.0, 0.34);
        coil(xr(castleZ0 + 2.2) * 0.35, qy, castleZ0 + 2.1, 0.3);
      }
      // Schiffsglocke vorn am Achterdeck: Querbalken auf zwei Pfosten, Messingglocke
      {
        const bzz = castleZ1 - 0.6;
        for (const e of [-1, 1]) put(group, box(0.08, 0.9, 0.08), darkWood, brandX + e * 0.34, qy + 0.45, bzz);
        put(group, box(0.8, 0.07, 0.08), darkWood, brandX, qy + 0.9, bzz);
        put(group, cyl(0.04, 0.2, 0.3, 10), gold, brandX, qy + 0.72, bzz);
        put(group, new SphereGeometry(0.05, 6, 5), iron, brandX, qy + 0.55, bzz);
        block(brandX, bzz, 0.4, 0.15);
      }
    }

    // Masten: Nagelbank mit Tauen (Ring aus Rahmen, Nägeln und Tauwerk) und Wantenspanner an der Bordwand
    for (const m of mastTops) {
      const ms2 = Math.min(sc, 3.2), rr = 0.19 * ms2 + 0.55;
      const mb = fore && m.z > fore.z0 ? D + fore.top : D; // auf dem Vordeck steht die Nagelbank auf dessen Plankendeck
      put(group, torus(rr, 0.045, 18), darkWood, 0, mb + 0.85, m.z, Math.PI / 2, 0, 0);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        put(group, cyl(0.035, 0.04, 0.85, 5), wood, Math.cos(a) * rr, mb + 0.42, Math.sin(a) * rr + m.z);
        // Belegnagel mit hängender Tauschlinge
        put(group, cyl(0.022, 0.022, 0.26, 5), gold, Math.cos(a) * rr * 1.0, mb + 0.97, Math.sin(a) * rr + m.z);
        if (k % 2 === 0) put(group, torus(0.13, 0.025, 8), rp2, Math.cos(a) * rr, mb + 0.6, Math.sin(a) * rr + m.z, 0, a, 0);
      }
      for (const sd of [-1, 1]) {
        for (const dz of [-1.3, 0, 1.3]) {
          const z = m.z + dz, sx = sd * (halfWidth(z) * 0.915 + 0.05), sy = D - 0.25 + sheerAt(z / (c.L / 2), c.L);
          put(group, box(0.07, 0.8, 0.22), iron, sx, sy - 0.1, z);
          put(group, torus(0.15, 0.04, 10), iron, sx + sd * 0.05, sy + 0.18, z, 0, Math.PI / 2, 0);
        }
      }
    }

    // Deckgeschütze auf Fregatten und größer: Karronaden hinter der Reling, mit Rädern und Brooktau
    if (c.decks >= 2) {
      const per = Math.min(4, Math.max(2, Math.floor(c.can * 0.3)));
      for (let i = 0; i < per; i++) {
        const gz0 = castleZ1 + stairLen + 1.4, gz1 = Math.max(gz0 + 4, (fore ? fore.z0 - fore.stairLen : c.L * 0.3) - 1.4);
        const gz = gz0 + ((i + 0.5) / per) * (gz1 - gz0);
        for (const sd of [-1, 1]) {
          for (const dz of [0, 0.7, -0.7, 1.4, -1.4]) {
            // an der Bordwand (Rohr zeigt nach außen), nicht mitten auf dem Deck
            const gx = sd * (halfWidth(gz + dz) * 0.89 - 0.85);
            if (canAdd(gx - sd * 0.4, gz + dz, 0.4, 0.4)) { carr(gx, D, gz + dz, sd); break; }
          }
        }
      }
    }

    // Beiboot auf Böcken über der Luke (wo zwischen den Masten Platz ist)
    if (c.L >= 30) {
      const castleEnd = castleZ1 + stairLen + 0.8, foreStart = fore ? fore.z0 - fore.stairLen - 0.9 : c.L * 0.34;
      const len = Math.min(5.2, c.L * 0.1 + 0.5), mid = (castleEnd + foreStart) / 2 - c.L * 0.02;
      let bz: number | null = null, best = 1e9;
      for (let z = castleEnd + len / 2 + 1; z <= foreStart - len / 2 - 1; z += 0.25) {
        if (mastTops.some((m) => Math.abs(m.z - z) < len / 2 + 1.5 + Math.min(sc, 3.2) * 0.3)) continue;
        if (Math.abs(z - mid) < best) { best = Math.abs(z - mid); bz = z; }
      }
      if (bz !== null && canAdd(0, bz, len * 0.3 + 0.2, len / 2 + 0.1, 0)) {
        // das Boot liegt hoch auf Böcken (Lichte 2,1 m): darunter kann man gehen, nur die Böcke nehmen Platz
        const bw = len * 0.3, by = D + 2.2;
        const boatMat = toon({ color: '#8A6840', map: planksTex, roughness: 0.85 });
        const inner = toon('#3A2616');
        const hullB = new Mesh(new SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), boatMat);
        hullB.scale.set(bw, bw * 0.55, len / 2);
        hullB.position.set(0, by + bw * 0.55 - 0.05, bz);
        group.add(hullB);
        // Boot offen: dunkle Innenfläche, Ruderbänke, Dollbord
        put(group, new CylinderGeometry(1, 1, 0.02, 14), inner, 0, by + bw * 0.55 - 0.02, bz).scale.set(bw * 0.93, 1, len / 2 * 0.95);
        for (const t of [-0.55, -0.15, 0.25, 0.65]) put(group, box(bw * 1.7 * Math.sqrt(Math.max(0.05, 1 - t * t)), 0.07, 0.3), wood, 0, by + bw * 0.55 - 0.12, bz + t * len / 2);
        put(group, torus(0.5, 0.03, 12), darkWood, 0, by + bw * 0.55, bz, Math.PI / 2, 0, 0).scale.set(bw * 2, len, 1);
        // Riemen nebeneinander im Boot
        for (const e of [-1, 1]) put(group, cyl(0.03, 0.05, len * 0.9, 5), wood, e * bw * 0.4, by + bw * 0.55 + 0.05, bz, Math.PI / 2, 0, 0);
        // Böcke
        for (const e of [-0.5, 0.5]) { put(group, box(bw * 1.4, 0.18, 0.2), darkWood, 0, D + 2.1, bz + e * len * 0.5); for (const s of [-1, 1]) { put(group, box(0.14, 2.1, 0.14), darkWood, s * bw * 0.6, D + 1.05, bz + e * len * 0.5); block(s * bw * 0.6, bz + e * len * 0.5, 0.15, 0.15); } }
      }
    }
  }

  yield;
  // Eine Flagge am höchsten Mast: Flaggenstock mit vergoldeter Kugel, Messingringen am Tuch und Flaggenleine (Fall) bis zum Deck. Alles hängt am oberen
  // Mastteil (knickt der Mast, fällt die Flagge mit). Das Tuch (32 × 20 Stücke, als Wimpel verjüngt) weht im Stoff-Shader (render/flagCloth.ts).
  const topIdx = c.masts.reduce((bi, m, i) => (Math.abs(m) < Math.abs(c.masts[bi]) ? i : bi), 0);
  const topZ = c.masts[topIdx] * c.L;
  const topH = c.mh * (topIdx === 0 && c.masts.length > 1 ? 0.92 : topIdx === c.masts.length - 1 && c.masts.length > 2 ? 0.8 : 1);
  const mastTopY = D + topH + (mastParts[topIdx]?.ext ?? 0);
  const fk = Math.min(2, sc);
  const fL = 2.1 * fk, fH = 1.25 * fk;
  const flagY = mastTopY + fH / 2 + 0.2 * fk;
  const mUpTop = mastParts[topIdx]?.up ?? group;
  const staffTop = flagY + fH / 2 + 0.42 * fk;
  put(mUpTop, cyl(0.026 * fk, 0.034 * fk, staffTop - mastTopY + 0.3, 6), darkWood, 0, (staffTop + mastTopY - 0.3) / 2, topZ);
  put(mUpTop, new SphereGeometry(0.085 * fk, 12, 10), gold, 0, staffTop + 0.05 * fk, topZ);
  put(mUpTop, cyl(0.07 * fk, 0.03 * fk, 0.1 * fk, 8), gold, 0, staffTop - 0.05 * fk, topZ);
  for (const yy of [flagY + fH / 2 - 0.03 * fk, flagY - fH / 2 + 0.03 * fk]) put(mUpTop, torus(0.05 * fk, 0.012 * fk, 8), gold, 0, yy, topZ, Math.PI / 2, 0, 0);
  rope(mUpTop, new Vector3(0.04 * fk, staffTop - 0.12 * fk, topZ + 0.02), new Vector3(0.1 * Math.min(sc, 3), D + 1.1, topZ + 0.32 * Math.min(sc, 3)), 0.012 * fk + 0.006, 0.12 + sc * 0.03, 10);
  const flagU = makeClothUniforms(fL, fH);
  const flagMat = clothMaterial(clothTex, flagU);
  const flag = new Mesh(clothGeometry({ len: fL, height: fH, taper: 0.22, swallow: 0.18 }), flagMat);
  flag.position.set(0, flagY, topZ - 0.04 * fk);
  flag.rotation.y = Math.PI / 2; // +x des Tuchs zeigt nach achtern (−z)
  addCloth(flag, flagU, flagMat);
  mUpTop.add(flag);

  // Galionsfigur: skulpturiertes Modell (data/figureheads.ts, Blender) mit verziertem Sockel; Maßstab nach Länge und Breite der Klasse. Die Figur steht
  // über dem Bugspriet (das Bugspriet tritt tiefer aus dem Vorsteven); ein vergoldeter Kragen fasst das Bugspriet am Austritt ein.
  const fhId = figureheadModel(look.figurehead);
  if (fhId) {
    const fhScale = figureheadScale(fhId, c.L, c.W);
    const fh = buildFigurehead(fhId, fhScale, c.L) ?? figurehead(FIGUREHEAD_DEFS[fhId].fallback, Math.min(2.2, 0.8 * sc));
    fh.position.set(0, bowTop - 0.1, bowZ + 0.15);
    group.add(fh);
    const sd = Math.min(sc, 3);
    const bsStart = bowZ + c.L * 0.08 - Math.cos(0.25) * c.L * 0.125 * 0.97;
    put(group, torus(0.2 * sd * 0.8, 0.034 * sd, 10), gold, 0, bowTop - 0.15 - Math.sin(0.25) * c.L * 0.125 * 0.97 + Math.sin(0.25) * c.L * 0.04, bsStart + c.L * 0.04, Math.PI / 2 - 0.25 + 0.0, 0, 0);
  }
  // Galion – Backenhölzer aus Gold zur Figur, dazwischen ein Grätingdeck, und seitlich die Katköpfe für den Anker
  if (c.L >= 24) {
    const bk = Math.min(1.7, c.L / 26);
    const gz = bowZ, gy = bowTop;
    const hwB = halfWidth(gz - 1.4 * bk) * 0.6;
    for (const sd of [-1, 1]) {
      const pts = [{ x: sd * hwB, y: gy - 0.4 * bk, z: gz - 1.4 * bk }, { x: sd * hwB * 0.5, y: gy - 0.62 * bk, z: gz - 0.2 * bk }, { x: sd * 0.2 * bk, y: gy - 0.55 * bk, z: gz + 0.75 * bk }];
      railSeg(group, pts[0], pts[1], 0, 0.15 * bk, gold, 0.17 * bk);
      railSeg(group, pts[1], pts[2], 0, 0.13 * bk, gold, 0.15 * bk);
      put(group, cyl(0.06 * bk, 0.06 * bk, 0.7 * bk, 6), darkWood, pts[1].x, pts[1].y - 0.3 * bk, pts[1].z);
    }
    const gs = new Shape();
    gs.moveTo(-hwB * 0.92, -(gz - 1.4 * bk)); gs.lineTo(hwB * 0.92, -(gz - 1.4 * bk)); gs.lineTo(0.2 * bk, -(gz + 0.7 * bk)); gs.lineTo(-0.2 * bk, -(gz + 0.7 * bk)); gs.closePath();
    const grating = new Mesh(new ShapeGeometry(gs).rotateX(-Math.PI / 2), toon({ color: '#6A4426', side: DoubleSide }));
    grating.position.y = gy - 0.58 * bk;
    group.add(grating);
    for (const sd of [-1, 1]) {
      const cz = gz - 2.8 * bk, hw2 = halfWidth(cz);
      put(group, box(1.5 * bk, 0.2 * bk, 0.22 * bk), darkWood, sd * (hw2 * 0.92 + 0.45 * bk), D + sheerAt(cz / (c.L / 2), c.L) + 0.28 * bk, cz);
      put(group, cyl(0.1 * bk, 0.1 * bk, 0.26 * bk, 8), gold, sd * (hw2 * 0.92 + 1.1 * bk), D + sheerAt(cz / (c.L / 2), c.L) + 0.28 * bk, cz, Math.PI / 2, 0, 0);
    }
  }

  if (transomWin) windows.push(transomWin);
  yield;
  // Alles auf dem Achterdeck (Deck, Reling, Steuerrad, Kompassrose, Truhen, Laternen) liegt über der Kajüte und bildet deren „Dach“:
  // es wird als Gruppe ausgeblendet, solange jemand in der Kajüte steht (Blick von oben in den Raum)
  const topGroup = new Group();
  group.add(topGroup);
  topGroup.add(castleTop); // sitzt bei z = 0 (die Form steckt in der Geometrie), die Suche unten fände es nicht
  for (const o of [...group.children]) {
    if (o === topGroup) continue;
    // Lichter bleiben außerhalb des Dachs: verschwindet ein Licht beim Ausblenden, ändert sich die Lichtzahl und three.js übersetzt
    // alle beleuchteten Materialien neu (beim Betreten der Kajüte stand das Bild dadurch mehrere Sekunden)
    if ((o as { isLight?: boolean }).isLight) continue;
    if (o.position.y >= D + castleH - 0.01 && o.position.z > castleZ0 - 0.3 && o.position.z < castleZ1 + 0.1 && Math.abs(o.position.x) < c.W) topGroup.add(o);
  }
  for (const m of mastParts) if (D + m.h * 0.79 >= D + castleH - 0.01 && m.z > castleZ0 - 0.3 && m.z < castleZ1 + 0.1) topGroup.add(m.up);
  blockers.push(...cabinBlockers);
  const keepSet = new Set<Mesh>([...sails, ...lanterns, ...windows, ...keepExtra, flag, deck]);
  wheel.traverse((o) => { if ((o as Mesh).isMesh) keepSet.add(o as Mesh); });
  // jeder obere Mastteil wird für sich verschmolzen (wenige Zeichenaufrufe) und bleibt als Gruppe beweglich
  for (const m of mastParts) yield* mergeStaticSteps(m.up, keepSet);
  // Deck-Drehbassen (Kanonen-Stufe ≥ 4) auf der Reling zwischen Achterdeck und Vorderkastell: die Halter stehen auf der Reling-Oberkante (über Fässern und
  // Kisten, außerhalb der begehbaren Fläche); frei bleiben die drei Zugänge der Gangway (Stegbreite + Halterfuß = 1,25 m) und die Stellen neben festen Deck-Kanonen
  let swivels: SwivelMount[] = [];
  if (vis.cannon.swivels > 0) {
    const dm = { halfWidth, blockers, quarter: { z1: castleZ1, stairLen }, fore: fore ? { z0: fore.z0, stairLen: fore.stairLen } : null };
    const gates = deckGates(dm, c.L);
    const avoid = [gates.mid, gates.aft, gates.fore];
    const lo = castleZ1 + 0.8, hi = (fore ? fore.z0 : c.L * 0.4) - 0.8;
    const gap = Math.max(2.4, c.L * 0.075);
    const spots: { side: 1 | -1; x: number; y: number; z: number }[] = [];
    for (const sd of [1, -1] as const) {
      const zs = pickSwivelZ(vis.cannon.swivels, lo, hi, gap, (z) => {
        if (avoid.some((g) => Math.abs(g - z) < 1.25)) return false;
        const rx = sd * edge(z / (c.L / 2)).x;
        return !blockers.some((b) => Math.abs(b.cz - z) < b.hz + 0.55 && Math.abs(b.cx - rx) < b.hx + 1.6);
      });
      for (const z of zs) spots.push({ side: sd, x: sd * edge(z / (c.L / 2)).x * 0.985, y: D + sheerAt(z / (c.L / 2), c.L) + 0.96, z });
    }
    swivels = addSwivels(evoCtx, spots);
  }

  const apart = [topGroup, ...mastParts.map((m) => m.up), ...swivels.map((sw) => sw.mount)];
  yield* mergeStaticSteps(topGroup, keepSet, apart.slice(1));
  yield* mergeStaticSteps(group, keepSet, apart);
  // Blender-Props nach dem Verschmelzen aufstellen (ein InstancedMesh darf nicht mit verschmolzen werden)
  if (batch.size) {
    const barrelCol = toon({ color: '#6F4A2B', roughness: 0.85 }), crateCol = toon({ color: '#8A6840', roughness: 0.9 });
    const iron2 = IRON(), cu2 = COPPER(), gold2 = PROP_GOLD(), dark2 = toon('#1E1410');
    // Rohrwerkstoff nach Kanonen-Stufe: 2 Eisen, 3 Bronze, 4 polierte Bronze, 5 schwarzer Gussstahl (die Goldringe setzt `addGunRing`)
    const gunMat = vis.cannon.barrel === 'eisen' ? iron2
      : vis.cannon.barrel === 'bronzelang' ? toon({ color: '#D9963E', spec: 1, metalness: 1, roughness: 0.22, forge: 'messing' })
      : vis.cannon.barrel === 'schwarz' ? toon({ color: '#17181C', spec: 1, metalness: 0.9, roughness: 0.3, forge: 'kanonenstahl' })
      : cu2;
    batch.flush(group, (id: PropId, role: string) => {
      switch (role) {
        case 'iron': return iron2;
        case 'bronze': return gunMat;
        case 'brass': return gold2;
        case 'glass': return lanternGlass;
        case 'ember': return GLOW_LAMP;
        case 'dark': return dark2;
        case 'darkwood': return darkWood;
        default: return id === 'fass' ? barrelCol : id === 'kiste' ? crateCol : wood;
      }
    });
  }
  group.traverse((o) => {
    if ((o as Mesh).isMesh && !o.userData.noOutline) { o.castShadow = true; o.receiveShadow = true; }
  });
  yield;
  yield* addOutlinesSteps(group);
  return { group, hull, sails, muzzlesL, muzzlesR, lanterns, windows, flag, flags: clothFlags, deckY: D, helm, wheel, quarter: { z0: castleZ0, z1: castleZ1, top: topY, stairX, stairW, stairLen, flare, doorHalf: doorWC / 2, cabin: { zA, zB } }, cabinRoof: topGroup, cabinLight, fore, masts: mastParts.map((m) => ({ up: m.up, z: m.z, pivotY: m.pivotY })), rigging, blockers, halfWidth, deckMat, deckBase, lights, railParts, swivels, evoKey: vis.key };
}

/** Feste Teile pro Material zu einem Mesh zusammenfassen (weniger Zeichenaufrufe); gibt alle 24 Teile und nach jedem Material ab */
function* mergeStaticSteps(group: Group, keep: Set<Mesh>, skip: Group[] = []): Generator<void> {
  group.updateMatrixWorld(true);
  const parts: Mesh[] = [];
  group.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || keep.has(m) || (m as InstancedMesh).isInstancedMesh) return;
    if (skip.length) { let p = m.parent; while (p) { if (skip.includes(p as Group)) return; p = p.parent; } }
    parts.push(m);
  });
  const buckets = new Map<object, { mat: any; geos: BufferGeometry[]; meshes: Mesh[] }>();
  let n = 0;
  for (const m of parts) {
    const b = buckets.get(m.material as object) ?? { mat: m.material, geos: [], meshes: [] };
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g = g.applyMatrix4(m.matrixWorld);
    b.geos.push(g);
    b.meshes.push(m);
    buckets.set(m.material as object, b);
    if (++n % 24 === 0) yield;
  }
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    for (const m of b.meshes) { m.removeFromParent(); disposeGeometry(m.geometry); }
    group.add(new Mesh(merged, b.mat));
    yield;
  }
  // Leere Gruppen (Steuerrad, Galionsfigur) aufräumen
  for (const c of [...group.children]) if (!(c as Mesh).isMesh && !(c as PointLight).isLight && !(c as LightAnchor).isLightAnchor && c.children.length === 0 && !(c as LineSegments).isLineSegments) c.removeFromParent();
}
