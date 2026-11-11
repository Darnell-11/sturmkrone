import { DoubleSide, type Group } from 'three';
import type { IslandDef } from '../data/regions';
import type { SiteDef } from '../data/settlements';
import { toon } from '../render/toon';
import { build } from './architecture';
import { boxBlocker, coastK, type Blocker, type WalkIsland } from './islandGround';
import { roadMesh } from './town';
import { floraProto, Occupancy, scatterSite, type Biome, type Scatter, type Spot } from './vegetation';
import { hashId, seeded } from './waves';

export interface SiteBuild {
  trees: Spot[];
  bushes: Spot[];
  /** Feuerstellen und Leuchtfeuer (Inselkoordinaten, y = Welt-Höhe) */
  fires: Spot[];
  /** Schornsteine (Inselkoordinaten, y = Welt-Höhe) */
  chimneys: Spot[];
  /** Stege als Strecke in Weltkoordinaten (Schiffskollision) */
  piers: { ax: number; az: number; bx: number; bz: number; hw: number }[];
  /** Hauptsiedlung: hier schlendern die Bewohner (Weltkoordinaten) */
  village: { x: number; z: number; r: number };
}

export interface SiteOpts {
  group: Group;
  def: IslandDef;
  site: SiteDef;
  biome: Biome;
  walk: WalkIsland;
  /** Bodenhöhe in Inselkoordinaten */
  hAt: (x: number, z: number) => number;
  veg: Scatter;
  density: number;
}

const RAD = Math.PI / 180;
/** Häuser, an deren Wänden Gras und bemooste Steine wachsen */
const HOUSES = new Set(['holzhuette', 'steinhaus', 'gasthaus', 'scheune', 'stelzenhuette']);

/**
 * Baut ein handgestaltetes Land aus seinen Daten: Siedlungen mit Kollisions-Gitter, Wege, Stege, Felder
 * und danach den Bewuchs des Bioms um alles herum.
 */
export function buildSite(o: SiteOpts): SiteBuild {
  const { group, def, site, walk, hAt, veg } = o;
  const rnd = seeded(hashId(def.id) ^ 0x51f7a3);
  const r = def.r;
  const E = (a: number) => r * coastK(walk.coast, a);
  const occ = new Occupancy();
  const out: SiteBuild = { trees: [], bushes: [], fires: [], chimneys: [], piers: [], village: { x: def.x, z: def.z, r: r * 0.5 } };
  const clear: { x: number; z: number; r: number }[] = [];
  const block = (b: Blocker) => { walk.blockers.push(b); occ.add(b); };

  site.clusters.forEach((c, ci) => {
    // Mittelpunkt und Ausrichtung der Siedlung: „vorn“ zeigt von der Inselmitte weg (zur Küste)
    let cx: number, cz: number;
    if (c.at) [cx, cz] = c.at;
    else {
      const th = (c.deg ?? 0) * RAD;
      const e = E(Math.atan2(Math.cos(th), Math.sin(th))) * (c.d ?? 0.7);
      cx = Math.sin(th) * e; cz = Math.cos(th) * e;
    }
    const phi = Math.atan2(cx, cz) + (c.turn ?? 0) * RAD;
    const cs = Math.cos(phi), sn = Math.sin(phi);
    clear.push({ x: cx, z: cz, r: c.clear });
    if (ci === 0) out.village = { x: def.x + cx, z: def.z + cz, r: Math.max(14, c.clear * 0.8) };

    for (const it of c.items) {
      const b = build(it.t, rnd, it.len);
      let x = cx + it.x * cs + it.z * sn, z = cz - it.x * sn + it.z * cs;
      const yaw = phi + (it.yaw ?? 0) * RAD;
      let y: number;
      if (b.pier !== undefined) {
        // Steg: seitlich um x versetzt, beginnt 3 m vor der Wasserlinie und läuft in Blickrichtung hinaus
        const dx = Math.sin(yaw), dz = Math.cos(yaw);
        const px = cx + it.x * cs, pz = cz - it.x * sn;
        let t = 0;
        for (let k = 0; k < 8; k++) {
          const qx = px + dx * t, qz = pz + dz * t;
          t += E(Math.atan2(qz, qx)) - Math.hypot(qx, qz);
        }
        t -= 3;
        x = px + dx * t; z = pz + dz * t;
        y = 0;
        out.piers.push({ ax: def.x + x, az: def.z + z, bx: def.x + x + dx * b.pier, bz: def.z + z + dz * b.pier, hw: 1.6 });
        // unter und neben den Bohlen wächst nichts und liegt kein Fels
        for (let s = -6; s <= b.pier; s += 2) occ.add({ x: def.x + x + dx * s, z: def.z + z + dz * s, r: 2.6 });
      } else y = hAt(x, z);
      b.g.position.set(x, y, z);
      b.g.rotation.y = yaw;
      group.add(b.g);
      const c0 = Math.cos(yaw), s0 = Math.sin(yaw);
      const toWorld = (ox: number, oz: number): [number, number] => [def.x + x + ox * c0 + oz * s0, def.z + z - ox * s0 + oz * c0];
      for (const [w, d, ox = 0, oz = 0, by = 0] of b.boxes) {
        const [wx, wz] = toWorld(ox, oz);
        block(boxBlocker(wx, wz, w, d, yaw + by * RAD));
      }
      for (const [cr, ox = 0, oz = 0] of b.circles) {
        const [wx, wz] = toWorld(ox, oz);
        block({ x: wx, z: wz, r: cr });
      }
      if (HOUSES.has(it.t) && b.boxes.length) {
        // dichte Grasbüschel rund um die Wände (Tür und Weg bleiben frei) und bemooste Felsen an den Ecken
        const [bw, bd] = b.boxes[0];
        const ring = Math.round((bw + bd) * 1.3);
        for (let k = 0; k < ring; k++) {
          const t = (k / ring) * 4, side = Math.floor(t), f = t - side;
          const off = 0.3 + rnd() * 0.55;
          let lx = 0, lz = 0;
          if (side === 0) { lx = -bw / 2 + f * bw; lz = bd / 2 + off; }
          else if (side === 1) { lx = bw / 2 + off; lz = bd / 2 - f * bd; }
          else if (side === 2) { lx = bw / 2 - f * bw; lz = -bd / 2 - off; }
          else { lx = -bw / 2 - off; lz = -bd / 2 + f * bd; }
          if (side === 0 && Math.abs(lx) < 2.4) continue;
          const gx = x + lx * c0 + lz * s0, gz = z - lx * s0 + lz * c0, k2 = 1 + rnd() * 0.7;
          veg.add(floraProto(o.biome, rnd() < 0.2 ? 'farn' : 'gras', Math.floor(rnd() * 2)), gx, hAt(gx, gz) - 0.02, gz, rnd() * 6, k2 * 0.6, k2 * 0.7, 0, 0, 1, 1, 1);
        }
        for (let k = 0; k < 4; k++) {
          const sx = k % 2 ? 1 : -1, sz = k < 2 ? 1 : -1;
          if (rnd() < 0.3) continue;
          const lx = sx * (bw / 2 + 0.55 + rnd() * 0.5), lz = sz * (bd / 2 + 0.35 + rnd() * 0.5);
          if (sz > 0 && Math.abs(lx) < 2.4) continue;
          const gx = x + lx * c0 + lz * s0, gz = z - lx * s0 + lz * c0, rs = 0.4 + rnd() * 0.45;
          veg.add(floraProto(o.biome, 'fels', Math.floor(rnd() * 3)), gx, hAt(gx, gz) - 0.05, gz, rnd() * 6, rs, rs * 0.9, 0, 0, 1, 1, 1);
          veg.add(floraProto(o.biome, 'gras', 0), gx + 0.3, hAt(gx, gz), gz, rnd() * 6, 0.75, 0.8, 0, 0, 1, 1, 1);
        }
      }
      const at = (p: [number, number, number]): Spot => ({ x: x + p[0] * c0 + p[2] * s0, y: y + p[1], z: z - p[0] * s0 + p[2] * c0 });
      if (b.fire) out.fires.push(at(b.fire));
      if (b.smoke) out.chimneys.push(at(b.smoke));
      // Feld: goldene Halme in Reihen (instanziert, wiegen sich im Wind)
      if (b.rows) for (const [rx, rz, len] of b.rows) {
        for (let s = 0; s < len; s += 0.55) {
          const lx = rx + s + (rnd() - 0.5) * 0.2, lz = rz + (rnd() - 0.5) * 0.3;
          const fx = x + lx * c0 + lz * s0, fz = z - lx * s0 + lz * c0;
          const k = 0.9 + rnd() * 0.25;
          veg.add(floraProto(o.biome, 'halme', Math.floor(rnd() * 3)), fx, hAt(fx, fz) + 0.1, fz, rnd() * 6, 0.9 + rnd() * 0.3, 0.85 + rnd() * 0.3, 0, 0, 1.3 * k, 1.08 * k, 0.6 * k);
        }
      }
    }
  });

  // Wege: festgetretene Erde, liegt als Band auf dem Boden (Tiefenverschiebung gegen Flimmern auf der Wiese)
  if (site.roads.length) {
    const dirt = toon({ color: '#8C7450', detail: 'sand', rim: 0.1, puddles: 0.7, layer: 3, side: DoubleSide });
    for (const road of site.roads) {
      // Punkte, die über die Küste hinausragen, an den Strand zurückholen
      const pts = road.pts.map(([x, z]): [number, number] => {
        const d = Math.hypot(x, z), lim = E(Math.atan2(z, x)) * 0.95;
        return d > lim ? [(x / d) * lim, (z / d) * lim] : [x, z];
      });
      group.add(roadMesh(pts, road.w, 0, 0, hAt, dirt));
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
        for (let k = 0; k <= n; k++) occ.add({ x: def.x + ax + (bx - ax) * (k / n), z: def.z + az + (bz - az) * (k / n), r: road.w / 2 + 0.3 });
        // Wegrand: Grasbüschel und gelegentlich ein bemooster Stein, beidseitig
        const len = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / len, nz = (bx - ax) / len;
        for (let d = 0; d < len; d += 1.1) {
          for (const sd of [-1, 1]) {
            if (rnd() < 0.4) continue;
            const e = road.w / 2 + 0.25 + rnd() * 0.5;
            const px = ax + ((bx - ax) * d) / len + nx * sd * e, pz = az + ((bz - az) * d) / len + nz * sd * e;
            if (Math.hypot(px, pz) > E(Math.atan2(pz, px)) * 0.93) continue;
            if (rnd() < 0.1) { const rs = 0.3 + rnd() * 0.35; veg.add(floraProto(o.biome, 'fels', Math.floor(rnd() * 3)), px, hAt(px, pz) - 0.05, pz, rnd() * 6, rs, rs * 0.9, 0, 0, 1, 1, 1); }
            else { const k2 = 0.9 + rnd() * 0.7; veg.add(floraProto(o.biome, 'gras', Math.floor(rnd() * 2)), px, hAt(px, pz) - 0.02, pz, rnd() * 6, k2 * 0.6, k2 * 0.7, 0, 0, 1, 1, 1); }
          }
        }
      }
    }
  }

  // Grabstelle für Schatzkarten freihalten (gleiche Formel wie SeaLife.addDig)
  { const da = (def.x * 13 + def.z * 7) % (Math.PI * 2); occ.add({ x: def.x + Math.cos(da) * r * 0.55, z: def.z + Math.sin(da) * r * 0.55, r: 3 }); }

  const grown = scatterSite({
    layers: site.scatter, biome: o.biome, r, wx: def.x, wz: def.z, edge: E, hAt, veg, occ, clear,
    blockers: walk.blockers, rnd, density: o.density, seed: hashId(def.id) & 0xffff,
  });
  out.trees = grown.trees;
  out.bushes = grown.bushes;
  return out;
}
