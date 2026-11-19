import { plankTexture, sailTexture } from '../render/textures';
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  type Scene,
} from 'three';
import type { IslandDef } from '../data/regions';
import { addOutlines } from '../render/outline';
import { toon } from '../render/toon';
import type { ParticleSystem } from './particles';
import { markShared } from '../render/dispose';
import { toonPbr } from '../render/pbrMaps';
import { keepIf } from '../core/arrays';
import { DolphinModel } from './dolphin';
import { createGulls } from './gull';
import { clamp01 } from '../core/mathUtil';

const GULLS = 28;

interface Floater { g: Group; x: number; z: number; kind: 'raft' | 'bottle'; t: number }
/** Delfin neben dem Schiff: Lage relativ zum Schiff (seitlich und längs), Sprung-Takt und Schwimmphase */
interface Dolphin { m: DolphinModel; t: number; side: number; lat: number; along: number; off: number; period: number; jump: number; air: boolean; life: number; idx: number }
const DOLPHIN_SPRAY = new Color(0.95, 0.98, 1);
interface Boat { g: Group; cx: number; cz: number; r: number; a: number; speed: number }
export interface DigSpot { island: string; x: number; z: number; marker: Mesh }

/**
 * Eine Möwe mit eigenem Verhalten (statt fester Formation neben dem Schiff):
 *  - orbit: kreist über ihrer Insel (Aufwind), ab und zu ein Sturzflug auf einen Fisch (dive)
 *  - escort: begleitet ein fahrendes Schiff (nur bei Fahrt: vorn, seitlich oder hinterm Heck, wechselnd), nach einiger Zeit dreht sie ab
 *  - sit: das Schiff liegt still, einzelne Möwen landen im Wasser daneben (Flügel angelegt, wippt) und starten wieder
 *  - climb: Start aus dem Wasser oder nach dem Sturzflug (kräftiger Flügelschlag)
 */
interface Gull {
  cx: number; cz: number; r: number; h: number; dir: number; ph: number; fl: number;
  x: number; y: number; z: number; yaw: number; roll: number; pitch: number; spd: number;
  mode: "orbit" | "escort" | "sit" | "dive" | "climb"; timer: number; ahead: number; side: number; tidy: number; homeX?: number; homeZ?: number;
}

/** Möwen, Delfine, Wal, Fischerboote, Schiffbrüchige, Flaschenpost und Grabstellen. */
export class SeaLife {
  private gulls: InstancedMesh;
  private gullFlap: import('three').InstancedBufferAttribute;
  private gullData: Gull[] = [];
  private gullJoinT = 2;
  private dolphins: Dolphin[] = [];
  private dolphinPool: DolphinModel[] = [];
  private boats: Boat[] = [];
  private floaters: Floater[] = [];
  digs: DigSpot[] = [];
  private whale: Group;
  private whaleT = 20;
  private dolphinT = 6;
  private dummy = new Object3D();
  private t = 0;

  constructor(private scene: Scene, islands: IslandDef[], private spray: ParticleSystem) {
    // Möwen: kleines Modell mit schlagenden Flügeln (Flügelschlag auf der Grafikkarte)
    const swarm = createGulls(GULLS);
    this.gulls = swarm.mesh;
    this.gullFlap = swarm.flap;
    scene.add(this.gulls);
    const homes = islands.filter((i) => i.kind !== 'camp');
    for (let i = 0; i < GULLS; i++) {
      const h = homes[i % homes.length];
      const a = Math.random() * Math.PI * 2, r = h.r * (0.6 + Math.random());
      this.gullData.push({
        cx: h.x, cz: h.z, r, h: 12 + Math.random() * 14, dir: Math.random() < 0.5 ? -1 : 1, ph: Math.random() * 6.28, fl: 0.5,
        x: h.x + Math.cos(a) * r, y: 12 + Math.random() * 14, z: h.z + Math.sin(a) * r, yaw: a + Math.PI / 2, roll: 0, pitch: 0, spd: 6 + Math.random() * 3,
        mode: 'orbit', timer: 0, ahead: 0, side: 0, tidy: Math.random(),
      });
    }
    // Startstellung gleich setzen: Instanzmatrizen beginnen als Einheitsmatrix. Ohne das säßen alle Möwen im Startbildschirm
    // (vor dem ersten `update`) als weißer Klumpen übereinander am Weltursprung
    const fa = this.gullFlap.array as Float32Array;
    this.gullData.forEach((d, i) => { fa[i * 2] = d.ph; fa[i * 2 + 1] = d.fl; this.placeGull(i, d); });
    this.gulls.instanceMatrix.needsUpdate = true;
    this.gullFlap.needsUpdate = true;

    // Wal
    this.whale = new Group();
    const body = new Mesh(new SphereGeometry(1, 16, 10), toon('#3A4A5A'));
    body.scale.set(3, 1.6, 9);
    const tail = new Mesh(new BoxGeometry(5, 0.3, 1.6), toon('#3A4A5A'));
    tail.position.z = -9;
    this.whale.add(body, tail);
    addOutlines(this.whale);
    this.whale.visible = false;
    scene.add(this.whale);

    // Fischerboote vor der Stadt
    const town = islands.find((i) => i.kind === 'town');
    if (town) for (let i = 0; i < 3; i++) this.boats.push(this.makeBoat(town.x + (i - 1) * 60, town.z - town.r - 70 - i * 20, 25 + i * 10));
  }

  private makeBoat(cx: number, cz: number, r: number): Boat {
    const g = new Group();
    const hull = new Mesh(new BoxGeometry(1.8, 0.8, 5), toon({ color: '#9A6A3B', map: plankTexture(), ...toonPbr(plankTexture(), { strength: 1.2, rough: 0.82, roughVar: 0.2, ao: 0.7 }) }));
    hull.position.y = 0.3;
    const mast = new Mesh(new CylinderGeometry(0.06, 0.08, 4, 6), toon('#5A3A22'));
    mast.position.y = 2.4;
    const sail = new Mesh(new PlaneGeometry(2.2, 2.6), toon({ color: 0xffffff, side: DoubleSide, map: sailTexture(['#E8DCC0', '#C9A27A', '#D9C8A8'][Math.floor(Math.random() * 3)], null, Math.floor(Math.random() * 999)), unique: true }));
    sail.position.set(0.05, 2.6, -0.4);
    sail.rotation.y = Math.PI / 2;
    sail.userData.noOutline = true;
    g.add(hull, mast, sail);
    addOutlines(g);
    this.scene.add(g);
    // gleich auf die Bahn setzen (sonst liegen alle Boote bis zum ersten `update` übereinander am Weltursprung)
    const a = Math.random() * Math.PI * 2;
    g.position.set(cx + Math.cos(a) * r, -0.1, cz + Math.sin(a) * r);
    g.rotation.y = -a;
    return { g, cx, cz, r, a, speed: 0.08 + Math.random() * 0.05 };
  }

  private addDolphin(): DolphinModel {
    const m = new DolphinModel();
    this.scene.add(m.group);
    return m;
  }

  /** Schiffbrüchiger auf einem Floß oder eine Flaschenpost */
  spawnFloater(kind: 'raft' | 'bottle', x: number, z: number) {
    const g = new Group();
    if (kind === 'raft') {
      for (let i = 0; i < 5; i++) { const log = new Mesh(new CylinderGeometry(0.25, 0.25, 3, 6), toon('#8A5A2B')); log.rotation.z = Math.PI / 2; log.position.z = (i - 2) * 0.5; g.add(log); }
      const person = new Mesh(new CylinderGeometry(0.3, 0.35, 1.3, 8), toon('#E8BE96'));
      person.position.y = 0.9;
      const head = new Mesh(new SphereGeometry(0.3, 10, 8), toon('#E8BE96'));
      head.position.y = 1.8;
      const flag = new Mesh(new PlaneGeometry(0.9, 0.6), toon({ color: '#FFFFFF', side: DoubleSide }));
      flag.position.set(0.8, 2.4, 0);
      flag.userData.noOutline = true;
      g.add(person, head, flag);
    } else {
      const bottle = new Mesh(new CylinderGeometry(0.18, 0.22, 0.8, 8), new MeshBasicMaterial({ color: new Color(0.6, 1.4, 0.8), transparent: true, opacity: 0.85, depthWrite: false }));
      bottle.rotation.z = 1.2;
      const cork = new Mesh(new CylinderGeometry(0.1, 0.1, 0.2, 6), toon('#C8A27A'));
      cork.position.set(0.45, 0.17, 0);
      g.add(bottle, cork);
    }
    addOutlines(g);
    // gleich an den Ort setzen (die Höhe folgt im `update`); sonst läge das Treibgut bis dahin am Weltursprung
    g.position.set(x, 0.05, z);
    this.scene.add(g);
    this.floaters.push({ g, x, z, kind, t: Math.random() * 10 });
  }

  /** Grabstelle (rotes X) auf einer Insel */
  addDig(island: IslandDef, groundAt: (x: number, z: number) => number) {
    if (this.digs.some((d) => d.island === island.id)) return;
    const a = (island.x * 13 + island.z * 7) % (Math.PI * 2);
    const x = island.x + Math.cos(a) * island.r * 0.55, z = island.z + Math.sin(a) * island.r * 0.55;
    const marker = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({ color: new Color(2.2, 0.3, 0.2), transparent: true, depthWrite: false, map: xTexture() }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(x, groundAt(x, z) + 0.08, z);
    this.scene.add(marker);
    this.digs.push({ island: island.id, x, z, marker });
  }

  removeDig(d: DigSpot) {
    d.marker.removeFromParent();
    this.digs = this.digs.filter((x) => x !== d);
  }

  /** Floß/Flasche in Reichweite des Schiffs: einsammeln */
  collect(x: number, z: number, range: number): Floater['kind'][] {
    const got: Floater['kind'][] = [];
    this.floaters = this.floaters.filter((f) => {
      if (Math.hypot(f.x - x, f.z - z) < range) { got.push(f.kind); f.g.removeFromParent(); return false; }
      return true;
    });
    return got;
  }

  count(kind: Floater['kind']) { return this.floaters.filter((f) => f.kind === kind).length; }

  nearest(kind: Floater['kind'], x: number, z: number) {
    let best: { x: number; z: number } | null = null, bd = Infinity;
    for (const f of this.floaters) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (f.kind === kind && d < bd) { bd = d; best = { x: f.x, z: f.z }; }
    }
    return best;
  }

  private stillT = 0;
  private updateGulls(dt: number, heightAt: (x: number, z: number) => number, ship: { x: number; z: number; heading: number; speed: number }, sailing: boolean) {
    const fa = this.gullFlap.array as Float32Array;
    const fast = sailing && ship.speed > 3.5;
    this.stillT = sailing && ship.speed < 1.5 ? this.stillT + dt : 0;
    const sh = Math.sin(ship.heading), ch = Math.cos(ship.heading);
    // Begleiter anwerben: je schneller das Schiff, desto mehr; sie kommen aus der Nähe (kein Aufpoppen aus dem Nichts)
    this.gullJoinT -= dt;
    if (this.gullJoinT <= 0) {
      this.gullJoinT = 1.5 + Math.random() * 2.5;
      if (fast) {
        const want = Math.min(5, 1 + Math.floor(ship.speed / 6));
        let have = 0;
        for (const g of this.gullData) if (g.mode === 'escort') have++;
        if (have < want) {
          let best: Gull | null = null, bd = 260 * 260;
          for (const g of this.gullData) {
            if (g.mode !== 'orbit') continue;
            const d = (g.x - ship.x) ** 2 + (g.z - ship.z) ** 2;
            if (d < bd) { bd = d; best = g; }
          }
          if (best) {
            best.mode = 'escort';
            best.timer = 25 + Math.random() * 55;
            // mal vorn, mal seitlich, oft hinter dem Heck (dort gibt es Futter)
            best.ahead = (Math.random() < 0.45 ? -1 : 1) * (4 + Math.random() * 16);
            best.side = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 10);
          }
        }
      } else if (this.stillT > 5) {
        // Schiff liegt still: ein bis drei Möwen aus der Nähe landen daneben
        let sitting = 0;
        for (const g of this.gullData) if (g.mode === 'sit') sitting++;
        if (sitting < 3 && Math.random() < 0.6) {
          let best: Gull | null = null, bd = 260 * 260;
          for (const g of this.gullData) {
            if (g.mode !== 'orbit' && g.mode !== 'escort') continue;
            const d = (g.x - ship.x) ** 2 + (g.z - ship.z) ** 2;
            if (d < bd) { bd = d; best = g; }
          }
          if (best) {
            best.mode = 'sit';
            const a = Math.random() * Math.PI * 2, rr = 5 + Math.random() * 9;
            // Landepunkt im Wasser neben dem Schiff (Weltkoordinate); cx/cz sind im Sitzen der Landepunkt, die Heimat merkt sich homeX/homeZ
            best.homeX = best.homeX ?? best.cx; best.homeZ = best.homeZ ?? best.cz;
            best.cx = ship.x + Math.cos(a) * rr; best.cz = ship.z + Math.sin(a) * rr;
            best.timer = 12 + Math.random() * 28;
          }
        }
      }
    }
    this.gullData.forEach((d, i) => {
      d.timer -= dt;
      // ---- Ziel und Wunschtempo je Verhalten ----
      let tx: number, tz: number, ty: number, wantSpd: number, rate = 1.3, flapBase = 0, flapBoost = 0;
      const wy = heightAt(d.x, d.z);
      if (d.mode !== 'sit' && d.homeX !== undefined) { d.cx = d.homeX; d.cz = d.homeZ!; d.homeX = undefined; d.homeZ = undefined; }
      if (d.mode === 'escort') {
        if ((!fast && this.stillT > 2) || !sailing || d.timer <= 0) { d.mode = 'orbit'; d.timer = 0; }
        tx = ship.x + sh * d.ahead + ch * d.side; tz = ship.z + ch * d.ahead - sh * d.side;
        ty = 6 + (i % 4) * 1.6 + Math.sin(this.t * 0.5 + i) * 1.8;
        const dist = Math.hypot(tx - d.x, tz - d.z);
        wantSpd = Math.max(6, ship.speed * 1.02 + Math.min(10, dist * 0.45));
        rate = 1.9;
        flapBase = 0.3;
      } else if (d.mode === 'sit') {
        if (fast && d.timer > 0.5 + (i % 5) * 0.6) d.timer = 0.5 + (i % 5) * 0.6;
        if (d.timer <= 0) { d.mode = 'climb'; d.timer = 3 + Math.random() * 2; }
        tx = d.cx; tz = d.cz; ty = wy + 0.12;
        const dist = Math.hypot(tx - d.x, tz - d.z);
        if (dist < 1.6 && d.y < wy + 0.5) {
          // gelandet: auf dem Wasser, Flügel angelegt (aFlap.y < 0), wippt mit den Wellen
          d.spd = 0; d.y = wy + 0.12 + Math.sin(this.t * 1.3 + i) * 0.06; d.pitch = 0; d.roll *= 0.9;
          d.yaw += Math.sin(this.t * 0.2 + i * 3) * 0.2 * dt;
          fa[i * 2] = d.ph; fa[i * 2 + 1] = -1;
          this.placeGull(i, d);
          return;
        }
        // Landeanflug: flach hinunter, Tempo nimmt ab, Flügel breit (bremsen)
        wantSpd = Math.max(2.2, Math.min(9, dist * 0.5));
        ty = dist > 14 ? 5 : wy + 0.25 + dist * 0.2;
        flapBase = 0.55;
      } else if (d.mode === 'dive') {
        tx = d.x + Math.sin(d.yaw) * 10; tz = d.z + Math.cos(d.yaw) * 10; ty = wy + 0.15;
        wantSpd = 15; rate = 0.6;
        if (d.y < wy + 0.6) {
          this.spray.emit(5, d.x, wy + 0.1, d.z, { speed: 0.9, up: 3.2, life: 0.6, color: DOLPHIN_SPRAY, gravity: 11, spread: 0.6, size: 0.3 });
          d.mode = 'climb'; d.timer = 2.5 + Math.random();
        }
      } else if (d.mode === 'climb') {
        tx = d.x + Math.sin(d.yaw) * 20; tz = d.z + Math.cos(d.yaw) * 20; ty = Math.max(d.h * 0.6, wy + 9);
        wantSpd = 9; flapBoost = 1; rate = 0.9;
        if (d.timer <= 0) d.mode = 'orbit';
      } else {
        // orbit: Kreis um die Heimatinsel in Aufwind-Wellen, Ziel liegt auf dem Kreis ein Stück voraus
        const homeA = Math.atan2(d.z - d.cz, d.x - d.cx);
        const r = d.r * (1 + 0.15 * Math.sin(this.t * 0.2 + i));
        const a2 = homeA + d.dir * 0.45;
        tx = d.cx + Math.cos(a2) * r; tz = d.cz + Math.sin(a2) * r;
        ty = d.h + Math.sin(this.t * 0.7 + i) * 2.2;
        wantSpd = 6.5 + (i % 5) * 0.7 + (d.tidy - 0.5) * 2;
        // fern von der Insel (kommt von einer Begleitung zurück): gerade heimwärts
        const hd = Math.hypot(d.x - d.cx, d.z - d.cz);
        if (hd > d.r * 1.8) { tx = d.cx; tz = d.cz; wantSpd = 10; rate = 0.8; }
        // gelegentlich Sturzflug auf einen Fisch, wenn sie über offenem Wasser sind
        if (hd > d.r * 0.7 && Math.random() < dt / 170 && d.y < d.h + 3) { d.mode = 'dive'; d.timer = 4; }
      }
      // ---- Steuern, Bewegen ----
      const want = Math.atan2(tx - d.x, tz - d.z);
      const diff = ((want - d.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      d.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
      d.roll += ((-Math.max(-1, Math.min(1, diff)) * 0.6) - d.roll) * Math.min(1, dt * 2.2);
      d.spd += (wantSpd - d.spd) * Math.min(1, dt * 1.1);
      const vy = Math.max(-7, Math.min(4.5, (ty - d.y) * 0.7));
      d.y += vy * dt;
      d.x += Math.sin(d.yaw) * d.spd * dt; d.z += Math.cos(d.yaw) * d.spd * dt;
      d.pitch += (Math.atan2(vy, Math.max(d.spd, 1)) - d.pitch) * Math.min(1, dt * 3);
      // Flügel: Gleiten und Schlagen im Wechsel, beim Steigen kräftig; Begleiter schlagen mehr, Landende bremsen mit breiten Flügeln
      const cyc = Math.sin(this.t * 0.35 + d.ph + i * 1.7);
      let wantFl = 0.12 + 0.88 * clamp01((cyc + 0.2) / 0.6) + Math.max(0, vy) * 0.25;
      wantFl = Math.min(1, Math.max(flapBase, wantFl) + flapBoost);
      d.fl += (wantFl - d.fl) * Math.min(1, dt * 2.5);
      d.ph += dt * (7 + (i % 4) * 0.9) * (0.35 + 0.65 * d.fl);
      fa[i * 2] = d.ph;
      fa[i * 2 + 1] = d.fl;
      this.placeGull(i, d);
    });
    this.gulls.instanceMatrix.needsUpdate = true;
    this.gullFlap.needsUpdate = true;
  }

  private placeGull(i: number, d: Gull) {
    this.dummy.position.set(d.x, d.y, d.z);
    this.dummy.rotation.set(-d.pitch, d.yaw, d.roll, 'YXZ');
    this.dummy.scale.setScalar(0.9 + d.tidy * 0.2);
    this.dummy.updateMatrix();
    this.gulls.setMatrixAt(i, this.dummy.matrix);
  }

  update(dt: number, heightAt: (x: number, z: number) => number, ship: { x: number; z: number; heading: number; speed: number }, sailing: boolean) {
    this.t += dt;
    this.updateGulls(dt, heightAt, ship, sailing);

    // Delfine begleiten das Schiff, tauchen in Bögen auf und springen (Bahn aus Wurfparabel, Neigung folgt der Flugbahn)
    this.dolphinT -= dt;
    if (sailing && ship.speed > 3 && this.dolphinT <= 0 && this.dolphins.length === 0) {
      this.dolphinT = 10 + Math.random() * 18;
      // Vier Auftrittsarten mit Logik: Bugwelle (bei schneller Fahrt, dicht vor dem Bug), Rudel an der Seite, Mutter mit Kalb, einzelner großer
      // Sprung weiter draußen
      const r = Math.random();
      const variant = ship.speed > 8 && r < 0.3 ? 'bow' : r < 0.55 ? 'side' : r < 0.8 ? 'pair' : 'breach';
      const side = Math.random() < 0.5 ? -1 : 1;
      const n = variant === 'breach' ? 1 : variant === 'pair' ? 2 : variant === 'bow' ? 2 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const m = this.dolphinPool[i] ?? (this.dolphinPool[i] = this.addDolphin());
        const period = 2.1 + Math.random() * 0.5;
        let lat = 9 + i * 3.2 + Math.random() * 2, along = 4 - i * 5 + Math.random() * 3, jump = 0.5, idx = i, sc = 1, sd = side;
        if (variant === 'bow') { lat = 2.2 + Math.random() * 1.3; along = 9 + i * 2.6 + Math.random() * 1.5; jump = 0.34; idx = 0; sd = i % 2 ? 1 : -1; }
        else if (variant === 'pair') { lat = 7 + i * 1.7; along = 2 + i * 2.2; sc = i ? 0.62 : 1; idx = i ? 0 : 1; }
        else if (variant === 'breach') { lat = 22 + Math.random() * 14; along = -8 + Math.random() * 28; jump = 0.62; idx = 4; }
        this.dolphins.push({ m, t: 0, side: sd, lat, along, off: Math.random() * period, period: variant === 'breach' ? 3.1 : period, jump, air: false, life: 0, idx });
        m.group.scale.setScalar(sc);
        m.group.visible = true;
      }
    }
    for (const d of this.dolphins) {
      d.t += dt;
      d.life += dt;
      // Höhe der Körpermitte über dem Wasser: Sprung als Parabel, dazwischen Auftauchen mit der Rückenflosse
      const hAt = (tt: number) => {
        const ph = ((tt + d.off) % d.period) / d.period;
        if (ph < d.jump) { const u = ph / d.jump; return -0.7 + (2.9 + 0.35 * d.idx) * 4 * u * (1 - u); }
        const v = (ph - d.jump) / (1 - d.jump);
        return -0.7 + 0.5 * Math.sin(Math.PI * v);
      };
      const f = ship;
      const sh = Math.sin(f.heading), ch = Math.cos(f.heading);
      const lat = d.side * (d.lat + Math.sin(d.life * 0.6 + d.idx * 2) * 1.4);
      const al = d.along + Math.sin(d.life * 0.45 + d.idx) * 2.5;
      const x = f.x + sh * al + ch * lat;
      const z = f.z + ch * al - sh * lat;
      const wy = heightAt(x, z);
      const y = hAt(d.t);
      const sp = Math.max(6, f.speed);
      const slope = (hAt(d.t + 0.06) - y) / 0.06;
      // sinkt am Ende wieder ab und verschwindet unter Wasser
      const sink = d.life > 11 ? (d.life - 11) * 1.6 : 0;
      d.m.group.position.set(x, wy + y - sink, z);
      d.m.group.rotation.set(-Math.atan2(slope, sp), f.heading + Math.sin(d.life * 0.8 + d.idx) * 0.06, Math.sin(d.life * 1.1 + d.idx) * 0.08, 'YXZ');
      const above = y > 0.2;
      d.m.swim(d.life, above ? 1 : 0.55);
      if (above !== d.air) {
        d.air = above;
        // Gischt beim Auftauchen und Eintauchen
        this.spray.emit(above ? 6 : 10, x, wy + 0.1, z, { speed: 0.9, up: above ? 2.5 : 3.8, life: 0.7, color: DOLPHIN_SPRAY, gravity: 11, spread: 0.7, size: 0.4 });
      }
    }
    for (const d of this.dolphins) if (d.life > 12.5) d.m.group.visible = false;
    keepIf(this.dolphins, (d) => d.life <= 12.5);

    // Wal taucht in der Ferne auf und bläst eine Fontäne
    this.whaleT -= dt;
    if (this.whaleT <= 0 && sailing) {
      this.whaleT = 40 + Math.random() * 40;
      const a = Math.random() * Math.PI * 2;
      this.whale.userData = { x: ship.x + Math.cos(a) * 90, z: ship.z + Math.sin(a) * 90, t: 0, dir: Math.random() * Math.PI * 2 };
      this.whale.visible = true;
    }
    if (this.whale.visible) {
      const w = this.whale.userData;
      w.t += dt;
      w.x += Math.sin(w.dir) * 3 * dt; w.z += Math.cos(w.dir) * 3 * dt;
      const k = Math.sin(Math.min(1, w.t / 10) * Math.PI);
      this.whale.position.set(w.x, heightAt(w.x, w.z) - 2.4 + k * 1.6, w.z);
      this.whale.rotation.y = w.dir;
      if (w.t > 3 && w.t < 6 && Math.random() < dt * 25) this.spray.emit(4, w.x, this.whale.position.y + 2, w.z, { speed: 0.6, up: 9, life: 1.2, color: new Color(0.95, 0.98, 1), spread: 0.2 });
      if (w.t > 10) this.whale.visible = false;
    }

    // Fischerboote
    for (const b of this.boats) {
      b.a += b.speed * dt;
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r;
      b.g.position.set(x, heightAt(x, z) - 0.1, z);
      b.g.rotation.set(Math.sin(this.t * 1.3 + b.cx) * 0.06, -b.a, Math.sin(this.t + b.cz) * 0.08, 'YXZ');
    }
    // Treibgut schaukelt
    for (const f of this.floaters) {
      f.t += dt;
      f.g.position.set(f.x, heightAt(f.x, f.z) + 0.05, f.z);
      f.g.rotation.set(Math.sin(f.t * 1.4) * 0.12, f.t * 0.2, Math.cos(f.t * 1.1) * 0.12);
    }
    for (const d of this.digs) d.marker.rotation.z += dt * 0.6;
  }
}

let X_TEX: CanvasTexture | null = null;
function xTexture() {
  if (X_TEX) return X_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#fff';
  g.lineWidth = 12;
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(12, 12); g.lineTo(52, 52); g.moveTo(52, 12); g.lineTo(12, 52); g.stroke();
  X_TEX = markShared(new CanvasTexture(c));
  return X_TEX;
}
