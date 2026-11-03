import {
  BoxGeometry,
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
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { FigureheadId, FlagId, ShipClass, ShipLook } from '../../data/ships';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutlines } from '../../render/outline';
import { plankTexture, sailTexture } from '../../render/textures';
import { toon } from '../../render/toon';

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
  /** Halbe Breite an Position z (für Treffer und Löcher) */
  halfWidth(z: number): number;
}

/** Breite des Rumpfs entlang der Länge: vorn spitz, hinten breit */
function widthAt(t: number): number {
  // t: −1 Heck … +1 Bug
  if (t > 0.35) return Math.cos(((t - 0.35) / 0.65) * Math.PI * 0.5) ** 0.8;
  if (t < -0.8) return 0.82 + (t + 1) * 0.9;
  return 1;
}

function hullGeometry(c: ShipClass, D: number, look: ShipLook): BufferGeometry {
  const sections = 22;
  const prof = [[-1, D], [-0.98, D * 0.55], [-0.88, D * 0.1], [-0.62, -0.55], [-0.25, -0.95], [0, -1.05], [0.25, -0.95], [0.62, -0.55], [0.88, D * 0.1], [0.98, D * 0.55], [1, D]];
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const hull = new Color(look.hull), stripe = new Color(look.stripe), bottom = new Color('#B8653A'), dark = new Color(look.hull).multiplyScalar(0.55);
  const ring = (i: number) => {
    const t = (i / sections) * 2 - 1;
    const z = t * c.L / 2;
    const w = Math.max(0.04, widthAt(t)) * c.W / 2;
    const rise = t > 0.6 ? (t - 0.6) * 1.6 : t < -0.85 ? (-0.85 - t) * 2 : 0;
    return prof.map(([px, py]) => new Vector3(px * w, py * (1 - Math.max(0, t - 0.8) * 1.5) + (py > 0.5 ? rise : rise * 0.3), z));
  };
  const colorFor = (y: number, i: number) => {
    if (y < 0.05) return bottom;
    if (Math.abs(y - (D - 0.7)) < 0.32) return stripe;
    return (i % 4 === 0) ? dark : hull;
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
        col.push(cc.r, cc.g, cc.b);
      }
    }
  }
  // Heckspiegel
  const st = ring(0);
  for (let k = 1; k < st.length - 2; k++) {
    // beide Seiten, damit der Heckspiegel von hinten nie fehlt
    for (const p of [st[0], st[k + 1], st[k], st[0], st[k], st[k + 1]]) { pos.push(p.x, p.y, p.z); col.push(dark.r, dark.g, dark.b); uv.push(p.x / 3, p.y * 0.35); }
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

/** Baut ein Schiff einer Klasse im eigenen Look. Bug zeigt nach +Z. */
export function buildShip(c: ShipClass, look: ShipLook): ShipModel {
  const group = new Group();
  const D = 1.4 + c.decks * 0.75;
  const sc = c.L / 15;
  const halfWidth = (z: number) => Math.max(0.05, widthAt(z / (c.L / 2))) * c.W / 2;

  const planksTex = plankTexture();
  const hullMat = toon({ color: 0xffffff, vertexColors: true, map: planksTex });
  const hull = new Mesh(hullGeometry(c, D, look), hullMat);
  group.add(hull);

  // Deck
  const deckShape = new Shape();
  const N = 24;
  for (let i = 0; i <= N; i++) { const z = ((i / N) * 2 - 1) * c.L / 2 * 0.98; const w = halfWidth(z) * 0.95; i === 0 ? deckShape.moveTo(w, z) : deckShape.lineTo(w, z); }
  for (let i = N; i >= 0; i--) { const z = ((i / N) * 2 - 1) * c.L / 2 * 0.98; deckShape.lineTo(-halfWidth(z) * 0.95, z); }
  const deckGeo = new ShapeGeometry(deckShape).rotateX(Math.PI / 2);
  const deckTex = planksTex.clone();
  deckTex.center.set(0.5, 0.5);
  deckTex.rotation = Math.PI / 2;
  deckTex.repeat.set(0.35, 0.35);
  deckTex.needsUpdate = true;
  const deck = new Mesh(deckGeo, toon({ color: '#C79A68', side: DoubleSide, map: deckTex }));
  deck.position.y = D - 0.05;
  deck.userData.noOutline = true;
  group.add(deck);
  const wood = toon({ color: '#7A5030', map: planksTex });
  const darkWood = toon('#4A2E1A');
  const gold = toon({ color: '#E3B04B', spec: 0.9 });
  // Reling
  for (const s of [-1, 1]) {
    for (let i = 0; i < 16; i++) {
      const z0 = ((i / 16) * 1.9 - 0.95) * c.L / 2, z1 = (((i + 1) / 16) * 1.9 - 0.95) * c.L / 2;
      const x0 = s * halfWidth(z0) * 0.97, x1 = s * halfWidth(z1) * 0.97;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const rail = new Mesh(new BoxGeometry(0.12, 0.12, len), gold);
      rail.position.set((x0 + x1) / 2, D + 0.85, (z0 + z1) / 2);
      rail.rotation.y = Math.atan2(x1 - x0, z1 - z0);
      group.add(rail);
      const post = new Mesh(new BoxGeometry(0.1, 0.85, 0.1), wood);
      post.position.set(x0, D + 0.42, z0);
      group.add(post);
    }
  }
  // Achterkastell mit Fenstern
  const windows: Mesh[] = [];
  const sternLen = c.L * 0.22;
  const castleH = 1.2 + c.decks * 0.5;
  const castle = new Mesh(new BoxGeometry(c.W * 0.82, castleH, sternLen), wood);
  castle.position.set(0, D + castleH / 2, -c.L / 2 + sternLen / 2 + c.L * 0.03);
  group.add(castle);
  const castleTop = new Mesh(new BoxGeometry(c.W * 0.86, 0.15, sternLen * 1.04), toon({ color: '#C79A68', map: deckTex }));
  castleTop.position.set(0, D + castleH, castle.position.z);
  group.add(castleTop);
  const winMat = new MeshBasicMaterial({ color: new Color(2.4, 1.6, 0.6) });
  for (let i = 0; i < c.decks + 2; i++) {
    const w = new Mesh(new PlaneGeometry(0.5, 0.45), winMat);
    w.position.set((i - (c.decks + 1) / 2) * (c.W * 0.7 / (c.decks + 2)), D + castleH * 0.55, castle.position.z - sternLen / 2 - 0.01);
    w.rotation.y = Math.PI;
    w.userData.noOutline = true;
    group.add(w);
    windows.push(w);
  }
  if (c.decks >= 2) {
    const fore = new Mesh(new BoxGeometry(c.W * 0.6, 0.9, c.L * 0.14), wood);
    fore.position.set(0, D + 0.45, c.L / 2 - c.L * 0.2);
    group.add(fore);
  }

  // Steuerrad
  const helm = new Vector3(0, D + castleH, castle.position.z + sternLen * 0.15);
  const wheel = new Group();
  const ring = new Mesh(new TorusGeometry(0.45, 0.05, 6, 16), wood);
  wheel.add(ring);
  for (let i = 0; i < 4; i++) { const sp = new Mesh(new BoxGeometry(1.15, 0.05, 0.05), wood); sp.rotation.z = (i / 4) * Math.PI; wheel.add(sp); }
  wheel.position.set(0, helm.y + 1.0, helm.z + 0.8);
  const stand = new Mesh(new BoxGeometry(0.15, 1, 0.15), darkWood);
  stand.position.set(0, helm.y + 0.5, helm.z + 0.85);
  group.add(wheel, stand);

  // Masten, Rahen, Segel
  const sails: Mesh[] = [];
  const emblem = flagTexture(look.flag, look.flagColor).image as HTMLCanvasElement;
  const mainMast = c.masts.length > 1 ? 1 : 0;
  let sailSeed = 1;
  const rig: number[] = [];
  c.masts.forEach((mz, mi) => {
    const z = mz * c.L;
    const h = c.mh * (mi === 0 && c.masts.length > 1 ? 0.92 : mi === c.masts.length - 1 && c.masts.length > 2 ? 0.8 : 1);
    const mast = new Mesh(new CylinderGeometry(0.12 * sc, 0.2 * sc, h, 8), darkWood);
    mast.position.set(0, D + h / 2, z);
    group.add(mast);
    const nest = new Mesh(new CylinderGeometry(0.45 * sc, 0.35 * sc, 0.4, 10), wood);
    nest.position.set(0, D + h * 0.78, z);
    group.add(nest);
    const yards = c.L > 16 ? 3 : 2;
    for (let k = 0; k < yards; k++) {
      const y = D + h * (0.3 + k * 0.24);
      const w = c.W * (1.15 - k * 0.22);
      const yard = new Mesh(new CylinderGeometry(0.06 * sc, 0.06 * sc, w, 6), darkWood);
      yard.rotation.z = Math.PI / 2;
      yard.position.set(0, y + h * 0.2, z);
      group.add(yard);
      const sh = h * 0.235;
      const sg = new PlaneGeometry(w * 0.95, sh, 6, 4);
      const sp = sg.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const x = sp.getX(i), yy = sp.getY(i);
        // kräftig gebläht, unten etwas mehr Bauch
        sp.setZ(i, Math.cos((x / (w * 0.95)) * Math.PI) * 1.05 * sc * (1 - Math.abs(yy) / sh * 0.35) * (1.1 - (yy / sh + 0.5) * 0.3));
      }
      sg.computeVertexNormals();
      const withEmblem = mi === mainMast && k === (yards > 2 ? 1 : 0);
      const sail = new Mesh(sg, toon({ color: 0xffffff, side: DoubleSide, map: sailTexture(look.sail, withEmblem ? emblem : null, sailSeed++) }).clone());
      sail.position.set(0, y + h * 0.1, z + 0.15);
      sail.userData.noOutline = true;
      sail.userData.base = sail.position.y;
      group.add(sail);
      sails.push(sail);
      // Takelage: Rah-Enden zur Bordwand
      for (const s of [-1, 1]) rig.push(s * w / 2, y + h * 0.2, z, s * halfWidth(z) * 0.95, D + 0.8, z - 1.5);
    }
    // Wanten vom Mast zur Bordwand
    for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) rig.push(0, D + h * 0.95, z, s * halfWidth(z + k) * 0.95, D + 0.8, z + k * 1.2);
  });
  // Klüver (Dreieckssegel am Bug)
  const bowZ = c.L / 2;
  const jibShape = new Shape();
  jibShape.moveTo(0, 0); jibShape.lineTo(0, c.mh * 0.6); jibShape.lineTo(c.L * 0.22, 0); jibShape.closePath();
  const jibGeo = new ShapeGeometry(jibShape);
  // Tuch-Textur über die Dreiecksfläche legen
  const juv = jibGeo.attributes.uv;
  for (let i = 0; i < juv.count; i++) juv.setXY(i, juv.getX(i) / (c.L * 0.22), juv.getY(i) / (c.mh * 0.6));
  const jib = new Mesh(jibGeo, toon({ color: 0xffffff, side: DoubleSide, map: sailTexture(look.sail, null, 99) }).clone());
  jib.rotation.y = -Math.PI / 2;
  jib.position.set(0, D + 1, c.masts[0] * c.L + 1);
  jib.userData.noOutline = true;
  jib.userData.base = jib.position.y;
  group.add(jib);
  sails.push(jib);
  const bowsprit = new Mesh(new CylinderGeometry(0.08 * sc, 0.12 * sc, c.L * 0.25, 6), darkWood);
  bowsprit.rotation.x = Math.PI / 2 - 0.25;
  bowsprit.position.set(0, D + 0.6, bowZ + c.L * 0.08);
  group.add(bowsprit);
  rig.push(0, D + c.mh * 0.95, c.masts[0] * c.L, 0, D + 1.2, bowZ + c.L * 0.18);
  const rigging = new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(rig, 3)), new LineBasicMaterial({ color: '#2A1E14' }));
  group.add(rigging);

  // Kanonen
  const muzzlesL: Vector3[] = [], muzzlesR: Vector3[] = [];
  const canMat = toon({ color: '#2A2A30', spec: 1 });
  for (let i = 0; i < c.can; i++) {
    const z = c.can === 1 ? 0 : ((i / (c.can - 1)) - 0.5) * c.L * 0.55;
    for (const s of [-1, 1]) {
      const x = s * halfWidth(z);
      const cannon = new Mesh(new CylinderGeometry(0.16 * Math.min(1.4, sc), 0.2 * Math.min(1.4, sc), 1.1, 8), canMat);
      cannon.rotation.z = Math.PI / 2;
      cannon.position.set(x + s * 0.25, D - 0.7, z);
      group.add(cannon);
      const port = new Mesh(new BoxGeometry(0.06, 0.6, 0.7), toon('#1E1410'));
      port.position.set(x + s * 0.02, D - 0.7, z);
      group.add(port);
      (s > 0 ? muzzlesL : muzzlesR).push(new Vector3(x + s * 0.8, D - 0.7, z));
    }
  }

  // Laternen
  const lanterns: Mesh[] = [];
  const lampMat = new MeshBasicMaterial({ color: new Color(4, 2.4, 0.9) });
  if (look.lanterns) {
    for (const p of [[c.W * 0.35, D + castleH + 0.6, -c.L / 2 + 0.6], [-c.W * 0.35, D + castleH + 0.6, -c.L / 2 + 0.6], [0, D + 1.4, bowZ - 1]]) {
      const l = new Mesh(new SphereGeometry(0.22 * Math.min(1.5, sc), 10, 8), lampMat);
      l.position.set(p[0], p[1], p[2]);
      l.userData.noOutline = true;
      group.add(l);
      lanterns.push(l);
    }
  }

  // Flagge am höchsten Mast
  const top = c.masts.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a), c.masts[0]) * c.L;
  const flag = new Mesh(new PlaneGeometry(1.8 * Math.min(2, sc), 1.1 * Math.min(2, sc), 8, 1), new MeshBasicMaterial({ map: flagTexture(look.flag, look.flagColor), side: DoubleSide }));
  flag.position.set(0, D + c.mh + 0.7, top - 1);
  flag.rotation.y = Math.PI / 2;
  flag.userData.noOutline = true;
  flag.userData.base = (flag.geometry.attributes.position as BufferAttribute).array.slice();
  group.add(flag);

  // Galionsfigur
  if (look.figurehead !== 'keine') {
    const fh = figurehead(look.figurehead, Math.min(2.2, 0.8 * sc));
    fh.position.set(0, D + 0.2, bowZ + 0.2);
    group.add(fh);
  }

  mergeStatic(group, new Set<Mesh>([...sails, ...lanterns, ...windows, flag, deck]));
  group.traverse((o) => {
    if ((o as Mesh).isMesh && !o.userData.noOutline) { o.castShadow = true; o.receiveShadow = true; }
  });
  addOutlines(group);
  return { group, sails, muzzlesL, muzzlesR, lanterns, windows, flag, deckY: D, helm, halfWidth };
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
    for (const m of b.meshes) m.removeFromParent();
    group.add(new Mesh(merged, b.mat));
  }
  // Leere Gruppen (Steuerrad, Galionsfigur) aufräumen
  for (const c of [...group.children]) if (!(c as Mesh).isMesh && c.children.length === 0 && !(c as LineSegments).isLineSegments) c.removeFromParent();
}
