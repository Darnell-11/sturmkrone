import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, Shape, ShapeGeometry } from 'three';
import { addOutlines } from '../render/outline';
import { toon } from '../render/toon';

/**
 * Delfin aus einem glatten Körper (Schnabel, Melone, Rumpf, Schwanzstiel) mit Rückenflosse, Brustflossen und Fluke.
 * Der Körper schlängelt sich vertikal wie bei echten Delfinen (Welle läuft von der Nase zum Schwanz), die Fluke
 * folgt der Neigung des Schwanzstiels. Grau oben, hell am Bauch (Vertexfarben).
 */
const RINGS = 28;
const SEG = 14;
const LEN = 2.5;
/** Anteil der Länge (0 Nase … 1 Schwanz) und Radius in m */
const PROFILE: [number, number][] = [[0, 0], [0.03, 0.045], [0.1, 0.065], [0.17, 0.1], [0.24, 0.19], [0.34, 0.265], [0.5, 0.295], [0.66, 0.235], [0.8, 0.14], [0.92, 0.075], [1, 0.055]];

function radiusAt(s: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    if (s <= PROFILE[i][0]) {
      const [s0, r0] = PROFILE[i - 1], [s1, r1] = PROFILE[i];
      const u = (s - s0) / (s1 - s0);
      return r0 + (r1 - r0) * (u * u * (3 - 2 * u));
    }
  }
  return PROFILE[PROFILE.length - 1][1];
}

const TOP = [0.36, 0.46, 0.55];
const BELLY = [0.9, 0.93, 0.94];

export class DolphinModel {
  readonly group = new Group();
  private geo = new BufferGeometry();
  private base: Float32Array;
  private pos: BufferAttribute;
  private fluke = new Group();

  constructor() {
    const n = (RINGS + 1) * SEG;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i <= RINGS; i++) {
      const s = i / RINGS;
      const r = radiusAt(s);
      for (let j = 0; j < SEG; j++) {
        const a = (j / SEG) * Math.PI * 2;
        const o = (i * SEG + j) * 3;
        const sy = Math.sin(a);
        pos[o] = Math.cos(a) * r * 0.92;
        pos[o + 1] = sy * r;
        pos[o + 2] = LEN / 2 - LEN * s;
        // Rücken grau, Bauch hell, weicher Übergang an der Flanke
        const k = Math.min(1, Math.max(0, (0.15 - sy) / 0.55));
        const m = k * k * (3 - 2 * k);
        for (let c = 0; c < 3; c++) col[o + c] = TOP[c] + (BELLY[c] - TOP[c]) * m;
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SEG; j++) {
        const a = i * SEG + j, b = i * SEG + ((j + 1) % SEG), c = (i + 1) * SEG + j, d = (i + 1) * SEG + ((j + 1) % SEG);
        idx.push(a, c, b, b, c, d);
      }
    }
    this.base = pos.slice();
    this.pos = new BufferAttribute(pos, 3);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('color', new BufferAttribute(col, 3));
    this.geo.setIndex(idx);
    this.geo.computeVertexNormals();

    const body = new Mesh(this.geo, toon({ color: '#ffffff', vertexColors: true, spec: 0.5 }));
    body.frustumCulled = false;
    this.group.add(body);
    addOutlines(this.group);

    const finMat = toon({ color: '#3F5568', side: DoubleSide });
    // Rückenflosse: sichelförmig nach hinten gebogen (Form in der Länge/Höhe-Ebene)
    const dorsal = new Shape();
    dorsal.moveTo(0.26, 0);
    dorsal.quadraticCurveTo(0.08, 0.2, -0.1, 0.3);
    dorsal.quadraticCurveTo(-0.12, 0.12, -0.34, 0);
    dorsal.closePath();
    const dg = new ShapeGeometry(dorsal, 6);
    dg.rotateY(-Math.PI / 2);
    const dm = new Mesh(dg, finMat);
    dm.position.set(0, 0.27, -0.12);
    dm.userData.noOutline = true;
    // Brustflossen: spitz nach hinten außen
    const pect = new Shape();
    pect.moveTo(0, 0.05);
    pect.quadraticCurveTo(0.2, 0.05, 0.42, -0.2);
    pect.quadraticCurveTo(0.2, -0.06, 0, -0.14);
    pect.closePath();
    for (const side of [-1, 1]) {
      const pg = new ShapeGeometry(pect, 5);
      pg.rotateX(-Math.PI / 2);
      if (side < 0) pg.scale(-1, 1, 1);
      const pm = new Mesh(pg, finMat);
      pm.position.set(side * 0.2, -0.1, 0.38);
      pm.rotation.z = -side * 0.35;
      pm.userData.noOutline = true;
      this.group.add(pm);
    }
    // Fluke: waagerechte Schwanzflosse in Sichelform
    const fl = new Shape();
    const pts: [number, number][] = [[0, -0.02], [0.2, 0.02], [0.44, -0.16], [0.62, -0.33], [0.4, -0.29], [0.17, -0.2], [0, -0.23], [-0.17, -0.2], [-0.4, -0.29], [-0.62, -0.33], [-0.44, -0.16], [-0.2, 0.02]];
    fl.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) fl.lineTo(pts[i][0], pts[i][1]);
    fl.closePath();
    const fg = new ShapeGeometry(fl);
    fg.rotateX(-Math.PI / 2);
    const fm = new Mesh(fg, finMat);
    fm.userData.noOutline = true;
    this.fluke.add(fm);
    this.fluke.position.set(0, 0, -LEN / 2 + 0.02);
    this.group.add(dm, this.fluke);
    this.group.visible = false;
  }

  /** Schwimmbewegung: t = Zeit in s, amp = Schlagstärke 0 … 1 (beim Sprung stark) */
  swim(t: number, amp: number) {
    const p = this.pos.array as Float32Array;
    const a = 0.2 * amp;
    for (let i = 0; i <= RINGS; i++) {
      const s = i / RINGS;
      const w = 0.04 + 0.96 * s * s;
      const dy = a * w * Math.sin(t * 8 - s * 5.2);
      for (let j = 0; j < SEG; j++) { const o = (i * SEG + j) * 3; p[o + 1] = this.base[o + 1] + dy; }
    }
    this.pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    const on = this.geo.getAttribute('outlineNormal') as BufferAttribute | undefined;
    if (on) { (on.array as Float32Array).set((this.geo.getAttribute('normal').array as Float32Array)); on.needsUpdate = true; }
    // Fluke am Schwanzende: folgt Höhe und Neigung der Welle
    const dyT = a * Math.sin(t * 8 - 5.2);
    const slope = a * Math.cos(t * 8 - 5.2) * 5.2 / (LEN);
    this.fluke.position.y = dyT;
    this.fluke.rotation.x = Math.atan(slope) + 0.12 * Math.sin(t * 8 - 5.2 - 0.9) * amp;
  }
}
