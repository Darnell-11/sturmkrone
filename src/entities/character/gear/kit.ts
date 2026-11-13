// Bausatz für starre Ausrüstungsteile (Schulterpanzer, Helme, Taschen …): kleine Formen-Funktionen und die Oberflächen.
// Alle Maße in Metern. Teile werden aus wenigen Grundformen zusammengesetzt und je Material zu einem Netz verschmolzen
// (ein Zeichenaufruf je Material).
import {
  BufferGeometry, Color, CylinderGeometry, DoubleSide, Euler, ExtrudeGeometry, Float32BufferAttribute, Group, LatheGeometry, Matrix4, Mesh, ConeGeometry,
  Quaternion, Shape, SphereGeometry, TorusGeometry, TubeGeometry, CatmullRomCurve3, Vector2, Vector3, OctahedronGeometry, BoxGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, type ToonOptions } from '../../../render/toon';
import type { Finish } from '../../../data/equipment';

/** Material einer Oberfläche (gecacht, geteilt). Farbe ist der Grundton. */
export function finishMat(finish: Finish, color: string | Color, extra: Partial<ToonOptions> = {}): Material {
  const base = { color, side: DoubleSide, rim: 0.9, ...extra } as ToonOptions;
  switch (finish) {
    case 'stahl': return toon({ ...base, surface: 'steel', spec: 1, metalness: 0.62, roughness: 0.4 });
    case 'dunkelstahl': return toon({ ...base, surface: 'steel', spec: 1, metalness: 0.55, roughness: 0.5 });
    case 'gold': return toon({ ...base, surface: 'steel', spec: 1, metalness: 0.8, roughness: 0.3 });
    case 'leder': return toon({ ...base, surface: 'leather', spec: 0.2 });
    case 'seide': return toon({ ...base, surface: 'cloth', spec: 0.35, roughness: 0.48 });
    case 'haut': return toon({ ...base, surface: 'skin' });
    // Haare: anisotroper Lichtband-Shader; Kopfmitte im Raum des Modells (Körpermaße, y oben): x 0, y 1,635, z −0,03
    case 'haar': return toon({ ...base, surface: 'hair', hairC: [0, 1.635, -0.03], rim: 0.7 });
    default: return toon({ ...base, surface: 'cloth' });
  }
}

/** Leuchtendes Material (Kristalle, Runen, Augen): überstrahlt und blüht im Bloom. Eigenes Material – wird mit dem Teil freigegeben. */
export function glowMat(color: string, power = 2.2): Material {
  const c = new Color(color);
  return toon({ color: c, emissive: new Color(c.r * power, c.g * power, c.b * power), surface: 'plain', unique: true, side: DoubleSide, rim: 0 });
}

const tmpM = new Matrix4(), tmpQ = new Quaternion(), tmpE = new Euler(), tmpV = new Vector3(), tmpS = new Vector3();

export interface Place { p?: [number, number, number]; r?: [number, number, number]; s?: number | [number, number, number] }

/** Geometrie verschieben, drehen, skalieren (ändert sie selbst) */
export function put<G extends BufferGeometry>(g: G, pl: Place = {}): G {
  tmpV.set(...(pl.p ?? [0, 0, 0]));
  tmpE.set(...(pl.r ?? [0, 0, 0]));
  tmpQ.setFromEuler(tmpE);
  const s = pl.s ?? 1;
  tmpS.set(...(typeof s === 'number' ? [s, s, s] as [number, number, number] : s));
  g.applyMatrix4(tmpM.compose(tmpV, tmpQ, tmpS));
  return g;
}

/** Mehrere Verschiebungen/Drehungen nacheinander anwenden (jede im Raum nach der vorigen) */
export function xf<G extends BufferGeometry>(g: G, ...steps: Place[]): G {
  for (const st of steps) put(g, st);
  return g;
}

/** Sammelt Formen je Material und baut daraus eine Gruppe mit einem Netz je Material */
export class Bag {
  private by = new Map<Material, BufferGeometry[]>();
  add(g: BufferGeometry, m: Material, pl?: Place) {
    if (pl) put(g, pl);
    const flat = g.index ? g.toNonIndexed() : g;
    // nur gemeinsame Attribute (Lage, Normale, UV) – sonst lässt sich nicht verschmelzen
    for (const k of Object.keys(flat.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') flat.deleteAttribute(k);
    if (!flat.attributes.uv) flat.setAttribute('uv', new Float32BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2));
    if (flat !== g) g.dispose();
    const l = this.by.get(m);
    if (l) l.push(flat); else this.by.set(m, [flat]);
    return this;
  }
  build(): Group {
    const out = new Group();
    for (const [m, list] of this.by) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new Mesh(merged, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      out.add(mesh);
    }
    this.by.clear();
    return out;
  }
}

// ---------- Formen ----------

/** Kugelschale (Ausschnitt): Radien je Achse, Winkelbereich. theta 0 = oben. */
export function dome(rx: number, ry: number, rz: number, th0 = 0, th1 = Math.PI / 2, ph0 = 0, ph1 = Math.PI * 2, seg = 20): BufferGeometry {
  const g = new SphereGeometry(1, seg, Math.max(6, Math.round(seg / 2)), ph0, ph1 - ph0, th0, th1 - th0);
  return put(g, { s: [rx, ry, rz] });
}

/** Drehkörper aus einem Profil [Radius, Höhe] von unten nach oben */
export function lathe(profile: [number, number][], seg = 24, ph0 = 0, ph1 = Math.PI * 2): BufferGeometry {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), seg, ph0, ph1 - ph0);
}

/** Röhre entlang einer Kurve durch die Punkte */
export function tube(pts: [number, number, number][], r: number, seg = 24, radial = 6, taper = false): BufferGeometry {
  const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(...p)));
  const g = new TubeGeometry(curve, seg, r, radial, false);
  if (taper) {
    // zur Spitze hin dünner
    const pos = g.attributes.position;
    const per = radial + 1;
    for (let i = 0; i < pos.count; i++) {
      const ring = Math.floor(i / per);
      const k = 1 - ring / seg;
      const t = curve.getPointAt(Math.min(1, ring / seg));
      pos.setXYZ(i, t.x + (pos.getX(i) - t.x) * Math.max(0.08, k), t.y + (pos.getY(i) - t.y) * Math.max(0.08, k), t.z + (pos.getZ(i) - t.z) * Math.max(0.08, k));
    }
    g.computeVertexNormals();
  }
  return g;
}

export const cone = (r: number, h: number, seg = 8) => new ConeGeometry(r, h, seg);
export const ring = (r: number, tube: number, seg = 28, arc = Math.PI * 2) => new TorusGeometry(r, tube, 6, seg, arc);
export const ball = (r: number, seg = 10) => new SphereGeometry(r, seg, Math.max(5, seg - 3));
export const cyl = (rt: number, rb: number, h: number, seg = 12) => new CylinderGeometry(rt, rb, h, seg);
export const gem = (r: number) => new OctahedronGeometry(r, 0);
export const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);

/** Flache Platte mit Umriss (x, y) und Dicke in z, leicht abgeschrägt – für Flügel, Kämme, Wappen */
export function plate(outline: [number, number][], depth = 0.006, bevel = 0.0015): BufferGeometry {
  const sh = new Shape();
  outline.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const g = new ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Glatte Kurve durch Umrisspunkte (Chaikin), damit Flügel und Kämme nicht eckig wirken */
export function smoothOutline(pts: [number, number][], rounds = 2): [number, number][] {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    const q: [number, number][] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = q;
  }
  return p;
}

/** Zufall mit Startwert (damit ein Teil immer gleich aussieht) */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** Farbe heller (k > 0) oder dunkler (k < 0) */
export function shade(hex: string, k: number): string {
  const c = new Color(hex);
  if (k >= 0) c.lerp(new Color('#ffffff'), k); else c.lerp(new Color('#000000'), -k);
  return `#${c.getHexString()}`;
}
