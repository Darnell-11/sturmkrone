import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, OctahedronGeometry, SphereGeometry, type Material } from 'three';
import type { IslandStyle } from '../data/regions';
import { toon } from '../render/toon';

/** Farben und Pflanzen je Region */
export interface StyleKit {
  sand: Material;
  grass: Material;
  rock: Material;
  trunk: Material;
  leaf: Material;
  extra: Material | null;
  flora: 'palme' | 'tot' | 'kiefer' | 'kristall';
  rockScale: number;
}

const cache = new Map<IslandStyle, StyleKit>();

export function styleKit(style: IslandStyle): StyleKit {
  let k = cache.get(style);
  if (k) return k;
  const glow = (c: Color) => new MeshBasicMaterial({ color: c });
  switch (style) {
    case 'nebel': k = { sand: toon(0xc9c2a8), grass: toon({ color: 0x7d8f6a, flatShading: true }), rock: toon({ color: 0x7a7e80, flatShading: true }), trunk: toon(0x5a4a3a), leaf: toon({ color: 0x6a7a5a, flatShading: true }), extra: null, flora: 'tot', rockScale: 1.1 }; break;
    case 'nord': k = { sand: toon(0xd8d2c0), grass: toon({ color: 0x4f8a52, flatShading: true }), rock: toon({ color: 0x8a8f96, flatShading: true }), trunk: toon(0x6a4a2b), leaf: toon({ color: 0x2f6a44, flatShading: true }), extra: null, flora: 'kiefer', rockScale: 1 }; break;
    case 'glut': k = { sand: toon(0x4a3c38), grass: toon({ color: 0x6a5048, flatShading: true }), rock: toon({ color: 0x2e2626, flatShading: true }), trunk: toon(0x2a2020), leaf: toon({ color: 0x3a2e2a, flatShading: true }), extra: glow(new Color(5, 1.4, 0.25)), flora: 'tot', rockScale: 1.3 }; break;
    case 'sturm': k = { sand: toon(0xb8b4a8), grass: toon({ color: 0x5a7a6a, flatShading: true }), rock: toon({ color: 0x5a6070, flatShading: true }), trunk: toon(0x4a3a2a), leaf: toon({ color: 0x3e5e4e, flatShading: true }), extra: null, flora: 'kiefer', rockScale: 1.7 }; break;
    case 'schlund': k = { sand: toon(0x8a86a0), grass: toon({ color: 0x5a4a8a, flatShading: true }), rock: toon({ color: 0x3a3450, flatShading: true }), trunk: toon(0x3a3048), leaf: toon({ color: 0x4a3a6a, flatShading: true }), extra: glow(new Color(1.2, 2.6, 4.5)), flora: 'kristall', rockScale: 1.2 }; break;
    default: k = { sand: toon(0xf1d9a0), grass: toon({ color: 0x6dbb4c, flatShading: true }), rock: toon({ color: 0x8a8378, flatShading: true }), trunk: toon(0x8a5a2b), leaf: toon({ color: 0x3f9a3a, flatShading: true }), extra: null, flora: 'palme', rockScale: 1 };
  }
  cache.set(style, k);
  return k;
}

/** Unregelmäßige Küste und hügelige Kuppe statt Zylinder und Halbkugel */
export function islandTerrain(kit: StyleKit, r: number, hill: number, rnd: () => number): { beach: Mesh; hill: Mesh } {
  const seed = rnd() * 100;
  const coast = (a: number) => 1 + 0.035 * Math.sin(a * 3 + seed) + 0.02 * Math.sin(a * 7 + seed * 2) + 0.01 * Math.sin(a * 13 + seed * 3);
  const bg = new CylinderGeometry(r, r * 1.25, 3, 64, 2);
  const bp = bg.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), z = bp.getZ(i);
    const k = coast(Math.atan2(z, x));
    bp.setX(i, x * k); bp.setZ(i, z * k);
  }
  bg.computeVertexNormals();
  const beach = new Mesh(bg, kit.sand);
  beach.position.y = -0.2;
  const R = r * 0.75;
  const hg = new SphereGeometry(R, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const hp = hg.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    const k = coast(Math.atan2(z, x));
    // sanfte Hügel und Mulden, zum Rand hin flach
    const top = y / R;
    const bump = 1 + 0.22 * top * (Math.sin(x * 0.11 + seed) * Math.cos(z * 0.09 - seed) + 0.5 * Math.sin((x + z) * 0.23 + seed * 1.7));
    hp.setXYZ(i, x * k, y * bump, z * k);
  }
  hg.computeVertexNormals();
  const hillMesh = new Mesh(hg, kit.grass);
  hillMesh.scale.y = hill;
  hillMesh.position.y = 1.2;
  return { beach, hill: hillMesh };
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
  return g;
}

/** Vulkan: Felskegel mit glühendem Krater (Glutring). Liefert Gruppe, Krater und Gipfelhöhe. */
export function volcano(kit: StyleKit, r: number, baseY: number, tall: boolean): { g: Group; crater: Mesh | null; top: number; radius: number } {
  const g = new Group();
  const h = r * (tall ? 0.75 : 0.42);
  const br = r * (tall ? 0.58 : 0.4);
  const cone = new Mesh(new CylinderGeometry(br * 0.24, br, h, 16, 1, true), kit.rock);
  cone.position.y = baseY + h / 2 - 0.3;
  g.add(cone);
  // Lavaströme als leuchtende Rinnen
  if (kit.extra) for (let i = 0; i < (tall ? 4 : 2); i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const flow = new Mesh(new BoxGeometry(0.7, h * 0.95, 0.25), kit.extra);
    flow.position.set(Math.sin(a) * br * 0.6, baseY + h * 0.45, Math.cos(a) * br * 0.6);
    flow.lookAt(0, baseY + h * 1.6, 0);
    flow.rotateX(Math.PI / 2);
    flow.userData.noOutline = true;
    g.add(flow);
  }
  let crater: Mesh | null = null;
  if (kit.extra) {
    crater = new Mesh(new CylinderGeometry(br * 0.22, br * 0.22, 0.5, 16), kit.extra);
    crater.position.y = baseY + h - 0.35;
    crater.userData.noOutline = true;
    g.add(crater);
  }
  return { g, crater, top: baseY + h, radius: br };
}

const wood = () => toon(0x8a5a2b);
const plaster = () => toon(0xefe4cc);
const roof = () => toon(0xa8322a);

/** Kleiner Außenposten-Hafen: Steg, Häuser, Laternen */
export function outpost(r: number, facing: number, lanterns: Mesh[]): Group {
  const g = new Group();
  const w = wood(), p = plaster(), rf = roof();
  const pier = new Mesh(new BoxGeometry(3, 0.4, 22), w);
  pier.position.set(Math.sin(facing) * (r + 6), 1.25, Math.cos(facing) * (r + 6));
  pier.rotation.y = facing;
  g.add(pier);
  for (let i = 0; i < 4; i++) {
    const post = new Mesh(new CylinderGeometry(0.18, 0.18, 3, 6), w);
    const d = r + 0 + i * 5;
    post.position.set(Math.sin(facing) * d + Math.cos(facing) * 1.6, 0.4, Math.cos(facing) * d - Math.sin(facing) * 1.6);
    g.add(post);
  }
  for (let i = 0; i < 4; i++) {
    const a = facing + (i - 1.5) * 0.45;
    const d = r * 0.55;
    const house = new Group();
    const body = new Mesh(new BoxGeometry(5, 3.4, 4.2), p);
    body.position.y = 1.7;
    const top = new Mesh(new ConeGeometry(4, 2.4, 4), rf);
    top.position.y = 4.6;
    top.rotation.y = Math.PI / 4;
    house.add(body, top);
    const win = new Mesh(new BoxGeometry(1, 1, 0.1), new MeshBasicMaterial({ color: new Color(3.5, 2.4, 1) }));
    win.position.set(0, 1.9, 2.12);
    win.userData.noOutline = true;
    house.add(win);
    lanterns.push(win);
    house.position.set(Math.sin(a) * d, 1.3, Math.cos(a) * d);
    house.rotation.y = a;
    g.add(house);
  }
  const lamp = new Mesh(new SphereGeometry(0.35, 8, 6), new MeshBasicMaterial({ color: new Color(4, 3, 1.2) }));
  lamp.position.set(Math.sin(facing) * (r + 16), 3.2, Math.cos(facing) * (r + 16));
  lamp.userData.noOutline = true;
  lanterns.push(lamp);
  const pole = new Mesh(new CylinderGeometry(0.1, 0.1, 2, 5), w);
  pole.position.set(lamp.position.x, 2.2, lamp.position.z);
  g.add(lamp, pole);
  return g;
}
