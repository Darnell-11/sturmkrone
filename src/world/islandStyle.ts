import { CanvasTexture, CatmullRomCurve3, CircleGeometry, LatheGeometry, Shape, ShapeGeometry, Sprite, SpriteMaterial, SRGBColorSpace, TorusGeometry, TubeGeometry, Vector2, Vector3, Box3 } from 'three';
import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, Mesh, MeshBasicMaterial, OctahedronGeometry, SphereGeometry, type Material, type MeshToonMaterial } from 'three';
import type { IslandStyle } from '../data/regions';
import { coastK, hillProfile } from './islandGround';
import { toon } from '../render/toon';
import { deckUV, plankTexture } from '../render/textures';
import { toonPbr } from '../render/pbrMaps';
import { markWind, windify } from '../render/wind';

/** Farben und Pflanzen je Region */
export interface StyleKit {
  sand: Material;
  grass: Material;
  /** Flache Wiese auf dem Strandplateau (liegt 2 cm über dem Sand: eigene Tiefenschicht gegen Flimmern in der Ferne) */
  grassCap: Material;
  rock: Material;
  trunk: Material;
  leaf: Material;
  extra: Material | null;
  flora: 'palme' | 'tot' | 'kiefer' | 'kristall';
  rockScale: number;
}

const cache = new Map<IslandStyle, StyleKit>();

export function styleKit(style: IslandStyle): StyleKit {
  const hit = cache.get(style);
  if (hit) return hit;
  let k: Omit<StyleKit, 'grassCap'>;
  const glow = (c: Color) => new MeshBasicMaterial({ color: c });
  switch (style) {
    case 'nebel': k = { sand: toon({ color: 0xc9c2a8, detail: 'sand', rim: 0.1, puddles: 0.75 }), grass: toon({ color: 0x7d8f6a, detail: 'grass', rim: 0.35, puddles: 0.45 }), rock: toon({ color: 0x7a7e80, flatShading: true, detail: 'rock' }), trunk: toon(0x5a4a3a), leaf: toon({ color: 0x6a7a5a, flatShading: true }), extra: null, flora: 'tot', rockScale: 1.1 }; break;
    case 'nord': k = { sand: toon({ color: 0xd8d2c0, detail: 'sand', rim: 0.1, puddles: 0.75 }), grass: toon({ color: 0x4f8a52, detail: 'grass', rim: 0.35, puddles: 0.45 }), rock: toon({ color: 0x8a8f96, flatShading: true, detail: 'rock' }), trunk: toon(0x6a4a2b), leaf: toon({ color: 0x2f6a44, flatShading: true }), extra: null, flora: 'kiefer', rockScale: 1 }; break;
    case 'glut': k = { sand: toon({ color: 0x4a3c38, detail: 'sand', rim: 0.1, puddles: 0.75 }), grass: toon({ color: 0x6a5048, detail: 'grass', rim: 0.35, puddles: 0.45 }), rock: toon({ color: 0x2e2626, flatShading: true, detail: 'rock' }), trunk: toon(0x2a2020), leaf: toon({ color: 0x3a2e2a, flatShading: true }), extra: glow(new Color(5, 1.4, 0.25)), flora: 'tot', rockScale: 1.3 }; break;
    case 'sturm': k = { sand: toon({ color: 0xb8b4a8, detail: 'sand', rim: 0.1, puddles: 0.75 }), grass: toon({ color: 0x5a7a6a, detail: 'grass', rim: 0.35, puddles: 0.45 }), rock: toon({ color: 0x5a6070, flatShading: true, detail: 'rock' }), trunk: toon(0x4a3a2a), leaf: toon({ color: 0x3e5e4e, flatShading: true }), extra: null, flora: 'kiefer', rockScale: 1.7 }; break;
    case 'schlund': k = { sand: toon({ color: 0x8a86a0, detail: 'sand', rim: 0.1, puddles: 0.75 }), grass: toon({ color: 0x5a4a8a, detail: 'grass', rim: 0.35, puddles: 0.45 }), rock: toon({ color: 0x3a3450, flatShading: true, detail: 'rock' }), trunk: toon(0x3a3048), leaf: toon({ color: 0x4a3a6a, flatShading: true }), extra: glow(new Color(1.2, 2.6, 4.5)), flora: 'kristall', rockScale: 1.2 }; break;
    // Festland: fette Weiden, heller Kiesstrand, graue Feldsteine
    case 'festland': k = { sand: toon({ color: 0xcfc09a, detail: 'sand', rim: 0.1, puddles: 0.75 }), grass: toon({ color: 0x5e9648, detail: 'grass', rim: 0.35, puddles: 0.45 }), rock: toon({ color: 0x8a857a, flatShading: true, detail: 'rock' }), trunk: toon(0x5e4630), leaf: toon({ color: 0x3f7a38, flatShading: true }), extra: null, flora: 'palme', rockScale: 1 }; break;
    // Sturmklippe: dunkler Basaltkies, karges Moos, schwarzer Fels
    case 'klippe': k = { sand: toon({ color: 0x66666c, detail: 'sand', rim: 0.1, puddles: 0.8 }), grass: toon({ color: 0x5c6c52, detail: 'grass', rim: 0.35, puddles: 0.5 }), rock: toon({ color: 0x3a3c42, flatShading: true, detail: 'rock' }), trunk: toon(0x3e342c), leaf: toon({ color: 0x2e4e3e, flatShading: true }), extra: null, flora: 'kiefer', rockScale: 1.5 }; break;
    // gedämpftes, satteres Grün statt Knallgrün, sonnengebleichter Sand
    default: k = { sand: toon({ color: 0xdcc392, detail: 'sand', rim: 0.1, puddles: 0.75 }), grass: toon({ color: 0x55894a, detail: 'grass', rim: 0.35, puddles: 0.45 }), rock: toon({ color: 0x7a746a, flatShading: true, detail: 'rock' }), trunk: toon(0x6e4a28), leaf: toon({ color: 0x356e34, flatShading: true }), extra: null, flora: 'palme', rockScale: 1 };
  }
  markWind(k.leaf);
  markWind(k.trunk);
  const kit: StyleKit = { ...k, grassCap: toon({ color: (k.grass as MeshToonMaterial).color.getHex(), detail: 'grass', rim: 0.35, puddles: 0.45, layer: 0.5 }) };
  cache.set(style, kit);
  return kit;
}

/**
 * Strandplateau mit unregelmäßiger Küste und 1–3 Hügeln – aus denselben Werten wie die Laufhöhe (islandGround).
 * hills: Inselkoordinaten.
 */
export function islandTerrain(kit: StyleKit, r: number, coast: { a: number; f: number; p: number }[], hills: { x: number; z: number; r: number; h: number }[], grassFrac = 0, rnd: () => number = Math.random, ragged = 0, shelf = 0.25): { beach: Mesh; hills: Mesh[] } {
  const k = (a: number) => coastK(coast, a);
  const bg = new CylinderGeometry(r, r * (1 + shelf), 3, Math.max(128, Math.round(r * 1.2)), 2);
  const bp = bg.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), z = bp.getZ(i);
    const f = k(Math.atan2(z, x));
    bp.setX(i, x * f); bp.setZ(i, z * f);
  }
  bg.computeVertexNormals();
  const beach = new Mesh(bg, kit.sand);
  beach.position.y = -0.2;
  const meshes: Mesh[] = [];
  // flache Grasfläche mit eigener, unregelmäßiger Kante auf dem Strandplateau
  if (grassFrac > 0.2) {
    // große Länder mit mehr Stützpunkten, sonst wird der Wiesenrand eckig
    const seed = rnd() * 100, n = Math.max(96, Math.round(r * 1.3));
    const lobes = 2 + Math.floor(rnd() * 2);
    const shape = new Shape();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      // ragged: große Buchten und Zungen im Wiesenrand – jede Insel bekommt ihren eigenen Umriss statt eines Kreises
      const wobble = 1 + 0.08 * Math.sin(a * 5 + seed) + 0.05 * Math.sin(a * 11 + seed * 2) + 0.03 * Math.sin(a * 23 + seed * 3)
        + ragged * (0.2 * Math.sin(a * lobes + seed * 1.7) + 0.13 * Math.sin(a * (lobes + 1) - seed * 0.9) + 0.07 * Math.sin(a * 7 + seed * 2.3));
      const rr = r * k(a) * Math.min(0.95, grassFrac * wobble);
      const x = Math.cos(a) * rr, y = -Math.sin(a) * rr;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    const gg = new ShapeGeometry(shape, 1);
    gg.rotateX(-Math.PI / 2);
    const cap = new Mesh(gg, kit.grassCap);
    cap.position.y = 1.32;
    cap.receiveShadow = true;
    meshes.push(cap);
  }
  meshes.push(...hills.map((h) => {
    // gleiche Form wie die Laufhöhe (hillProfile), vom Fuß zur Kuppe
    const pts: Vector2[] = [];
    for (let i = 0; i <= 28; i++) { const t = 1 - i / 28; pts.push(new Vector2(Math.max(0.001, t * h.r), hillProfile(t) * h.r * h.h)); }
    const hg = new LatheGeometry(pts, 56);
    const m = new Mesh(hg, kit.grass);
    m.position.set(h.x, 1.2, h.z);
    m.receiveShadow = true;
    return m;
  }));
  return { beach, hills: meshes };
}

const KIND_LABEL: Record<string, string> = { town: 'Hafenstadt', harbor: 'Hafen', camp: 'Lager', ruin: 'Ruine', quiet: '', treasure: 'Schatzinsel', lighthouse: 'Leuchtturm', boss: 'Boss' };

/** Schwebendes Namensschild über einer Insel (wie in 1.0): Name, Art und Stufe */
export function islandLabel(name: string, kind: string, level?: number, kindLabel?: string): Sprite {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  const sub = [kindLabel ?? KIND_LABEL[kind] ?? '', level ? `Stufe ${level}` : ''].filter(Boolean).join(' · ');
  g.textAlign = 'center';
  g.lineJoin = 'round';
  // lange Namen („Festung Nordwacht“) wurden am Rand abgeschnitten: Schrift so weit verkleinern, dass sie passt
  let size = 54;
  g.font = `800 ${size}px "Alegreya Sans", sans-serif`;
  while (g.measureText(name).width > 480 && size > 28) { size -= 2; g.font = `800 ${size}px "Alegreya Sans", sans-serif`; }
  g.lineWidth = 10; g.strokeStyle = 'rgba(18,30,48,0.85)';
  g.strokeText(name, 256, 62);
  g.fillStyle = '#FFF3D0';
  g.fillText(name, 256, 62);
  if (sub) {
    g.font = '700 32px "Alegreya Sans", sans-serif';
    g.lineWidth = 7;
    g.strokeText(sub, 256, 108);
    g.fillStyle = kind === 'camp' || kind === 'boss' || kind === 'ruin' ? '#FFB49A' : '#CFEFFF';
    g.fillText(sub, 256, 108);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: t, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
  s.scale.set(32, 8, 1);
  s.renderOrder = 5;
  s.userData.noOutline = true;
  return s;
}

/** Eine Pflanze (oder ein Kristall) passend zur Region */
export function plant(kit: StyleKit, rnd: () => number): Group {
  const g = new Group();
  switch (kit.flora) {
    case 'kiefer': {
      const h = 6 + rnd() * 4;
      const t = new Mesh(new CylinderGeometry(0.22, 0.35, h * 0.4, 6), kit.trunk);
      t.position.y = h * 0.2;
      g.add(t);
      for (let i = 0; i < 3; i++) {
        const c = new Mesh(new ConeGeometry(2.2 - i * 0.55, h * 0.36, 7), kit.leaf);
        c.position.y = h * (0.38 + i * 0.2);
        g.add(c);
      }
      break;
    }
    case 'tot': {
      const h = 4 + rnd() * 3;
      const t = new Mesh(new CylinderGeometry(0.12, 0.3, h, 5), kit.trunk);
      t.position.y = h / 2;
      t.rotation.z = (rnd() - 0.5) * 0.25;
      g.add(t);
      for (let i = 0; i < 3; i++) {
        const b = new Mesh(new CylinderGeometry(0.05, 0.12, h * 0.45, 4), kit.trunk);
        b.position.set(0, h * (0.5 + i * 0.15), 0);
        b.rotation.set(0, rnd() * 6, 0.9 + rnd() * 0.4);
        b.translateY(h * 0.2);
        g.add(b);
      }
      break;
    }
    case 'kristall': {
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const s = 0.6 + rnd() * 1.4;
        const c = new Mesh(new OctahedronGeometry(s, 0), i === 0 && kit.extra ? kit.extra : kit.rock);
        c.scale.y = 2.2;
        c.position.set((rnd() - 0.5) * 2, s * 1.8, (rnd() - 0.5) * 2);
        c.rotation.set((rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.5);
        if (c.material === kit.extra) c.userData.noOutline = true;
        g.add(c);
      }
      break;
    }
    default: {
      const t = new Mesh(new CylinderGeometry(0.25, 0.4, 7, 6), kit.trunk);
      t.position.y = 3.5;
      g.add(t);
      for (let l = 0; l < 6; l++) {
        const f = new Mesh(new ConeGeometry(0.9, 4.2, 4), kit.leaf);
        f.position.y = 7;
        f.rotation.set(Math.PI / 2.4, (l / 6) * Math.PI * 2, 0, 'YXZ');
        f.scale.z = 0.25;
        g.add(f);
      }
    }
  }
  // im Wind wiegen: Krone und Wedel stärker, Stamm unten fest (Kristalle bewegen sich nicht)
  if (kit.flora !== 'kristall') {
    g.updateMatrixWorld(true);
    const box = new Box3().setFromObject(g);
    windify(g, kit.flora === 'tot' ? 0.12 : kit.flora === 'kiefer' ? 0.3 : 0.42, Math.max(1, box.max.y));
  }
  return g;
}

/** Vulkan: Felskegel mit glühendem Krater (Glutring). Liefert Gruppe, Krater und Gipfelhöhe. */
export function volcano(kit: StyleKit, r: number, baseY: number, tall: boolean): { g: Group; crater: Mesh | null; top: number; radius: number } {
  const g = new Group();
  const h = r * (tall ? 0.75 : 0.42);
  const br = r * (tall ? 0.58 : 0.4);
  // Flanke: nach oben steiler werdend (konkav), zerklüftet mit Rinnen – statt eines glatten Kegels
  const radiusAt = (a: number, t: number) => {
    // t kann durch Rundung minimal über 1 liegen (Spitze des Kegels): ohne Begrenzung ergäbe die Potenz NaN-Eckpunkte
    const base = br * (0.22 + 0.78 * Math.pow(Math.max(0, 1 - t), 1.6));
    const n = Math.sin(a * 7 + t * 5) * 0.05 + Math.sin(a * 13 - t * 9) * 0.03 + Math.sin(a * 3 + 1.3) * 0.04;
    const gully = -Math.pow(Math.abs(Math.sin(a * 5 + t * 1.5)), 6) * 0.07;
    return base * (1 + (n + gully) * (0.35 + 0.65 * (1 - t)));
  };
  const surf = (a: number, t: number, out = 0) => {
    const rr = radiusAt(a, t) + out;
    return new Vector3(Math.sin(a) * rr, baseY - 0.3 + t * h, Math.cos(a) * rr);
  };
  const rows = 18, segs = 56;
  const pts: Vector2[] = [];
  for (let k = 0; k <= rows; k++) { const t = k / rows; pts.push(new Vector2(br * (0.22 + 0.78 * Math.pow(1 - t, 1.6)), t * h)); }
  const geo = new LatheGeometry(pts, segs);
  const pos = geo.getAttribute('position');
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const a = Math.atan2(x, z), t = y / h;
    const r0 = Math.hypot(x, z) || 1;
    const rr = radiusAt(a, t);
    pos.setX(k, (x / r0) * rr); pos.setZ(k, (z / r0) * rr);
  }
  geo.computeVertexNormals();
  const rockMat = kit.extra ? toon({ color: '#4A3C36', flatShading: true, detail: 'rock' }) : kit.rock;
  const cone = new Mesh(geo, rockMat);
  cone.position.y = baseY - 0.3;
  cone.castShadow = true;
  cone.receiveShadow = true;
  g.add(cone);
  // Lavaströme: glühende Rinnen, die sich vom Kraterrand die Flanke hinunterschlängeln
  if (kit.extra) for (let i = 0; i < (tall ? 6 : 3); i++) {
    const a0 = (i / (tall ? 6 : 3)) * Math.PI * 2 + 0.4 + Math.sin(i * 2.3) * 0.3;
    const len = 0.55 + ((i * 37) % 10) / 22;
    const path: Vector3[] = [];
    for (let k = 0; k <= 24; k++) {
      const t = 0.98 - (k / 24) * len;
      path.push(surf(a0 + Math.sin(t * 6 + i) * 0.18, t, 0.12).sub(new Vector3(0, baseY - 0.3, 0)));
    }
    const flow = new Mesh(new TubeGeometry(new CatmullRomCurve3(path), 48, (tall ? 0.55 : 0.35) * (1 + i % 2 * 0.4), 6), kit.extra);
    flow.position.y = baseY - 0.3;
    flow.userData.noOutline = true;
    g.add(flow);
  }
  let crater: Mesh | null = null;
  if (kit.extra) {
    // Kratersee aus Lava mit gezacktem Rand
    const topR = br * 0.22;
    crater = new Mesh(new CircleGeometry(topR * 0.92, 24), kit.extra);
    crater.rotation.x = -Math.PI / 2;
    crater.position.y = baseY - 0.3 + h - 0.5;
    crater.userData.noOutline = true;
    g.add(crater);
    const rim = new Mesh(new TorusGeometry(topR, topR * 0.16, 6, 24), rockMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = baseY - 0.3 + h - 0.1;
    g.add(rim);
  }
  return { g, crater, top: baseY + h, radius: br };
}

const wood = () => toon(0x8a5a2b);

export type RockType = 'bloecke' | 'nadeln' | 'platten' | 'bogen' | 'basalt';
/** Welche Felsformen in welcher Region vorkommen (die erste Wahl der Insel wird aus ihrem Namen gewürfelt) */
export const ROCK_TYPES: Record<IslandStyle, RockType[]> = {
  tropisch: ['bloecke', 'platten', 'bogen', 'bloecke'],
  nebel: ['nadeln', 'platten', 'bloecke', 'bogen'],
  nord: ['bloecke', 'platten', 'nadeln'],
  glut: ['basalt', 'nadeln', 'bloecke'],
  sturm: ['nadeln', 'basalt', 'bogen', 'platten'],
  schlund: ['nadeln', 'bogen', 'basalt'],
  festland: ['bloecke', 'platten'],
  klippe: ['basalt', 'nadeln'],
};

/** Eckpunkte verschieben: gleiche Lage = gleiche Verschiebung (das Netz bleibt dicht), jeder Fels wird ein Einzelstück */
function deform(geo: import('three').BufferGeometry, seed: number, amt: number, flatY = false) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.11) * 43758.5453;
    const k = 1 + (h - Math.floor(h) - 0.5) * 2 * amt;
    pos.setXYZ(i, x * k, flatY ? y : y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Felsformation: Blockhaufen, Felsnadeln, Plattenstapel, Felsbogen oder Basaltsäulen – statt überall derselben Felsnadel.
 * size = Grundmaß in Metern. Liefert die Gruppe und die Kollisionskreise (Gruppenkoordinaten).
 */
export function rockFormation(type: RockType, kit: StyleKit, rnd: () => number, size: number): { g: Group; blocks: { x: number; z: number; r: number }[] } {
  const g = new Group();
  const blocks: { x: number; z: number; r: number }[] = [];
  const mat = kit.rock;
  const boulder = (s: number, x: number, z: number, squash = 0.6 + rnd() * 0.3, solid = true) => {
    const m = new Mesh(deform(new DodecahedronGeometry(s, 0), rnd() * 100, 0.2), mat);
    m.scale.set(1 + rnd() * 0.3, squash, 1 + rnd() * 0.3);
    m.position.set(x, s * squash * 0.45, z);
    m.rotation.y = rnd() * 6;
    g.add(m);
    if (solid) blocks.push({ x, z, r: s * 0.9 });
    return m;
  };
  const spire = (w: number, h: number, x: number, z: number) => {
    const geo = new CylinderGeometry(w * (0.12 + rnd() * 0.16), w, h, 6, 3);
    geo.translate(0, h / 2, 0);
    const m = new Mesh(deform(geo, rnd() * 100, 0.2, true), mat);
    m.position.set(x, -0.5, z);
    m.rotation.set((rnd() - 0.5) * 0.3, rnd() * 6, (rnd() - 0.5) * 0.3);
    g.add(m);
    blocks.push({ x, z, r: w * 0.95 });
  };
  const scatter = (n: number, d0: number, d1: number, s0: number, s1: number) => {
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, d = d0 + rnd() * (d1 - d0); boulder(s0 + rnd() * (s1 - s0), Math.cos(a) * d, Math.sin(a) * d); }
  };
  switch (type) {
    case 'bloecke': {
      boulder(size * (0.8 + rnd() * 0.3), 0, 0, 0.7 + rnd() * 0.35);
      scatter(3 + Math.floor(rnd() * 4), size * 0.8, size * 1.9, size * 0.25, size * 0.6);
      break;
    }
    case 'nadeln': {
      const n = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + rnd(), d = i === 0 ? 0 : size * (0.55 + rnd() * 0.6);
        const w = size * (i === 0 ? 0.5 : 0.25 + rnd() * 0.2);
        spire(w, Math.min(17, w * (3 + rnd() * 2.6) * Math.sqrt(kit.rockScale)), Math.cos(a) * d, Math.sin(a) * d);
      }
      scatter(2 + Math.floor(rnd() * 2), size * 1.1, size * 1.8, size * 0.18, size * 0.35);
      break;
    }
    case 'platten': {
      const n = 3 + Math.floor(rnd() * 3);
      let y = 0, ox = 0, oz = 0;
      for (let i = 0; i < n; i++) {
        const s = size * (1 - i * 0.14) * (0.8 + rnd() * 0.25);
        const th = size * (0.2 + rnd() * 0.12);
        const m = new Mesh(deform(new CylinderGeometry(s * 0.9, s, th, 7, 1), rnd() * 100, 0.16, true), mat);
        ox += (rnd() - 0.5) * s * 0.5; oz += (rnd() - 0.5) * s * 0.5;
        m.position.set(ox, y + th / 2 - 0.2, oz);
        m.rotation.set((rnd() - 0.5) * 0.2, rnd() * 6, (rnd() - 0.5) * 0.2);
        g.add(m);
        y += th * 0.86;
        if (i === 0) blocks.push({ x: ox, z: oz, r: s * 0.95 });
      }
      scatter(2 + Math.floor(rnd() * 2), size * 1.1, size * 1.7, size * 0.2, size * 0.4);
      break;
    }
    case 'bogen': {
      const span = size * (0.9 + rnd() * 0.3), h = size * (1.3 + rnd() * 0.6);
      for (const sgn of [-1, 1]) {
        const w = size * (0.38 + rnd() * 0.14);
        const geo = new CylinderGeometry(w * 0.8, w, h + 1, 6, 2);
        geo.translate(0, (h - 1) / 2, 0);
        const m = new Mesh(deform(geo, rnd() * 100, 0.18, true), mat);
        m.position.set(sgn * span, 0, 0);
        g.add(m);
        blocks.push({ x: sgn * span, z: 0, r: w });
      }
      const top = new Mesh(deform(new DodecahedronGeometry(1, 0), rnd() * 100, 0.18), mat);
      top.scale.set(span * 1.55, size * 0.42, size * 0.62);
      top.position.y = h + size * 0.1;
      top.rotation.z = (rnd() - 0.5) * 0.12;
      g.add(top);
      scatter(2 + Math.floor(rnd() * 3), span * 1.5, span * 2.2, size * 0.2, size * 0.45);
      break;
    }
    case 'basalt': {
      const rr = Math.max(0.55, size * 0.17);
      const n = 12 + Math.floor(rnd() * 9);
      const peak = size * (1.3 + rnd() * 1.1) * Math.sqrt(kit.rockScale);
      let reach = 0;
      for (let i = 0; i < n; i++) {
        // Spirale über ein Sechseckraster: dichtes Bündel, außen niedriger
        const q = Math.round(Math.cos(i * 2.4) * Math.sqrt(i) * 0.8), rI = Math.round(Math.sin(i * 2.4) * Math.sqrt(i) * 0.8);
        const x = Math.sqrt(3) * rr * (q + rI / 2), z = 1.5 * rr * rI;
        const d = Math.hypot(x, z);
        const h = Math.max(0.6, (peak - d * 1.25) * (0.6 + rnd() * 0.55));
        const col = new Mesh(new CylinderGeometry(rr, rr, h + 1.4, 6), mat);
        col.position.set(x, (h - 1.4) / 2, z);
        g.add(col);
        reach = Math.max(reach, d + rr);
      }
      blocks.push({ x: 0, z: 0, r: reach * 0.92 });
      g.rotation.y = rnd() * 6;
      // gedrehte Gruppe: Kollisionskreis liegt in der Mitte, braucht keine Umrechnung
      break;
    }
  }
  return { g, blocks };
}

/** Länge der Hafenstege der Außenposten: beginnt 5 m an Land, reicht gut 20 m übers Wasser */
export const OUTPOST_PIER = { from: -5, to: 27 };

/** Kleiner Außenposten-Hafen: Steg mit Laterne (r = Küstenradius in Stegrichtung) */
export function outpost(r: number, facing: number, lanterns: Mesh[]): Group {
  const g = new Group();
  const w = wood();
  const len = OUTPOST_PIER.to - OUTPOST_PIER.from, mid = (OUTPOST_PIER.to + OUTPOST_PIER.from) / 2;
  const deck = new BoxGeometry(3, 0.4, len);
  deckUV(deck, 3, len);
  const pier = new Mesh(deck, toon({ color: '#A8804E', map: plankTexture(), puddles: 0.6, ...toonPbr(plankTexture(), { strength: 1.2, rough: 0.82, roughVar: 0.2, ao: 0.7 }) }));
  pier.position.set(Math.sin(facing) * (r + mid), 1.25, Math.cos(facing) * (r + mid));
  pier.rotation.y = facing;
  g.add(pier);
  // Pfähle beiderseits, bis ins Wasser hinab
  for (let d = r + 2; d <= r + OUTPOST_PIER.to - 1; d += 5) for (const s of [-1, 1]) {
    const post = new Mesh(new CylinderGeometry(0.18, 0.18, 4, 6), w);
    post.position.set(Math.sin(facing) * d + Math.cos(facing) * 1.6 * s, -0.1, Math.cos(facing) * d - Math.sin(facing) * 1.6 * s);
    g.add(post);
  }
  // die Häuser des Hafens baut islandDress je nach Region (vorher vier gleiche Häuschen in jedem Hafen)
  const lamp = new Mesh(new SphereGeometry(0.35, 8, 6), new MeshBasicMaterial({ color: new Color(4, 3, 1.2) }));
  lamp.position.set(Math.sin(facing) * (r + OUTPOST_PIER.to - 3) + Math.cos(facing) * 1.2, 3.2, Math.cos(facing) * (r + OUTPOST_PIER.to - 3) - Math.sin(facing) * 1.2);
  lamp.userData.noOutline = true;
  lanterns.push(lamp);
  const pole = new Mesh(new CylinderGeometry(0.1, 0.1, 2, 5), w);
  pole.position.set(lamp.position.x, 2.2, lamp.position.z);
  g.add(lamp, pole);
  return g;
}
