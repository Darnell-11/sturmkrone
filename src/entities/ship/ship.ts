import { BufferAttribute, CircleGeometry, Color, MathUtils, Mesh, MeshBasicMaterial, Vector3, type Scene } from 'three';
import { AMMO, SHIP_CLASSES, type AmmoId, type ShipClass, type ShipLook } from '../../data/ships';
import { toon } from '../../render/toon';
import { buildShip, type ShipModel } from './shipBuilder';

export interface SeaEnv {
  heightAt(x: number, z: number): number;
  windDir: number;
  windStrength: number;
  time: number;
}

const HOLE_MAT = new MeshBasicMaterial({ color: 0x1b1410, side: 2 });

/** Ein Schiff mit Fahrphysik, Schadenszonen und sichtbaren Schäden. */
export class Ship {
  model: ShipModel;
  cls: ShipClass;
  x = 0;
  z = 0;
  heading = 0;
  speed = 0;
  /** Fahrstufe 0 = Anker, 1 = halbe, 2 = volle Fahrt */
  sailLevel = 1;
  /** Stufenloser Gashebel 0 … 1 (Spielerschiff); null = Fahrstufen der KI */
  throttle: number | null = null;
  /** Wendigkeit (Steuermann, Ausbauten) */
  turnMult = 1;
  /** Höchsttempo der KI-Schiffe (wie in 1.0 langsamer als der Spieler); null = frei */
  speedCap: number | null = null;
  hull: number;
  maxHull: number;
  sail = 1;
  crew = 1;
  fire = 0;
  reloadL = 0;
  reloadR = 0;
  ammo: AmmoId = 'kugel';
  sinking = 0;
  /** Faji-Effekte: eingefroren, Feuerpause */
  frozen = 0;
  ceasefire = 0;
  boost = 0;
  prev = { x: 0, z: 0, heading: 0 };
  private holes = 0;
  private turnInput = 0;

  constructor(private scene: Scene, tier: number, public look: ShipLook, readonly faction: 'pirat' | 'marine', hullBonus = 0) {
    this.cls = SHIP_CLASSES[Math.max(0, Math.min(SHIP_CLASSES.length - 1, tier))];
    this.maxHull = this.hull = this.cls.hp + hullBonus;
    this.model = buildShip(this.cls, look);
    scene.add(this.model.group);
  }

  get alive() { return this.hull > 0; }
  get length() { return this.cls.L; }
  get pos() { return new Vector3(this.x, 0, this.z); }

  /** Klasse oder Aussehen ändern (Werft) */
  rebuild(tier: number, look: ShipLook, hullBonus = 0) {
    const frac = this.hull / this.maxHull;
    this.model.group.removeFromParent();
    this.cls = SHIP_CLASSES[tier];
    this.look = look;
    this.maxHull = this.cls.hp + hullBonus;
    this.hull = Math.max(1, this.maxHull * frac);
    this.model = buildShip(this.cls, look);
    this.scene.add(this.model.group);
    this.holes = 0;
  }

  /** Steuerung: throttle −1 … 1 ändert Fahrstufe nicht, turn −1 … 1 */
  steer(dt: number, turn: number, env: SeaEnv, speedMult = 1) {
    this.prev = { x: this.x, z: this.z, heading: this.heading };
    if (!this.alive) return;
    this.frozen -= dt;
    this.ceasefire -= dt;
    this.boost -= dt;
    this.reloadL = Math.max(0, this.reloadL - dt);
    this.reloadR = Math.max(0, this.reloadR - dt);
    if (this.frozen > 0) { this.speed *= Math.pow(0.05, dt); return; }
    // Wind: Rückenwind schneller, Gegenwind etwas langsamer (Tempo wie in 1.0)
    const rel = Math.cos(this.heading - env.windDir);
    // wie in 1.0: das Tempo hängt nur vom Gashebel ab (der Wind wechselte sonst in jeder Kurve das Tempo)
    const windK = this.throttle !== null ? 1 : 0.96 + 0.24 * (rel * 0.5 + 0.5) + env.windStrength * 0.05;
    const level = this.throttle ?? [0, 0.55, 1][this.sailLevel];
    if (this.throttle !== null) this.sailLevel = level < 0.05 ? 0 : level < 0.75 ? 1 : 2;
    const sailK = level * (0.4 + 0.6 * this.sail);
    let target = this.cls.spd * sailK * windK * speedMult * (this.boost > 0 ? 1.7 : 1);
    if (this.speedCap !== null) target = Math.min(target, this.speedCap);
    this.speed += (target - this.speed) * Math.min(1, dt * (target < this.speed ? 0.8 : 0.9));
    // Wenden: große Schiffe drehen träger, ohne Fahrt langsamer
    this.turnInput += (turn - this.turnInput) * Math.min(1, dt * 10);
    const size = 1.1 - Math.min(1, (this.cls.L - 15) / 39) * 0.45;
    const rate = 1.3 * this.turnMult * size * (0.35 + 0.65 * Math.min(1, this.speed / 8));
    this.heading -= this.turnInput * rate * dt;
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    // Feuer frisst den Rumpf
    if (this.fire > 0) { this.fire -= dt; this.hull -= dt * this.maxHull * 0.012; }
  }

  /** Schaden mit Munitionsart; liefert den Rumpfschaden */
  damage(base: number, ammo: AmmoId, hitLocal: Vector3 | null): number {
    if (!this.alive) return 0;
    const a = AMMO[ammo];
    const hullDmg = base * a.hull;
    this.hull = Math.max(0, this.hull - hullDmg);
    this.sail = Math.max(0.05, this.sail - base * a.sail / this.maxHull * 1.6);
    this.crew = Math.max(0, this.crew - base * a.crew / this.maxHull * 1.4);
    if (a.fire > 0 && Math.random() < 0.6) this.fire = Math.max(this.fire, 8);
    if (hitLocal && this.holes < 24 && a.hull >= 0.5) this.addHole(hitLocal);
    this.updateSailDamage();
    return hullDmg;
  }

  private addHole(p: Vector3) {
    this.holes++;
    const side = p.x >= 0 ? 1 : -1;
    const z = MathUtils.clamp(p.z, -this.cls.L * 0.42, this.cls.L * 0.42);
    const hole = new Mesh(new CircleGeometry(0.25 + Math.random() * 0.25, 7), HOLE_MAT);
    hole.position.set(side * (this.model.halfWidth(z) + 0.03), this.model.deckY * (0.25 + Math.random() * 0.5), z);
    hole.rotation.y = side * Math.PI / 2;
    hole.userData.noOutline = true;
    this.model.group.add(hole);
  }

  private updateSailDamage() {
    for (const s of this.model.sails) {
      const m = s.material as any;
      m.color = new Color(this.look.sail).lerp(new Color('#5A4A3A'), (1 - this.sail) * 0.6);
    }
  }

  repair(frac: number) {
    this.hull = Math.min(this.maxHull, this.hull + this.maxHull * frac);
    this.sail = Math.min(1, this.sail + frac);
    this.fire = 0;
    this.updateSailDamage();
  }

  /** Darstellung: auf Wellen setzen, Segel blähen, Flagge flattern, sinken */
  render(alpha: number, env: SeaEnv, night: number, frameDt: number) {
    const x = MathUtils.lerp(this.prev.x, this.x, alpha);
    const z = MathUtils.lerp(this.prev.z, this.z, alpha);
    const h = this.prev.heading + (this.heading - this.prev.heading) * alpha;
    const L = this.cls.L, W = this.cls.W;
    const fx = Math.sin(h), fz = Math.cos(h);
    const wy = env.heightAt(x, z);
    const ahead = env.heightAt(x + fx * L * 0.4, z + fz * L * 0.4);
    const behind = env.heightAt(x - fx * L * 0.4, z - fz * L * 0.4);
    const sideA = env.heightAt(x + fz * W * 0.45, z - fx * W * 0.45);
    const sideB = env.heightAt(x - fz * W * 0.45, z + fx * W * 0.45);
    const g = this.model.group;
    if (this.sinking > 0) this.sinking += frameDt;
    const sink = this.sinking > 0 ? this.sinking : 0;
    g.position.set(x, (ahead + behind) / 2 * 0.6 + wy * 0.4 - 0.25 - sink * 1.4, z);
    const pitch = Math.atan2(behind - ahead, L * 0.8) + sink * 0.08;
    const roll = Math.atan2(sideA - sideB, W * 0.9) * 0.8 - this.turnInput * Math.min(1, this.speed / 10) * 0.08 + sink * 0.12;
    g.rotation.set(pitch, h, roll, 'YXZ');
    // Segel: Fahrstufe und Wind
    // Segel wachsen stufenlos mit dem Gashebel (springen nicht mehr zwischen drei Größen)
    const k = (this.throttle !== null ? 0.15 + this.throttle * 0.85 : [0.15, 0.6, 1][this.sailLevel]) * this.sail;
    for (const s of this.model.sails) s.scale.set(1, Math.max(0.15, k), 0.6 + k * 0.5 + Math.sin(env.time * 2 + s.position.y) * 0.05);
    // Flagge flattert
    const fp = this.model.flag.geometry.attributes.position as BufferAttribute;
    const base = this.model.flag.userData.base as Float32Array;
    for (let i = 0; i < fp.count; i++) {
      const bx = base[i * 3];
      const w = (bx + 1) * 0.5;
      fp.setZ(i, Math.sin(env.time * 7 + bx * 3) * 0.18 * w * (0.5 + env.windStrength));
    }
    fp.needsUpdate = true;
    for (const l of this.model.lanterns) l.scale.setScalar(0.7 + night * 0.8);
    for (const w of this.model.windows) w.visible = night > 0.25;
  }

  dispose() { this.model.group.removeFromParent(); }
}

export const SHIP_WOOD = toon('#6A4426');
