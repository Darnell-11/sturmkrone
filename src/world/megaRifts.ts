// Spalten der Mega-Inseln (4.3.6): Kanäle, Lavaspalten, Klüfte und Meeresarme quer durch eine Insel, überspannt von Brücken.
// Der Boden sinkt entlang des Linienzugs auf die Sohle (Einebnung mit fester Höhe über `WalkIsland.addPad`): unter dem Meeresspiegel füllt das Meer die
// Spalte von selbst, Lava liegt als glühendes Band auf einer trockenen Sohle. Hindernisse sperren die Ränder (auch für die Wegfindung der Gegner);
// nur an den Übergängen bleiben die Sperren offen: dort spannt sich eine freistehende Brücke über die durchgehend ausgehobene Spalte, getragen von einem
// Laufdeck (`WalkIsland.decks`, 4.4A), das nur die Laufhöhe ändert. Alles in Teilschritten (Streaming).
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Color, type Group, type Material } from 'three';
import type { IslandDef } from '../data/regions';
import type { RiftDef } from '../data/settlements';
import { toon } from '../render/toon';
import { markShared } from '../render/dispose';
import type { GlowPlaced } from '../render/glow';
import { build } from './architecture';
import { boxBlocker, coastK, type Blocker, type WalkIsland } from './islandGround';
import { RIFT_GAP, inCrossing, pointAt, polyLength, riftBlockHalf, riftWallOff } from './riftMath';

export { RIFT_GAP, inCrossing, pointAt, polyLength, riftBlockHalf, riftWallOff };

/**
 * Sohle je Art (Höhe über dem Meeresspiegel; negativ = das Meer füllt die Spalte), Böschung hinter der Wand und Farbe der Ränder. Die Böschung bleibt
 * schmal und liegt unter der Mauerkrone: früher reichte der Aushub 2 – 4 m über die Wand hinaus, ein begehbarer Graben neben der Spalte.
 */
export const RIFT_LOOK: Record<RiftDef['kind'], { floor: number; blend: number; wall: string; bridge: string }> = {
  kanal: { floor: -1.8, blend: 0.8, wall: '#8C847A', bridge: 'holz' },
  sund: { floor: -2.8, blend: 1, wall: '#6E6A62', bridge: 'ruine' },
  kluft: { floor: -4.2, blend: 1, wall: '#C8C2B4', bridge: 'stein' },
  lava: { floor: 0.2, blend: 0.8, wall: '#2A2428', bridge: 'obsidian' },
};

/** Brückendeck (architecture.ts `bruecke`): halbe Breite der begehbaren Fahrbahn zwischen den Brüstungen und Oberkante über dem Ursprung */
export const BRIDGE_DECK_HW = 2.25;
export const BRIDGE_DECK_TOP = 0.115;
/** Breite Brücken (`RiftDef.wide`, Kaiser-Inseln): Fahrbahn 9,2 statt 4,6 m – das Laufdeck wächst mit */
export const BRIDGE_WIDE_K = 2.02;

/** Höhe des glühenden Lavabands über der Sohle: sichtbar über der Geländedecke der Sohle (vorher 0,12 m, lag darunter) */
const LAVA_LIFT = 0.42;
/** Mauerkrone über dem natürlichen Boden: über der Wiesendecke (sonst ragt das Gras in Zacken über die Krone) */
const CAP_LIFT = 0.3;

let lavaMat: MeshBasicMaterial | null = null;
// Lava leuchtet über der Bloom-Schwelle (4.4C: Helligkeit ~1,25 in der Mitte, die Ränder darunter) – sie ist eine echte Lichtquelle
const lava = () => (lavaMat ??= markShared(Object.assign(new MeshBasicMaterial({ color: new Color(3.1, 0.74, 0.12), vertexColors: true, toneMapped: false }), { userData: { glow: true } })));

/** Ruhiges Rauschen 0 … 1 aus einer Zahl (Lage entlang der Spalte): fest je Insel, ohne Zufallsfolge */
const hash01 = (k: number): number => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export interface RiftBuild { glows: GlowPlaced[]; vents: { x: number; y: number; z: number }[] }

export interface RiftOpts {
  group: Group;
  def: IslandDef;
  walk: WalkIsland;
  rifts: readonly RiftDef[];
  /** Bodenhöhe (Inselkoordinaten) mit und ohne Einebnungen */
  hAt: (x: number, z: number) => number;
  hNat: (x: number, z: number) => number;
  block: (b: Blocker) => void;
  rnd: () => number;
}

const STEP = 3;
const _p = { x: 0, z: 0, dx: 0, dz: 0 };

/**
 * Spalten einer Insel bauen (vor den Siedlungen, damit ihre Einebnungen gewinnen): Sohle, Randsperren, Kaimauern bzw. Felsränder, Lavaband mit Glut und
 * Dampf, Brücken an den Übergängen. Gibt nach jedem Abschnitt ab.
 */
export function* buildRiftsSteps(o: RiftOpts): Generator<void, RiftBuild> {
  const { def, walk } = o;
  const out: RiftBuild = { glows: [], vents: [] };
  const E = (lx: number, lz: number) => def.r * coastK(walk.coast, Math.atan2(lz, lx));
  for (const rift of o.rifts) {
    const L = RIFT_LOOK[rift.kind];
    const total = polyLength(rift.pts);
    // Ränder: Kaimauern und Ruinenmauern als Mauerwerk, Lava- und Kreidekluft als nackter Fels (Basalt, Kalk) – ohne Moos und Fugen
    const natural = rift.kind === 'lava' || rift.kind === 'kluft';
    const wallMat: Material = natural
      ? toon({ color: L.wall, detail: 'rock', flatShading: true, forge: rift.kind === 'lava' ? 'fels_basalt' : 'fels_kalk' })
      : toon({ color: L.wall, detail: 'stone', flatShading: true, forge: 'mauerwerk' });
    // 1. Sohle und Randsperren in Abschnitten von 3 m. Die Sohle läuft auch unter den Brücken durch (4.4A: kein Erddamm mehr, die Brücke
    //    schwebt); nur die Sperren lassen die Brückenstelle frei – dort trägt das Laufdeck der Brücke (`walk.decks`)
    for (let s = 0; s < total; s += STEP) {
      const sm = Math.min(total, s + STEP / 2);
      pointAt(rift.pts, sm, _p);
      const dist = Math.hypot(_p.x, _p.z);
      if (dist > E(_p.x, _p.z) * 1.04) continue;
      const yaw = Math.atan2(_p.dx, _p.dz);
      walk.addPad?.(def.x + _p.x, def.z + _p.z, 2 * riftWallOff(rift.w), STEP + 0.8, yaw, L.blend, false, L.floor);
      if (!inCrossing(rift, total, sm)) o.block(boxBlocker(def.x + _p.x, def.z + _p.z, 2 * riftBlockHalf(rift.w), STEP + 0.3, yaw));
    }
    yield;
    // 2. Ränder: Kaimauern (Kanal), Felswände (Kluft, Sund), Basalt (Lava) – von der Sohle bis zur natürlichen Bodenhöhe, oben eine Mauerkrone über der
    //    schmalen Böschung hinter der Wand
    const pos: number[] = [];
    const idx: number[] = [];
    const lavaPos: number[] = [];
    const lavaIdx: number[] = [];
    const lavaCol: number[] = [];
    const seed = total * 0.37 + rift.w;
    for (let s = 0; s < total; s += STEP) {
      const s1 = Math.min(total, s + STEP);
      const sm = (s + s1) / 2;
      // unter einer Brücke laufen Wand und Lava weiter; nur die Mauerkrone fehlt dort (die Widerlager liegen darauf)
      const under = inCrossing(rift, total, sm);
      pointAt(rift.pts, s, _p);
      const ax = _p.x, az = _p.z, nx = -_p.dz, nz = _p.dx;
      pointAt(rift.pts, s1, _p);
      const bx = _p.x, bz = _p.z;
      if (Math.hypot(ax, az) > E(ax, az) * 1.02 && Math.hypot(bx, bz) > E(bx, bz) * 1.02) continue;
      const capW = L.blend + 0.4;
      for (const side of [-1, 1]) {
        const off = side * riftWallOff(rift.w), offC = side * (riftWallOff(rift.w) + capW);
        const p0x = ax + nx * off, p0z = az + nz * off, p1x = bx + nx * off, p1z = bz + nz * off;
        const top0 = o.hNat(p0x, p0z), top1 = o.hNat(p1x, p1z);
        if (!Number.isFinite(top0) || !Number.isFinite(top1)) continue;
        const y0 = Math.max(top0, L.floor) + CAP_LIFT, y1 = Math.max(top1, L.floor) + CAP_LIFT;
        let v = pos.length / 3;
        // senkrechte Wand: zwei Dreiecke von der Sohle (etwas tiefer) bis knapp über den Boden
        pos.push(p0x, L.floor - 0.6, p0z, p1x, L.floor - 0.6, p1z, p1x, y1, p1z, p0x, y0, p0z);
        if (side > 0) idx.push(v, v + 1, v + 2, v, v + 2, v + 3); else idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
        // Mauerkrone nach außen über die Böschung (nach oben gewandt), außen auf natürlicher Bodenhöhe
        if (under) continue;
        const q0x = ax + nx * offC, q0z = az + nz * offC, q1x = bx + nx * offC, q1z = bz + nz * offC;
        const o0 = o.hNat(q0x, q0z), o1 = o.hNat(q1x, q1z);
        if (!Number.isFinite(o0) || !Number.isFinite(o1)) continue;
        v = pos.length / 3;
        pos.push(p0x, y0, p0z, p1x, y1, p1z, q1x, Math.max(o1, L.floor) + CAP_LIFT, q1z, q0x, Math.max(o0, L.floor) + CAP_LIFT, q0z);
        if (side > 0) idx.push(v, v + 2, v + 1, v, v + 3, v + 2); else idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      }
      if (rift.kind === 'lava') {
        // drei Bahnen: dunkle Kruste an den Wänden, glühende Ader in der Mitte (Eckpunktfarben, über die Länge mit ruhigem Rauschen)
        const v = lavaPos.length / 3, hw = riftWallOff(rift.w) - 0.05, y = L.floor + LAVA_LIFT;
        lavaPos.push(ax - nx * hw, y, az - nz * hw, ax, y + 0.02, az, ax + nx * hw, y, az + nz * hw, bx - nx * hw, y, bz - nz * hw, bx, y + 0.02, bz, bx + nx * hw, y, bz + nz * hw);
        for (const k of [s, s1]) {
          const eL = 0.08 + 0.16 * hash01(seed + k * 0.21), c = 0.7 + 0.5 * hash01(seed + 17 + k * 0.13), eR = 0.08 + 0.16 * hash01(seed + 41 + k * 0.21);
          lavaCol.push(eL, eL, eL, c, c, c, eR, eR, eR);
        }
        lavaIdx.push(v, v + 1, v + 4, v, v + 4, v + 3, v + 1, v + 2, v + 5, v + 1, v + 5, v + 4);
      }
    }
    if (pos.length) {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const wall = new Mesh(g, wallMat);
      wall.receiveShadow = true;
      o.group.add(wall);
    }
    if (lavaPos.length) {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(lavaPos, 3));
      g.setAttribute('color', new Float32BufferAttribute(lavaCol, 3));
      g.setIndex(lavaIdx);
      g.computeVertexNormals();
      const band = new Mesh(g, lava());
      band.userData.noOutline = true;
      band.castShadow = false;
      o.group.add(band);
      // Glut und Dampf entlang der Spalte
      for (let s = 10; s < total; s += 26) {
        if (inCrossing(rift, total, s)) continue;
        pointAt(rift.pts, s, _p);
        out.glows.push({ kind: 'fire', x: _p.x, y: L.floor + LAVA_LIFT + 0.2, z: _p.z, ground: L.floor + LAVA_LIFT + 0.03, size: 0.9, pool: 7 });
        if (((s / 26) | 0) % 2 === 0) out.vents.push({ x: def.x + _p.x, y: L.floor + LAVA_LIFT + 0.4, z: def.z + _p.z });
      }
    }
    yield;
    // 3. Brücken an den Übergängen: quer zur Spalte, so lang, dass sie beide Böschungen überspannen. Jedes Ende liegt auf der natürlichen Bodenhöhe
    //    seiner Seite (die Brücke neigt sich, wenn die Ufer verschieden hoch sind); das Deck ist ein Laufdeck über der ausgehobenen Spalte.
    for (const t of rift.cross) {
      pointAt(rift.pts, t * total, _p);
      const cx = _p.x, cz = _p.z;
      const yaw = Math.atan2(_p.dx, _p.dz) + Math.PI / 2;
      const len = rift.w + 2 * (L.blend + 1) + 2;
      const b = build('bruecke', o.rnd, len, null, (rift.bridge ?? L.bridge) + (rift.wide ? ':breit' : ''));
      const ex = Math.sin(yaw) * len * 0.5, ez = Math.cos(yaw) * len * 0.5;
      const hA = o.hNat(cx - ex, cz - ez), hB = o.hNat(cx + ex, cz + ez);
      const yA = Number.isFinite(hA) ? hA : 1.3, yB = Number.isFinite(hB) ? hB : 1.3;
      const yMid = (yA + yB) / 2;
      b.g.position.set(cx, yMid, cz);
      b.g.rotation.set(-Math.atan2(yB - yA, len), yaw, 0, 'YXZ');
      o.group.add(b.g);
      (walk.decks ??= []).push({ x: def.x + cx, z: def.z + cz, hw: BRIDGE_DECK_HW * (rift.wide ? BRIDGE_WIDE_K : 1), hl: len / 2, yaw, y0: yA + BRIDGE_DECK_TOP, y1: yB + BRIDGE_DECK_TOP, r2: (len / 2 + BRIDGE_DECK_HW + 1) ** 2 });
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      for (const [w, d, ox = 0, oz = 0] of b.boxes) o.block(boxBlocker(def.x + cx + ox * c + oz * sn, def.z + cz - ox * sn + oz * c, w, d, yaw));
      for (const gl of b.glows ?? []) {
        const gx = cx + gl.x * c + gl.z * sn, gz = cz - gl.x * sn + gl.z * c;
        const gy = yA + (yB - yA) * (gl.z / len + 0.5);
        out.glows.push({ kind: gl.kind, x: gx, y: gy + gl.y, z: gz, ground: gl.gy == null ? null : gy + gl.gy, size: gl.size, pool: gl.pool });
      }
      yield;
    }
  }
  return out;
}
