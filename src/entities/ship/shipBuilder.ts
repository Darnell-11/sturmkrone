import {
  BoxGeometry,
  ExtrudeGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { FigureheadId, FlagId, ShipClass, ShipLook } from '../../data/ships';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutlines } from '../../render/outline';
import { oakTexture, plankTexture, sailTexture } from '../../render/textures';
import { sharedGeo } from '../../render/geoCache';
import { disposeGeometry } from '../../render/dispose';
import { toon } from '../../render/toon';
import { toonPbr } from '../../render/pbrMaps';

/** Achsenparalleler fester Block im Schiffskoordinatensystem */
export interface Blocker { cx: number; cz: number; hx: number; hz: number }

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
  deckY: number;
  helm: Vector3;
  /** Steuerrad (Drehpunkt in der Mitte; dreht mit dem Ruder) */
  wheel: Group;
  /**
   * Achterdeck und Treppen (Schiffskoordinaten; Höhen relativ zum Hauptdeck): für Begehen und Kollision.
   * `bulge`: seitliche Ausbuchtung der geschwungenen Treppen (m, zur Schiffsmitte hin; 0 = gerade)
   */
  quarter: { z0: number; z1: number; top: number; stairX: number[]; stairW: number; stairLen: number; bulge: number };
  /** Vorderkastell (massiver Aufbau am Bug, nicht begehbar), null = keins */
  fore: { z0: number; z1: number } | null;
  /** Feste Aufbauten an Deck (Mitte, halbe Ausdehnung, Schiffskoordinaten): Masten, Luke, Fässer, Möbel … */
  blockers: Blocker[];
  /** Deck-Material und Grundfarbe (Nässe dunkelt das Holz ab) */
  deckMat: Mesh['material'];
  deckBase: Color;
  /** Laternen-Lichter (nur Spielerschiff): warmes Punktlicht, Stärke nach Tageszeit */
  lights: PointLight[];
  /** Halbe Breite an Position z (für Treffer und Löcher) */
  halfWidth(z: number): number;
}

/** Breite des Rumpfs entlang der Länge: vorn spitz, hinten breit */
function widthAt(t: number): number {
  // t: −1 Heck … +1 Bug. Durchgehend geschwungen wie ein echter Rumpf (vorher über 2/3 der Länge kastenförmig):
  // fein zulaufender Bug, größte Breite etwas hinter der Mitte, breiter Heckspiegel
  if (t >= 0) return Math.pow(Math.max(0, 1 - Math.pow(t, 2.3)), 0.6);
  const u = -t;
  return 0.78 + 0.22 * Math.pow(Math.max(0, 1 - Math.pow(u, 3)), 0.5);
}

/** Deckssprung: Bug und Heck steigen an (bei großen Schiffen begrenzt) */
export function sheerAt(t: number, L: number): number {
  const k = Math.min(1.6, L / 15) * 0.55;
  return (t > 0 ? t * t * 1.1 : t * t * 0.8) * k;
}

/** Vorsprung des Stevens: der Bug neigt sich oben nach vorn (geschwungener Vorsteven statt senkrechter Wand) */
export function rakeAt(t: number, L: number): number {
  const u = Math.max(0, (t - 0.72) / 0.28);
  return L * 0.075 * u * u;
}

function hullGeometry(c: ShipClass, D: number, look: ShipLook): BufferGeometry {
  const sections = 22;
  // Spantform: größte Breite auf halber Höhe, oben leicht eingezogen (Tumblehome), unten runder Bauch
  const prof = [[-0.9, D], [-1, D * 0.55], [-0.95, D * 0.15], [-0.7, -0.5], [-0.32, -0.92], [0, -1.05], [0.32, -0.92], [0.7, -0.5], [0.95, D * 0.15], [1, D * 0.55], [0.9, D]];
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const hull = new Color(look.hull), stripe = new Color(look.stripe), bottom = new Color('#6E3524'), dark = new Color(look.hull).multiplyScalar(0.5);
  const ring = (i: number) => {
    const t = (i / sections) * 2 - 1;
    const z = t * c.L / 2;
    // Letzter Ring schließt den Bug zu einer Schneide (vorher blieb dort ein Spalt)
    const w = (i === sections ? 0.004 : Math.max(0.04, widthAt(t))) * c.W / 2;
    const rise = sheerAt(t, c.L);
    const rk = rakeAt(t, c.L);
    const draft = D / (1.4 + c.decks * 0.75); // Tiefgang wächst mit der Schiffsgröße
    return prof.map(([px, py0]) => {
      const py = py0 < 0 ? py0 * draft : py0;
      // Kiel steigt zum Bug an (Vorfuß), die Oberkante bleibt auf Deckshöhe; der Vorsteven ragt oben nach vorn
      const pyy = py < 0 ? py * (1 - Math.max(0, t - 0.85) * 1.6) : py;
      const topK = Math.min(1, Math.max(0, (py + 0.3) / (D + 0.3)));
      return new Vector3(px * w, pyy + (py > 0.5 ? rise : rise * Math.max(0, (py + 1.05) / (D + 1.05))), z + rk * Math.pow(topK, 1.3));
    });
  };
  // waagerechte Bergholz-Leisten statt senkrechter Streifen, dunkles Unterwasserschiff
  const colorFor = (y: number, _i: number) => {
    if (y < 0.05) return bottom;
    if (Math.abs(y - (D - 0.7)) < 0.28) return stripe;
    if (Math.abs(y - D * 0.32) < 0.14 || Math.abs(y - (D + 0.25)) < 0.1) return dark;
    return hull;
  };
  for (let i = 0; i < sections; i++) {
    const a = ring(i), b = ring(i + 1);
    for (let k = 0; k < prof.length - 1; k++) {
      // Drehsinn so, dass die Außenseite sichtbar ist (vorher zeigte sie nach innen – der Rumpf war von außen unsichtbar)
      const quad = [a[k], b[k + 1], b[k], a[k], a[k + 1], b[k + 1]];
      for (const p of quad) {
        pos.push(p.x, p.y, p.z);
        uv.push(p.z / 3, p.y * 0.35);
        const cc = colorFor(p.y, i);
        // Verwitterung: Salzstreifen und Schmutz am Wasser, ungleichmäßig nachgedunkelt
        const wv = (0.84 + 0.16 * Math.sin(p.z * 2.1 + p.y * 5.3) * Math.sin(p.z * 0.7 + 1)) * (p.y < 1.2 ? 0.82 + 0.18 * Math.max(0, p.y) / 1.2 : 1) * 0.92;
        col.push(cc.r * wv, cc.g * wv, cc.b * wv);
      }
    }
  }
  // Heckspiegel
  const st = ring(0);
  // Fächer über alle Profilpunkte bis zur gegenüberliegenden Oberkante (vorher fehlte das letzte Dreieck)
  for (let k = 1; k < st.length - 1; k++) {
    for (const p of [st[0], st[k + 1], st[k]]) { pos.push(p.x, p.y, p.z); col.push(dark.r, dark.g, dark.b); uv.push(p.x / 3, p.y * 0.35); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function flagTexture(flag: FlagId, color: string): CanvasTexture {
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
const IRON = () => toon({ color: '#4A3326', spec: 0.9, metalness: 0.85, roughness: 0.78 });
const COPPER = () => toon({ color: '#B8683A', spec: 1, metalness: 1, roughness: 0.38 });
const ROPE = () => toon({ color: '#3D2F20', roughness: 0.95 });

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
function railSeg(group: Group, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, hy: number, th: number, mat: Mesh['material'], h = th * 0.9) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  const m = new Mesh(box(th, h, len), mat);
  m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + hy, (a.z + b.z) / 2);
  m.rotation.order = 'YXZ';
  m.rotation.set(-Math.asin(dy / len), Math.atan2(dx, dz), 0);
  group.add(m);
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
/** Baut ein Schiff einer Klasse im eigenen Look. Bug zeigt nach +Z. */
export function buildShip(c: ShipClass, look: ShipLook, hero = false): ShipModel {
  const group = new Group();
  // Bordwandhöhe wächst mit der Schiffsgröße (große Schiffe ragen hoch aus dem Wasser)
  const hk = Math.pow(Math.max(1, c.L / 24), 0.6);
  const D = (1.4 + c.decks * 0.75) * hk;
  const sc = c.L / 15;
  const halfWidth = (z: number) => Math.max(0.05, widthAt(z / (c.L / 2))) * c.W / 2;
  const blockers: Blocker[] = [];
  /** Zusatzteile, die nicht mit dem Rest verschmolzen werden */
  const keepExtra: Mesh[] = [];
  const block = (cx: number, cz: number, hx: number, hz: number) => { blockers.push({ cx, cz, hx, hz }); };
  /** Oberkante des Rumpfs bei t (−1 Heck … +1 Bug): Breite und Länge samt Vorsteven-Neigung, damit Deck und Reling bis zur Spitze passen */
  const edge = (t: number) => ({ x: (t >= 0.999 ? 0.004 : Math.max(0.04, widthAt(t))) * c.W / 2 * 0.9, z: t * c.L / 2 + rakeAt(t, c.L) });

  const planksTex = plankTexture();
  const oak = oakTexture();
  // beidseitig: auch die Innenseite der Bordwand (vom Deck aus) und der Heckspiegel von hinten bleiben sichtbar
  const hullMat = toon({ color: 0xffffff, vertexColors: true, map: oak, side: DoubleSide, roughness: 0.9, ...toonPbr(oak, { strength: 0.28, rough: 0.92, roughVar: 0.25, ao: 0.6 }) });
  const hull = new Mesh(hullGeometry(c, D, look), hullMat);
  group.add(hull);

  // Deck
  const deckShape = new Shape();
  const N = 24;
  const deckT = (i: number) => -0.98 + (i / N) * 1.98;
  for (let i = 0; i <= N; i++) { const e = edge(deckT(i)); i === 0 ? deckShape.moveTo(e.x * 0.99, e.z) : deckShape.lineTo(e.x * 0.99, e.z); }
  for (let i = N; i >= 0; i--) { const e = edge(deckT(i)); deckShape.lineTo(-e.x * 0.99, e.z); }
  const deckGeo = new ShapeGeometry(deckShape).rotateX(Math.PI / 2);
  const deckTex = oak.clone();
  deckTex.center.set(0.5, 0.5);
  deckTex.rotation = Math.PI / 2;
  deckTex.repeat.set(0.35, 0.35);
  deckTex.needsUpdate = true;
  // Deckplanken: dunkles Eichenholz mit Rillen; Nässe (Regen, Gischt) färbt es ab und lässt es glänzen (Pfützen-Shader)
  const deckBase = new Color('#B58A5C');
  const deckMat = toon({ color: deckBase, side: DoubleSide, map: deckTex, unique: true, puddles: 0.6, ...toonPbr(deckTex, { strength: 0.7, rough: 0.88, roughVar: 0.2, ao: 0.75 }, oak) });
  const deck = new Mesh(deckGeo, deckMat);
  deck.position.y = D - 0.05;
  deck.userData.noOutline = true;
  group.add(deck);
  const wood = toon({ color: '#7A5030', map: planksTex });
  const darkWood = toon('#4A2E1A');
  const gold = toon({ color: '#E3B04B', spec: 0.9 });
  // Reling: Handlauf, Zwischenholm, Pfosten, Docken (gedrechselte Stäbe) und Handlauf-Kappen; Heckreling und Bugreling schließen sie ringsum
  {
    const RN = 18;
    const railMat = darkWood;
    const rp: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i <= RN; i++) {
      const t = -0.96 + (i / RN) * 1.94;
      const e = edge(t);
      rp.push({ x: e.x * 0.985, y: D + sheerAt(t, c.L), z: e.z });
    }
    const seg = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, hy: number, th: number, mat: Mesh['material']) => railSeg(group, a, b, hy, th, mat);
    for (const sd of [-1, 1]) {
      const pts = rp.map((p) => ({ x: p.x * sd, y: p.y, z: p.z }));
      for (let i = 0; i < pts.length - 1; i++) {
        const a0 = pts[i], b0 = pts[i + 1];
        seg(a0, b0, 0.88, 0.1, railMat);
        seg(a0, b0, 0.46, 0.06, railMat);
        // gedrechselte Docken zwischen den Pfosten
        for (const f of [0.33, 0.66]) {
          const bx = a0.x + (b0.x - a0.x) * f, bz = a0.z + (b0.z - a0.z) * f, by = a0.y + (b0.y - a0.y) * f;
          put(group, cyl(0.025, 0.03, 0.42, 5), wood, bx, by + 0.67, bz);
        }
      }
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        put(group, box(0.08, 0.9, 0.08), wood, p.x, p.y + 0.45, p.z);
        put(group, cyl(0.06, 0.06, 0.05, 6), gold, p.x, p.y + 0.93, p.z);
      }
    }
    // Goldene Zierleiste entlang der Oberkante des Rumpfes (außen) und am Vorsteven
    {
      const trimMat = toon({ color: '#E3B04B', spec: 0.9 });
      for (const sd of [-1, 1]) {
        for (let i = 0; i < rp.length - 1; i++) {
          const a0 = { x: rp[i].x * sd * 1.03, y: rp[i].y - 0.04, z: rp[i].z }, b0 = { x: rp[i + 1].x * sd * 1.03, y: rp[i + 1].y - 0.04, z: rp[i + 1].z };
          railSeg(group, a0, b0, 0, 0.07, trimMat, 0.14);
        }
      }
      const e1 = edge(0.5), e2 = edge(1);
      railSeg(group, { x: 0, y: D * 0.35, z: c.L / 2 * 0.98 }, { x: 0, y: D + sheerAt(1, c.L), z: e2.z }, 0, 0.09, trimMat, 0.09);
      void e1;
    }
    // Heckreling quer über das Heck, Bugreling vorn
    const sternP = rp[0], bowP = rp[rp.length - 1];
    seg({ x: -sternP.x, y: sternP.y, z: sternP.z }, { x: sternP.x, y: sternP.y, z: sternP.z }, 0.88, 0.1, railMat);
    seg({ x: -sternP.x, y: sternP.y, z: sternP.z }, { x: sternP.x, y: sternP.y, z: sternP.z }, 0.46, 0.06, railMat);
    for (let k = 1; k < 6; k++) put(group, cyl(0.025, 0.03, 0.42, 5), wood, -sternP.x + (2 * sternP.x * k) / 6, sternP.y + 0.67, sternP.z);
    void bowP;
  }
  // Achterkastell mit Fenstern
  const windows: Mesh[] = [];
  let transomWin: Mesh | null = null;
  const sternLen = c.L * 0.22;
  const castleH = (1.2 + c.decks * 0.5) * hk;
  // Achterkastell: folgt der Rumpfkurve statt eines Quaders, mit goldener Zierleiste
  const castleZ0 = -c.L / 2 + c.L * 0.02, castleZ1 = castleZ0 + sternLen;
  const cs = new Shape();
  const CN = 8;
  for (let i = 0; i <= CN; i++) { const z = castleZ0 + (i / CN) * sternLen; const x = halfWidth(z) * 0.9; if (i === 0) cs.moveTo(x, -z); else cs.lineTo(x, -z); }
  for (let i = CN; i >= 0; i--) { const z = castleZ0 + (i / CN) * sternLen; cs.lineTo(-halfWidth(z) * 0.9, -z); }
  const castle = new Mesh(new ExtrudeGeometry(cs, { depth: castleH, bevelEnabled: false }).rotateX(-Math.PI / 2), wood);
  castle.position.y = D;
  group.add(castle);
  const castleTop = new Mesh(new ExtrudeGeometry(cs, { depth: 0.14, bevelEnabled: false }).rotateX(-Math.PI / 2), toon({ color: '#B58A5C', map: deckTex, unique: true, ...toonPbr(deckTex, { strength: 0.7, rough: 0.88, roughVar: 0.2, ao: 0.75 }, oak) }));
  castleTop.position.y = D + castleH;
  castleTop.scale.set(1.06, 1, 1.02);
  group.add(castleTop);
  // Zierleiste etwas größer in allen Richtungen: gleiche Flächen wie der Kastell-Körper flackerten (Tiefenkonflikt)
  const ts = new Shape();
  for (let i = 0; i <= CN; i++) { const z = castleZ0 - 0.07 + (i / CN) * (sternLen + 0.14); const x = halfWidth(z) * 0.9 * 1.035 + 0.04; if (i === 0) ts.moveTo(x, -z); else ts.lineTo(x, -z); }
  for (let i = CN; i >= 0; i--) { const z = castleZ0 - 0.07 + (i / CN) * (sternLen + 0.14); ts.lineTo(-halfWidth(z) * 0.9 * 1.035 - 0.04, -z); }
  const trim = new Mesh(new ExtrudeGeometry(ts, { depth: 0.12, bevelEnabled: false }).rotateX(-Math.PI / 2), gold);
  trim.position.y = D + castleH * 0.86;
  group.add(trim);
  // ---- Treppe(n) zum Achterdeck, Kapitänskajüte und Reling rund um das Achterdeck ----
  const topY = castleH + 0.14;
  const xfront = halfWidth(castleZ1) * 0.9 * 1.04;
  const stairW = Math.min(2.4, 0.9 + c.W * 0.075);
  const stairLen = topY / 0.58;
  // Das größte Schiff bekommt eine Doppeltreppe (beidseits der Kajütentür), alle anderen eine Treppe an Steuerbord
  const stairX = c.L >= 70 ? [-1, 1].map((sd) => sd * (xfront - stairW / 2 - 0.35)) : [-(xfront - stairW / 2 - 0.35)];
  const doorLamps: number[][] = [];
  // Das größte Schiff: die beiden Treppen schwingen auf halber Höhe zur Mitte hin aus (Ausbuchtung), wie bei edlen Schiffen
  const bulge = c.L >= 70 ? stairLen * 0.16 : 0;
  /** Mittellinie einer Treppe an Position t (0 unten … 1 oben) */
  const stairXc = (xs: number, t: number) => xs - Math.sign(xs) * bulge * Math.sin(Math.PI * t);
  {
    const treadMat = toon({ color: '#A67C4E', roughness: 0.85 });
    const riserMat = toon({ color: '#5E3A22', roughness: 0.9 });
    const zBot = castleZ1 + stairLen;
    const n = Math.max(6, Math.ceil(topY / 0.24));
    const run = stairLen / n, rise = topY / n;
    const K = bulge > 0 ? 10 : 1;
    for (const xs of stairX) {
      for (const e of [-1, 1]) {
        const pt = (t: number) => ({ x: stairXc(xs, t) + e * (stairW / 2 - 0.05), y: D + topY * t, z: zBot - stairLen * t });
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
        // geschwungene Treppen enden unten in einer Schnecke (goldene Kugel auf dickem Pfosten)
        if (bulge > 0) {
          const p = pt(0);
          put(group, cyl(0.1, 0.13, 1.0, 8), darkWood, p.x, p.y + 0.5, p.z + 0.1);
          put(group, new SphereGeometry(0.17, 10, 8), gold, p.x, p.y + 1.1, p.z + 0.1);
        }
      }
      for (let k = 1; k <= n; k++) {
        const t = (k - 0.5) / n;
        const z = zBot - (k - 0.5) * run, y = D + k * rise;
        const yaw = bulge > 0 ? Math.atan2(-Math.sign(xs) * bulge * Math.PI * Math.cos(Math.PI * t), -stairLen) : 0;
        const x = stairXc(xs, t);
        put(group, box(stairW - 0.14, 0.07, run + 0.07), treadMat, x, y - 0.035, z, 0, yaw, 0);
        put(group, box(stairW - 0.14, rise, 0.04), riserMat, stairXc(xs, (k - 1) / n), y - rise / 2, zBot - (k - 1) * run - 0.03, 0, yaw, 0);
      }
    }
    // Kapitänskajüte: Tür in der Vorderwand des Achterkastells, Goldrahmen, Messingknauf, Oberlicht, Wandlaternen
    const dw = Math.min(1.7, 0.95 + c.W * 0.035), dh = Math.min(2.3, castleH * 0.8);
    const zd = castleZ1 + 0.03;
    const frame = toon({ color: '#E3B04B', spec: 0.9 });
    put(group, box(dw, dh, 0.08), toon('#2B1A10'), 0, D + dh / 2, zd + 0.02);
    for (let i = 1; i < 4; i++) put(group, box(0.025, dh - 0.1, 0.03), toon('#1B100A'), -dw / 2 + (dw * i) / 4, D + dh / 2, zd + 0.07);
    for (const e of [-1, 1]) put(group, box(0.1, dh + 0.12, 0.12), frame, e * (dw / 2 + 0.05), D + dh / 2 + 0.04, zd + 0.03);
    put(group, box(dw + 0.3, 0.14, 0.14), frame, 0, D + dh + 0.1, zd + 0.03);
    put(group, box(dw + 0.5, 0.06, 0.2), frame, 0, D + dh + 0.2, zd + 0.04);
    put(group, new SphereGeometry(0.06, 8, 6), frame, dw * 0.32, D + dh * 0.48, zd + 0.1);
    put(group, new SphereGeometry(0.06, 8, 6), frame, -dw * 0.32, D + dh * 0.48, zd + 0.1);
    // Oberlicht über der Tür (leuchtet nachts)
    const th = Math.max(0.28, castleH - dh - 0.4);
    const tw = new Mesh(new PlaneGeometry(dw * 0.7, th), new MeshBasicMaterial({ color: new Color(2.4, 1.6, 0.6) }));
    tw.position.set(0, D + dh + 0.35 + th / 2, zd + 0.02);
    tw.userData.noOutline = true;
    group.add(tw);
    transomWin = tw;
    doorLamps.push([-(dw / 2 + 0.55), D + dh * 0.78, zd + 0.25], [dw / 2 + 0.55, D + dh * 0.78, zd + 0.25]);
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
  const winMat = new MeshBasicMaterial({ color: new Color(2.4, 1.6, 0.6) });
  for (let i = 0; i < c.decks + 2; i++) {
    const w = new Mesh(new PlaneGeometry(0.5, 0.45), winMat);
    w.position.set((i - (c.decks + 1) / 2) * (c.W * 0.62 / (c.decks + 2)), D + castleH * 0.55, castleZ0 - 0.02);
    w.rotation.y = Math.PI;
    w.userData.noOutline = true;
    group.add(w);
    windows.push(w);
    // Goldrahmen mit Sprosse um jedes Heckfenster
    {
      const fr = toon({ color: '#E3B04B', spec: 0.9 });
      const wx = w.position.x, wy = w.position.y, wz = castleZ0 - 0.05;
      put(group, box(0.56, 0.05, 0.05), fr, wx, wy + 0.25, wz);
      put(group, box(0.56, 0.05, 0.05), fr, wx, wy - 0.25, wz);
      for (const e of [-1, 1]) put(group, box(0.05, 0.5, 0.05), fr, wx + e * 0.27, wy, wz);
      put(group, box(0.04, 0.45, 0.04), fr, wx, wy, wz);
    }
  }
  // Vorderkastell (ab Brigg): erhöhtes Vordeck, das der Rumpfkurve folgt. Massiv und nicht begehbar (Kollision), mit Planken-Deck,
  // Reling, Goldleiste, Tür samt Laternen zum Hauptdeck und Buggeschützen oben – statt eines braunen Klotzes
  let fore: { z0: number; z1: number } | null = null;
  if (c.L > 20) {
    const f0 = c.L / 2 - c.L * 0.27, f1 = c.L / 2 - c.L * 0.1;
    fore = { z0: f0, z1: f1 };
    const fh = 0.9 + c.decks * 0.2;
    const fs = new Shape();
    for (let i = 0; i <= 6; i++) { const z = f0 + (i / 6) * (f1 - f0); const x = halfWidth(z) * 0.88; if (i === 0) fs.moveTo(x, -z); else fs.lineTo(x, -z); }
    for (let i = 6; i >= 0; i--) { const z = f0 + (i / 6) * (f1 - f0); fs.lineTo(-halfWidth(z) * 0.88, -z); }
    const foreBody = new Mesh(new ExtrudeGeometry(fs, { depth: fh, bevelEnabled: false }).rotateX(-Math.PI / 2), wood);
    foreBody.position.y = D;
    group.add(foreBody);
    // Deckplatte, etwas überstehend, mit Planken
    const foreTop = new Mesh(new ExtrudeGeometry(fs, { depth: 0.12, bevelEnabled: false }).rotateX(-Math.PI / 2), toon({ color: '#B58A5C', map: deckTex, unique: true, ...toonPbr(deckTex, { strength: 0.7, rough: 0.88, roughVar: 0.2, ao: 0.75 }, oak) }));
    foreTop.position.y = D + fh;
    foreTop.scale.set(1.05, 1, 1.01);
    group.add(foreTop);
    // Goldleiste unter der Deckplatte, Sockelleiste unten
    const ftr = new Shape();
    for (let i = 0; i <= 6; i++) { const z = f0 - 0.05 + (i / 6) * (f1 - f0 + 0.1); const x = halfWidth(z) * 0.88 * 1.04 + 0.03; if (i === 0) ftr.moveTo(x, -z); else ftr.lineTo(x, -z); }
    for (let i = 6; i >= 0; i--) { const z = f0 - 0.05 + (i / 6) * (f1 - f0 + 0.1); ftr.lineTo(-halfWidth(z) * 0.88 * 1.04 - 0.03, -z); }
    const foreTrim = new Mesh(new ExtrudeGeometry(ftr, { depth: 0.1, bevelEnabled: false }).rotateX(-Math.PI / 2), gold);
    foreTrim.position.y = D + fh * 0.72;
    group.add(foreTrim);
    const foreBase = new Mesh(new ExtrudeGeometry(ftr, { depth: 0.12, bevelEnabled: false }).rotateX(-Math.PI / 2), darkWood);
    foreBase.position.y = D;
    group.add(foreBase);
    // Reling oben: vorn und an den Seiten (hinten offen zur Optik, die Rückwand trägt die Tür)
    const ry = D + fh + 0.12;
    const zs = [f0 + 0.2, (f0 + f1) / 2, f1 - 0.15];
    const xAt = (z: number) => halfWidth(z) * 0.88 * 1.03;
    for (const sd of [-1, 1]) {
      for (let i = 0; i < zs.length - 1; i++) {
        const a0 = { x: sd * xAt(zs[i]), y: ry, z: zs[i] }, b0 = { x: sd * xAt(zs[i + 1]), y: ry, z: zs[i + 1] };
        railSeg(group, a0, b0, 0.78, 0.08, darkWood);
        railSeg(group, a0, b0, 0.4, 0.05, darkWood);
        for (const f of [0.35, 0.7]) put(group, cyl(0.022, 0.026, 0.34, 5), wood, a0.x + (b0.x - a0.x) * f, ry + 0.58, a0.z + (b0.z - a0.z) * f);
      }
      for (const z of zs) { put(group, box(0.07, 0.8, 0.07), wood, sd * xAt(z), ry + 0.4, z); put(group, cyl(0.05, 0.05, 0.05, 6), gold, sd * xAt(z), ry + 0.83, z); }
    }
    const zfr = zs[2], xfr = xAt(zfr);
    railSeg(group, { x: -xfr, y: ry, z: zfr }, { x: xfr, y: ry, z: zfr }, 0.78, 0.08, darkWood);
    railSeg(group, { x: -xfr, y: ry, z: zfr }, { x: xfr, y: ry, z: zfr }, 0.4, 0.05, darkWood);
    const mfr = Math.floor((2 * xfr) / 0.5);
    for (let i = 1; i < mfr; i++) put(group, cyl(0.022, 0.026, 0.34, 5), wood, -xfr + ((2 * xfr) * i) / mfr, ry + 0.58, zfr);
    // Rückwand zum Hauptdeck: Doppeltür mit Goldrahmen, Bullaugen und zwei Wandlaternen
    {
      const zw = f0 - 0.03;
      const dh = Math.min(fh * 0.8, 1.7), dw = Math.min(1.5, 0.8 + c.W * 0.03);
      put(group, box(dw, dh, 0.07), toon('#2B1A10'), 0, D + dh / 2, zw);
      put(group, box(0.03, dh - 0.08, 0.03), toon('#1B100A'), 0, D + dh / 2, zw - 0.05);
      const fr = toon({ color: '#E3B04B', spec: 0.9 });
      for (const e of [-1, 1]) put(group, box(0.09, dh + 0.1, 0.1), fr, e * (dw / 2 + 0.05), D + dh / 2 + 0.03, zw - 0.02);
      put(group, box(dw + 0.28, 0.12, 0.12), fr, 0, D + dh + 0.08, zw - 0.02);
      for (const e of [-1, 1]) {
        const px = e * (dw / 2 + 0.55 + c.W * 0.045);
        if (Math.abs(px) < xAt(f0) - 0.4) {
          put(group, cyl(0.2, 0.2, 0.06, 12), fr, px, D + fh * 0.5, zw - 0.02, Math.PI / 2, 0, 0);
          put(group, cyl(0.15, 0.15, 0.07, 12), toon('#1B2A3A'), px, D + fh * 0.5, zw - 0.03, Math.PI / 2, 0, 0);
        }
      }
    }
    // Buggeschütze oben (ab Korvette): zwei Drehgeschütze mit Zapfen nach vorn
    if (c.L >= 30) {
      const cu = COPPER(), ir = IRON();
      for (const sd of [-1, 1]) {
        const gz = f1 - 0.9, gx = sd * Math.min(halfWidth(gz) * 0.5, 1.6 + c.W * 0.06);
        put(group, cyl(0.1, 0.12, 0.5, 6), darkWood, gx, ry + 0.25, gz);
        const barrel = put(group, cyl(0.12, 0.17, 1.15, 10), cu, gx, ry + 0.58, gz + 0.35, Math.PI / 2, 0, 0);
        barrel.scale.setScalar(Math.min(1.2, sc * 0.7 + 0.4));
        put(group, cyl(0.19, 0.19, 0.06, 10), ir, gx, ry + 0.58, gz + 0.1, Math.PI / 2, 0, 0);
        put(group, box(0.5, 0.1, 0.4), ir, gx, ry + 0.52, gz + 0.1);
      }
    }
    block(0, (f0 + f1) / 2, c.L, (f1 - f0) / 2 + 0.05);
  }

  // Steuerrad
  const helm = new Vector3(0, D + castleH + 0.14, castleMid + sternLen * 0.15);
  const wheel = new Group();
  {
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

  // Masten, Rahen, Segel
  const sails: Mesh[] = [];
  // Flagge einmal malen: dieselbe Leinwand dient als Wappen auf dem Großsegel
  const flagTex = flagTexture(look.flag, look.flagColor);
  const emblem = flagTex.image as HTMLCanvasElement;
  const mainMast = c.masts.length > 1 ? 1 : 0;
  let sailSeed = 1;
  const rig: number[] = [];
  const mastTops: { z: number; h: number }[] = [];
  c.masts.forEach((mz, mi) => {
    const z = mz * c.L;
    const h = c.mh * (mi === 0 && c.masts.length > 1 ? 0.92 : mi === c.masts.length - 1 && c.masts.length > 2 ? 0.8 : 1);
    // Untermast und schlankere Stenge darüber (statt eines dicken Pfahls)
    const ms = Math.min(sc, 3.2);
    const lower = new Mesh(new CylinderGeometry(0.13 * ms, 0.19 * ms, h * 0.64, 10), darkWood);
    lower.position.set(0, D + h * 0.32, z);
    const upper = new Mesh(new CylinderGeometry(0.06 * ms, 0.1 * ms, h * 0.42, 8), darkWood);
    upper.position.set(0, D + h * 0.79, z);
    group.add(lower, upper);
    block(0, z, 0.19 * ms + 0.1, 0.19 * ms + 0.1);
    const nest = new Mesh(new CylinderGeometry(0.45 * Math.min(sc, 3), 0.35 * Math.min(sc, 3), 0.4, 10), wood);
    nest.position.set(0, D + h * 0.78, z);
    group.add(nest);
    // Mastkorb: Reling aus Ring, Pfosten und Handlauf, goldene Kugel an der Mastspitze (große Schiffe)
    if (c.L >= 24) {
      const ns = Math.min(sc, 3), top = D + h * 0.78 + 0.2;
      put(group, torus(0.5 * ns, 0.025, 14), darkWood, 0, top + 0.5, z, Math.PI / 2, 0, 0);
      put(group, torus(0.5 * ns, 0.02, 14), darkWood, 0, top + 0.22, z, Math.PI / 2, 0, 0);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; put(group, cyl(0.02, 0.02, 0.55, 4), wood, Math.cos(a) * 0.5 * ns, top + 0.27, Math.sin(a) * 0.5 * ns + z); }
      put(group, new SphereGeometry(0.11 * Math.min(sc, 2.4), 8, 6), gold, 0, D + h + 0.12, z);
    }
    const yards = c.L > 16 ? 3 : 2;
    for (let k = 0; k < yards; k++) {
      const y = D + h * (0.3 + k * 0.24);
      const w = c.W * (1.15 - k * 0.22);
      const yard = new Mesh(new CylinderGeometry(0.06 * Math.min(sc, 3), 0.06 * Math.min(sc, 3), w, 6), darkWood);
      yard.rotation.z = Math.PI / 2;
      yard.position.set(0, y + h * 0.2, z);
      group.add(yard);
      const sh = h * 0.235;
      const sg = new PlaneGeometry(w * 0.95, sh, 10, 6);
      const sp = sg.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const x = sp.getX(i), yy = sp.getY(i);
        // kräftig gebläht, unten etwas mehr Bauch
        sp.setZ(i, Math.cos((x / (w * 0.95)) * Math.PI) * 1.05 * sc * (1 - Math.abs(yy) / sh * 0.35) * (1.1 - (yy / sh + 0.5) * 0.3));
      }
      sg.computeVertexNormals();
      const baseZ = (sp.array as Float32Array).slice(); // Ausgangsform für Windbiegung in Ship.render
      const withEmblem = mi === mainMast && k === (yards > 2 ? 1 : 0);
      const sailMat = toon({ color: 0xffffff, side: DoubleSide, map: sailTexture(look.sail, withEmblem ? emblem : null, sailSeed++, true), unique: true, micro: 'cloth', roughness: 0.92 });
      sailMat.alphaTest = 0.5; // ausgefranste Ränder und Risse
      const sail = new Mesh(sg, sailMat);
      sail.userData.baseP = baseZ;
      sail.userData.sw = w * 0.95;
      sail.userData.sh = sh;
      sail.position.set(0, y + h * 0.1, z + 0.15);
      sail.userData.noOutline = true;
      sail.userData.base = sail.position.y;
      group.add(sail);
      sails.push(sail);
      // Takelage: Rah-Enden zur Bordwand
      for (const s of [-1, 1]) rig.push(s * w / 2, y + h * 0.2, z, s * halfWidth(z) * 0.95, D + 0.8, z - 1.5);
    }
    mastTops.push({ z, h });
    // Wimpel an der Mastspitze (steht nach achtern im Wind)
    {
      const pl = Math.min(3.2, 1.2 + c.L * 0.03), ph2 = pl * 0.22;
      const ps = new Shape();
      ps.moveTo(0, ph2 / 2); ps.lineTo(pl, 0); ps.lineTo(0, -ph2 / 2); ps.closePath();
      const pg = new ShapeGeometry(ps);
      pg.rotateY(Math.PI / 2);
      const pm = put(group, pg, toon({ color: look.flagColor, side: DoubleSide }), 0, D + h + 0.35, z);
      pm.userData.noOutline = true;
    }
    // Wanten vom Mast zur Bordwand, dazu Webleinen (Sprossen) zwischen den Wanten zum Aufentern
    for (const s of [-1, 1]) {
      for (let k = -1; k <= 1; k++) rig.push(0, D + h * 0.95, z, s * halfWidth(z + k) * 0.95, D + 0.8, z + k * 1.2);
      const bx = s * halfWidth(z) * 0.95;
      for (let t = 0.12; t < 0.62; t += 0.075) {
        // Punkt auf der vorderen und hinteren Want in Höhe t (0 = Bordwand, 1 = Mast)
        rig.push(bx * (1 - t), D + 0.8 + (h * 0.95 - 0.8) * t, z - 1.2 * (1 - t), bx * (1 - t), D + 0.8 + (h * 0.95 - 0.8) * t, z + 1.2 * (1 - t));
      }
    }
    // Rah-Hängetaue vom Mastkopf zu den Rahnocken
    for (let k = 0; k < yards; k++) for (const s of [-1, 1]) rig.push(0, D + h * 0.88, z, s * c.W * (1.15 - k * 0.22) / 2, D + h * (0.3 + k * 0.24) + h * 0.2, z);
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
  const jibMat = toon({ color: 0xffffff, side: DoubleSide, map: sailTexture(look.sail, null, 99, true), unique: true, micro: 'cloth', roughness: 0.92 });
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
  for (let i = 0; i < c.can; i++) {
    const z = c.can === 1 ? 0 : ((i / (c.can - 1)) - 0.5) * c.L * 0.55;
    for (const s of [-1, 1]) {
      const x = s * halfWidth(z);
      const cy = D - 0.7;
      put(group, cyl(0.16 * cs1, 0.2 * cs1, 1.1, 10), copper, x + s * 0.25, cy, z, 0, 0, Math.PI / 2);
      for (const bx of [-0.25, 0.2]) put(group, cyl(0.215 * cs1, 0.215 * cs1, 0.07, 10), iron, x + s * (0.25 + bx), cy, z, 0, 0, Math.PI / 2); // Eisenbänder
      put(group, cyl(0.22 * cs1, 0.17 * cs1, 0.12, 10), copper, x + s * 0.82, cy, z, 0, 0, Math.PI / 2); // Mündungswulst
      put(group, box(0.6, 0.16, 0.55), darkWood, x + s * 0.3, cy - 0.27, z); // Lafette
      put(group, box(0.06, 0.6, 0.7), toon('#1E1410'), x + s * 0.02, cy, z);
      portFrame(x, cy, z, s);
      (s > 0 ? muzzlesL : muzzlesR).push(new Vector3(x + s * 0.8, cy, z));
    }
  }

  // zweite (und dritte) Reihe Stückpforten bei mehrdeckigen Schiffen
  if (c.decks >= 2) {
    const portMat = toon('#1E1410'), lidMat = toon(look.stripe);
    for (let row = 1; row < c.decks; row++) {
      const y = D * (0.62 - row * 0.2);
      for (let i = 0; i < c.can + 1; i++) {
        const z = ((i / c.can) - 0.5) * c.L * 0.62;
        for (const s of [-1, 1]) {
          const x = s * halfWidth(z) * 1.0;
          const port = new Mesh(new BoxGeometry(0.06, 0.55, 0.65), portMat);
          port.position.set(x + s * 0.02, y, z);
          portFrame(x, y, z, s, 0.65, 0.55);
          const lid = new Mesh(new BoxGeometry(0.05, 0.12, 0.75), lidMat);
          lid.position.set(x + s * 0.05, y + 0.36, z);
          group.add(port, lid);
        }
      }
    }
  }

  // Laternen: Eisengehäuse mit Glas und Aufhängering; auf dem Spielerschiff wirft jede ein warmes Punktlicht
  const lanterns: Mesh[] = [];
  const lights: PointLight[] = [];
  const lampMat = new MeshBasicMaterial({ color: new Color(4, 2.4, 0.9) });
  const lampIron = IRON();
  if (look.lanterns) {
    const mainTop = mastTops[Math.min(mastTops.length - 1, c.masts.length > 1 ? 1 : 0)];
    const spots: number[][] = [[c.W * 0.35, D + castleH + 0.6, -c.L / 2 + 0.6], [-c.W * 0.35, D + castleH + 0.6, -c.L / 2 + 0.6], [0, bowTop + 0.7, bowZ - 1.4]];
    if (mainTop) spots.push([0, D + mainTop.h * 0.78 + 0.75, mainTop.z + 0.9]);
    for (const dl of doorLamps) spots.push(dl);
    // Lichtquellen: Heck (mittig) und Mastkorb
    const lightSpots = new Set<number[]>([spots[0], spots[spots.length - 1]]);
    for (const p of spots) {
      const ls = Math.min(1.5, sc);
      const l = new Mesh(new SphereGeometry(0.22 * ls, 10, 8), lampMat);
      l.position.set(p[0], p[1], p[2]);
      l.userData.noOutline = true;
      group.add(l);
      lanterns.push(l);
      // Gehäuse: Deckel, Boden, vier Streben, Haken
      const r = 0.27 * ls, hh = 0.34 * ls;
      put(group, cyl(r * 0.5, r * 1.05, 0.12 * ls, 8), lampIron, p[0], p[1] + hh + 0.06 * ls, p[2]);
      put(group, cyl(r * 0.95, r * 0.8, 0.1 * ls, 8), lampIron, p[0], p[1] - hh - 0.05 * ls, p[2]);
      for (let k = 0; k < 4; k++) {
        const a2 = (k / 4) * Math.PI * 2 + Math.PI / 4;
        put(group, box(0.035 * ls, hh * 2, 0.035 * ls), lampIron, p[0] + Math.cos(a2) * r * 0.92, p[1], p[2] + Math.sin(a2) * r * 0.92);
      }
      put(group, torus(0.1 * ls, 0.02 * ls, 8), lampIron, p[0], p[1] + hh + 0.22 * ls, p[2], 0, Math.PI / 2, 0);
      if (hero && lightSpots.has(p) && lights.length < 2) {
        // nur zwei Lichter (Heck, Mastkorb) – jedes Licht kostet jedes beleuchtete Pixel der Szene etwas
        const pl = new PointLight(0xffa24a, 0, 60 * Math.min(1.6, 0.7 + sc * 0.4), 1.4);
        pl.position.set(0, p[1] + 0.3, p[2]);
        pl.castShadow = false;
        group.add(pl);
        lights.push(pl);
      }
    }
  }

  // Deck-Ausstattung: Luke, Ankerwinde, Fässer, Kisten, Ankerkette und Anker – feste Positionen, damit jedes Schiff gleich aussieht
  {
    const iron = IRON();
    const kk = Math.min(1.6, 0.7 + sc * 0.35);
    const castleEnd = castleZ1 + 0.8;
    const foreStart = c.L > 20 ? c.L / 2 - c.L * 0.27 - 0.8 : c.L * 0.34;
    // Gitterluke mittschiffs
    const hz = (castleEnd + foreStart) / 2 - c.L * 0.02;
    const hs = 0.75 * kk;
    put(group, box(hs * 2.2, 0.16, hs * 2.2), darkWood, 0, D + 0.08, hz);
    block(0, hz, hs * 1.1, hs * 1.1);
    for (let i = -3; i <= 3; i++) put(group, box(0.05, 0.06, hs * 2), iron, i * hs * 0.3, D + 0.19, hz);
    for (let i = -3; i <= 3; i++) put(group, box(hs * 2, 0.06, 0.05), iron, 0, D + 0.17, hz + i * hs * 0.3);
    // Ankerwinde vorn
    const wz = Math.min(foreStart - 0.5, c.L * 0.3);
    put(group, cyl(0.28 * kk, 0.34 * kk, 0.7 * kk, 10), wood, 0, D + 0.35 * kk, wz);
    block(0, wz, 0.4 * kk, 0.4 * kk);
    for (let i = 0; i < 4; i++) put(group, box(1.5 * kk, 0.07, 0.07), darkWood, 0, D + 0.62 * kk, wz).rotation.y = (i / 4) * Math.PI;
    // Fässer und Kisten an den Bordwänden
    let seed = 5;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const barrelMat = toon({ color: '#6F4A2B', roughness: 0.85 });
    const crateMat = toon({ color: '#8A6840', roughness: 0.9 });
    const props = 3 + c.decks * 2 + Math.floor(c.L / 14);
    const zLo = castleEnd, zHi = Math.max(zLo + 1, foreStart - 0.3);
    for (let i = 0; i < props; i++) {
      const z = zLo + (i + 0.5) / props * (zHi - zLo) + (rnd() - 0.5) * 0.6;
      if (c.masts.some((m) => Math.abs(m * c.L - z) < 1.4)) continue;
      const sd = i % 2 ? 1 : -1;
      const x = sd * halfWidth(z) * (0.7 + rnd() * 0.12);
      if (rnd() < 0.55) {
        const br = 0.34 * kk, bh = 0.8 * kk;
        put(group, cyl(br * 0.92, br * 0.92, bh, 10), barrelMat, x, D + bh / 2, z);
        put(group, cyl(br * 1.06, br * 1.06, 0.05, 10), barrelMat, x, D + bh / 2, z);
        for (const hy of [0.18, 0.5, 0.82]) put(group, cyl(br * 1.08, br * 1.08, 0.05, 10), iron, x, D + bh * hy, z);
        block(x, z, br * 1.05, br * 1.05);
        if (rnd() < 0.4) { const bz = z + (rnd() - 0.5) * 0.3; put(group, cyl(br * 0.92, br * 0.92, bh, 10), barrelMat, x - sd * br * 1.9, D + bh / 2, bz); block(x - sd * br * 1.9, bz, br * 1.05, br * 1.05); }
      } else {
        const cw = (0.55 + rnd() * 0.25) * kk;
        put(group, box(cw, cw * 0.85, cw), crateMat, x, D + cw * 0.425, z, 0, rnd() * 0.5, 0);
        block(x, z, cw * 0.62, cw * 0.62);
        put(group, box(cw * 1.02, 0.05, cw * 1.02), iron, x, D + cw * 0.2, z);
        if (rnd() < 0.35) put(group, box(cw * 0.7, cw * 0.6, cw * 0.7), crateMat, x, D + cw * 0.85 + cw * 0.3, z, 0, rnd(), 0);
      }
    }
    // Ankerkette (Glieder) und Anker an der Steuerbord-Bugseite, aufgerollte Kette am Deck
    const az = c.L * 0.36;
    const ax = -(halfWidth(az) + 0.12);
    const links = 10;
    for (let i = 0; i < links; i++) {
      const lk = put(group, torus(0.11 * kk, 0.028 * kk, 8), iron, ax, D * 0.85 - i * 0.26 * kk, az, 0, i % 2 ? Math.PI / 2 : 0, 0);
      lk.scale.set(1, 1.5, 1);
    }
    const ay = D * 0.85 - links * 0.26 * kk - 0.5 * kk;
    put(group, cyl(0.06 * kk, 0.07 * kk, 1.5 * kk, 6), iron, ax, ay, az);
    put(group, box(0.9 * kk, 0.07 * kk, 0.07 * kk), iron, ax, ay + 0.6 * kk, az);
    const arms = put(group, torus(0.5 * kk, 0.06 * kk, 10, Math.PI), iron, ax, ay - 0.55 * kk, az, 0, 0, Math.PI);
    arms.rotation.y = Math.PI / 2;
    for (const e of [-1, 1]) put(group, cone(0.14 * kk, 0.3 * kk), iron, ax, ay - 0.35 * kk, az + e * 0.5 * kk, 0, 0, e * -0.6);
    const cz = c.L * 0.3;
    for (let i = 0; i < 4; i++) put(group, torus((0.3 - i * 0.04) * kk, 0.05 * kk, 8), iron, halfWidth(cz) * 0.55, D + 0.04 + i * 0.07, cz, Math.PI / 2, 0, 0);
  }

  // ---- Ausstattung großer Schiffe: Achterdeck, Masten, Geschütze, Beiboot, Heckgalerie ----
  if (c.L >= 24) {
    const iron = IRON(), cu = COPPER(), rp2 = ROPE();
    const chestMat = toon({ color: '#6A4426', roughness: 0.85 });
    const lampGlass = new MeshBasicMaterial({ color: new Color(1.5, 0.95, 0.42) });
    const skyGlass = toon({ color: '#7FB6CC', roughness: 0.2 });
    const qy = D + topY; // Oberfläche des Achterdecks
    const xr = (z: number) => halfWidth(z) * 0.9 * 1.04 - 0.3; // nutzbare halbe Breite auf dem Achterdeck
    const coil = (x: number, y: number, z: number, r = 0.26) => { for (let i = 0; i < 3; i++) put(group, torus(r - i * 0.015, 0.045, 10), rp2, x, y + 0.05 + i * 0.07, z, Math.PI / 2, 0, 0); };
    const brandX = c.L >= 70 ? 0 : xr(castleZ1) * 0.35;
    /** Karronade auf Lafette mit Rädern: Rohr zeigt nach außen (sd), y = Standfläche */
    const carr = (gx: number, gy: number, gz: number, sd: number) => {
      put(group, box(1.2, 0.28, 0.7), darkWood, gx, gy + 0.28, gz);
      for (const e of [-1, 1]) for (const f of [-0.38, 0.38]) put(group, cyl(0.2, 0.2, 0.1, 10), iron, gx + e * 0.38, gy + 0.2, gz + f, Math.PI / 2, 0, 0);
      put(group, cyl(0.15, 0.22, 1.4, 10), cu, gx + sd * 0.1, gy + 0.62, gz, 0, 0, Math.PI / 2);
      put(group, cyl(0.235, 0.235, 0.07, 10), iron, gx - sd * 0.25, gy + 0.62, gz, 0, 0, Math.PI / 2);
      put(group, cyl(0.25, 0.2, 0.14, 10), cu, gx + sd * 0.8, gy + 0.62, gz, 0, 0, Math.PI / 2);
      put(group, torus(0.22, 0.03, 8), rp2, gx - sd * 0.5, gy + 0.62, gz, 0, Math.PI / 2, 0);
      block(gx, gz, 0.8, 0.42);
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
      // Heckflagge: Fahnenstock mit Wappentuch
      const px = 0, pz = castleZ0 + 0.4;
      put(group, cyl(0.04, 0.05, 3.4 * Math.min(1.5, sc * 0.5 + 0.4), 6), wood, px, qy + 1.7 * Math.min(1.5, sc * 0.5 + 0.4), pz);
      put(group, new SphereGeometry(0.1, 8, 6), gold, px, qy + 3.45 * Math.min(1.5, sc * 0.5 + 0.4), pz);
      const ens = new Mesh(new PlaneGeometry(1.5 * Math.min(1.8, sc * 0.55), 0.95 * Math.min(1.8, sc * 0.55), 6, 1), new MeshBasicMaterial({ map: flagTex, side: DoubleSide }));
      ens.rotation.y = Math.PI / 2;
      ens.position.set(px, qy + 3.0 * Math.min(1.5, sc * 0.5 + 0.4), pz - 0.78 * Math.min(1.8, sc * 0.55));
      ens.userData.noOutline = true;
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
          for (const f of [0.22, 0.78]) { const gz2 = castleZ0 + sternLen * f; carr(sd * xr(gz2) * 0.9, qy, gz2, sd); }
          const bz2 = castleZ1 - 1.6, bx2 = sd * xr(bz2) * 0.9;
          const bm = toon({ color: '#6F4A2B', roughness: 0.85 });
          put(group, cyl(0.32, 0.32, 0.8, 10), bm, bx2, qy + 0.4, bz2);
          for (const hy of [0.18, 0.5, 0.82]) put(group, cyl(0.345, 0.345, 0.05, 10), iron, bx2, qy + 0.8 * hy, bz2);
          put(group, cyl(0.32, 0.32, 0.8, 10), bm, bx2 - sd * 0.7, qy + 0.4, bz2 + 0.2);
          block(bx2 - sd * 0.35, bz2 + 0.1, 0.8, 0.5);
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
      put(group, torus(rr, 0.045, 18), darkWood, 0, D + 0.85, m.z, Math.PI / 2, 0, 0);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        put(group, cyl(0.035, 0.04, 0.85, 5), wood, Math.cos(a) * rr, D + 0.42, Math.sin(a) * rr + m.z);
        // Belegnagel mit hängender Tauschlinge
        put(group, cyl(0.022, 0.022, 0.26, 5), gold, Math.cos(a) * rr * 1.0, D + 0.97, Math.sin(a) * rr + m.z);
        if (k % 2 === 0) put(group, torus(0.13, 0.025, 8), rp2, Math.cos(a) * rr, D + 0.6, Math.sin(a) * rr + m.z, 0, a, 0);
      }
      block(0, m.z, rr + 0.05, rr + 0.05);
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
      const per = Math.max(2, Math.floor(c.can * 0.7));
      for (let i = 0; i < per; i++) {
        const gz = castleZ1 + 3.5 + ((i + 0.5) / per) * (Math.max(castleZ1 + 8, (fore ? fore.z0 : c.L * 0.3) - 3) - castleZ1 - 3.5);
        for (const sd of [-1, 1]) {
          carr(sd * halfWidth(gz) * 0.48, D, gz, sd);
        }
      }
    }

    // Beiboot auf Böcken über der Luke (wo zwischen den Masten Platz ist)
    if (c.L >= 30) {
      const castleEnd = castleZ1 + 0.8, foreStart = fore ? fore.z0 - 0.8 : c.L * 0.34;
      const len = Math.min(5.2, c.L * 0.1 + 0.5), mid = (castleEnd + foreStart) / 2 - c.L * 0.02;
      let bz: number | null = null, best = 1e9;
      for (let z = castleEnd + len / 2 + 1; z <= foreStart - len / 2 - 1; z += 0.25) {
        if (mastTops.some((m) => Math.abs(m.z - z) < len / 2 + 1.5 + Math.min(sc, 3.2) * 0.3)) continue;
        if (Math.abs(z - mid) < best) { best = Math.abs(z - mid); bz = z; }
      }
      if (bz !== null) {
        const bw = len * 0.3, by = D + 1.0;
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
        for (const e of [-0.5, 0.5]) { put(group, box(bw * 1.4, 0.18, 0.2), darkWood, 0, D + 0.9, bz + e * len * 0.5); for (const s of [-1, 1]) put(group, box(0.14, 0.9, 0.14), darkWood, s * bw * 0.6, D + 0.45, bz + e * len * 0.5); }
        block(0, bz, bw + 0.2, len / 2 + 0.1);
      }
    }

    // Heckgalerie (ab Fregatte): Balkon unter den Heckfenstern mit Konsolen und gedrechselter Brüstung
    if (c.L >= 38) {
      const gw = Math.min(halfWidth(castleZ0) * 0.88, c.W * 0.34), gz0 = castleZ0 - 0.02, gd = 0.8, gy = D + castleH * 0.18;
      put(group, box(gw * 2 + 0.2, 0.12, gd), wood, 0, gy, gz0 - gd / 2);
      put(group, box(gw * 2 + 0.3, 0.07, gd + 0.1), gold, 0, gy - 0.09, gz0 - gd / 2);
      for (let k = -3; k <= 3; k++) put(group, cone(0.12, 0.45), darkWood, (k / 3) * gw * 0.92, gy - 0.3, gz0 - 0.1, Math.PI, 0, 0);
      const bpts = [{ x: -gw, z: gz0 }, { x: -gw, z: gz0 - gd }, { x: gw, z: gz0 - gd }, { x: gw, z: gz0 }];
      for (let i = 0; i < bpts.length - 1; i++) {
        const a0 = { x: bpts[i].x, y: gy + 0.06, z: bpts[i].z }, b0 = { x: bpts[i + 1].x, y: gy + 0.06, z: bpts[i + 1].z };
        railSeg(group, a0, b0, 0.85, 0.07, darkWood);
        railSeg(group, a0, b0, 0.18, 0.05, darkWood);
        const L2 = Math.hypot(b0.x - a0.x, b0.z - a0.z), nbal = Math.max(1, Math.floor(L2 / 0.26));
        for (let k = 1; k < nbal; k++) put(group, cyl(0.022, 0.028, 0.66, 5), wood, a0.x + ((b0.x - a0.x) * k) / nbal, gy + 0.5, a0.z + ((b0.z - a0.z) * k) / nbal);
      }
      for (const p of bpts) { put(group, box(0.09, 0.95, 0.09), wood, p.x, gy + 0.5, p.z); put(group, cyl(0.06, 0.06, 0.06, 6), gold, p.x, gy + 1.0, p.z); }
    }
  }

  // Flagge am höchsten Mast
  const top =c.masts.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a), c.masts[0]) * c.L;
  const flag = new Mesh(new PlaneGeometry(1.8 * Math.min(2, sc), 1.1 * Math.min(2, sc), 8, 1), new MeshBasicMaterial({ map: flagTex, side: DoubleSide }));
  flag.position.set(0, D + c.mh + 0.7, top - 1);
  flag.rotation.y = Math.PI / 2;
  flag.userData.noOutline = true;
  flag.userData.base = (flag.geometry.attributes.position as BufferAttribute).array.slice();
  group.add(flag);

  // Galionsfigur
  if (look.figurehead !== 'keine') {
    const fh = figurehead(look.figurehead, Math.min(2.2, 0.8 * sc));
    fh.position.set(0, bowTop - 0.1, bowZ + 0.15);
    group.add(fh);
  }

  if (transomWin) windows.push(transomWin);
  const keepSet = new Set<Mesh>([...sails, ...lanterns, ...windows, ...keepExtra, flag, deck]);
  wheel.traverse((o) => { if ((o as Mesh).isMesh) keepSet.add(o as Mesh); });
  mergeStatic(group, keepSet);
  group.traverse((o) => {
    if ((o as Mesh).isMesh && !o.userData.noOutline) { o.castShadow = true; o.receiveShadow = true; }
  });
  addOutlines(group);
  return { group, sails, muzzlesL, muzzlesR, lanterns, windows, flag, deckY: D, helm, wheel, quarter: { z0: castleZ0, z1: castleZ1, top: topY, stairX, stairW, stairLen, bulge }, fore, blockers, halfWidth, deckMat, deckBase, lights };
}

/** Feste Teile pro Material zu einem Mesh zusammenfassen (weniger Zeichenaufrufe) */
function mergeStatic(group: Group, keep: Set<Mesh>) {
  group.updateMatrixWorld(true);
  const buckets = new Map<object, { mat: any; geos: BufferGeometry[]; meshes: Mesh[] }>();
  group.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || keep.has(m)) return;
    const b = buckets.get(m.material as object) ?? { mat: m.material, geos: [], meshes: [] };
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g = g.applyMatrix4(m.matrixWorld);
    b.geos.push(g);
    b.meshes.push(m);
    buckets.set(m.material as object, b);
  });
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    for (const m of b.meshes) { m.removeFromParent(); disposeGeometry(m.geometry); }
    group.add(new Mesh(merged, b.mat));
  }
  // Leere Gruppen (Steuerrad, Galionsfigur) aufräumen
  for (const c of [...group.children]) if (!(c as Mesh).isMesh && !(c as PointLight).isLight && c.children.length === 0 && !(c as LineSegments).isLineSegments) c.removeFromParent();
}
