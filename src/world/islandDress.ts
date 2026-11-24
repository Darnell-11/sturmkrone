import { cobbleMaterial, dirtMaterial, roadMesh } from './town';
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  ExtrudeGeometry,
  Shape,
  ShapeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  DoubleSide,
  type Material,
  type MeshToonMaterial,
} from 'three';
import type { IslandDef, IslandStyle } from '../data/regions';
import { toon } from '../render/toon';
import { coalMaterial } from '../render/lampMaterials';
import { boxBlocker, coastK, type WalkIsland } from './islandGround';
import { plant, type StyleKit } from './islandStyle';
import { hashId, seeded } from './waves';
import { markWind, windify } from '../render/wind';
import { cachedProto, envProto, floraProto, groundY, noise, type Biome, type Scatter } from './vegetation';
import { auditPlacement } from './placeAudit';
import type { GlowPlaced } from '../render/glow';
import { archGroup, hasArch } from './envModels';
import { lighthouseBeams } from './lighthouseBeam';
import { addPlinths, build, colliders, levelFootprint, PLINTHED, SETTLES, settleOnSlope, settleYard, type Built } from './architecture';
import { FACTIONS, type FactionId } from '../data/factions';
import { factionBanner, factionBuilt } from './factionArch';
import type { StructureType } from '../data/settlements';
import { waveFlag } from '../render/flags';
import { clamp01 } from '../core/mathUtil';

/**
 * Banner der Besitzmacht an der Landestelle einer handgebauten Insel (Festland, Palmenküste, Sturmklippe, Fährholm): `buildSite` kennt
 * den Besitz nicht, darum setzt die Welt die Banner danach. Meidet Hindernisse; liefert die Zahl der gesetzten Banner.
 */
export function plantFactionBanners(group: Group, def: IslandDef, walk: WalkIsland, hAt: (x: number, z: number) => number): number {
  if (!def.factionId) return 0;
  const seaA = Math.atan2(-def.z, -def.x);
  let n = 0;
  for (const da of [-0.16, 0.16]) {
    const a = seaA + da, d = def.r * coastK(walk.coast, a) * 0.84;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (walk.blockers.some((b) => Math.hypot(b.x - (walk.x + x), b.z - (walk.z + z)) < (b.r ?? 2) + 3)) continue;
    const b = factionBanner(def.factionId, 1);
    b.g.position.set(x, hAt(x, z), z);
    group.add(b.g);
    walk.blockers.push({ x: walk.x + x, z: walk.z + z, r: 0.5 });
    n++;
  }
  return n;
}

/** Ein Punkt in Inselkoordinaten (y = Bodenhöhe) */
export interface Spot { x: number; y: number; z: number }

export interface DressOpts {
  group: Group;
  def: IslandDef;
  kit: StyleKit;
  walk: WalkIsland;
  hAt: (x: number, z: number) => number;
  glow: Set<Mesh>;
  density: number;
  style: IslandStyle;
  /** Sammler für instanzierten Bewuchs (Bäume, Büsche, Gras, Felsen) */
  veg: Scatter;
  /** Höhe der Wiesenfläche über dem Boden an einer Stelle (Inselkoordinaten), damit Wege nicht darunter verschwinden */
  liftAt?: (x: number, z: number) => number;
}

const FLOWERS: Record<IslandStyle, string[]> = {
  tropisch: ['#C8443C', '#E8B84A', '#EFE9DA', '#B663C2', '#E07A3A'],
  nebel: ['#B8C2C4', '#8C9E94', '#D8D4C4'],
  nord: ['#E4E0D2', '#7BA2C4', '#C8B256'],
  glut: ['#D2602E', '#8C4432'],
  sturm: ['#C2CCD2', '#8FA0AC'],
  schlund: ['#78D8F2', '#A886F0'],
  festland: ['#E8D44A', '#F2F0E6', '#C8443C', '#7B8FE0'],
  klippe: ['#C2CCD2', '#9AA8C8'],
  kreide: ['#F2F0E6', '#C8443C', '#E8D44A'],
  atoll: ['#F06A90', '#F4F0E0', '#F0A030'],
  weinland: ['#8A5AC8', '#C84A6A', '#E8D44A'],
};

/** Bewuchs-Palette (Blender-Pflanzen) je Inselstil; null = eigene Farbwelt des Stils (Glut, Schlund, Nebel behalten die Eigenbau-Pflanzen) */
const biomeOf = (st: IslandStyle): Biome | null =>
  st === 'tropisch' ? 'tropisch' : st === 'festland' || st === 'nord' ? 'festland' : st === 'klippe' || st === 'sturm' ? 'klippe'
    : st === 'kreide' || st === 'atoll' || st === 'weinland' ? st : null;

/**
 * Stattet eine Insel aus: Pflanzen, Felsen, Strandgut und – je nach Art – Lager, Dorf, Wrack, Ruine oder Wehranlage.
 * Alles wird aus dem Namen der Insel ausgewürfelt: jede Insel sieht anders aus, aber bei jedem Start gleich.
 * Liefert Baum-, Busch- und Feuerplätze für Tiere und Effekte.
 */
export type Dressed = { trees: Spot[]; bushes: Spot[]; fires: Spot[]; glows: GlowPlaced[]; patrols: { x: number; z: number }[][] };

/** Ausstattung einer Insel in einem Zug (die Welt baut sie beim Laden so, siehe `dressIslandSteps`) */
export function dressIsland(o: DressOpts): Dressed {
  const it = dressIslandSteps(o);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/**
 * Dieselbe Ausstattung in Teilschritten (Streaming, Phase 4.3A): der Iterator gibt zwischen den Abschnitten (Bauten je Inselart, Bäume, Büsche,
 * Gras, Blumen, Boden, Felsen, Wege) und in den langen Schleifen ab, damit der WorldStreamer die Arbeit auf mehrere Bilder verteilen kann.
 * Das Ergebnis ist dasselbe wie in einem Zug: gleiche Zufallsfolge, gleiche Reihenfolge.
 */
export function* dressIslandSteps(o: DressOpts): Generator<void, Dressed> {
  const { group, def, kit, walk, hAt, glow, style, veg } = o;
  const rnd = seeded(hashId(def.id) ^ 0x9e3779b9);
  const r = def.r;
  const dens = Math.max(0.4, Math.min(1.6, o.density));
  /** Küstenradius in einer Richtung (die Inseln sind nicht mehr rund) */
  const E = (a: number) => r * coastK(walk.coast, a);
  const trees: Spot[] = [], bushes: Spot[] = [], fires: Spot[] = [], glows: GlowPlaced[] = [];
  /** Rundgänge der Wachen einer Festung (Inselkoordinaten): Burghof, Wehrgang, Tor – Mitte – Tor */
  const patrols: { x: number; z: number }[][] = [];
  // belegte Flächen (Inselkoordinaten): vorhandene Hindernisse plus alles, was hier entsteht
  const taken: { x: number; z: number; r: number }[] = walk.blockers.map((b) => ({ x: b.x - walk.x, z: b.z - walk.z, r: b.r }));
  if (def.kind === 'ruin' || def.kind === 'boss' || def.kind === 'citadel' || def.kind === 'marinefort') taken.push({ x: 0, z: 0, r: def.kind === 'citadel' || (def.kind === 'marinefort' && def.marine === 'hq') ? 14 : 8 }); // Kristall / Bosskampf in der Mitte
  // Grabstelle für Schatzkarten freihalten (gleiche Formel wie SeaLife.addDig)
  { const da = (def.x * 13 + def.z * 7) % (Math.PI * 2); taken.push({ x: Math.cos(da) * r * 0.55, z: Math.sin(da) * r * 0.55, r: 3 }); }
  /** Auf einem Weg (Erde, Pflaster) wächst nichts: Abstand zum Linienzug (Inselkoordinaten) */
  const onPath = (x: number, z: number, rr: number) => {
    for (const pa of paths) {
      for (let i = 1; i < pa.pts.length; i++) {
        const [ax, az] = pa.pts[i - 1], [bx, bz] = pa.pts[i];
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const t = clamp01(((x - ax) * dx + (z - az) * dz) / l2);
        if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < pa.w / 2 + 0.35 + rr) return true;
      }
    }
    return false;
  };
  const free = (x: number, z: number, rr: number) => taken.every((t) => Math.hypot(x - t.x, z - t.z) > t.r + rr) && !onPath(x, z, rr);
  const block = (x: number, z: number, rr: number) => { taken.push({ x, z, r: rr }); walk.blockers.push({ x: walk.x + x, z: walk.z + z, r: rr }); };
  /** Rechteck-Kollider (Mauern, Steinblöcke): gedreht wie das Objekt */
  const blockBox = (x: number, z: number, w: number, d: number, yaw: number) => {
    taken.push({ x, z, r: Math.hypot(w, d) / 2 });
    walk.blockers.push(boxBlocker(walk.x + x, walk.z + z, w, d, yaw));
  };
  const spot = (minD: number, maxD: number, rr: number, tries = 12): { x: number; z: number } | null => {
    for (let i = 0; i < tries; i++) {
      const a = rnd() * Math.PI * 2, d = E(a) * (minD + rnd() * (maxD - minD));
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (free(x, z, rr)) return { x, z };
    }
    return null;
  };
  const put = (m: Group | Mesh, x: number, z: number, yaw = rnd() * Math.PI * 2, sink = 0) => {
    m.position.set(x, hAt(x, z) - sink, z);
    m.rotation.y = yaw;
    auditPlacement?.(def.id, 'put', m, hAt);
    group.add(m);
    return m;
  };
  /** Bauwerk aus world/architecture.ts aufstellen, mit seinem Kollisions-Gitter */
  // `t` darf auch ein fertiger Baustein sein (Blender-Module der Weltmächte aus factionArch.ts): sie werden eingeebnet und bekommen einen Sockel
  const mount = (t: StructureType | Built, x: number, z: number, yaw: number, len?: number, sx = 1) => {
    const pre = typeof t !== 'string';
    // Bauten einer Weltmacht (Tore, Türme, Mauern …) tragen die Farbwelt ihrer Macht (architecture.ts, THEMED_TYPES)
    const b = pre ? t : build(t, rnd, len, def.factionId ?? null);
    if (sx !== 1) { b.g.scale.x = sx; b.boxes = b.boxes.map(([w, d, ox = 0, oz = 0, by = 0]) => [w * sx, d, ox * sx, oz, by] as [number, number, number, number, number]); }
    if (pre || SETTLES.has(t) || t === 'marktstand') levelFootprint(b, walk.x + x, walk.z + z, yaw, walk.addPad, pre ? 1.4 : 0.9);
    let y = hAt(x, z);
    if (!pre && SETTLES.has(t)) y = settleOnSlope(b, x, z, yaw, hAt);
    else { b.g.position.set(x, y, z); b.g.rotation.y = yaw; }
    settleYard(b, x, z, yaw, hAt);
    if (pre || PLINTHED.has(t)) addPlinths(b, x, z, yaw, hAt);
    auditPlacement?.(def.id, pre ? 'faction' : t, b.g, hAt);
    group.add(b.g);
    for (const c of colliders(b, walk.x + x, walk.z + z, yaw)) { walk.blockers.push(c); taken.push({ x: c.x - walk.x, z: c.z - walk.z, r: c.r }); }
    if (b.fire) fires.push({ x: x + b.fire[0] * Math.cos(yaw) + b.fire[2] * Math.sin(yaw), y: y + b.fire[1], z: z - b.fire[0] * Math.sin(yaw) + b.fire[2] * Math.cos(yaw) });
    for (const gl of b.glows ?? []) glows.push({ kind: gl.kind, x: x + gl.x * Math.cos(yaw) + gl.z * Math.sin(yaw), y: y + gl.y, z: z - gl.x * Math.sin(yaw) + gl.z * Math.cos(yaw), ground: gl.gy == null ? null : y + gl.gy, size: gl.size, pool: gl.pool, pdx: (gl.px ?? 0) * Math.cos(yaw) + (gl.pz ?? 0) * Math.sin(yaw), pdz: -(gl.px ?? 0) * Math.sin(yaw) + (gl.pz ?? 0) * Math.cos(yaw), glint: gl.glint });
  };
  /** Wohnhäuser je Region: jede Gegend baut anders */
  const HOMES: Record<IslandStyle, (StructureType | 'rundhuette')[]> = {
    tropisch: ['kolonialhaus', 'stelzenhuette', 'rundhuette', 'kolonialhaus', 'stelzenhuette'],
    nebel: ['stelzenhuette', 'holzhuette', 'stelzenhuette'],
    nord: ['fachwerkhaus', 'holzhuette', 'steinhaus', 'fachwerkhaus', 'scheune'],
    glut: ['steinhaus', 'steinhaus', 'holzhuette'],
    sturm: ['steinhaus', 'holzhuette', 'steinhaus', 'wachturm'],
    schlund: ['steinhaus', 'stelzenhuette', 'holzhuette'],
    festland: ['fachwerkhaus', 'steinhaus', 'holzhuette', 'kolonialhaus'],
    klippe: ['steinhaus'],
    kreide: ['steinhaus', 'fachwerkhaus', 'holzhuette'],
    atoll: ['stelzenhuette', 'rundhuette', 'stelzenhuette'],
    weinland: ['kolonialhaus', 'steinhaus', 'fachwerkhaus'],
  };
  /** Wege (Inselkoordinaten, Breite): werden am Ende als Erdbänder auf den Boden gelegt */
  const paths: { pts: [number, number][]; w: number }[] = [];
  const placedHomes: { x: number; z: number; yaw: number }[] = [];
  const home = (t: StructureType | 'rundhuette', x: number, z: number, yaw: number) => {
    placedHomes.push({ x, z, yaw });
    // Kurogane baut mit geschwungenen Dächern und dunklem Holz (Blender-Baustein haus_kuro)
    const kuro = def.factionId === 'kurogane' && t !== 'wachturm' ? factionBuilt('kurogane', 'haus_kuro') : null;
    if (kuro) mount(kuro, x, z, yaw);
    else if (t === 'rundhuette') { put(hut(rnd), x, z, yaw); block(x, z, 2.2); } else mount(t, x, z, yaw);
  };
  /** Weg von der Tür eines Hauses zu einem Punkt: leicht geschwungen */
  const pathFromDoor = (h: { x: number; z: number; yaw: number }, to: { x: number; z: number }, w = 2.2) => {
    const door: [number, number] = [h.x + Math.sin(h.yaw) * 3.6, h.z + Math.cos(h.yaw) * 3.6];
    const mx = (door[0] + to.x) / 2 + (rnd() - 0.5) * 2.4, mz = (door[1] + to.z) / 2 + (rnd() - 0.5) * 2.4;
    paths.push({ pts: [door, [mx, mz], [to.x, to.z]], w });
  };
  const grassCol = new Color(((kit.grass as MeshToonMaterial).color ?? new Color('#55894a')).getHex());
  const rockCol = new Color(((kit.rock as MeshToonMaterial).color ?? new Color('#7a746a')).getHex());
  const tuftMats = [0.85, 1, 1.18].map((k) => markWind(toon({ color: grassCol.clone().multiplyScalar(k), flatShading: true })));
  const rockMats = [0.85, 1, 1.15].map((k) => toon({ color: rockCol.clone().multiplyScalar(k), flatShading: true }));
  const darkWood = toon('#4A3220'), canvas = toon({ color: '#C9B48E', side: DoubleSide });

  /**
   * Festung Nordwacht: Ringmauer mit Zinnen und drei Toren, Rundtürme mit Schieferdächern und Wimpeln,
   * ein hoher Bergfried – die mächtigste Seefestung der Welt soll auch so aussehen.
   */
  /**
   * Burgring: ein geschlossenes Vieleck aus Zinnenmauern (Länge je Kante ≈ 7 m, auf die Kante gestreckt), Torhäuser an gleichmäßig
   * verteilten Stellen (15 m Kante, Durchgang nach außen), Rundtürme an jeder dritten Mauerecke. Die Kanten schließen lückenlos,
   * weil erst die Eckpunkte entlang der Küstenform berechnet werden und jedes Teil genau zwischen zwei Eckpunkten sitzt.
   * Liefert Eckpunkte, Mittelpunkte der Tore und den Radius.
   */
  const curtainWall = (frac: number, nGates: number, opt: { towerEvery?: number; onTower?: (q: { x: number; z: number }) => void } = {}) => {
    const ringR = (a: number) => E(a) * frac;
    let avg = 0;
    for (let i = 0; i < 24; i++) avg += ringR((i / 24) * Math.PI * 2);
    avg /= 24;
    const wa = rnd() * Math.PI * 2;
    const sector = (Math.PI * 2 * avg) / nGates;
    const edges: { gate: boolean; len: number }[] = [];
    for (let g = 0; g < nGates; g++) {
      edges.push({ gate: true, len: 15 });
      const nW = Math.max(2, Math.round((sector - 15) / 7));
      for (let i = 0; i < nW; i++) edges.push({ gate: false, len: Math.max(4, (sector - 15) / nW) });
    }
    let a = wa;
    const raw = [wa];
    for (const e of edges) { a += e.len / ringR(a); raw.push(a); }
    const k = (Math.PI * 2) / (a - wa);
    const ang = raw.map((x) => wa + (x - wa) * k);
    const V = ang.slice(0, edges.length).map((x) => ({ x: Math.cos(x) * ringR(x), z: Math.sin(x) * ringR(x), a: x }));
    const gates: { x: number; z: number; a: number }[] = [];
    let walls = 0;
    edges.forEach((e, i) => {
      const p = V[i], q = V[(i + 1) % V.length];
      const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz) || 1;
      const yaw = Math.atan2(-dz / len, dx / len) + Math.PI;     // lokales +z zeigt nach außen, lokales x läuft entlang der Kante
      const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
      if (e.gate) { mount('torhaus', mx, mz, yaw, undefined, len / 15); gates.push({ x: mx, z: mz, a: Math.atan2(mz, mx) }); }
      else {
        mount('zinnenmauer', mx, mz, yaw, undefined, len / 6);
        walls++;
        if (walls % (opt.towerEvery ?? 3) === 0 && !edges[(i + 1) % edges.length].gate) {
          if (opt.onTower) opt.onTower(q); else mount('zinnenturm', q.x, q.z, rnd() * 6);
        }
      }
    });
    if (import.meta.env.DEV) ((window as unknown as { __gates?: Record<string, { x: number; z: number }[]> }).__gates ??= {})[def.id] = gates.map((g2) => ({ x: walk.x + g2.x, z: walk.z + g2.z })); // QA-Hilfe (nur Entwicklung)
    return { V, gates, avg, wa };
  };
  /** Gepflasterte Wege von den Toren zur Hofmitte */
  const courtRoads = (gates: { x: number; z: number }[], to: { x: number; z: number }) => {
    gates.forEach((g2, i) => {
      const pts: [number, number][] = [[g2.x * 1.18, g2.z * 1.18], [g2.x * 1.0, g2.z * 1.0], [g2.x * 0.7 + to.x * 0.3, g2.z * 0.7 + to.z * 0.3], [g2.x * 0.3 + to.x * 0.7, g2.z * 0.3 + to.z * 0.7]];
      group.add(roadMesh(pts, 4.4, 0, 0, (x, z) => hAt(x, z), cobbleMaterial(i + 1)));
    });
  };

  /** Festung Nordwacht: Ringmauer mit drei Torhäusern, Bergfried, Kapelle, Lagerhäuser und Kasernen im Hof */
  const fortress = () => {
    // Nordwacht gehört der Preußischen Marine: Granitbastionen an den Mauerecken (Blender-Baustein bastion_granit)
    const prussian = def.factionId === 'deutschland';
    const { gates, avg, wa } = curtainWall(0.5, 3, prussian ? {
      towerEvery: 4,
      onTower: (q) => { const b = factionBuilt('deutschland', 'bastion_granit'); if (b) mount(b, q.x, q.z, Math.atan2(q.x, q.z)); else mount('zinnenturm', q.x, q.z, rnd() * 6); },
    } : {});
    const ka = wa + Math.PI + 0.35;
    const kd = avg * 0.5;
    const keep = { x: Math.cos(ka) * kd, z: Math.sin(ka) * kd };
    mount('bergfried', keep.x, keep.z, Math.atan2(-keep.x, -keep.z));
    courtRoads(gates, { x: keep.x * 0.5, z: keep.z * 0.5 });
    // Hofgebäude an den Wegen entlang, Türen zur Hofmitte
    const inner: [StructureType, number, number][] = [['kapelle', 0.56, 1.0], ['lagerhaus', 0.6, 2.0], ['steinhaus', 0.62, 2.7], ['steinhaus', 0.62, 3.5], ['lagerhaus', 0.6, 4.2], ['steinhaus', 0.62, 5.4], ['kran', 0.72, 0.4]];
    for (const [t, f, an] of inner) {
      const aa = wa + an, dd = avg * f;
      const x = Math.cos(aa) * dd, z = Math.sin(aa) * dd;
      if (free(x, z, 6)) mount(t, x, z, Math.atan2(-x, -z) + (rnd() - 0.5) * 0.3);
    }
  };

  /** Wappen-Banner der Macht auf einem Mast; `yaw` nur der Ordnung halber (das Tuch hängt zu beiden Seiten gleich) */
  const banner = (fid: FactionId, x: number, z: number, yaw: number, k = 1) => {
    if (!free(x, z, 0.9 * k)) return false;
    // Das Banner bleibt ein eigenes Netz (nicht verschmolzen) und trägt die Macht: bei einer Besatzung der Insel tauscht die Welt es gegen die Flagge des Spielers
    const b = factionBanner(fid, k);
    mount(b, x, z, yaw);
    // Beim Verschmelzen der Insel lösen sich die behaltenen Meshes aus ihrer Gruppe: jedes Teil trägt darum die Lage des ganzen Banners
    const pose = { x: b.g.position.x, y: b.g.position.y, z: b.g.position.z, yaw: b.g.rotation.y, k: b.g.scale.x, fid };
    b.g.traverse((m) => { if ((m as Mesh).isMesh) { glow.add(m as Mesh); m.userData.bannerPose = pose; } });
    return true;
  };

  /**
   * Große Festung einer Weltmacht (Endgame-Inseln und Marine-Anlagen): Burgring aus Mauern und Toren, an den Ecken Bausteine der Macht
   * (Sternbastion, Granitbastion, Barockpavillon, Marine-Wachturm), im Hof ihre Gebäude (Kontore, Pavillons, Kurogane-Häuser,
   * Zellenblöcke), Banner an jedem Tor. Der Platz in der Mitte bleibt frei: dort wartet der Kommandant.
   */
  const grandFortress = (fid: FactionId) => {
    const F = FACTIONS[fid].fort;
    const big = r > 200;
    const outward = (q: { x: number; z: number }) => Math.atan2(q.x, q.z);
    const inward = (x: number, z: number) => Math.atan2(-x, -z);
    // Auf den großen Endgame-Inseln bauen die Mächte ihre Bausteine größer (Bastionen 1,8-fach, Hallen 1,4-fach), damit die Festung gewaltig wirkt
    const kc = big ? 1.8 : 1, kh = big ? 1.4 : 1;
    const corner = (model: string) => (q: { x: number; z: number }) => {
      const b = factionBuilt(fid, model, kc);
      if (b) mount(b, q.x, q.z, outward(q)); else mount('zinnenturm', q.x, q.z, rnd() * 6);
    };
    const onTower = F.style === 'sternfestung' ? corner('bastion_stern') : F.style === 'bastion' ? corner('bastion_granit')
      : F.style === 'zitadelle' ? corner('wachturm_marine') : F.style === 'barock' ? corner('pavillon_barock') : undefined;
    const fort = curtainWall(big ? 0.6 : 0.58, big ? 6 : 2, { towerEvery: big ? 9 : 4, onTower });
    courtRoads(fort.gates, { x: 0, z: 0 });
    // Hofgebäude im Ring um die Mitte, Türen zur Hofmitte
    const ringAt = (items: (StructureType | Built | null)[], frac: number, a0: number, rr: number) => {
      items.forEach((it, i) => {
        if (!it) return;
        const a = a0 + (i / items.length) * Math.PI * 2, d = fort.avg * frac;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (free(x, z, rr)) mount(it, x, z, inward(x, z) + (rnd() - 0.5) * 0.12);
      });
    };
    const keepA = fort.wa + Math.PI + 0.3, kx = Math.cos(keepA) * fort.avg * 0.6, kz = Math.sin(keepA) * fort.avg * 0.6;
    const nHall = big ? 9 : 4;
    const mk = (model: string, n: number, k = kh) => Array.from({ length: n }, () => factionBuilt(fid, model, k));
    switch (F.style) {
      case 'sternfestung':
        mount('bergfried', kx, kz, inward(kx, kz));
        ringAt(['kapelle', 'lagerhaus', 'lagerhaus', 'steinhaus', 'steinhaus', 'steinhaus', 'steinhaus', 'lagerhaus'].slice(0, nHall - 1) as StructureType[], 0.74, fort.wa + 0.25, 6.5);
        break;
      case 'kontor': {
        mount('kapelle', kx, kz, inward(kx, kz));
        ringAt([...mk('kontor_giebel', nHall), 'lagerhaus'], 0.7, fort.wa + 0.3, 7);
        // Hafenkräne am Ufer vor der Mauer, Ausleger zum Meer
        const seaA = Math.atan2(-def.z, -def.x);
        for (const da of [-0.3, 0, 0.3]) {
          const a = seaA + da, d = E(a) * 0.86, kb = factionBuilt(fid, 'kran_rad', kh);
          if (kb && free(Math.cos(a) * d, Math.sin(a) * d, 4)) mount(kb, Math.cos(a) * d, Math.sin(a) * d, Math.PI / 2 - a);
        }
        break;
      }
      case 'bastion':
        mount('bergfried', kx, kz, inward(kx, kz));
        ringAt(['lagerhaus', 'steinhaus', 'lagerhaus', 'steinhaus', 'lagerhaus', 'steinhaus', 'kapelle'].slice(0, nHall - 1) as StructureType[], 0.74, fort.wa + 0.2, 6.5);
        break;
      case 'barock':
        mount('kapelle', kx, kz, inward(kx, kz));
        ringAt([...mk('pavillon_barock', big ? 7 : 3), 'lagerhaus'], 0.7, fort.wa + 0.2, 8);
        break;
      case 'burg': {
        const keep = factionBuilt(fid, 'dach_kuro', big ? 1.6 : 1);
        if (keep) mount(keep, kx, kz, inward(kx, kz)); else mount('bergfried', kx, kz, inward(kx, kz));
        ringAt([...mk('haus_kuro', big ? 10 : 5)], 0.72, fort.wa + 0.2, 6);
        // schwarze Tore vor den Torhäusern
        for (const g2 of fort.gates) {
          const tb = factionBuilt(fid, 'tor_kuro', kh), n = Math.hypot(g2.x, g2.z) || 1;
          if (tb) mount(tb, g2.x * 1.1, g2.z * 1.1, outward({ x: g2.x / n, z: g2.z / n }));
        }
        break;
      }
      case 'zitadelle': {
        const cells = factionBuilt(fid, 'zellenblock_marine', kh);
        if (cells) mount(cells, kx, kz, inward(kx, kz)); else mount('bergfried', kx, kz, inward(kx, kz));
        // Weißwacht: um das Zentrum weitere Zellenblöcke (das Gefängnis wächst in die Tiefe), davor Lager und Kapelle
        ringAt([...(big ? mk('zellenblock_marine', 5) : [null]), 'kapelle', 'lagerhaus', 'lagerhaus'], 0.74, fort.wa + 0.15, 9);
        break;
      }
    }
    // Rundgänge für die Wachen der Besatzung (Spieler hält die Insel): Burghof, Wehrgang innen an der Mauer, von Tor zu Tor durch die Mitte
    const ring = (frac: number, n: number, a0: number) => Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * Math.PI * 2; return { x: Math.cos(a) * fort.avg * frac, z: Math.sin(a) * fort.avg * frac }; });
    patrols.push(ring(0.5, 8, fort.wa + 0.1), ring(0.86, 12, fort.wa + 0.4));
    if (fort.gates.length) patrols.push(fort.gates.flatMap((g2) => [{ x: g2.x * 0.78, z: g2.z * 0.78 }, { x: 0, z: 0 }]));
    // Banner der Macht links und rechts neben jedem Tor (außen)
    for (const g2 of fort.gates) {
      const n = Math.hypot(g2.x, g2.z) || 1, nx = g2.x / n, nz = g2.z / n;
      for (const sd of [-1, 1]) banner(fid, g2.x * 1.07 - nz * 7.5 * sd, g2.z * 1.07 + nx * 7.5 * sd, outward({ x: nx, z: nz }), big ? 1.4 : 1.1);
    }
  };

  // ---------- Bauten je Inselart (zuerst, damit sie Platz bekommen) ----------
  switch (def.kind) {
    case 'camp': {
      // Piratenlager: Holzpalisade mit Tor zum Meer, zwei Wachtürme, Zelte und Hütte um eine Feuerstelle, Erdplatz, hohes Banner
      const R = 15;
      const c = spot(0.2, 0.44, R + 2, 40) ?? spot(0.1, 0.5, R, 30) ?? { x: r * 0.2, z: 0 };
      const pa = Math.atan2(c.z, c.x);          // Richtung zum Meer: dort liegt das Tor
      const gateHalf = 0.2;
      const cx = (a: number, d: number) => ({ x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d });
      const faceC = (p: { x: number; z: number }) => Math.atan2(c.x - p.x, c.z - p.z);
      yield;
      // Erdplatz: drei breite Bänder im Sechseck durch die Mitte, dazu der Weg zum Tor und zur Hütte
      { const ex = cx(pa, R + 3), bk = cx(pa + Math.PI, R * 0.6);
        paths.push({ pts: [[ex.x, ex.z], [c.x + (ex.x - c.x) * 0.5, c.z + (ex.z - c.z) * 0.5], [c.x, c.z], [bk.x, bk.z]], w: 4.6 });
        for (let k = 0; k < 3; k++) { const a = pa + (k / 3) * Math.PI, dx = Math.cos(a) * 6.4, dz = Math.sin(a) * 6.4; paths.push({ pts: [[c.x - dx, c.z - dz], [c.x, c.z], [c.x + dx, c.z + dz]], w: 8.2 }); } }
      yield;
      // Wachtürme links und rechts vom Tor, Laternen am Durchgang
      for (const s of [-1, 1]) {
        const p = cx(pa + s * (gateHalf + 0.17), R + 0.4);
        if (free(p.x, p.z, 2.2)) mount('wachturm', p.x, p.z, faceC(p));
        const t = cx(pa + s * (gateHalf - 0.02), R - 1.6);
        if (free(t.x, t.z, 0.6)) mount('laterne', t.x, t.z, 0);
      }
      yield;
      // Kapitänshütte gegenüber dem Tor, Vorräte, Waffenständer
      { const hp = cx(pa + Math.PI, R * 0.62);
        if (free(hp.x, hp.z, 3.6)) { mount('holzhuette', hp.x, hp.z, faceC(hp)); placedHomes.push({ x: hp.x, z: hp.z, yaw: faceC(hp) }); }
        for (const [t, ao, dd] of [['kisten', 0.62, 11.2], ['faesser', -0.55, 10.8], ['fass', 1.0, 11.6], ['kisten', -1.05, 11.4]] as [StructureType, number, number][]) {
          const q = cx(pa + Math.PI + ao, dd);
          if (free(q.x, q.z, 1.6)) mount(t, q.x, q.z, faceC(q) + (rnd() - 0.5) * 0.6);
        }
        const rq = cx(pa + Math.PI * 0.5 - 0.3, 5.6);
        if (free(rq.x, rq.z, 1.4)) { put(weaponRack(darkWood), rq.x, rq.z, faceC(rq)); block(rq.x, rq.z, 0.9); }
        // Banner: hohe Stange mit großem Tuch, aus der Luft schon weit zu erkennen
        for (const [ba, bd] of [[0.82, 4.6], [0.7, 5.4], [-0.75, 5.0], [0.5, 6.4]]) {
          const bp = cx(pa + Math.PI * ba, bd);
          if (free(bp.x, bp.z, 0.8)) { put(flag(def.factionId ? FACTIONS[def.factionId].fort.cloth : '#8A1F1A', darkWood, 2.1), bp.x, bp.z); block(bp.x, bp.z, 0.4); break; }
        } }
      yield;
      // Feuerstelle mit Sitzbalken, zweite Feuerstelle bei den Zelten
      const fire = campfire(glow);
      put(fire, c.x, c.z, 0);
      fires.push({ x: c.x, y: hAt(c.x, c.z) + 0.4, z: c.z });
      glows.push({ kind: 'fire', x: c.x, y: hAt(c.x, c.z) + 0.26, z: c.z, ground: hAt(c.x, c.z), size: 1.4, pool: 11 });
      block(c.x, c.z, 1.1);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.5, p = cx(a, 2.6);
        const log = new Mesh(new CylinderGeometry(0.2, 0.22, 2.0, 7), darkWood);
        log.rotation.z = Math.PI / 2;
        log.position.set(0, 0.25, 0);
        const lg = new Group(); lg.add(log);
        put(lg, p.x, p.z, a + Math.PI / 2);
      }
      { const f2 = cx(pa - Math.PI * 0.5 + 0.25, 7.2);
        if (free(f2.x, f2.z, 1.4)) { put(campfire(glow, true), f2.x, f2.z, 0); fires.push({ x: f2.x, y: hAt(f2.x, f2.z) + 0.3, z: f2.z }); glows.push({ kind: 'fire', x: f2.x, y: hAt(f2.x, f2.z) + 0.22, z: f2.z, ground: hAt(f2.x, f2.z), size: 0.9, pool: 7 }); block(f2.x, f2.z, 0.9); } }
      yield;
      // Zelte im Ring um die Feuerstelle (nicht vor dem Tor und nicht an der Hütte), Türen zum Feuer
      const tentCloth = [canvas, toon({ color: '#B9674A', side: DoubleSide }), toon({ color: '#7B94A4', side: DoubleSide }), toon({ color: '#C9B48E', side: DoubleSide })];
      const tentAt: [number, number][] = [[1, 0.95], [-1, 0.95], [1, 1.4], [-1, 1.4], [1, 1.85], [-1, 1.85], [1, 2.3], [-1, 2.3]];
      let nTent = 0;
      for (const [sg, ao] of tentAt) {
        if (nTent >= 5) break;
        for (const dd of [8.8, 9.8, 7.8]) {
          const p = cx(pa + sg * ao, dd);
          if (!free(p.x, p.z, 2.4)) continue;
          put(tent(tentCloth[nTent % tentCloth.length], darkWood, rnd), p.x, p.z, faceC(p));
          blockBox(p.x, p.z, 3.0, 4.2, faceC(p));
          nTent++;
          break;
        }
      }
      yield;
      // Palisade: dicht gesetzte, angespitzte Stämme; Lücke am Tor; Kollision in Abschnitten von ~2,3 m
      const postMat = toon('#5A4129'), postTop = toon('#7B5C3C');
      const nPost = Math.round((Math.PI * 2 * R) / 0.5);
      let run = 0;
      for (let i = 0; i < nPost; i++) {
        const a = pa + Math.PI * 2 * (i / nPost);
        const da = Math.min(i / nPost, 1 - i / nPost) * Math.PI * 2; // Winkelabstand zur Torrichtung
        if (da < gateHalf) { run = 0; continue; }
        const p = cx(a, R + (rnd() - 0.5) * 0.25);
        if (Math.hypot(p.x, p.z) > E(Math.atan2(p.z, p.x)) * 0.92 || !free(p.x, p.z, 0.25)) { run = 0; continue; }
        const h = 2.9 + rnd() * 0.9;
        const post = new Mesh(new CylinderGeometry(0.2, 0.24, h, 6), postMat);
        post.position.set(p.x, hAt(p.x, p.z) + h / 2 - 0.15, p.z);
        post.rotation.set((rnd() - 0.5) * 0.05, 0, (rnd() - 0.5) * 0.05);
        const tip = new Mesh(new ConeGeometry(0.2, 0.55, 6), postTop);
        tip.position.set(p.x, hAt(p.x, p.z) + h - 0.15 + 0.22, p.z);
        group.add(post, tip);
        if (++run % 4 === 0) blockBox(p.x + Math.sin(a) * 0.75, p.z - Math.cos(a) * 0.75, 2.3, 0.7, -a - Math.PI / 2);
      }
      yield;
      // Querbalken hinter den Stämmen (innen)
      for (let i = 0; i < Math.floor(nPost / 7); i++) {
        const a = pa + Math.PI * 2 * ((i * 7 + 3) / nPost);
        if (Math.min((i * 7 + 3) / nPost, 1 - (i * 7 + 3) / nPost) * Math.PI * 2 < gateHalf) continue;
        const p = cx(a, R - 0.35);
        if (Math.hypot(p.x, p.z) > E(Math.atan2(p.z, p.x)) * 0.92) continue;
        const bar = new Mesh(new BoxGeometry(3.6, 0.14, 0.16), darkWood);
        bar.position.set(p.x, hAt(p.x, p.z) + 1.5, p.z);
        bar.rotation.y = -a - Math.PI / 2;
        group.add(bar);
      }
      taken.push({ x: c.x, z: c.z, r: R + 1.2 }); // Platz im Lager bleibt frei von Bäumen und Gras
      break;
    }
    case 'quiet': {
      // Jedes Dorf anders: Bauweise nach Region, dazu eine von drei Anlagen (Rund um den Platz, Zeile am Strand, lose verstreut)
      const homes = HOMES[style];
      const mixed = rnd() < 0.5, first = Math.floor(rnd() * homes.length);
      const kindOf = (i: number) => homes[(first + (mixed ? i : 0)) % homes.length];
      const layout = Math.floor(rnd() * 3);
      const n = 3 + Math.floor(rnd() * 4);
      let c = spot(0.1, 0.35, 6, 20) ?? { x: 0, z: 0 };
      if (layout === 1) {
        // Zeile am Strand, Türen zum Meer
        const a0 = rnd() * Math.PI * 2, d = E(a0) * 0.66;
        c = { x: Math.cos(a0) * (d + 7), z: Math.sin(a0) * (d + 7) };
        for (let i = 0; i < n; i++) {
          const t = (i - (n - 1) / 2) * (8.5 + rnd() * 1.5);
          const x = Math.cos(a0) * d - Math.sin(a0) * t, z = Math.sin(a0) * d + Math.cos(a0) * t;
          if (Math.hypot(x, z) > E(Math.atan2(z, x)) * 0.8 || !free(x, z, 3.6)) continue;
          home(kindOf(i), x, z, Math.atan2(Math.cos(a0), Math.sin(a0)) + (rnd() - 0.5) * 0.3);
        }
      } else {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd() * 0.4, d = layout === 0 ? 8 + rnd() * 3 : 9 + rnd() * 14;
          const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
          if (Math.hypot(x, z) > E(Math.atan2(z, x)) * 0.82 || !free(x, z, 3.6)) continue;
          home(kindOf(i), x, z, Math.atan2(c.x - x, c.z - z) + (layout === 2 ? (rnd() - 0.5) * 1.2 : 0));
        }
      }
      yield;
      // Wege: von jeder Tür zur Dorfmitte (bei der Zeile am Strand zusätzlich entlang der Häuser)
      for (const h of placedHomes) pathFromDoor(h, c, layout === 1 ? 2.6 : 2.2);
      if (layout === 1 && placedHomes.length > 1) paths.push({ pts: placedHomes.map((h) => [h.x + Math.sin(h.yaw) * 4.4, h.z + Math.cos(h.yaw) * 4.4] as [number, number]), w: 3.0 });
      if (free(c.x, c.z, 1.4)) {
        // Dorfmitte: Feuerstelle oder Brunnen
        if (rnd() < 0.65) { const pit = campfire(glow, true); put(pit, c.x, c.z, 0); fires.push({ x: c.x, y: hAt(c.x, c.z) + 0.3, z: c.z }); block(c.x, c.z, 0.9); }
        else mount('brunnen', c.x, c.z, rnd() * 6);
      }
      yield;
      // Hausrat: was herumsteht, würfelt jede Insel selbst
      const props: StructureType[] = ['kisten', 'fass', 'faesser', 'heu', 'laterne', 'zaun', 'kisten'];
      for (let i = 0; i < 2 + Math.floor(rnd() * 4); i++) {
        const a = rnd() * Math.PI * 2, d = 4 + rnd() * 9;
        const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        if (Math.hypot(x, z) > E(Math.atan2(z, x)) * 0.84 || !free(x, z, 2.2)) continue;
        mount(props[Math.floor(rnd() * props.length)], x, z, rnd() * 6, 5 + rnd() * 4);
      }
      yield;
      // Netze trocknen am Strand, Ruderboote liegen im Sand
      for (let i = 0; i < 2; i++) {
        const a = rnd() * Math.PI * 2, d = E(a) * 0.84;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (!free(x, z, 1.6)) continue;
        put(i === 0 ? netRack(darkWood) : rowboat(), x, z, a + Math.PI / 2);
        block(x, z, 1.2);
      }
      break;
    }
    case 'harbor': {
      // Außenposten: Häuser im Bogen hinter dem Steg (der Steg zeigt zur Weltmitte, siehe seaWorld)
      const facing = Math.atan2(-def.x, -def.z);
      yield;
      // Steg und Zugang freihalten: dort liegen keine Felsen, Kisten oder Büsche
      { const pe = E(Math.atan2(Math.cos(facing), Math.sin(facing))); for (let d = pe * 0.7; d <= pe + 30; d += 2) taken.push({ x: Math.sin(facing) * d, z: Math.cos(facing) * d, r: 3 }); }
      const homes = HOMES[style];
      const n = 4 + Math.floor(rnd() * 3), first = Math.floor(rnd() * homes.length);
      for (let i = 0; i < n; i++) {
        const a = facing + (i - (n - 1) / 2) * (0.36 + rnd() * 0.1);
        const d = E(Math.atan2(Math.cos(a), Math.sin(a))) * (0.48 + rnd() * 0.2);
        const x = Math.sin(a) * d, z = Math.cos(a) * d;
        if (!free(x, z, 4)) continue;
        const t = homes[(first + i) % homes.length];
        home(t === 'wachturm' && i !== n - 1 ? 'holzhuette' : t, x, z, a + (rnd() - 0.5) * 0.35);
      }
      yield;
      // Hauptweg vom Steg ins Dorf, Stichwege zu den Haustüren
      {
        const root = E(Math.atan2(Math.cos(facing), Math.sin(facing)));
        const top: [number, number] = [Math.sin(facing) * root * 0.92, Math.cos(facing) * root * 0.92];
        const mid: [number, number] = [Math.sin(facing) * root * 0.7, Math.cos(facing) * root * 0.7];
        const end: [number, number] = [Math.sin(facing) * root * 0.42, Math.cos(facing) * root * 0.42];
        paths.push({ pts: [top, mid, end], w: 3.6 });
        for (const h of placedHomes) pathFromDoor(h, { x: mid[0] * 0.5 + end[0] * 0.5, z: mid[1] * 0.5 + end[1] * 0.5 }, 2.0);
      }
      yield;
      // Hafenanlagen: Lagerhaus am Kai, Hebekran, Marktstände, Kapelle hinter den Häusern
      {
        const fa = facing;
        const place = (t: StructureType | Built, ang: number, frac: number, yawOff: number, rr: number) => {
          const a = fa + ang, d = E(Math.atan2(Math.cos(a), Math.sin(a))) * frac;
          const x = Math.sin(a) * d, z = Math.cos(a) * d;
          if (free(x, z, rr)) mount(t, x, z, a + yawOff);
        };
        place('lagerhaus', 0.42, 0.7, 0.35, 7);
        place('lagerhaus', -0.5, 0.68, -0.35, 7);
        place(def.factionId === 'niederlande' ? factionBuilt('niederlande', 'kran_rad') ?? 'kran' : 'kran', 0.2, 0.84, 0, 3.5);
        place('marktstand', -0.22, 0.74, Math.PI, 2.6);
        place('marktstand', -0.3, 0.7, Math.PI + 0.3, 2.6);
        place('kapelle', 0.05, 0.28, 0, 7);
      }
      yield;
      // Kai: Laternen, Kisten und Fässer am Fuß des Stegs
      const quay: StructureType[] = ['laterne', 'kisten', 'faesser', 'laterne', 'fass', 'netz', 'boot'];
      for (let i = 0; i < 4 + Math.floor(rnd() * 3); i++) {
        const a = facing + (rnd() - 0.5) * 0.7, d = E(Math.atan2(Math.cos(a), Math.sin(a))) * (0.76 + rnd() * 0.12);
        const x = Math.sin(a) * d, z = Math.cos(a) * d;
        // der Weg vom Steg ins Dorf bleibt frei
        if (Math.abs(a - facing) * d < 3 || !free(x, z, 2)) continue;
        mount(quay[(first + i) % quay.length], x, z, a + (rnd() - 0.5) * 1.2);
      }
      break;
    }
    case 'treasure': {
      const a = rnd() * Math.PI * 2, d = E(a) * 0.82;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      put(wreck(rnd), x, z, a + Math.PI / 2 + (rnd() - 0.5) * 0.6, 0.6);
      block(x, z, 3.2);
      break;
    }
    case 'ruin': {
      const stone = toon({ color: rockCol.clone().lerp(new Color('#D8D0C0'), 0.5), flatShading: true });
      const n = 7 + Math.floor(rnd() * 5);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, d = r * (0.32 + rnd() * 0.12);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (!free(x, z, 0.9)) continue;
        const h = rnd() < 0.4 ? 1 + rnd() * 2 : 4 + rnd() * 3;
        const p = new Group();
        const shaft = new Mesh(new CylinderGeometry(0.55, 0.65, h, 8), stone);
        shaft.position.y = h / 2;
        const base = new Mesh(new BoxGeometry(1.6, 0.5, 1.6), stone);
        base.position.y = 0.25;
        p.add(shaft, base);
        if (h > 4) { const cap = new Mesh(new BoxGeometry(1.5, 0.4, 1.5), stone); cap.position.y = h; p.add(cap); }
        p.rotation.z = (rnd() - 0.5) * (h < 3 ? 0.4 : 0.12);
        put(p, x, z);
        block(x, z, 0.8);
      }
      const arch = new Group();
      for (const s of [-1, 1]) { const leg = new Mesh(new BoxGeometry(1.2, 6, 1.2), stone); leg.position.set(s * 2.6, 3, 0); arch.add(leg); }
      const top = new Mesh(new TorusGeometry(2.6, 0.6, 4, 10, Math.PI), stone);
      top.position.y = 6;
      arch.add(top);
      const ap = spot(0.55, 0.72, 3);
      if (ap) {
        const ay = rnd() * Math.PI * 2;
        put(arch, ap.x, ap.z, ay);
        for (const s of [-1, 1]) block(ap.x + Math.cos(ay) * 2.6 * s, ap.z - Math.sin(ay) * 2.6 * s, 0.85);
      }
      for (let i = 0; i < 8; i++) {
        const p = spot(0.2, 0.8, 0.8, 4);
        if (!p) continue;
        const bw = 1 + rnd(), bh = 0.6 + rnd() * 0.5, bd = 1 + rnd();
        const blk = new Mesh(new BoxGeometry(bw, bh, bd), stone);
        blk.rotation.set((rnd() - 0.5) * 0.4, rnd() * 3, (rnd() - 0.5) * 0.4);
        put(blk, p.x, p.z, blk.rotation.y, -0.2);
        blockBox(p.x, p.z, bw + 0.1, bd + 0.1, blk.rotation.y);
      }
      break;
    }
    case 'boss': {
      if (style === 'glut') break; // dort steht der Vulkan
      if (def.id === 'festungnordwacht') { fortress(); break; }
      yield;
      // Wehranlage: kleiner Burgring mit zwei Torhäusern, Rundtürmen, einem Wachhaus und gepflasterten Wegen
      const fort = curtainWall(0.46, 2);
      courtRoads(fort.gates, { x: 0, z: 0 });
      for (let i = 0; i < 2; i++) {
        const aa = fort.wa + 1.2 + i * 2.4, dd = fort.avg * 0.62;
        const x = Math.cos(aa) * dd, z = Math.sin(aa) * dd;
        if (free(x, z, 5)) mount(i ? 'lagerhaus' : 'steinhaus', x, z, Math.atan2(-x, -z));
      }
      break;
    }
    case 'lighthouse': {
      // Der Leuchtturm steht in der Inselmitte, daneben das Wärterhaus mit Weg
      mount('leuchtturm', 0, 0, rnd() * 6);
      yield;
      // Umlaufender Lichtkegel (nachts): bleibt ungemergt (die Drehung rechnet der Shader um die Laterne)
      {
        const ly = hAt(0, 0) + 22.6;
        const bm = lighthouseBeams(); bm.position.set(0, ly, 0); group.add(bm); bm.traverse((o) => { if ((o as Mesh).isMesh) glow.add(o as Mesh); });
        // Lichthof um die Lampe (nachts) und Lichtfleck auf der Galerie
        glows.push({ kind: 'lamp', x: 0, y: ly, z: 0, ground: ly - 1.9, size: 6.5, pool: 6 });
      }
      const qa = rnd() * Math.PI * 2;
      const q = { x: Math.cos(qa) * 11, z: Math.sin(qa) * 11 };
      if (free(q.x, q.z, 4)) { mount('steinhaus', q.x, q.z, Math.atan2(-q.x, -q.z)); paths.push({ pts: [[q.x * 0.72, q.z * 0.72], [q.x * 0.36, q.z * 0.36], [0, 0]], w: 2.2 }); }
      break;
    }
    case 'citadel': case 'marinefort': {
      // Festungsinseln der Weltmächte und der Marine (data/factions.ts): in der Mitte wartet der Kommandant
      if (def.factionId) grandFortress(def.factionId);
      break;
    }
  }

  yield;
  // ---------- Besitz: Banner der Macht an der Landestelle ----------
  if (def.factionId && def.kind !== 'citadel' && def.kind !== 'marinefort') {
    const seaA = Math.atan2(-def.z, -def.x); // Richtung zur Weltmitte: dort legen die meisten Schiffe an
    for (const da of [-0.14, 0.14]) {
      const a = seaA + da, d = E(a) * 0.84;
      banner(def.factionId, Math.cos(a) * d, Math.sin(a) * d, a, def.kind === 'boss' ? 1.4 : 1);
    }
  }

  yield;
  // ---------- Bäume ----------
  // Jede Insel hat ihren eigenen Bewuchs: karg, normal oder dicht bewaldet; die Bäume stehen in Hainen mit Lichtungen
  // dazwischen (nicht gleichmäßig verstreut), und in den Tropen mischt jede Insel Palmen und Laubbäume anders
  const wooded = [0.5, 0.8, 1.1, 1.8][Math.floor(rnd() * 4)];
  const groveSize = 12 + rnd() * 16, groveThr = 0.28 + rnd() * 0.24, groveSeed = hashId(def.id) & 0xfff;
  const broadK = rnd() < 0.25 ? 0 : rnd();
  const birchK = style === 'nord' ? rnd() * 0.35 : 0;
  const nTrees = Math.round((r * 0.22 + 1) * dens * (0.55 + rnd()) * wooded);
  for (let i = 0, placed = 0; i < nTrees * 4 && placed < nTrees; i++) {
    if ((i & 31) === 31) yield;
    const p = spot(0.1, 0.78, 1.4);
    if (!p) continue;
    if (noise(p.x / groveSize, p.z / groveSize, groveSeed) < groveThr) continue;
    placed++;
    // Vorlagen statt Einzelbäume: wenige Varianten je Region, per InstancedMesh beliebig oft gezeichnet
    const v = Math.floor(rnd() * 6);
    const bio = biomeOf(style);
    const proto = style === 'tropisch' ? floraProto('tropisch', rnd() < broadK ? 'laubbaum' : 'palme', v)
      : style === 'festland' ? floraProto('festland', rnd() < 0.2 ? 'birke' : 'laubbaum', v)
      : style === 'nord' ? floraProto('festland', rnd() < 0.3 + birchK ? 'birke' : 'windkiefer', v)
      : bio === 'klippe' ? floraProto('klippe', 'windkiefer', v)
      : rnd() < birchK ? floraProto('festland', 'birke', v)
      : cachedProto(`kit:${style}:plant:${v % 4}`, (pr) => plant(kit, pr), { collide: 0.6 });
    veg.add(proto, p.x, hAt(p.x, p.z) - 0.1, p.z, rnd() * Math.PI * 2, 0.75 + rnd() * 0.6);
    block(p.x, p.z, 0.6);
    trees.push({ x: p.x, y: hAt(p.x, p.z), z: p.z });
  }

  yield;
  // ---------- Strandpflanzen: ein paar schiefe Palmen bzw. Sträucher auf dem Sand ----------
  if (style === 'tropisch' || style === 'nord') {
    for (let i = 0; i < Math.round(r * 0.1 * dens); i++) {
      const p = spot(0.72, 0.86, 1.2, 6);
      if (!p) continue;
      const proto = style === 'tropisch' ? floraProto('tropisch', 'palme', Math.floor(rnd() * 6)) : cachedProto(`kit:${style}:plant:${Math.floor(rnd() * 4)}`, (pr) => plant(kit, pr), { collide: 0.6 });
      veg.add(proto, p.x, hAt(p.x, p.z) - 0.1, p.z, rnd() * Math.PI * 2, 0.6 + rnd() * 0.35, undefined, 0, (rnd() - 0.5) * 0.5);
      block(p.x, p.z, 0.5);
      trees.push({ x: p.x, y: hAt(p.x, p.z), z: p.z });
    }
  }

  yield;
  // ---------- Büsche, Gras, Blumen ----------
  const lush = style === 'tropisch' || style === 'nord' || style === 'nebel';
  const nBush = Math.round(r * (lush ? 0.8 : 0.4) * dens * (0.55 + rnd()));
  for (let i = 0; i < nBush; i++) {
    if ((i & 31) === 31) yield;
    const p = spot(0.08, 0.86, 0.9, 6);
    if (!p) continue;
    const v = Math.floor(rnd() * 3);
    const bio = biomeOf(style);
    if (style === 'tropisch' && rnd() < 0.4) {
      veg.add(floraProto('tropisch', 'farn', v), p.x, hAt(p.x, p.z), p.z, rnd() * Math.PI * 2, 0.9 + rnd() * 0.7, undefined, 0, 0, 0.85 + rnd() * 0.3);
      continue;
    }
    if (bio) {
      // Blender-Pflanzen in der Palette der Region: Bananenstauden, Agaven, Blütensträucher, dürres Gebüsch
      const roll = rnd();
      const kind: 'banane' | 'agave' | 'busch' = style === 'tropisch' && roll < 0.3 ? 'banane' : (bio !== 'tropisch' && roll < 0.14) || (style === 'tropisch' && roll > 0.9) ? 'agave' : 'busch';
      const sz = kind === 'busch' ? 0.8 + rnd() * 0.55 : 0.85 + rnd() * 0.5;
      veg.add(floraProto(bio, kind, Math.floor(rnd() * 4)), p.x, hAt(p.x, p.z), p.z, rnd() * Math.PI * 2, sz, sz * (0.9 + rnd() * 0.2));
      taken.push({ x: p.x, z: p.z, r: 0.8 });
      bushes.push({ x: p.x, y: hAt(p.x, p.z), z: p.z });
      continue;
    }
    const bushCol = () => `#${(tuftMats[v] as unknown as { color: { getHexString(): string } }).color.getHexString()}`;
    const proto = envProto(`kit:${style}:bush:${v}`, `busch_${(v % 2) + 1}`, bushCol, { surf: 'plant', near: 320, wind: 0.08 }) ?? cachedProto(`kit:${style}:bush:${v}`, (pr) => {
      const b = new Group();
      for (let k = 0; k < 2 + Math.floor(pr() * 3); k++) {
        const s = 0.45 + pr() * 0.55;
        const m = new Mesh(new IcosahedronGeometry(s, 0), tuftMats[v]);
        m.position.set((pr() - 0.5) * 1.2, s * 0.6, (pr() - 0.5) * 1.2);
        m.scale.y = 0.75;
        b.add(m);
      }
      windify(b, 0.07, 1.1);
      return b;
    }, { near: 320 });
    veg.add(proto, p.x, hAt(p.x, p.z), p.z, rnd() * Math.PI * 2, 0.8 + rnd() * 0.5, undefined, 0, 0, 0.88 + rnd() * 0.24);
    taken.push({ x: p.x, z: p.z, r: 0.8 });
    bushes.push({ x: p.x, y: hAt(p.x, p.z), z: p.z });
  }
  const nTuft = Math.round(r * (lush ? 9.5 : 4.2) * dens);
  for (let i = 0; i < nTuft; i++) {
    if ((i & 31) === 31) yield;
    const a = rnd() * Math.PI * 2, d = E(a) * Math.sqrt(rnd()) * 0.86;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!free(x, z, 0.2)) continue;
    const v = Math.floor(rnd() * 3);
    const gb = biomeOf(style);
    if (gb && style !== 'nebel') {
      const gs = 0.9 + rnd() * 0.7;
      veg.add(floraProto(gb, 'gras', v), x, hAt(x, z), z, rnd() * Math.PI * 2, gs, gs * (0.85 + rnd() * 0.3));
      continue;
    }
    const proto = cachedProto(`kit:${style}:tuft:${v}`, (pr) => {
      const tuft = new Group();
      for (let k = 0; k < 4; k++) {
        const h = 0.35 + pr() * 0.45;
        const blade = new Mesh(new ConeGeometry(0.07, h, 3, 1, true), tuftMats[v]);
        blade.position.set((pr() - 0.5) * 0.36, h / 2, (pr() - 0.5) * 0.36);
        blade.rotation.set((pr() - 0.5) * 0.5, 0, (pr() - 0.5) * 0.5);
        tuft.add(blade);
      }
      windify(tuft, 0.16, 0.8);
      return tuft;
    }, { near: 105, cast: false, outline: false, soft: true });
    veg.add(proto, x, hAt(x, z), z, rnd() * Math.PI * 2, 0.8 + rnd() * 0.5, undefined, 0, 0, 0.85 + rnd() * 0.3);
  }
  const flowers = FLOWERS[style];
  const nFlower = Math.round(r * (style === 'tropisch' || style === 'nord' ? 2.6 : style === 'festland' ? 2.0 : 0.6) * dens);
  for (let i = 0; i < nFlower; i++) {
    if ((i & 31) === 31) yield;
    const a = rnd() * Math.PI * 2, d = E(a) * Math.sqrt(rnd()) * 0.8;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!free(x, z, 0.2)) continue;
    const fb = biomeOf(style);
    if (fb) {
      const fs = 0.9 + rnd() * 0.6;
      veg.add(floraProto(fb, 'blume', Math.floor(rnd() * 3)), x, hAt(x, z), z, rnd() * Math.PI * 2, fs, fs);
      continue;
    }
    const f = new Group();
    const col = flowers[Math.floor(rnd() * flowers.length)];
    const petal = style === 'schlund' ? glowPetal(col) : toon(col);
    for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++) {
      const stem = new Mesh(new CylinderGeometry(0.015, 0.015, 0.35, 3), tuftMats[0]);
      const ox = (rnd() - 0.5) * 0.5, oz = (rnd() - 0.5) * 0.5;
      stem.position.set(ox, 0.17, oz);
      const head = new Mesh(new SphereGeometry(0.07, 5, 4), petal);
      head.position.set(ox, 0.36, oz);
      f.add(stem, head);
    }
    put(f, x, z);
  }

  yield;
  // ---------- Strand und Waldboden: Kiesel, Dünengras, Stümpfe, Stämme, Pilze – damit Sand und Wiese nirgends leer wirken ----------
  {
    const rockHex = (v: number) => () => `#${rockMats[v % 3].color.getHexString()}`;
    const nPeb = Math.round(r * 1.5 * dens);
    for (let i = 0; i < nPeb; i++) {
      const a = rnd() * Math.PI * 2, d = E(a) * (0.55 + rnd() * 0.42);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (hAt(x, z) < 1.1 || !free(x, z, 0.5)) continue;
      const v = Math.floor(rnd() * 3);
      const proto = envProto(`kit:${style}:kiesel:${v}`, `kiesel_${v + 1}`, rockHex(v), { near: 150, cast: false });
      if (proto) veg.add(proto, x, hAt(x, z) - 0.03, z, rnd() * 6, 0.8 + rnd() * 1.0);
    }
    if (style !== 'glut' && style !== 'schlund') {
      const dune = (): string => (style === 'tropisch' ? '#C9C07A' : style === 'nord' || style === 'sturm' ? '#A8AE86' : '#BDB880');
      const nDune = Math.round(r * 1.3 * dens);
      for (let i = 0; i < nDune; i++) {
        const a = rnd() * Math.PI * 2, d = E(a) * (0.48 + rnd() * 0.46);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (hAt(x, z) < 1.1 || !free(x, z, 0.4)) continue;
        const v = Math.floor(rnd() * 2);
        const proto = envProto(`kit:${style}:strandgras:${v}`, `strandgras_${v + 1}`, (role) => (role === 'fruit' ? '#E5DCA8' : role === 'leaf2' ? '#A9A66A' : dune()), { surf: 'plant', near: 170, cast: false, outline: false, soft: true, wind: 0.2 });
        if (proto) { const sz = 0.9 + rnd() * 0.8; veg.add(proto, x, hAt(x, z), z, rnd() * 6, sz, sz * (0.85 + rnd() * 0.3)); }
      }
    }
    if (lush) {
      const woodCol = style === 'nord' ? '#5A4634' : '#6E4F34';
      const forest = (name: string, id: string, n: number, color: (role: string) => string, size: [number, number], opts: Parameters<typeof envProto>[3], block0 = 0) => {
        for (let i = 0; i < n; i++) {
          const a = rnd() * Math.PI * 2, d = E(a) * (0.12 + rnd() * 0.62);
          const x = Math.cos(a) * d, z = Math.sin(a) * d;
          if (!free(x, z, block0 + 0.6)) continue;
          const proto = envProto(id, name, color, opts);
          if (!proto) continue;
          const sz = size[0] + rnd() * (size[1] - size[0]);
          veg.add(proto, x, hAt(x, z) - 0.05, z, rnd() * 6, sz, sz);
          if (block0 > 0) block(x, z, block0 * sz);
        }
      };
      forest('stumpf_1', `kit:${style}:stumpf`, Math.round(r * 0.1 * dens), (role) => (role === 'nut' ? '#B8956A' : role === 'moss' ? '#5E7A4A' : woodCol), [0.9, 1.5], { surf: 'tree', near: 200 }, 0.4);
      forest('stamm_1', `kit:${style}:stamm`, Math.round(r * 0.06 * dens), (role) => (role === 'moss' ? '#5E7A4A' : woodCol), [0.8, 1.3], { surf: 'tree', near: 220 }, 0.5);
      forest('pilz_1', `kit:${style}:pilz`, Math.round(r * 0.35 * dens), (role) => (role === 'flower' ? '#C4503A' : '#E8E0CC'), [0.9, 1.6], { surf: 'plant', near: 90, cast: false, outline: false });
    }
  }

  // Schilf und Rohrkolben am Ufer von Inseln mit Grün (Lagunenrand)
  if (biomeOf(style) && style !== 'sturm') {
    const nReed = Math.round(r * 0.28 * dens);
    for (let i = 0; i < nReed; i++) {
      const a = rnd() * Math.PI * 2, d = E(a) * (0.84 + rnd() * 0.07);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!free(x, z, 0.5) || hAt(x, z) < 0.9) continue;
      for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++) {
        const rx = x + (rnd() - 0.5) * 2.2, rz = z + (rnd() - 0.5) * 2.2;
        if (hAt(rx, rz) < 0.9) continue;
        veg.add(floraProto(biomeOf(style)!, 'schilf', Math.floor(rnd() * 2)), rx, hAt(rx, rz), rz, rnd() * Math.PI * 2, 0.8 + rnd() * 0.6, 0.8 + rnd() * 0.5);
      }
    }
  }

  yield;
  // ---------- Felsen und Strandgut ----------
  const nRock = Math.round((2 + r * 0.12) * (0.6 + rnd() * 0.8));
  for (let i = 0; i < nRock; i++) {
    if ((i & 31) === 31) yield;
    const inWater = rnd() < 0.35;
    const a = rnd() * Math.PI * 2;
    const d = E(a) * (inWater ? 1.04 + rnd() * 0.12 : 0.55 + rnd() * 0.4);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const s = (inWater ? 1.2 : 0.6) + rnd() * (inWater ? 2.2 : 1.4);
    // auch Felsen im Wasser: nicht auf Stege und Bootsplätze
    if (!free(x, z, s)) continue;
    const v = Math.floor(rnd() * 3);
    // abgeschrägte Blender-Felsen; Moos nur auf grünen Inseln, große Brocken im Wasser als Klippenformation
    const rockCol = () => `#${rockMats[v].color.getHexString()}`;
    const cliff = inWater && s > 2.2;
    const moss = lush ? 'rock' : undefined;
    const proto = (cliff ? envProto(`kit:${style}:klippe:${v % 2}`, `klippe_${(v % 2) + 1}`, rockCol, { surf: moss, collide: 0 }) : null)
      ?? envProto(`kit:${style}:rock:${v}`, `fels_${v + 1}`, rockCol, { surf: moss })
      ?? cachedProto(`kit:${style}:rock:${v}`, () => new Mesh(new DodecahedronGeometry(1, 0), rockMats[v]));
    const wide = 1 + rnd() * 0.5;
    const yaw = rnd() * 6;
    const sy = s * (0.6 + rnd() * (inWater ? 1.4 : 0.6));
    // Neigung nur ±0,15 rad: die Blender-Felsen haben einen flachen Boden, bei ±0,5 rad (28°) schwebte eine Seite bis zu einem halben Meter
    const tiltX = (rnd() - 0.5) * 0.3, tiltZ = (rnd() - 0.5) * 0.3;
    // Boden: an Land liegt die echte Unterkante des Felsens (Bounding-Box) 8 cm unter dem tiefsten Boden unter dem Fuß; im Wasser steht er unter
    // den Wellen (vorher `+ s * 0.25` über Boden bzw. Meer: Felsen schwebten bis 1,2 m, im Mittel 0,4 m)
    const py = inWater ? -(0.3 + 0.12 * sy) - proto.minY * sy : groundY(proto, hAt, x, z, s * wide, sy);
    veg.add(proto, x, py, z, yaw, s * wide, sy, tiltX, tiltZ);
    block(x, z, s * wide * 0.82);
  }
  if (style !== 'glut') {
    for (let i = 0; i < 1 + Math.floor(rnd() * 3); i++) {
      const a = rnd() * Math.PI * 2, d = E(a) * (0.9 + rnd() * 0.08);
      // Treibholz aus Blender (ohne Datei: liegender Stamm als Ausweichform in vegetation.ts)
      const lx = Math.cos(a) * d, lz = Math.sin(a) * d;
      veg.add(floraProto('tropisch', 'treibholz', Math.floor(rnd() * 3)), lx, hAt(lx, lz) - 0.02, lz, rnd() * 6, 0.85 + rnd() * 0.5);
    }
    const shellMat = toon('#EFD9C2'), starMat = toon('#D2603A');
    for (let i = 0; i < Math.round(6 * dens); i++) {
      const a = rnd() * Math.PI * 2, d = E(a) * (0.86 + rnd() * 0.12);
      const star = rnd() < 0.3;
      const m = new Mesh(star ? new ConeGeometry(0.18, 0.05, 5) : new SphereGeometry(0.1, 5, 3), star ? starMat : shellMat);
      if (!star) m.scale.y = 0.5;
      m.position.set(Math.cos(a) * d, hAt(Math.cos(a) * d, Math.sin(a) * d) + 0.03, Math.sin(a) * d);
      m.userData.noOutline = true;
      group.add(m);
    }
  }

  // Wege auf den Boden legen (nach allen Bauten, damit sie unter ihnen liegen)
  paths.forEach((pa, i) => {
    const len = pa.pts.reduce((a, p, k) => a + (k ? Math.hypot(p[0] - pa.pts[k - 1][0], p[1] - pa.pts[k - 1][1]) : 0), 0);
    if (len < 3 || pa.pts.some((p) => Math.hypot(p[0], p[1]) > E(Math.atan2(p[1], p[0])) * 0.98)) return;
    group.add(roadMesh(pa.pts, pa.w, 0, 0, (x, z) => hAt(x, z), dirtMaterial(i % 6), 0.06));
  });

  return { trees, bushes, fires, glows, patrols };
}

// ---------- Bausteine ----------

const petalCache = new Map<string, MeshBasicMaterial>();
/** Leuchtende Blüte (Schlundriff) – geteiltes Material, damit alle Blüten zusammengefasst werden */
function glowPetal(col: string) {
  let m = petalCache.get(col);
  if (!m) { m = new MeshBasicMaterial({ color: new Color(col).multiplyScalar(2.2) }); petalCache.set(col, m); }
  return m;
}

/** Lagerfeuer: Steinring, Holzscheite, Glut (Rauch und Funken macht die Welt) */
function campfire(glow: Set<Mesh>, small = false): Group {
  if (hasArch('feuerstelle')) {
    // Blender-Feuerstelle: Steinring mit abgeschrägten Kanten, gekreuzte Scheite mit verkohlten Enden, Aschebett und Glut
    const ember = coalMaterial;
    const mk = (c: string, flat = false) => toon({ color: c, flatShading: flat, vertexColors: true });
    const fg = archGroup('feuerstelle', (role) => role === 'ember' ? ember : role === 'stone' ? mk('#6E6A64', true) : role === 'log' ? mk('#3A2A1E') : mk('#1A1614'))!;
    fg.traverse((o) => { if ((o as Mesh).isMesh && (o as Mesh).material === ember) { o.userData.noOutline = true; glow.add(o as Mesh); } });
    if (small) fg.scale.setScalar(0.78);
    return fg;
  }
  const g = new Group();
  const stone = toon({ color: '#6E6A64', flatShading: true });
  const n = small ? 7 : 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = new Mesh(new DodecahedronGeometry(0.22, 0), stone);
    s.position.set(Math.cos(a) * 0.75, 0.12, Math.sin(a) * 0.75);
    g.add(s);
  }
  for (let i = 0; i < 4; i++) {
    const log = new Mesh(new CylinderGeometry(0.08, 0.1, 1.1, 5), toon('#3A2A1E'));
    log.rotation.set(0.5, (i / 4) * Math.PI * 2, 0);
    log.position.y = 0.3;
    g.add(log);
  }
  // Glutbett: flache glühende Scheibe; die Flamme darüber zeichnet das GlowSystem (render/glow.ts)
  const ember = new Mesh(new CylinderGeometry(small ? 0.38 : 0.5, small ? 0.45 : 0.58, 0.1, 9), new MeshBasicMaterial({ color: new Color(4, 1.4, 0.3) }));
  ember.position.y = 0.2;
  ember.userData.noOutline = true;
  glow.add(ember);
  g.add(ember);
  return g;
}

/** Zelt aus Segeltuch */
function tent(cloth: Material, pole: Material, rnd: () => number): Group {
  // Giebelzelt: Prisma aus Segeltuch, Tür vorn (+z) mit dunkler Klappe, Firststange mit Zipfeln, Heringe und Spannseile
  const g = new Group();
  const w = 1.45 + rnd() * 0.25, h = 2.0 + rnd() * 0.35, L = 3.5 + rnd() * 0.6;
  const sh = new Shape();
  sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(0, h); sh.closePath();
  const geo = new ExtrudeGeometry(sh, { depth: L, bevelEnabled: false });
  geo.translate(0, 0, -L / 2);
  const body = new Mesh(geo, cloth);
  body.castShadow = true;
  g.add(body);
  const flapShape = new Shape();
  flapShape.moveTo(-w * 0.42, 0); flapShape.lineTo(w * 0.42, 0); flapShape.lineTo(0, h * 0.74); flapShape.closePath();
  const flap = new Mesh(new ShapeGeometry(flapShape), toon({ color: '#2C2118', side: DoubleSide }));
  flap.position.set(0, 0.02, L / 2 + 0.012);
  flap.userData.noOutline = true;
  g.add(flap);
  const ridge = new Mesh(new CylinderGeometry(0.045, 0.045, L + 0.9, 5), pole);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.set(0, h + 0.03, 0);
  g.add(ridge);
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const stake = new Mesh(new CylinderGeometry(0.03, 0.04, 0.4, 4), pole);
    stake.position.set(sx * (w + 0.7), 0.16, sz * (L / 2 - 0.2));
    stake.rotation.z = -sx * 0.4;
    g.add(stake);
    const rope = new Mesh(new CylinderGeometry(0.012, 0.012, Math.hypot(0.75, h * 0.8), 3), pole);
    rope.position.set(sx * (w + 0.35), h * 0.4, sz * (L / 2 - 0.2));
    rope.rotation.z = -sx * Math.atan2(0.75, h * 0.8);
    rope.userData.noOutline = true;
    g.add(rope);
  }
  // Bündel und Rucksack vor dem Zelt
  const pack = new Mesh(new BoxGeometry(0.55, 0.4, 0.35), toon('#6B5238'));
  pack.position.set(w * 0.8, 0.2, L / 2 + 0.55);
  pack.rotation.y = rnd();
  g.add(pack);
  return g;
}

function weaponRack(wood: Material): Group {
  const g = new Group();
  const bar = new Mesh(new BoxGeometry(1.8, 0.1, 0.1), wood);
  bar.position.y = 1.1;
  g.add(bar);
  for (const s of [-1, 1]) { const leg = new Mesh(new BoxGeometry(0.1, 1.2, 0.1), wood); leg.position.set(s * 0.85, 0.6, 0); g.add(leg); }
  const steel = toon({ color: '#B8C0C8', spec: 1 });
  for (let i = 0; i < 4; i++) {
    const blade = new Mesh(new BoxGeometry(0.06, 1.4, 0.02), steel);
    blade.position.set(-0.6 + i * 0.4, 0.75, 0.08);
    blade.rotation.z = 0.12;
    g.add(blade);
  }
  return g;
}

function flag(col: string, wood: Material, k = 1): Group {
  const g = new Group();
  const pole = new Mesh(new CylinderGeometry(0.06 * k, 0.08 * k, 5 * k, 6), wood);
  pole.position.y = 2.5 * k;
  const clothGeo = new PlaneGeometry(1.5 * k, 1 * k, 10, 3);
  clothGeo.translate(0.75 * k, 0, 0); // Mastkante bei x = 0
  const cloth = waveFlag(new Mesh(clothGeo, toon({ color: col, side: DoubleSide })), 'x', 1.5 * k);
  cloth.position.set(0.05 * k, 4.4 * k, 0);
  cloth.userData.noOutline = true;
  g.add(pole, cloth);
  if (k > 1.5) {
    // Totenkopf-Fleck auf dem großen Banner
    const skull = new Mesh(new CircleGeometry(0.28 * k, 10), toon({ color: '#EDE6D2', side: DoubleSide }));
    skull.position.set(0.8 * k, 4.42 * k, 0.012);
    skull.userData.noOutline = true;
    g.add(skull);
  }
  return g;
}

/** Hütte mit Lehmwand und Strohdach */
function hut(rnd: () => number): Group {
  const g = new Group();
  const r = 1.8 + rnd() * 0.6;
  const wall = new Mesh(new CylinderGeometry(r, r * 1.05, 2.2, 10), toon(['#C9B28E', '#BFA27A', '#D2C2A2'][Math.floor(rnd() * 3)]));
  wall.position.y = 1.1;
  const roof = new Mesh(new ConeGeometry(r * 1.45, 2.2, 10), toon({ color: ['#8C7442', '#9C824C', '#7C6A3E'][Math.floor(rnd() * 3)], flatShading: true }));
  roof.position.y = 3.2;
  const door = new Mesh(new BoxGeometry(0.9, 1.6, 0.1), toon('#4A3220'));
  door.position.set(0, 0.8, r - 0.02);
  g.add(wall, roof, door);
  return g;
}

function netRack(wood: Material): Group {
  const g = new Group();
  for (const s of [-1, 1]) { const p = new Mesh(new CylinderGeometry(0.06, 0.07, 2, 4), wood); p.position.set(s * 1.4, 1, 0); g.add(p); }
  const net = new Mesh(new PlaneGeometry(2.8, 1.4, 6, 3), toon({ color: '#6E7A6A', side: DoubleSide }));
  net.position.y = 1.2;
  net.userData.noOutline = true;
  g.add(net);
  return g;
}

function rowboat(): Group {
  const g = new Group();
  const hull = new Mesh(new SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon({ color: '#7A5232', side: DoubleSide }));
  hull.scale.set(0.8, 0.45, 2);
  hull.position.y = 0.45;
  hull.rotation.z = 0.15;
  g.add(hull);
  return g;
}

/** Gestrandetes Wrack: schiefer Rumpf mit gebrochenem Mast */
function wreck(rnd: () => number): Group {
  const g = new Group();
  const hullMat = toon({ color: '#5A3E26', side: DoubleSide });
  const hull = new Mesh(new CylinderGeometry(2.4, 2.4, 9, 10, 1, true, 0, Math.PI), hullMat);
  hull.rotation.set(Math.PI / 2, 0, Math.PI);
  hull.position.y = 1.2;
  g.add(hull);
  for (let i = 0; i < 5; i++) {
    const rib = new Mesh(new TorusGeometry(2.4, 0.12, 4, 8, Math.PI), toon('#3E2A1A'));
    rib.rotation.set(0, Math.PI / 2, Math.PI);
    rib.position.set(0, 1.2, -3.6 + i * 1.8);
    g.add(rib);
  }
  const mast = new Mesh(new CylinderGeometry(0.15, 0.2, 5, 6), toon('#4A3220'));
  mast.position.set(0, 3, 1);
  mast.rotation.z = 0.7 + rnd() * 0.3;
  g.add(mast);
  g.rotation.z = 0.25;
  return g;
}

