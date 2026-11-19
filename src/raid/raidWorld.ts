// Die Raid-Insel als Szene: Gelände (Bucht, Strand, Burghügel), Viertel, Burg, Wege, Stege und die zerstörbaren Bauwerke. Alles hängt an EINER
// Wurzelgruppe und wird mit `dispose()` vollständig freigegeben (Geometrien, Materialien, Texturen, Instanzen, Kollider); danach bleibt nichts zurück.
// Die Lebenspunkte und Zustände führt die Sitzung (raidSession.ts); dieses Modul zeigt sie nur an und meldet Treffer der Schiffskanonen.
import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, Group, Mesh, type Object3D, type Scene, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FACTIONS, type FactionId } from '../data/factions';
import type { AmmoId } from '../data/ships';
import { audio } from '../audio/audio';
import { disposeObject } from '../render/dispose';
import { addOutlines } from '../render/outline';
import { toon } from '../render/toon';
import { texDetail } from '../render/texDetail';
import type { BallTarget } from '../naval/naval';
import type { SmokeSystem } from '../world/smoke';
import type { DebrisSystem } from '../world/debris';
import type { ParticleSystem } from '../world/particles';
import type { IslandShape } from '../world/ocean';
import {
  addPlinths, build, colliders, levelFootprint, PLINTHED, SETTLES, settleOnSlope, settleYard, type Built,
} from '../world/architecture';
import { factionBanner, factionBuilt } from '../world/factionArch';
import { factionRole } from '../world/factionMats';
import { boxBlocker, coastK, coastMax, fitHills, IslandGround, shelfOf, WATERLINE, type Blocker, type WalkIsland } from '../world/islandGround';
import { islandTerrain, styleKit } from '../world/islandStyle';
import { cobbleMaterial, dirtMaterial, mergeByMaterial, roadMesh } from '../world/town';
import { floraProto, Scatter, type VegChunk } from '../world/vegetation';
import { hashId, seeded } from '../world/waves';
import type { IslandStyle } from '../data/regions';
import type { StructureType } from '../data/settlements';
import type { RaidLayout, RaidStructureDef, StructureState } from './raidTypes';
import { angleDiff } from '../core/mathUtil';

/**
 * Standfläche unter einem Bauwerk einebnen (Inselkoordinaten von `walk` in Weltmitte): meldet die Fläche an der Insel an und merkt ihre Grenzen, damit
 * das Gelände-Mesh nach dem Aufbau nachgeführt wird (`terrain.refresh`). Liefert die Höhe der Fläche. Genau wie bei den Dörfern der Hauptkarte
 * folgen Laufhöhe und Mesh derselben Rechnung: kein Einsinken, keine Spalten, keine unsichtbaren Stufen.
 */
export function flattenTerrainFootprint(
  walk: WalkIsland, solo: IslandGround, padBounds: [number, number, number, number][],
  wx: number, wz: number, w: number, d: number, yaw: number, blend = 2.4, round = false,
): number {
  let sum = 0, n = 0;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const lx = (i / 4 - 0.5) * w, lz = (j / 4 - 0.5) * d;
    const h = solo.islandHeight(walk, wx + lx * c + lz * sn, wz - lx * sn + lz * c, false, true);
    if (Number.isFinite(h)) { sum += h; n++; }
  }
  if (!n) return 0;
  const y = sum / n;
  const hw = w / 2, hd = round ? w / 2 : d / 2;
  const R = Math.hypot(hw, hd) + blend;
  (walk.pads ??= []).push({ x: wx, z: wz, hw, hd, yaw, blend, y, r2: R * R, round });
  padBounds.push([wx - walk.x - R, wz - walk.z - R, wx - walk.x + R, wz - walk.z + R]);
  return y;
}

const STYLE_OF: Record<FactionId, IslandStyle> = { england: 'festland', niederlande: 'festland', deutschland: 'nord', frankreich: 'festland', kurogane: 'glut', marine: 'festland' };

/** Bausteine der Macht je Eckturm der Burg (Bauart aus data/factions.ts) */
const CORNER_MODEL: Partial<Record<string, [string, number]>> = {
  sternfestung: ['bastion_stern', 1.2], bastion: ['bastion_granit', 1.1], zitadelle: ['wachturm_marine', 1.15], barock: ['pavillon_barock', 0.95],
};

export interface RaidWorldHost {
  /** Schaden an einem Bauwerk melden (die Sitzung rechnet); null = ignorieren (eingerissen, Briefing) */
  damage(structureId: string, dmg: number, ammo: AmmoId): { state: StructureState; hp: number; changed: boolean } | null;
}

export interface RaidWorldDeps {
  scene: Scene;
  layout: RaidLayout;
  /** Mitte der Insel in Weltkoordinaten */
  center: { x: number; z: number };
  factionId: FactionId;
  smoke: SmokeSystem;
  sparks: ParticleSystem;
  debris: DebrisSystem;
  host: RaidWorldHost;
}

/** Laufzeitdaten eines zerstörbaren Bauwerks */
interface StructureRt {
  def: RaidStructureDef;
  state: StructureState;
  intact: Group;
  rubble: Mesh;
  foot: Blocker;
  ship: Blocker | null;
  /** Mitte in Weltkoordinaten und Grundhöhe */
  wx: number; wz: number; y: number;
  smokeT: number;
}

export class RaidWorld implements BallTarget {
  /** Wurzel: alles gehört dazu (Gelände, Bauten, Bewuchs, Bauwerke) */
  readonly root = new Group();
  private statics = new Group();
  private structGroup = new Group();
  readonly walk: WalkIsland;
  readonly shape: IslandShape;
  readonly solo = new IslandGround();
  /** Kacheln des Bewuchses (Sichtweite je Kachel); die Welt zeichnet sie nur in der Nähe */
  chunks: VegChunk[] = [];
  readonly structures = new Map<string, StructureRt>();
  /** Schiffs-Kollider der Bauwerke (an `IslandGround.shipBlockers` anmelden) */
  readonly shipBlockers: Blocker[] = [];
  /** Stege des Burghafens (Weltkoordinaten) und ihre Meshes: erscheinen sofort, sind aber erst nach der Freigabe zum Anlegen benutzbar */
  readonly piers: { ax: number; az: number; bx: number; bz: number; hw: number; y: number }[] = [];
  private disposed = false;
  private theme: FactionId;

  constructor(private deps: RaidWorldDeps) {
    const { layout, center, factionId } = deps;
    this.theme = factionId;
    const F = FACTIONS[factionId];
    const cx = center.x, cz = center.z, r = layout.r;
    const rnd = seeded(hashId(layout.factionId) ^ layout.seed);
    this.root.position.set(cx, 0, cz);
    this.root.add(this.statics, this.structGroup);

    // ---------- Insel: Küste, Hügel, Böschung ----------
    const hills = fitHills(r, layout.coast, layout.hills);
    const walk: WalkIsland = {
      x: cx, z: cz, r, beachY: 1.3, hillY: 1.2, coast: layout.coast,
      hills: hills.map((h) => ({ ...h, x: cx + h.x, z: cz + h.z })),
      shelf: shelfOf(r), blockers: [], reliefAmp: 0.4, reliefSeed: layout.seed & 0xffff,
    };
    const wl = 1 + walk.shelf * WATERLINE;
    this.shape = { x: cx, z: cz, r: r * coastMax(layout.coast) * wl, coast: layout.coast, base: r * wl };
    this.solo.add(walk);
    this.walk = walk;
    const hAt = (lx: number, lz: number) => Math.max(-2, this.solo.height(cx + lx, cz + lz));
    const kit = styleKit(STYLE_OF[factionId]);
    const shapeRnd = seeded(hashId(layout.factionId + 'raid'));
    const terrain = islandTerrain(kit, r, layout.coast, hills, 0.82, shapeRnd, 0.35, walk.shelf, (lx, lz) => { const v = this.solo.height(cx + lx, cz + lz); return Number.isFinite(v) ? v : -1.7; });
    this.statics.add(terrain.beach, ...terrain.hills);
    walk.lift = terrain.liftAt;
    const keep = new Set<Mesh>([terrain.beach, ...terrain.hills]);

    // ---------- Standflächen ----------
    walk.pads = [];
    const padBounds: [number, number, number, number][] = [];
    walk.addPad = (wx, wz, w, d, yaw, blend = 2.4, round = false) => flattenTerrainFootprint(walk, this.solo, padBounds, wx, wz, w, d, yaw, blend, round);

    /** Bau aufstellen: einebnen, auf den Boden setzen, Sockel, Kollisions-Gitter (gedrehte Quader, kein Einsinken) */
    const place = (t: StructureType | Built, x: number, z: number, yaw: number, len?: number) => {
      const pre = typeof t !== 'string';
      const b = pre ? t : build(t, rnd, len, factionId);
      if (pre || SETTLES.has(t) || t === 'marktstand') levelFootprint(b, cx + x, cz + z, yaw, walk.addPad, pre ? 1.4 : 0.9);
      let y = hAt(x, z);
      if (!pre && SETTLES.has(t)) y = settleOnSlope(b, x, z, yaw, hAt);
      else { b.g.position.set(x, y, z); b.g.rotation.y = yaw; }
      settleYard(b, x, z, yaw, hAt);
      if (pre || PLINTHED.has(t)) addPlinths(b, x, z, yaw, hAt);
      this.statics.add(b.g);
      for (const c of colliders(b, cx + x, cz + z, yaw)) walk.blockers.push(c);
      return b;
    };
    const mod = (name: string, k = 1): Built | null => factionBuilt(factionId, name, k);

    // ---------- Burg auf dem Hügel ----------
    const C = layout.castle;
    // Burgplateau: runde Standfläche auf der Hügelkuppe (innerer Hof plus Mauerring), weicher Übergang
    walk.addPad(cx + C.x, cz + C.z, 2 * (C.ringR + 9), 2 * (C.ringR + 9), 0, 26, true);
    this.buildCastle(place, mod, rnd, factionId);

    // ---------- Viertel ----------
    for (const d of layout.districts) {
      for (const b of d.buildings) {
        if (b.t.startsWith('mod:')) {
          const name = b.t.slice(4);
          const built = mod(name);
          if (built) { place(built, b.x, b.z, b.yaw); continue; }
          place(name === 'kran_rad' ? 'kran' : 'lagerhaus', b.x, b.z, b.yaw);
          continue;
        }
        place(b.t as StructureType, b.x, b.z, b.yaw, b.t === 'zaun' ? 8 : undefined);
      }
      for (const p of d.perches) place(this.perchHouse(F.fort.wall, F.fort.stonelight, F.fort.roof, p.w, p.d, p.h), p.x, p.z, p.yaw);
      for (const bar of d.barricades) place(this.barricade(bar.w), bar.x, bar.z, bar.yaw);
    }

    // ---------- Wege ----------
    let ri = 0;
    for (const [pts, w, mat] of [[layout.paths.A, 4.2, cobbleMaterial(2)], [layout.paths.B, 4.6, dirtMaterial(1)]] as const) {
      this.statics.add(roadMesh(pts.map(([x, z]) => [x, z] as [number, number]), w, 0, 0, (x, z) => hAt(x, z), mat, 0.06 + 0.02 * ri++));
    }

    // ---------- Burghafen: Stege (sichtbar, erst nach der Freigabe benutzbar) ----------
    for (const p of layout.piers) {
      const len = Math.hypot(p.bx - p.ax, p.bz - p.az);
      const st = build('steg', rnd, len);
      st.g.position.set(p.ax, 0, p.az);
      st.g.rotation.y = Math.atan2(p.bx - p.ax, p.bz - p.az);
      this.statics.add(st.g);
      this.piers.push({ ax: cx + p.ax, az: cz + p.az, bx: cx + p.bx, bz: cz + p.bz, hw: 1.6, y: 1.45 });
    }

    // ---------- Bewuchs: Bäume und Büsche abseits von Wegen und Bauten ----------
    const veg = new Scatter();
    const dens = Math.max(0.5, Math.min(1.4, texDetail.density));
    const biome = factionId === 'kurogane' ? 'klippe' : 'festland';
    const farFromBuildings = (x: number, z: number, m: number) => !walk.blockers.some((b) => Math.hypot(b.x - (cx + x), b.z - (cz + z)) < b.r + m);
    const nearPath = (x: number, z: number) => [layout.paths.A, layout.paths.B].some((pts) => pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 9));
    for (let i = 0, placed = 0; i < 1400 && placed < Math.round(130 * dens); i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * r * 0.95;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const e = r * coastK(this.walk.coast, Math.atan2(z, x));
      if (Math.hypot(x, z) > e * 0.88 || hAt(x, z) < 1.1 || !farFromBuildings(x, z, 4) || nearPath(x, z)) continue;
      const proto = floraProto(biome, biome === 'klippe' ? 'windkiefer' : rnd() < 0.2 ? 'birke' : 'laubbaum', Math.floor(rnd() * 6));
      veg.add(proto, x, hAt(x, z) - 0.1, z, rnd() * 6.28, 0.8 + rnd() * 0.6);
      walk.blockers.push({ x: cx + x, z: cz + z, r: 0.6 });
      placed++;
    }
    for (let i = 0, placed = 0; i < 1400 && placed < Math.round(160 * dens); i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * r * 0.95;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const e = r * coastK(this.walk.coast, Math.atan2(z, x));
      if (Math.hypot(x, z) > e * 0.9 || hAt(x, z) < 1.1 || !farFromBuildings(x, z, 2) || nearPath(x, z)) continue;
      veg.add(floraProto(biome, 'busch', Math.floor(rnd() * 4)), x, hAt(x, z), z, rnd() * 6.28, 0.8 + rnd() * 0.5);
      placed++;
    }

    // ---------- Gelände nachführen, verschmelzen, Schatten und Konturen ----------
    if (walk.pads.length) {
      const Hn = (lx: number, lz: number) => { const v = this.solo.islandHeight(walk, cx + lx, cz + lz, false, true); return Number.isFinite(v) ? v : -1.7; };
      terrain.refresh(Hn, padBounds);
      padBounds.length = 0;
    }
    mergeByMaterial(this.statics, keep);
    this.chunks = veg.build(this.statics);
    this.statics.traverse((o) => { if ((o as Mesh).isMesh && !o.userData.noOutline) { o.castShadow = true; o.receiveShadow = true; } });
    addOutlines(this.statics);

    // ---------- Zerstörbare Bauwerke ----------
    for (const def of layout.structures) this.buildStructure(def, rnd, hAt);
    this.structGroup.traverse((o) => { if ((o as Mesh).isMesh && !o.userData.noOutline) { o.castShadow = true; o.receiveShadow = true; } });
    addOutlines(this.structGroup);
    deps.scene.add(this.root);
  }

  // ---------- Burg ----------

  private buildCastle(place: (t: StructureType | Built, x: number, z: number, yaw: number, len?: number) => Built, mod: (n: string, k?: number) => Built | null, rnd: () => number, id: FactionId) {
    const { layout } = this.deps;
    const C = layout.castle, F = FACTIONS[id];
    const gAng = (g: { x: number; z: number }) => Math.atan2(g.z - C.z, g.x - C.x);
    const gates = [gAng(C.gateN), gAng(C.gateE)];
    const n = Math.round((Math.PI * 2 * C.ringR) / 6.2);
    const a0 = gates[0];
    const corner = CORNER_MODEL[F.fort.style];
    const ringPt = (i: number) => { const a = a0 + (i / n) * Math.PI * 2; return { a, x: C.x + Math.cos(a) * C.ringR, z: C.z + Math.sin(a) * C.ringR }; };
    for (let i = 0; i < n; i++) {
      const p = ringPt(i), q = ringPt(i + 1);
      const ma = (p.a + q.a) / 2;
      if (gates.some((g) => angleDiff(ma, g) < 7.6 / C.ringR)) continue;
      const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, len = Math.hypot(q.x - p.x, q.z - p.z);
      // Wandstück: Länge entlang der Kante, Außenseite zeigt vom Mittelpunkt weg
      const yaw = Math.atan2(-(q.z - p.z) / len, (q.x - p.x) / len) + Math.PI;
      place('zinnenmauer', mx, mz, yaw).g.scale.x = len / 6.1;
      if (i % 8 === 0) {
        // Ecke: Baustein der Macht, Vorderseite nach außen (vom Burgmittelpunkt weg)
        const m = corner ? mod(corner[0], corner[1]) : null;
        if (m) place(m, p.x, p.z, Math.atan2(Math.cos(p.a), Math.sin(p.a))); else place('zinnenturm', p.x, p.z, rnd() * 6);
      }
    }
    // Tore: Hauptpforte (Route A, nach Norden zum Burghafen) und Ostpforte (Route B)
    for (const g of gates) {
      const gx = C.x + Math.cos(g) * C.ringR, gz = C.z + Math.sin(g) * C.ringR;
      place('torhaus', gx, gz, Math.atan2(Math.cos(g), Math.sin(g)));
      for (const sd of [-1, 1]) {
        const bx = gx + Math.cos(g) * 4 - Math.sin(g) * 9 * sd, bz = gz + Math.sin(g) * 4 + Math.cos(g) * 9 * sd;
        place(factionBanner(id, 1.5), bx, bz, 0);
      }
    }
    // Bergfried samt Hof: der Kommandant wartet in der Mitte (Arena bleibt frei)
    const keepModel = id === 'kurogane' ? mod('dach_kuro', 1.3) : id === 'marine' ? mod('zellenblock_marine', 1.3) : null;
    const ky = Math.atan2(C.arena.x - C.keep.x, C.arena.z - C.keep.z);
    if (keepModel) place(keepModel, C.keep.x, C.keep.z, ky); else place('bergfried', C.keep.x, C.keep.z, ky);
    place(factionBanner(id, 1.8), C.keep.x + 11, C.keep.z + 6, 0);
    place(factionBanner(id, 1.8), C.keep.x - 11, C.keep.z + 6, 0);
    // Hofgebäude im Kreis um die Arena
    const yard: StructureType[] = ['kapelle', 'lagerhaus', 'lagerhaus', 'steinhaus', 'steinhaus'];
    yard.forEach((t, i) => {
      const a = ((i + 0.5) / yard.length) * Math.PI * 2 + a0 + 0.6, d = C.ringR * 0.66;
      const x = C.x + Math.cos(a) * d, z = C.z + Math.sin(a) * d;
      if (Math.hypot(x - C.keep.x, z - C.keep.z) < 20) return;
      place(t, x, z, Math.atan2(C.x - x, C.z - z));
    });
  }

  // ---------- Dachschützenhaus und Straßensperre ----------

  /** Schützenhaus: flaches Dach mit Zinnenrand, Tür; Musketiere stehen oben (Dachhöhe h) */
  private perchHouse(wall: string, trim: string, roof: string, w: number, d: number, h: number): Built {
    const g = new Group();
    const body = new Mesh(new BoxGeometry(w, h, d), toon({ color: wall, detail: 'plaster' }));
    body.position.y = h / 2;
    const top = new Mesh(new BoxGeometry(w + 0.5, 0.35, d + 0.5), toon({ color: trim, detail: 'stone' }));
    top.position.y = h + 0.17;
    g.add(body, top);
    for (const [bw, bd, ox, oz] of [[w + 0.5, 0.45, 0, (d + 0.5) / 2 - 0.22], [w + 0.5, 0.45, 0, -(d + 0.5) / 2 + 0.22], [0.45, d + 0.5, (w + 0.5) / 2 - 0.22, 0], [0.45, d + 0.5, -(w + 0.5) / 2 + 0.22, 0]] as const) {
      const p = new Mesh(new BoxGeometry(bw, 0.9, bd), toon({ color: roof, detail: 'stone' }));
      p.position.set(ox, h + 0.8, oz);
      g.add(p);
    }
    const door = new Mesh(new BoxGeometry(1.3, 2.2, 0.2), toon('#2A1E14'));
    door.position.set(0, 1.1, d / 2 + 0.08);
    g.add(door);
    return { g, boxes: [[w, d]], circles: [] };
  }

  /** Straßensperre: zwei Barrikaden aus Balken und Sandsäcken mit einer Lücke in der Mitte */
  private barricade(w: number): Built {
    const g = new Group();
    const wood = toon('#4A3220'), sack = toon('#B8A070'), iron = toon('#3A3C40');
    const seg = (w - 2.8) / 2;
    const boxes: Built['boxes'] = [];
    for (const sd of [-1, 1]) {
      const ox = sd * (1.4 + seg / 2);
      const base = new Mesh(new BoxGeometry(seg, 0.9, 1.3), sack);
      base.position.set(ox, 0.45, 0);
      g.add(base);
      for (let k = -1; k <= 1; k += 2) {
        const beam = new Mesh(new BoxGeometry(0.22, 2.0, 0.22), wood);
        beam.position.set(ox + k * seg * 0.36, 1.45, 0);
        beam.rotation.z = k * 0.55;
        g.add(beam);
        const spike = new Mesh(new BoxGeometry(0.1, 0.1, 1.1), iron);
        spike.position.set(ox + k * seg * 0.2, 1.1, 0);
        g.add(spike);
      }
      boxes.push([seg, 1.3, ox, 0]);
    }
    return { g, boxes, circles: [] };
  }

  // ---------- Zerstörbare Bauwerke ----------

  private buildStructure(def: RaidStructureDef, rnd: () => number, hAt: (x: number, z: number) => number) {
    const { center, factionId } = this.deps;
    const F = FACTIONS[factionId];
    const g = new Group();
    const h0 = hAt(def.x, def.z);
    const y = Number.isFinite(h0) && h0 > 0.5 ? h0 : 0;
    g.position.set(def.x, y, def.z);
    g.rotation.y = def.yaw;
    const stone = factionRole(factionId, 'stone');
    if (def.kind === 'wall') {
      const n = Math.max(1, Math.round(def.w / 6));
      for (let i = 0; i < n; i++) {
        const b = build('zinnenmauer', rnd, 6, factionId);
        b.g.position.x = -def.w / 2 + (i + 0.5) * (def.w / n);
        b.g.scale.set(def.w / n / 6.1, 1.25, 1.2);
        g.add(b.g);
      }
    } else if (def.kind === 'seagate') {
      const b = build('torhaus', rnd, 0, factionId);
      b.g.scale.set(def.w / 15, 1.3, 1.25);
      g.add(b.g);
    } else if (def.kind === 'tower') {
      const b = build('zinnenturm', rnd, 0, factionId);
      b.g.scale.setScalar(1.25);
      g.add(b.g);
    } else {
      // Küstenbatterie: Sockel mit Brustwehr und drei Kanonen, die aufs Meer zeigen
      const out = Math.atan2(def.x, def.z) - def.yaw;
      const plat = new Mesh(new BoxGeometry(def.w, 2.4, def.d), stone);
      plat.position.y = 1.2;
      g.add(plat);
      const wallMat = factionRole(factionId, 'stonelight');
      for (const [bw, bd, ox, oz] of [[def.w, 1, 0, def.d / 2 - 0.5], [def.w, 1, 0, -def.d / 2 + 0.5], [1, def.d, def.w / 2 - 0.5, 0], [1, def.d, -def.w / 2 + 0.5, 0]] as const) {
        const p = new Mesh(new BoxGeometry(bw, 1.3, bd), wallMat);
        p.position.set(ox, 3.05, oz);
        g.add(p);
      }
      const iron = toon({ color: '#3A3C40', spec: 0.6 });
      for (let k = -1; k <= 1; k++) {
        const cn = new Mesh(new CylinderGeometry(0.34, 0.42, 3.2, 8), iron);
        const ca = out + k * 0.35;
        cn.position.set(Math.sin(ca) * 2.4, 3.1, Math.cos(ca) * 2.4);
        // Rohr waagerecht in Richtung ca (Zylinderachse Y: erst auf die Seite kippen, dann um Y zum Meer drehen)
        cn.rotation.order = 'YXZ';
        cn.rotation.set(Math.PI / 2, ca, 0);
        g.add(cn);
      }
    }
    // Fundament bis unter die Wasserlinie (Bauwerke in der Bucht stehen im Wasser)
    if (def.kind !== 'battery') {
      const foot = new Mesh(new BoxGeometry(def.w + 1.2, 4.6, def.d + 1.2), stone);
      foot.position.y = -1.7;
      g.add(foot);
    }
    this.structGroup.add(g);
    // Trümmer: niedrige, unregelmäßige Blöcke in der Mitte (wird bei BREACHED gezeigt)
    const parts: BufferGeometry[] = [];
    const n = 16 + Math.round(def.w / 3);
    for (let i = 0; i < n; i++) {
      const bw = 0.9 + rnd() * 2.3, bh = 0.5 + rnd() * 0.9, bd = 0.9 + rnd() * 2.0;
      const bg = new BoxGeometry(bw, bh, bd);
      bg.rotateY(rnd() * 3);
      bg.rotateZ((rnd() - 0.5) * 0.4);
      bg.translate((rnd() - 0.5) * def.w * 0.95, -0.2 + bh * 0.35 + rnd() * 0.5, (rnd() - 0.5) * def.d * 1.1);
      parts.push(bg);
    }
    const rubble = new Mesh(mergeGeometries(parts)!, toon({ color: new Color(F.fort.stone).multiplyScalar(0.55), flatShading: true, detail: 'stone' }));
    for (const p of parts) p.dispose();
    rubble.position.copy(g.position);
    rubble.rotation.y = def.yaw;
    rubble.visible = false;
    this.structGroup.add(rubble);
    const wx = center.x + def.x, wz = center.z + def.z;
    // Kollider: für Figuren (Land) und – bis auf Batterien – für Schiffe (Seetor und Mauern sperren die Bucht)
    const foot = boxBlocker(wx, wz, def.w, def.d, def.yaw);
    this.walk.blockers.push(foot);
    let ship: Blocker | null = null;
    if (def.kind !== 'battery') { ship = boxBlocker(wx, wz, def.w, def.d, def.yaw); this.shipBlockers.push(ship); }
    this.structures.set(def.structureId, { def, state: 'INTACT', intact: g, rubble, foot, ship, wx, wz, y, smokeT: 0 });
  }

  // ---------- Treffer und Zustand ----------

  /** Schiffskugeln gegen die Bauwerke (BallTarget): Quader mit Höhe, Zustand und Lebenspunkte kommen aus der Sitzung */
  hitBall(p: Vector3, dmg: number, ammo: AmmoId): boolean {
    for (const s of this.structures.values()) {
      if (s.state === 'BREACHED') continue;
      const d = s.def;
      const dx = p.x - s.wx, dz = p.z - s.wz;
      if (dx * dx + dz * dz > (d.w + d.d) ** 2) continue;
      const c = Math.cos(d.yaw), sn = Math.sin(d.yaw);
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      if (Math.abs(lx) > d.w / 2 + 0.8 || Math.abs(lz) > d.d / 2 + 0.8 || p.y < -1 || p.y > s.y + d.h + 3) continue;
      const res = this.deps.host.damage(d.structureId, dmg, ammo);
      if (!res) return false;
      this.hitFx(p, res.state === 'BREACHED');
      if (res.changed) this.setState(d.structureId, res.state);
      return true;
    }
    return false;
  }

  private hitFx(p: Vector3, big: boolean) {
    const { smoke, sparks, debris } = this.deps;
    const stoneCol = FACTIONS[this.theme].fort.stone;
    audio.play('crack', 1, p);
    sparks.emit(big ? 26 : 12, p.x, p.y, p.z, { speed: 6, up: 5, life: 0.9, color: new Color(1.8, 1.4, 0.9), gravity: 14, spread: 0.4 });
    debris.splinters(p.x, p.y, p.z, 0, 0, big ? 14 : 6, stoneCol);
    smoke.puff(p.x, p.y, p.z, { n: 3, size: 1.4, grow: 6, life: 3.2, tone: 0.6, vy: 1.5, spread: 1, rise: 0.8, alpha: 0.75, wind: 0.8 });
    if (big) audio.play('heavy', 1, p);
  }

  /** Zustand eines Bauwerks anzeigen (Sitzung → Welt): INTACT, DAMAGED (raucht), BREACHED (Trümmer, Kollider fallen weg, Einsturzwolke) */
  setState(structureId: string, state: StructureState) {
    const s = this.structures.get(structureId);
    if (!s || s.state === state) return;
    s.state = state;
    if (state !== 'BREACHED') return;
    s.intact.visible = false;
    s.rubble.visible = true;
    const fi = this.walk.blockers.indexOf(s.foot);
    if (fi >= 0) this.walk.blockers.splice(fi, 1);
    if (s.ship) { const si = this.shipBlockers.indexOf(s.ship); if (si >= 0) this.shipBlockers.splice(si, 1); }
    // Einsturz: dicke Staubwolke, Funken und Trümmerflug
    const { smoke, sparks, debris } = this.deps;
    const top = s.y + s.def.h;
    smoke.puff(s.wx, top * 0.6, s.wz, { n: 10, size: 4, grow: 20, life: 9, tone: 0.5, vy: 4, spread: s.def.w * 0.35, rise: 1.2, alpha: 0.85, glow: 0.2, wind: 0.8, jitter: s.def.w * 0.3 });
    sparks.emit(60, s.wx, top * 0.5, s.wz, { speed: 10, up: 8, life: 1.4, color: new Color(3, 1.6, 0.5), gravity: 12, spread: s.def.w * 0.3 });
    debris.splinters(s.wx, top * 0.7, s.wz, 0, 0, 24, FACTIONS[this.theme].fort.stone);
    audio.play('sink', 0.9, { x: s.wx, z: s.wz });
  }

  /** Rauch über beschädigten Bauwerken; `dt` in Sekunden */
  update(dt: number) {
    for (const s of this.structures.values()) {
      if (s.state !== 'DAMAGED') continue;
      s.smokeT -= dt;
      if (s.smokeT > 0) continue;
      s.smokeT = 0.45 + Math.random() * 0.4;
      const ox = (Math.random() - 0.5) * s.def.w * 0.8;
      this.deps.smoke.puff(s.wx + ox, s.y + s.def.h * (0.5 + Math.random() * 0.5), s.wz, { n: 1, size: 1.2, grow: 5, life: 5, tone: 0.3, vy: 2.2, spread: 0.7, rise: 1, alpha: 0.65, glow: 0.6, wind: 0.9 });
    }
  }

  /** Bewuchs-Kacheln nach Sichtweite ein- und ausblenden (wie die Hauptkarte) */
  cull(camX: number, camZ: number, lod: number) {
    for (const c of this.chunks) {
      const dx = c.x - camX, dz = c.z - camZ, lim = c.max * lod + c.r;
      c.mesh.visible = dx * dx + dz * dz < lim * lim;
    }
  }

  /** Objekt unter einem Punkt (Kontrolle): zählt die Bauwerke, die noch stehen */
  standing(): number { let n = 0; for (const s of this.structures.values()) if (s.state !== 'BREACHED') n++; return n; }

  // ---------- Aufräumen ----------

  /**
   * Alles freigeben: Geometrien, Materialien, Texturen und Instanzen der Wurzelgruppe, Kollider, Stege. Geteilte Ressourcen (Toon-Cache,
   * Bausteine, Banner-Texturen) bleiben erhalten, weil sie mit `markShared` gekennzeichnet sind.
   */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    // Die Bewuchs-Kacheln hängen unter `statics`: `disposeObject` besucht sie samt ihren Konturen (Kontur-Liste, Instanzpuffer). Sie vorher
    // abzuhängen ließ ihre Konturen in der globalen Liste und den ganzen Inselbaum im Speicher zurück (je Raid rund 1 000 Objekte).
    disposeObject(this.root as Object3D);
    this.chunks = [];
    this.structures.clear();
    this.shipBlockers.length = 0;
    this.piers.length = 0;
    this.walk.blockers.length = 0;
    if (this.walk.pads) this.walk.pads.length = 0;
  }
}

