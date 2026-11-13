import {
  BoxGeometry,
  Color,
  ConeGeometry,
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
import { boxBlocker, coastK, type WalkIsland } from './islandGround';
import { plant, type StyleKit } from './islandStyle';
import { hashId, seeded } from './waves';
import { markWind, windify } from '../render/wind';
import { cachedProto, envProto, floraProto, noise, type Scatter } from './vegetation';
import type { GlowPlaced } from '../render/glow';
import { archGroup, hasArch } from './envModels';
import { build, colliders } from './architecture';
import type { StructureType } from '../data/settlements';

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
};

/**
 * Stattet eine Insel aus: Pflanzen, Felsen, Strandgut und – je nach Art – Lager, Dorf, Wrack, Ruine oder Wehranlage.
 * Alles wird aus dem Namen der Insel ausgewürfelt: jede Insel sieht anders aus, aber bei jedem Start gleich.
 * Liefert Baum-, Busch- und Feuerplätze für Tiere und Effekte.
 */
export function dressIsland(o: DressOpts): { trees: Spot[]; bushes: Spot[]; fires: Spot[]; glows: GlowPlaced[] } {
  const { group, def, kit, walk, hAt, glow, style, veg } = o;
  const rnd = seeded(hashId(def.id) ^ 0x9e3779b9);
  const r = def.r;
  const dens = Math.max(0.4, Math.min(1.6, o.density));
  /** Küstenradius in einer Richtung (die Inseln sind nicht mehr rund) */
  const E = (a: number) => r * coastK(walk.coast, a);
  const trees: Spot[] = [], bushes: Spot[] = [], fires: Spot[] = [], glows: GlowPlaced[] = [];
  // belegte Flächen (Inselkoordinaten): vorhandene Hindernisse plus alles, was hier entsteht
  const taken: { x: number; z: number; r: number }[] = walk.blockers.map((b) => ({ x: b.x - walk.x, z: b.z - walk.z, r: b.r }));
  if (def.kind === 'ruin' || def.kind === 'boss') taken.push({ x: 0, z: 0, r: 6 }); // Kristall / Bosskampf in der Mitte
  // Grabstelle für Schatzkarten freihalten (gleiche Formel wie SeaLife.addDig)
  { const da = (def.x * 13 + def.z * 7) % (Math.PI * 2); taken.push({ x: Math.cos(da) * r * 0.55, z: Math.sin(da) * r * 0.55, r: 3 }); }
  const free = (x: number, z: number, rr: number) => taken.every((t) => Math.hypot(x - t.x, z - t.z) > t.r + rr);
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
    group.add(m);
    return m;
  };
  /** Bauwerk aus world/architecture.ts aufstellen, mit seinem Kollisions-Gitter */
  const mount = (t: StructureType, x: number, z: number, yaw: number, len?: number) => {
    const b = build(t, rnd, len);
    const y = hAt(x, z);
    b.g.position.set(x, y, z);
    b.g.rotation.y = yaw;
    group.add(b.g);
    for (const c of colliders(b, walk.x + x, walk.z + z, yaw)) { walk.blockers.push(c); taken.push({ x: c.x - walk.x, z: c.z - walk.z, r: c.r }); }
    if (b.fire) fires.push({ x: x + b.fire[0] * Math.cos(yaw) + b.fire[2] * Math.sin(yaw), y: y + b.fire[1], z: z - b.fire[0] * Math.sin(yaw) + b.fire[2] * Math.cos(yaw) });
    for (const gl of b.glows ?? []) glows.push({ kind: gl.kind, x: x + gl.x * Math.cos(yaw) + gl.z * Math.sin(yaw), y: y + gl.y, z: z - gl.x * Math.sin(yaw) + gl.z * Math.cos(yaw), ground: gl.gy == null ? null : y + gl.gy, size: gl.size, pool: gl.pool, pdx: (gl.px ?? 0) * Math.cos(yaw) + (gl.pz ?? 0) * Math.sin(yaw), pdz: -(gl.px ?? 0) * Math.sin(yaw) + (gl.pz ?? 0) * Math.cos(yaw), glint: gl.glint });
  };
  /** Wohnhäuser je Region: jede Gegend baut anders */
  const HOMES: Record<IslandStyle, (StructureType | 'rundhuette')[]> = {
    tropisch: ['rundhuette', 'stelzenhuette'],
    nebel: ['stelzenhuette', 'holzhuette', 'stelzenhuette'],
    nord: ['holzhuette', 'steinhaus', 'holzhuette', 'scheune'],
    glut: ['steinhaus', 'steinhaus', 'holzhuette'],
    sturm: ['steinhaus', 'holzhuette', 'steinhaus', 'wachturm'],
    schlund: ['steinhaus', 'stelzenhuette', 'holzhuette'],
    festland: ['steinhaus', 'holzhuette'],
    klippe: ['steinhaus'],
  };
  const home = (t: StructureType | 'rundhuette', x: number, z: number, yaw: number) => {
    if (t === 'rundhuette') { put(hut(rnd), x, z, yaw); block(x, z, 2.2); } else mount(t, x, z, yaw);
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
  const fortress = () => {
    const wallMat = toon({ color: '#8E8A80', flatShading: true, detail: 'rock' });
    const capMat = toon({ color: '#A8A398', flatShading: true });
    const slate = toon({ color: '#3C4654', flatShading: true });
    const banner = toon({ color: '#1F4E79', side: DoubleSide });
    const wa = rnd() * Math.PI * 2;
    const gates = [wa, wa + 2.1, wa + 4.2];
    const nearGate = (a: number) => gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.28);
    const ringAt = (a: number) => E(a) * 0.5;
    const step = 0.13;
    for (let a = 0; a < Math.PI * 2 - 0.01; a += step) {
      if (nearGate(a + step / 2)) continue;
      const d = ringAt(a + step / 2);
      const x = Math.cos(a + step / 2) * d, z = Math.sin(a + step / 2) * d;
      const len = d * step * 1.08;
      const seg = new Group();
      const body = new Mesh(new BoxGeometry(len, 4.4, 1.8), wallMat);
      body.position.y = 2.2;
      seg.add(body);
      // Zinnen
      for (let k = 0; k < Math.max(2, Math.floor(len / 1.5)); k++) {
        const m = new Mesh(new BoxGeometry(0.7, 0.8, 1.9), capMat);
        m.position.set(-len / 2 + 0.5 + k * 1.5, 4.8, 0);
        seg.add(m);
      }
      put(seg, x, z, -(a + step / 2) + Math.PI / 2, 0.3);
      blockBox(x, z, len + 0.1, 1.9, -(a + step / 2) + Math.PI / 2);
    }
    const tower = (x: number, z: number, h: number, rr: number) => {
      const t = new Group();
      const body = new Mesh(new CylinderGeometry(rr, rr * 1.15, h, 12), wallMat);
      body.position.y = h / 2;
      const crown = new Mesh(new CylinderGeometry(rr * 1.25, rr * 1.1, 1.1, 12), capMat);
      crown.position.y = h + 0.5;
      const roofM = new Mesh(new ConeGeometry(rr * 1.35, rr * 1.9, 12), slate);
      roofM.position.y = h + 1.05 + rr * 0.95;
      const pole = new Mesh(new CylinderGeometry(0.06, 0.06, 2.4, 5), darkWood);
      pole.position.y = h + 1.05 + rr * 1.9 + 1.1;
      const flag = new Mesh(new PlaneGeometry(1.6, 0.8), banner);
      flag.position.set(0.8, h + 1.05 + rr * 1.9 + 1.8, 0);
      flag.userData.noOutline = true;
      // schmale Schießscharten
      for (let k = 0; k < 4; k++) {
        const sl = new Mesh(new BoxGeometry(0.25, 1.1, 0.2), toon('#1C1A1A'));
        const a = (k / 4) * Math.PI * 2;
        sl.position.set(Math.sin(a) * rr * 1.02, h * 0.6, Math.cos(a) * rr * 1.02);
        sl.rotation.y = a;
        sl.userData.noOutline = true;
        t.add(sl);
      }
      t.add(body, crown, roofM, pole, flag);
      put(t, x, z, rnd() * Math.PI * 2, 0.2);
      block(x, z, rr + 0.4);
    };
    // Tortürme beiderseits jedes Tores
    for (const g of gates) for (const side of [-1, 1]) {
      const a = g + side * 0.31;
      const d = ringAt(a);
      tower(Math.cos(a) * d, Math.sin(a) * d, 8.5, 2.1);
    }
    // Bergfried am Rand des Hofes, gegenüber dem ersten Tor (die Mitte bleibt frei für den Bosskampf)
    const ka = wa + Math.PI;
    const kd = ringAt(ka) * 0.62;
    tower(Math.cos(ka) * kd, Math.sin(ka) * kd, 15, 3.4);
  };

  // ---------- Bauten je Inselart (zuerst, damit sie Platz bekommen) ----------
  switch (def.kind) {
    case 'camp': {
      const c = spot(0.18, 0.45, 5, 20) ?? { x: r * 0.3, z: 0 };
      const fire = campfire(glow);
      put(fire, c.x, c.z, 0);
      fires.push({ x: c.x, y: hAt(c.x, c.z) + 0.4, z: c.z });
      glows.push({ kind: 'fire', x: c.x, y: hAt(c.x, c.z) + 0.26, z: c.z, ground: hAt(c.x, c.z), size: 1.2, pool: 8.5 });
      block(c.x, c.z, 1.1);
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.5, d = 4.5 + rnd() * 2;
        const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        if (!free(x, z, 1.8)) continue;
        put(tent(canvas, darkWood, rnd), x, z, Math.atan2(c.x - x, c.z - z));
        block(x, z, 1.7);
      }
      // Palisade auf der Seeseite
      const pa = Math.atan2(c.z, c.x);
      for (let k = -5; k <= 5; k++) {
        const a = pa + k * 0.09, d = Math.hypot(c.x, c.z) + 9;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (d > E(a) * 0.9 || !free(x, z, 0.3)) continue;
        const stake = new Mesh(new ConeGeometry(0.22, 2.6 + rnd() * 0.6, 5), darkWood);
        put(stake, x, z, 0, 0.2).position.y += 1.2;
        block(x, z, 0.3);
      }
      const rack = weaponRack(darkWood);
      const rp = spot(0.2, 0.6, 1.2);
      if (rp) { put(rack, rp.x, rp.z); block(rp.x, rp.z, 0.8); }
      const banner = flag('#5A1E1A', darkWood);
      const bp = spot(0.2, 0.55, 0.5);
      if (bp) put(banner, bp.x, bp.z);
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
      if (free(c.x, c.z, 1.4)) {
        // Dorfmitte: Feuerstelle oder Brunnen
        if (rnd() < 0.65) { const pit = campfire(glow, true); put(pit, c.x, c.z, 0); fires.push({ x: c.x, y: hAt(c.x, c.z) + 0.3, z: c.z }); block(c.x, c.z, 0.9); }
        else mount('brunnen', c.x, c.z, rnd() * 6);
      }
      // Hausrat: was herumsteht, würfelt jede Insel selbst
      const props: StructureType[] = ['kisten', 'fass', 'faesser', 'heu', 'laterne', 'zaun', 'kisten'];
      for (let i = 0; i < 2 + Math.floor(rnd() * 4); i++) {
        const a = rnd() * Math.PI * 2, d = 4 + rnd() * 9;
        const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        if (Math.hypot(x, z) > E(Math.atan2(z, x)) * 0.84 || !free(x, z, 2.2)) continue;
        mount(props[Math.floor(rnd() * props.length)], x, z, rnd() * 6, 5 + rnd() * 4);
      }
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
      const stone = toon({ color: rockCol.clone().lerp(new Color('#8A8478'), 0.4), flatShading: true });
      for (let i = 0; i < 2; i++) {
        const p = spot(0.45, 0.7, 3.2, 20);
        if (!p) continue;
        put(watchtower(stone, darkWood, rnd), p.x, p.z);
        block(p.x, p.z, 2.6);
      }
      const wa = rnd() * Math.PI * 2;
      for (let k = -4; k <= 4; k++) {
        const a = wa + k * 0.12, d = E(a) * 0.62;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (!free(x, z, 1.4)) continue;
        const seg = new Mesh(new BoxGeometry(d * 0.13, 2.8, 1.2), stone);
        put(seg, x, z, -a + Math.PI / 2, 0.3).position.y += 1.2;
        blockBox(x, z, d * 0.13 + 0.1, 1.3, -a + Math.PI / 2);
      }
      break;
    }
    case 'lighthouse': {
      const p = spot(0.35, 0.6, 2.5);
      if (p) { put(hut(rnd), p.x, p.z); block(p.x, p.z, 2.2); }
      break;
    }
  }

  // ---------- Bäume ----------
  // Jede Insel hat ihren eigenen Bewuchs: karg, normal oder dicht bewaldet; die Bäume stehen in Hainen mit Lichtungen
  // dazwischen (nicht gleichmäßig verstreut), und in den Tropen mischt jede Insel Palmen und Laubbäume anders
  const wooded = [0.5, 0.8, 1.1, 1.8][Math.floor(rnd() * 4)];
  const groveSize = 12 + rnd() * 16, groveThr = 0.28 + rnd() * 0.24, groveSeed = hashId(def.id) & 0xfff;
  const broadK = rnd() < 0.25 ? 0 : rnd();
  const birchK = style === 'nord' ? rnd() * 0.35 : 0;
  const nTrees = Math.round((r * 0.16 + 1) * dens * (0.5 + rnd()) * wooded);
  for (let i = 0, placed = 0; i < nTrees * 4 && placed < nTrees; i++) {
    const p = spot(0.1, 0.78, 1.4);
    if (!p) continue;
    if (noise(p.x / groveSize, p.z / groveSize, groveSeed) < groveThr) continue;
    placed++;
    // Vorlagen statt Einzelbäume: wenige Varianten je Region, per InstancedMesh beliebig oft gezeichnet
    const v = Math.floor(rnd() * 4);
    const proto = style === 'tropisch' ? floraProto('tropisch', rnd() < broadK ? 'laubbaum' : 'palme', v)
      : rnd() < birchK ? floraProto('festland', 'birke', v)
      : cachedProto(`kit:${style}:plant:${v}`, (pr) => plant(kit, pr), { collide: 0.6 });
    veg.add(proto, p.x, hAt(p.x, p.z) - 0.1, p.z, rnd() * Math.PI * 2, 0.75 + rnd() * 0.6);
    block(p.x, p.z, 0.6);
    trees.push({ x: p.x, y: hAt(p.x, p.z), z: p.z });
  }

  // ---------- Strandpflanzen: ein paar schiefe Palmen bzw. Sträucher auf dem Sand ----------
  if (style === 'tropisch' || style === 'nord') {
    for (let i = 0; i < Math.round(r * 0.1 * dens); i++) {
      const p = spot(0.72, 0.86, 1.2, 6);
      if (!p) continue;
      const proto = style === 'tropisch' ? floraProto('tropisch', 'palme', Math.floor(rnd() * 4)) : cachedProto(`kit:${style}:plant:${Math.floor(rnd() * 4)}`, (pr) => plant(kit, pr), { collide: 0.6 });
      veg.add(proto, p.x, hAt(p.x, p.z) - 0.1, p.z, rnd() * Math.PI * 2, 0.6 + rnd() * 0.35, undefined, 0, (rnd() - 0.5) * 0.5);
      block(p.x, p.z, 0.5);
      trees.push({ x: p.x, y: hAt(p.x, p.z), z: p.z });
    }
  }

  // ---------- Büsche, Gras, Blumen ----------
  const lush = style === 'tropisch' || style === 'nord' || style === 'nebel';
  const nBush = Math.round(r * (lush ? 0.55 : 0.25) * dens * (0.5 + rnd()));
  for (let i = 0; i < nBush; i++) {
    const p = spot(0.08, 0.86, 0.9, 6);
    if (!p) continue;
    const v = Math.floor(rnd() * 3);
    if (style === 'tropisch' && rnd() < 0.4) {
      veg.add(floraProto('tropisch', 'farn', v), p.x, hAt(p.x, p.z), p.z, rnd() * Math.PI * 2, 0.9 + rnd() * 0.7, undefined, 0, 0, 0.85 + rnd() * 0.3);
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
  const nTuft = Math.round(r * (lush ? 1.6 : 0.6) * dens);
  for (let i = 0; i < nTuft; i++) {
    const a = rnd() * Math.PI * 2, d = E(a) * Math.sqrt(rnd()) * 0.86;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!free(x, z, 0.2)) continue;
    const v = Math.floor(rnd() * 3);
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
  const nFlower = Math.round(r * (style === 'tropisch' || style === 'nord' ? 0.7 : 0.2) * dens);
  for (let i = 0; i < nFlower; i++) {
    const a = rnd() * Math.PI * 2, d = E(a) * Math.sqrt(rnd()) * 0.8;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!free(x, z, 0.2)) continue;
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

  // ---------- Felsen und Strandgut ----------
  const nRock = Math.round((2 + r * 0.12) * (0.6 + rnd() * 0.8));
  for (let i = 0; i < nRock; i++) {
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
    veg.add(proto, x, (inWater ? 0 : hAt(x, z)) + s * 0.25, z, rnd() * 6, s * wide, s * (0.6 + rnd() * (inWater ? 1.4 : 0.6)), rnd() - 0.5, rnd() - 0.5);
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

  return { trees, bushes, fires, glows };
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
    const ember = new MeshBasicMaterial({ color: new Color(4, 1.4, 0.3) });
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
  const g = new Group();
  const w = 2.6 + rnd() * 0.8;
  const body = new Mesh(new ConeGeometry(w, 2.4, 4, 1, true), cloth);
  body.rotation.y = Math.PI / 4;
  body.scale.set(1, 1, 1.4);
  body.position.y = 1.2;
  const p = new Mesh(new CylinderGeometry(0.05, 0.05, 2.8, 4), pole);
  p.position.y = 1.4;
  g.add(body, p);
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

function flag(col: string, wood: Material): Group {
  const g = new Group();
  const pole = new Mesh(new CylinderGeometry(0.06, 0.08, 5, 5), wood);
  pole.position.y = 2.5;
  const cloth = new Mesh(new PlaneGeometry(1.5, 1), toon({ color: col, side: DoubleSide }));
  cloth.position.set(0.78, 4.4, 0);
  cloth.userData.noOutline = true;
  g.add(pole, cloth);
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

/** Wachturm aus Stein mit Holzdach */
function watchtower(stone: Material, wood: Material, rnd: () => number): Group {
  const g = new Group();
  const h = 7 + rnd() * 3;
  const body = new Mesh(new CylinderGeometry(1.8, 2.3, h, 8), stone);
  body.position.y = h / 2;
  const top = new Mesh(new CylinderGeometry(2.4, 2.2, 0.8, 8), stone);
  top.position.y = h + 0.4;
  const roof = new Mesh(new ConeGeometry(2.6, 2.4, 8), wood);
  roof.position.y = h + 2;
  g.add(body, top, roof);
  return g;
}
