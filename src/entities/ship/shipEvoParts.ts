// Anbauten der visuellen Schiffs-Evolution (Geometrie). Der Plan kommt rein aus Zahlen (data/shipVisuals.ts), hier entstehen die Netze: Flickbretter,
// Eisenbänder, Panzergürtel, Rammsporn, vernagelte Stückpforten, Pfortendeckel, Rostrohre und Drehbassen. Alles sitzt über `surfaceFrame` auf der Bordwand:
// die Lage folgt der echten Rumpfform (`hullSideX`) samt Neigung der Wand, darum passt jedes Teil auf der 18-m-Schaluppe wie auf dem 74-m-Leviathan.
// Nichts hier berührt Blocker, Reling-Teile, Treppen oder Deck: die Begehbarkeit bleibt exakt wie ohne Ausbau (siehe tests und docs in CLAUDE.md).
import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Group, Matrix4, Mesh, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import type { ShipClass } from '../../data/ships';
import { PATCH_TONES, beltPlates, detailScale, hullPatches, ironStations, lowerPortY, mainPortY, pilasterPlates, portSpots, type ShipVisual } from '../../data/shipVisuals';
import { toon } from '../../render/toon';

type Mat = Mesh['material'];

export interface EvoMats { iron: Mat; copper: Mat; gold: Mat; darkWood: Mat; wood: Mat }

export interface EvoCtx {
  c: ShipClass;
  /** Deckshöhe über der Wasserlinie */
  D: number;
  group: Group;
  vis: ShipVisual;
  /** Halbbreite des Rumpfs (Steuerbord, positiv) in absoluter Höhe y an z: `hullSideX` mit den Rumpf-Funktionen der Klasse */
  sideX(z: number, yAbs: number): number;
  /** Deckssprung an z (Meter) */
  sheer(z: number): number;
  mats: EvoMats;
}

const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, seg = 6) => new CylinderGeometry(r0, r1, h, seg);

/** Absolute Höhe zu einer Rumpfhöhe py (wie die Rumpf-Geometrie: über 0,5 m trägt der Deckssprung voll, darunter nach und nach) */
function yAbs(ctx: EvoCtx, py: number, z: number): number {
  const rise = ctx.sheer(z);
  return py > 0.5 ? py + rise : py + rise * Math.max(0, (py + 1.05) / (ctx.D + 1.05));
}

export interface Frame { pos: Vector3; basis: Matrix4; n: Vector3 }
const _ty = new Vector3(), _tz = new Vector3(), _n = new Vector3(), _z = new Vector3(), _y = new Vector3();

/**
 * Lage und Ausrichtung auf der Bordwand bei z und Rumpfhöhe py (Bordseite sd = ±1): x liegt `out` Meter vor der Außenhaut, die Achsen
 * sind Normale nach außen (x), Wandrichtung nach oben (y) und entlang der Länge (z). So liegen Platten bündig auf Bauch und Flare.
 */
export function surfaceFrame(ctx: EvoCtx, sd: number, z: number, py: number, out = 0): Frame {
  const ya = yAbs(ctx, py, z), e = 0.3;
  const x0 = ctx.sideX(z, ya);
  const dxdz = (ctx.sideX(z + e, ya) - ctx.sideX(z - e, ya)) / (2 * e);
  const dxdy = (ctx.sideX(z, ya + e) - ctx.sideX(z, ya - e)) / (2 * e);
  _ty.set(sd * dxdy, 1, 0).normalize();
  _tz.set(sd * dxdz, 0, 1).normalize();
  _n.crossVectors(_ty, _tz).multiplyScalar(sd).normalize();
  _z.crossVectors(_n, _ty).normalize();
  _y.crossVectors(_z, _n).normalize();
  const basis = new Matrix4().makeBasis(_n.clone(), _y.clone(), _z.clone());
  const n = _n.clone();
  return { pos: new Vector3(sd * (x0 + out), ya, z).addScaledVector(n, 0), basis, n };
}

const AX = new Vector3(1, 0, 0);
const ZERO = new Vector3();

/** Netz auf die Bordwand setzen: `local` = Versatz in den Achsen des Rahmens (x nach außen, y hoch, z längs), `roll` = Drehung um die Wandnormale */
function onHull(ctx: EvoCtx, geo: BufferGeometry, mat: Mat, f: Frame, local: Vector3 = ZERO, roll = 0): Mesh {
  const m = new Mesh(geo, mat);
  const q = new Quaternion().setFromRotationMatrix(f.basis);
  m.position.copy(f.pos).add(local.clone().applyQuaternion(q));
  if (roll) q.multiply(new Quaternion().setFromAxisAngle(AX, roll));
  m.quaternion.copy(q);
  ctx.group.add(m);
  return m;
}

// ---------- Rumpf Stufe 1: Flickbretter ----------

/** Asymmetrisch aufgenagelte Flickbretter in abweichenden Holztönen (nur Stufe 1); liefert ihre Zahl */
export function addPatches(ctx: EvoCtx): number {
  const patches = hullPatches(ctx.c, ctx.vis.hull.patches);
  const tones = PATCH_TONES.map((col) => toon({ color: col, roughness: 1 }));
  const nailGeo = cyl(0.028, 0.028, 0.03, 5);
  const sc = Math.min(2, detailScale(ctx.c));
  for (const p of patches) {
    const f = surfaceFrame(ctx, p.side, p.z, p.y, 0.025);
    onHull(ctx, box(0.05, p.h, p.w), tones[p.tone], f, ZERO, p.rot);
    // Nägel an den Ecken (dunkles Eisen), mit der Brettdrehung mitgedreht
    for (const [dy, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const lx = new Vector3(0.03, dy * (p.h / 2 - 0.08), dz * (p.w / 2 - 0.12 * sc));
      onHull(ctx, nailGeo, ctx.mats.iron, f, rotLocal(lx, p.rot), p.rot).rotateZ(Math.PI / 2);
    }
  }
  return patches.length;
}

/** Versatz um die Wandnormale (x-Achse) drehen */
function rotLocal(v: Vector3, roll: number): Vector3 {
  const s = Math.sin(roll), c2 = Math.cos(roll);
  return new Vector3(v.x, v.y * c2 - v.z * s, v.y * s + v.z * c2);
}

// ---------- Rumpf Stufe 2 – 3: Eisenbänder, Nieten, Schanzkleid, Messing ----------

export function addIronwork(ctx: EvoCtx): void {
  const { c, D, vis, mats } = ctx;
  const sc = Math.min(2, detailScale(c));
  const bandW = 0.13 * sc, th = 0.05;
  const stations = ironStations(c, vis.hull.bands);
  const rivetGeo = cyl(0.034 * sc, 0.034 * sc, 0.04, 6);
  const brassMat = mats.gold;
  const y0 = D * 0.16, y1 = D * 0.96, segs = 4;
  for (const sd of [1, -1]) for (const z of stations) {
    // senkrechtes Band in vier Stücken, die der Wölbung folgen
    for (let k = 0; k < segs; k++) {
      const ya = y0 + ((y1 - y0) * k) / segs, yb = y0 + ((y1 - y0) * (k + 1)) / segs, ym = (ya + yb) / 2;
      const f = surfaceFrame(ctx, sd, z, ym, 0.026);
      onHull(ctx, box(th, (yb - ya) * 1.04, bandW), mats.iron, f);
      if (k % 2 === 0) for (const dz of [-1, 1]) onHull(ctx, rivetGeo, vis.hull.brass === 2 ? brassMat : mats.iron, f, new Vector3(0.03, 0, dz * bandW * 0.3)).rotateZ(Math.PI / 2);
    }
    // Messing-Beschlag am oberen Ende (Stufe 2: nur dort, Stufe 3 auch unten)
    if (vis.hull.brass) {
      onHull(ctx, box(0.06, 0.16 * sc, bandW * 1.7), brassMat, surfaceFrame(ctx, sd, z, y1 - 0.06, 0.03));
      if (vis.hull.brass === 2) onHull(ctx, box(0.06, 0.12 * sc, bandW * 1.5), brassMat, surfaceFrame(ctx, sd, z, y0 + 0.05, 0.03));
    }
  }
  // umlaufendes Band über die Länge unter den Stückpforten (nur zwischen Pforten und außerhalb der unteren Reihen)
  const py = D * 0.36;
  const step = 1.4;
  for (const sd of [1, -1]) for (let z = -c.L * 0.38; z <= c.L * 0.36; z += step) {
    if (portBlocked(c, z, py, step / 2 + 0.05)) continue;
    onHull(ctx, box(0.042, 0.1 * sc, step * 1.02), mats.iron, surfaceFrame(ctx, sd, z, py, 0.024));
  }
  // verstärktes Schanzkleid: dunkle Plankenkappe außen entlang der Oberkante
  if (vis.hull.reinforced) {
    const sh = 1.3;
    for (const sd of [1, -1]) for (let z = -c.L * 0.44; z <= c.L * 0.2; z += sh) {
      onHull(ctx, box(0.06, 0.26, sh * 1.03), mats.darkWood, surfaceFrame(ctx, sd, z + sh / 2, D * 0.93, 0.03));
      if (vis.hull.brass === 2 && Math.round(z / sh) % 3 === 0) onHull(ctx, box(0.07, 0.07, 0.2), brassMat, surfaceFrame(ctx, sd, z + sh / 2, D * 0.93, 0.045));
    }
  }
}

/** Liegt ein Punkt (z, py) in der Nähe einer Stückpforte (beider Reihen)? */
function portBlocked(c: ShipClass, z: number, py: number, hz: number): boolean {
  return portSpots(c).some((p) => Math.abs(py - p.y) < p.hy + 0.1 && Math.abs(z - p.z) < hz + p.hz);
}

// ---------- Rumpf Stufe 4 – 5: Panzergürtel ----------

export function addBelt(ctx: EvoCtx): void {
  const belt = ctx.vis.hull.belt;
  if (!belt) return;
  const { c, D } = ctx;
  const steel = toon({ color: belt.steel, spec: 0.9, metalness: 0.85, roughness: belt.gold ? 0.42 : 0.55 });
  const bolt = toon({ color: belt.bolt, spec: 1, metalness: 1, roughness: 0.35 });
  const trim = belt.gold ? ctx.mats.gold : bolt;
  // Höhe des Gürtels: bis knapp unter die tiefste untere Pfortenreihe, nie dicker als ein Fünftel der Bordwand
  let lowest = Infinity;
  for (let r = 1; r < c.decks; r++) lowest = Math.min(lowest, lowerPortY(c, r) - 0.5);
  const top = Math.min(1.45, lowest - 0.06, 0.38 + D * 0.22);
  const y0 = 0.4, bh = Math.max(0.3, top - y0), ym = y0 + bh / 2;
  const boltGeo = cyl(0.04, 0.04, 0.04, 6);
  const sc = Math.min(2, detailScale(c));
  for (const sd of [1, -1]) {
    for (const p of beltPlates(c)) {
      const f = surfaceFrame(ctx, sd, p.z, ym, 0.04);
      onHull(ctx, box(0.075, bh, p.len), steel, f);
      // gebördelte Ober- und Unterkante
      for (const dy of [-1, 1]) onHull(ctx, box(0.09, 0.05, p.len * 1.02), trim, f, new Vector3(0.012, dy * (bh / 2), 0));
      for (const dz of [-1, 1]) for (const dy of [-1, 1]) onHull(ctx, boltGeo, bolt, f, new Vector3(0.05, dy * (bh / 2 - 0.1), dz * (p.len / 2 - 0.16 * sc))).rotateZ(Math.PI / 2);
    }
    // Stufe 5: zweite Reihe, Platten zwischen den Stückpforten der Breitseite mit Goldbolzen
    if (belt.rows === 2) {
      const py = mainPortY(c);
      for (const p of pilasterPlates(c)) {
        const f = surfaceFrame(ctx, sd, p.z, py, 0.04);
        onHull(ctx, box(0.07, 1.0, p.len), steel, f);
        onHull(ctx, box(0.085, 0.05, p.len * 1.02), trim, f, new Vector3(0.01, 0.5, 0));
        onHull(ctx, box(0.085, 0.05, p.len * 1.02), trim, f, new Vector3(0.01, -0.5, 0));
        for (const dz of [-1, 1]) for (const dy of [-1, 1]) onHull(ctx, boltGeo, bolt, f, new Vector3(0.045, dy * 0.38, dz * Math.max(0.1, p.len / 2 - 0.16))).rotateZ(Math.PI / 2);
      }
    }
  }
}

// ---------- Rammsporn ----------

/** Eisen- (Stufe 4) bzw. Gold- und Bronze-beschlagener Rammsporn (Stufe 5) am Vorsteven knapp über der Wasserlinie, unter Bugspriet und Galionsfigur */
export function addRam(ctx: EvoCtx): void {
  const ram = ctx.vis.hull.ram;
  if (!ram) return;
  const { c, group } = ctx;
  const len = Math.max(1.5, Math.min(4.8, c.L * 0.085));
  const r0 = Math.max(0.2, Math.min(0.55, c.W * 0.05));
  const z0 = c.L / 2 - 0.5, y = 0.34;
  const iron = toon({ color: ram.iron, spec: 0.9, metalness: 0.85, roughness: ram.gold ? 0.45 : 0.6 });
  const tip = toon({ color: ram.tip, spec: 1, metalness: 1, roughness: 0.32 });
  const place = (geo: BufferGeometry, mat: Mat, dz: number, dy = 0, dx = 0): Mesh => { const m = new Mesh(geo, mat); m.position.set(dx, y + dy, z0 + dz); group.add(m); return m; };
  // Hauptkörper: spitz zulaufender Keil (sechseckiger Kegel, nach vorn gezogen), etwas flachgedrückt
  const body = place(cyl(r0 * 0.16, r0, len, 6).rotateX(Math.PI / 2), iron, len / 2);
  body.scale.set(1.1, 0.78, 1);
  // Spitze: kleiner Kegel aus hellem Metall (Stufe 5 Gold)
  place(new ConeGeometry(r0 * 0.3, len * 0.2, 6).rotateX(Math.PI / 2), tip, len * 0.94).scale.set(1.1, 0.8, 1);
  // Metallringe und Rückenflosse
  for (const f of [0.22, 0.52]) {
    const t = new Mesh(new TorusGeometry(r0 * (1 - f * 0.78), 0.035 * Math.min(2, detailScale(c)), 6, 12), ram.gold ? ctx.mats.gold : tip);
    t.position.set(0, y, z0 + len * f);
    t.scale.set(1.1, 0.8, 1);
    group.add(t);
  }
  place(box(0.06, r0 * 1.15, len * 0.62), iron, len * 0.34, r0 * 0.78);
  // Wulstring an der Wurzel, wo der Sporn aus dem Vorsteven tritt
  const root = new Mesh(new SphereGeometry(r0 * 1.12, 8, 6), ram.gold ? ctx.mats.gold : iron);
  root.position.set(0, y, z0 + 0.1);
  root.scale.set(1.0, 0.8, 0.7);
  group.add(root);
}

// ---------- Stückpforten ----------

/** Vernagelte Pforte: zwei gekreuzte, angenagelte Bretter über der geschlossenen Öffnung (Stufe 1 und 2 für die nicht bestückten Pforten) */
export function addBoardedPort(ctx: EvoCtx, sd: number, x: number, y: number, z: number, pw: number, ph: number): void {
  const len = Math.hypot(pw, ph) * 1.18, a = Math.atan2(ph, pw);
  const mat = toon({ color: '#6B5236', roughness: 1 });
  const nail = cyl(0.03, 0.03, 0.03, 5);
  for (const dir of [1, -1]) {
    const m = new Mesh(box(0.055, 0.13, len), mat);
    m.position.set(x + sd * 0.085, y, z);
    m.rotation.x = dir * a;
    ctx.group.add(m);
    for (const e of [-1, 1]) {
      const n = new Mesh(nail, ctx.mats.iron);
      n.position.set(x + sd * 0.125, y + dir * e * (ph / 2) * 0.9, z + e * (pw / 2) * 0.9);
      n.rotation.z = Math.PI / 2;
      ctx.group.add(n);
    }
  }
}

/** Hochgeklappter Pfortendeckel über der offenen Pforte (Scharnier an der Oberkante, nach außen oben geneigt) */
export function addPortLid(ctx: EvoCtx, sd: number, x: number, y: number, z: number, pw: number, ph: number, color: string): void {
  const ll = ph * 1.02, elev = 0.62;
  const mat = toon({ color, roughness: 0.9 });
  const hx = x + sd * 0.08, hy = y + ph / 2 + 0.03;
  const dx = sd * Math.cos(elev), dy = Math.sin(elev);
  const m = new Mesh(box(0.045, ll, pw * 1.05), mat);
  m.position.set(hx + dx * ll / 2, hy + dy * ll / 2, z);
  m.rotation.z = Math.atan2(-sd * Math.cos(elev), Math.sin(elev));
  ctx.group.add(m);
  const hinge = new Mesh(cyl(0.035, 0.035, pw * 1.05, 5).rotateX(Math.PI / 2), ctx.mats.iron);
  hinge.position.set(hx, hy, z);
  ctx.group.add(hinge);
}

/** Kurzes, angerostetes Eisenrohr aus einer offenen Pforte (Stufe 1) */
export function addRustBarrel(ctx: EvoCtx, sd: number, x: number, y: number, z: number, scale: number): void {
  const rust = toon({ color: '#7B4A2A', spec: 0.2, metalness: 0.5, roughness: 1 });
  const bar = new Mesh(cyl(0.16 * scale, 0.19 * scale, 0.62, 8), rust);
  bar.position.set(x + sd * 0.3, y, z);
  bar.rotation.z = Math.PI / 2;
  ctx.group.add(bar);
  const lip = new Mesh(cyl(0.2 * scale, 0.17 * scale, 0.08, 8), ctx.mats.iron);
  lip.position.set(x + sd * 0.62, y, z);
  lip.rotation.z = Math.PI / 2;
  ctx.group.add(lip);
  const cart = new Mesh(box(0.55, 0.14, 0.5), ctx.mats.darkWood);
  cart.position.set(x + sd * 0.25, y - 0.25, z);
  ctx.group.add(cart);
}

/** Goldring (Stufe 5) und Mündungswulst an die Mündung einer Kanone setzen; die Kanone selbst ist das Blender-Modell */
export function addGunRing(ctx: EvoCtx, sd: number, x: number, y: number, z: number, scale: number): void {
  const ring = new Mesh(new TorusGeometry(0.2 * scale, 0.03 * scale, 6, 12), ctx.mats.gold);
  ring.position.set(x + sd * (0.8 - 0.12 * scale), y, z);
  ring.rotation.y = Math.PI / 2;
  ctx.group.add(ring);
}

// ---------- Drehbassen ----------

/** Eine Drehbasse an der Reling: der Halter (`mount`) dreht um die Hochachse, `muzzle` ist die Mündung im Schiffskoordinatensystem (mit dem Halter) */
export interface SwivelMount { mount: Group; side: 1 | -1; /** Fußpunkt im Schiffskoordinatensystem */ x: number; y: number; z: number; /** Mündung relativ zum Halter */ muzzle: Vector3; aim: number }

/**
 * Drehbassen auf Drehgestellen entlang der Hauptdeck-Reling, ab Kanonen-Stufe 4. `spots` = (z, x der Reling, y der Reling-Oberkante) je Bordseite;
 * Zugänge, Aufbauten und Decksdekor hat der Aufrufer schon ausgespart. Die Halter sind eigene Gruppen (werden nicht verschmolzen) und drehen frei.
 */
export function addSwivels(ctx: EvoCtx, spots: { side: 1 | -1; x: number; y: number; z: number }[]): SwivelMount[] {
  const out: SwivelMount[] = [];
  const s = Math.min(1.5, Math.max(0.8, ctx.c.L / 30));
  const gold = ctx.vis.cannon.goldRing;
  const barrelMat = toon({ color: gold ? '#1B1C20' : '#B5733A', spec: 1, metalness: 1, roughness: gold ? 0.35 : 0.3 });
  for (const sp of spots) {
    const mount = new Group();
    mount.position.set(sp.x, sp.y, sp.z);
    // Drehgestell: Standsäule mit Fuß und Gabel
    const post = new Mesh(cyl(0.05 * s, 0.07 * s, 0.34 * s, 6), ctx.mats.darkWood);
    post.position.y = 0.17 * s;
    const foot = new Mesh(cyl(0.12 * s, 0.14 * s, 0.05 * s, 8), ctx.mats.iron);
    foot.position.y = 0.025 * s;
    mount.add(post, foot);
    for (const e of [-1, 1]) {
      const fork = new Mesh(box(0.04 * s, 0.14 * s, 0.05 * s), ctx.mats.iron);
      fork.position.set(0, 0.38 * s, e * 0.075 * s);
      mount.add(fork);
    }
    // Rohr in der Gabel, nach außen (Bordseite) gerichtet; Mündungswulst, Griff am Heck
    const barrel = new Mesh(cyl(0.05 * s, 0.075 * s, 0.7 * s, 8), barrelMat);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(sp.side * 0.18 * s, 0.4 * s, 0);
    const muzzleRing = new Mesh(cyl(0.085 * s, 0.07 * s, 0.07 * s, 8), gold ? ctx.mats.gold : ctx.mats.copper);
    muzzleRing.rotation.z = Math.PI / 2;
    muzzleRing.position.set(sp.side * 0.54 * s, 0.4 * s, 0);
    const handle = new Mesh(box(0.2 * s, 0.04 * s, 0.04 * s), ctx.mats.darkWood);
    handle.position.set(-sp.side * 0.28 * s, 0.4 * s, 0);
    mount.add(barrel, muzzleRing, handle);
    ctx.group.add(mount);
    out.push({ mount, side: sp.side, x: sp.x, y: sp.y, z: sp.z, muzzle: new Vector3(sp.side * 0.6 * s, 0.4 * s, 0), aim: 0 });
  }
  return out;
}
