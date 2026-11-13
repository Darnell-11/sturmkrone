import { BufferAttribute, CircleGeometry, Color, MathUtils, Mesh, MeshBasicMaterial, Vector3, type Scene } from 'three';
import { AMMO, SEA_SPEED, SHIP_CLASSES, type AmmoId, type ShipClass, type ShipLook } from '../../data/ships';
import { toon } from '../../render/toon';
import { buildShip, CABIN_WINDOW, GLOW_LAMP, type ShipModel } from './shipBuilder';
import { glowHub, makeEmitter } from '../../render/glow';
import { disposeObject, markShared } from '../../render/dispose';
import { wetShared } from '../../render/wetness';

export interface SeaEnv {
  heightAt(x: number, z: number): number;
  windDir: number;
  windStrength: number;
  time: number;
  /** Sonnenrichtung (zeigt zur Sonne) und Sichtbarkeit 0 … 1: Licht scheint durch die Segel */
  sunDir?: { x: number; y: number; z: number };
  sunVis?: number;
}

const _sc = new Color();

const HOLE_MAT = markShared(new MeshBasicMaterial({ color: 0x1b1410, side: 2 }));

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
  /** Faji-Schild (Stahlleib, Titanform, Unbeugsam auf See): Restdauer und Schadensminderung 0 … 1 */
  shield = 0;
  shieldK = 0;
  prev = { x: 0, z: 0, heading: 0 };
  private holes = 0;
  private turnInput = 0;
  /** Drehgeschwindigkeit (rad/s) mit Trägheit und Fahrtrichtung, die dem Bug hinterherhinkt (Abdrift in Kurven) */
  private yawRate = 0;
  /** Drehwinkel des Steuerrads (folgt dem Ruderausschlag mit Verzögerung) */
  private wheelA = 0;
  course = 0;
  private courseOk = false;
  /** Rückstoß der Breitseite: Stärke und Zeit seit dem Schuss */
  private recoilA = 0;
  private recoilT = 9;
  /** Wie das Schiff untergeht: Bug oder Heck voran, zur Seite kippend */
  private sinkPitch = 0;
  private sinkRoll = 0;

  /** Gischt auf dem Deck 0 … 1 (steigt bei schneller Fahrt in rauer See) */
  private spray = 0;
  /** Letzte dargestellte Lage und Tempo 0 … 1 (das Wasser zeichnet daraus Rumpfschaum und Bugwelle) */
  hullFx = { x: 0, z: 0, h: 0, speed: 0 };
  private ripple = 0;
  /** Gedämpfte Lage auf dem Wasser (Höhe, Neigung, Rollen) mit Geschwindigkeit: das Schiff folgt den Wellen mit Masse, statt jeder Welle sofort */
  private sm = { y: 0, p: 0, r: 0, vy: 0, vp: 0, vr: 0, init: false };

  /** hero: Spielerschiff – bekommt Laternenlichter und rechnet die Segel-Normalen jedes Bild neu */
  constructor(private scene: Scene, tier: number, public look: ShipLook, readonly faction: 'pirat' | 'marine', hullBonus = 0, private hero = false) {
    this.cls = SHIP_CLASSES[Math.max(0, Math.min(SHIP_CLASSES.length - 1, tier))];
    this.maxHull = this.hull = this.cls.hp + hullBonus;
    this.model = buildShip(this.cls, look, hero);
    scene.add(this.model.group);
    this.glowLights();
  }

  /** Laternen des Schiffs als Lichtquellen anmelden (bewegen sich mit dem Schiff) */
  private glowLights() {
    for (const l of this.model.lanterns) glowHub.add(makeEmitter('lamp', 0, 0, 0, { obj: l, size: (l.userData.glowSize as number | undefined) ?? 0.62 * Math.min(1.5, this.cls.L / 28 + 0.55), owner: this, glint: !l.userData.glowSize }));
    // Fenster (Heckgalerie, Stückpforten) leuchten nachts: Hof an der Fläche, sichtbar nur, wenn das Schiff sie anzeigt
    for (const w of this.model.windows) glowHub.add(makeEmitter('window', 0, 0, 0, { obj: w, size: 0.5, owner: this }));
  }

  /** Ruderausschlag −1 … 1 (für Steuerrad und Haltung des Steuermanns) */
  get steerAmount() { return this.turnInput; }
  get alive() { return this.hull > 0; }
  get length() { return this.cls.L; }
  get pos() { return new Vector3(this.x, 0, this.z); }

  /** Klasse oder Aussehen ändern (Werft) */
  rebuild(tier: number, look: ShipLook, hullBonus = 0) {
    const frac = this.hull / this.maxHull;
    glowHub.removeOwner(this);
    disposeObject(this.model.group);
    this.cls = SHIP_CLASSES[tier];
    this.look = look;
    this.maxHull = this.cls.hp + hullBonus;
    this.hull = Math.max(1, this.maxHull * frac);
    this.model = buildShip(this.cls, look, this.hero);
    this.scene.add(this.model.group);
    this.glowLights();
    this.holes = 0;
  }

  /** Steuerung: throttle −1 … 1 ändert Fahrstufe nicht, turn −1 … 1 */
  steer(dt: number, turn: number, env: SeaEnv, speedMult = 1) {
    const pv = this.prev;
    pv.x = this.x; pv.z = this.z; pv.heading = this.heading;
    if (!this.alive) return;
    this.frozen -= dt;
    this.ceasefire -= dt;
    this.boost -= dt;
    this.shield -= dt;
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
    let target = this.cls.spd * SEA_SPEED * sailK * windK * speedMult * (this.boost > 0 ? 1.7 : 1);
    if (this.speedCap !== null) target = Math.min(target, this.speedCap);
    // Schwere Schiffe: je größer, desto träger beim Beschleunigen, Bremsen und Wenden (m: 0 Schaluppe … 1 Leviathan)
    const m = Math.min(1, Math.max(0, (this.cls.L - 15) / 59));
    this.speed += (target - this.speed) * Math.min(1, dt * (target < this.speed ? 0.45 : 0.62) * (1.25 - 0.7 * m));
    // Wenden: Ruderausschlag baut Drehgeschwindigkeit nur langsam auf und ab; Kurven kosten Fahrt
    this.turnInput += (turn - this.turnInput) * Math.min(1, dt * 4);
    const maxRate = (0.58 - 0.33 * m) * this.turnMult * (0.3 + 0.7 * Math.min(1, this.speed / 8));
    this.yawRate += (this.turnInput * maxRate - this.yawRate) * Math.min(1, dt * (1.5 - 0.8 * m));
    this.heading -= this.yawRate * dt;
    this.speed -= this.speed * Math.min(0.5, Math.abs(this.yawRate) * 0.07 * dt);
    // Die Fahrtrichtung folgt dem Bug mit Verzögerung: das Schiff schiebt in Kurven seitlich über das Wasser
    if (!this.courseOk) { this.course = this.heading; this.courseOk = true; }
    let dc = this.heading - this.course;
    dc = Math.atan2(Math.sin(dc), Math.cos(dc));
    if (Math.abs(dc) > 1.0) { this.course = this.heading; dc = 0; }
    this.course += dc * Math.min(1, dt * (3.2 - 1.6 * m));
    this.x += Math.sin(this.course) * this.speed * dt;
    this.z += Math.cos(this.course) * this.speed * dt;
    // Feuer frisst den Rumpf
    if (this.fire > 0) { this.fire -= dt; this.hull -= dt * this.maxHull * 0.012; }
  }

  /**
   * Schiff liegt still (Spieler verlässt das Ruder oder geht an Land): Fahrt auf null und die Interpolationslage auf die
   * aktuelle setzen. Ohne das blieb `prev` eine Logikstufe hinter `x/z/heading` zurück, und die Darstellung sprang mit jedem
   * Bild zwischen alter und neuer Lage hin und her – das Schiff zitterte, solange es nicht gesteuert wurde.
   */
  settle() {
    this.speed = 0;
    this.yawRate = 0;
    this.turnInput = 0;
    this.course = this.heading;
    const pv = this.prev;
    pv.x = this.x; pv.z = this.z; pv.heading = this.heading;
  }

  /** Schaden mit Munitionsart; liefert den Rumpfschaden */
  damage(base: number, ammo: AmmoId, hitLocal: Vector3 | null): number {
    if (!this.alive) return 0;
    if (this.shield > 0) base *= 1 - this.shieldK;
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

  /** Rückstoß einer Breitseite (Vorzeichen = feuernde Seite) */
  kick(a: number) {
    this.recoilA = a;
    this.recoilT = 0;
  }

  repair(frac: number) {
    this.sinkPitch = 0;
    this.sinkRoll = 0;
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
    this.hullFx.x = x; this.hullFx.z = z; this.hullFx.h = h;
    this.hullFx.speed = this.sinking > 0 ? 0 : Math.max(0, Math.min(1, (this.speed - 0.5) / 9));
    const wy = env.heightAt(x, z);
    const ahead = env.heightAt(x + fx * L * 0.4, z + fz * L * 0.4);
    const behind = env.heightAt(x - fx * L * 0.4, z - fz * L * 0.4);
    const sideA = env.heightAt(x + fz * W * 0.45, z - fx * W * 0.45);
    const sideB = env.heightAt(x - fz * W * 0.45, z + fx * W * 0.45);
    const g = this.model.group;
    if (this.sinking > 0) {
      if (this.sinking <= 0.02 && this.sinkPitch === 0) {
        // jedes Wrack geht anders unter: mal sticht der Bug in die Tiefe, mal ragt er in den Himmel
        this.sinkPitch = (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.4);
        this.sinkRoll = (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.35);
      }
      this.sinking += frameDt;
    }
    const sink = this.sinking > 0 ? this.sinking : 0;
    // erst langsam vollaufen, dann immer schneller wegsacken
    const depth = sink * 0.35 + sink * sink * 0.16;
    const tilt = Math.min(1, sink / 5.5);
    const m = Math.min(1, Math.max(0, (L - 15) / 59));
    const tgtY = (ahead + behind) / 2 * 0.6 + wy * 0.4 - 0.25;
    // Bug hebt sich mit Fahrt (Gleiten), das Heck sackt leicht ein
    const lift = Math.min(1, this.speed / 14);
    const tgtP = Math.atan2(behind - ahead, L * 0.8) - lift * 0.02;
    const tgtR = Math.atan2(sideA - sideB, W * 0.9) * 0.8;
    const sm = this.sm;
    if (!sm.init) { sm.y = tgtY; sm.p = tgtP; sm.r = tgtR; sm.vy = sm.vp = sm.vr = 0; sm.init = true; }
    // Federn: je größer das Schiff, desto träger (Eigenfrequenz 2,6 → 1,2 rad/s), leicht unterdämpft für weiches Nachschwingen
    {
      const dt = Math.min(frameDt, 1 / 30);
      const w0 = 2.6 - 1.4 * m, c = 2 * 0.8 * w0, k = w0 * w0;
      sm.vy += (k * (tgtY - sm.y) - c * sm.vy) * dt; sm.y += sm.vy * dt;
      sm.vp += (k * (tgtP - sm.p) - c * sm.vp) * dt; sm.p += sm.vp * dt;
      sm.vr += (k * (tgtR - sm.r) - c * sm.vr) * dt; sm.r += sm.vr * dt;
      if (Math.abs(tgtY - sm.y) > 4) { sm.y = tgtY; sm.vy = 0; }
    }
    g.position.set(x, sm.y - depth, z);
    this.recoilT += frameDt;
    const recoil = this.recoilA * Math.exp(-2.4 * this.recoilT) * Math.cos(this.recoilT * 6.5);
    const pitch = sm.p + this.sinkPitch * tilt * tilt;
    const roll = sm.r - (this.yawRate * 0.22 + this.turnInput * 0.05) * Math.min(1, this.speed / 10) + this.sinkRoll * tilt - recoil;
    g.rotation.set(pitch, h, roll, 'YXZ');
    // Steuerrad dreht mit dem Ruder: voller Ausschlag etwa 140°, mit leichtem Nachlauf wie beim echten Rad
    this.wheelA += (this.turnInput * 2.4 - this.wheelA) * Math.min(1, frameDt * 7);
    this.model.wheel.rotation.z = this.wheelA;
    // Segel: Fahrstufe und Wind
    // Segel wachsen stufenlos mit dem Gashebel (springen nicht mehr zwischen drei Größen)
    const k = (this.throttle !== null ? 0.15 + this.throttle * 0.85 : [0.15, 0.6, 1][this.sailLevel]) * this.sail;
    const wind = env.windStrength;
    const gust = 0.5 + 0.5 * Math.sin(env.time * 0.9 + this.x * 0.01);
    this.ripple += frameDt * (2.2 + wind * 3.5);
    for (const s of this.model.sails) {
      s.scale.set(1, Math.max(0.15, k), 0.6 + k * 0.5 + Math.sin(env.time * 2 + s.position.y) * 0.05);
      // Windbiegung: Bauch wächst und schrumpft mit Böen, Wellen laufen übers Tuch, die Kanten flattern stärker
      const base = s.userData.baseP as Float32Array | undefined;
      if (!base) continue;
      const geo = s.geometry.attributes.position as BufferAttribute;
      const sw = s.userData.sw as number, sh = s.userData.sh as number;
      const amp = (0.05 + wind * 0.16) * (this.cls.L / 15) * (1.1 - k * 0.5);
      const ph = s.position.y * 0.7;
      const arr = geo.array as Float32Array;
      for (let i = 0; i < geo.count; i++) {
        const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
        const ex = Math.abs(bx) / (sw * 0.5);
        const ey = 0.5 - by / sh;
        const edge = 0.35 + 0.65 * Math.max(ex * ex, ey * ey);
        arr[i * 3 + 2] = bz * (0.88 + 0.22 * gust) + Math.sin(this.ripple + bx * 0.9 + by * 0.5 + ph) * amp * edge;
        arr[i * 3] = bx + Math.sin(this.ripple * 0.8 + by * 0.7 + ph) * amp * 0.25 * ey;
      }
      geo.needsUpdate = true;
      if (this.hero) s.geometry.computeVertexNormals();
      // Stoff-Durchleuchtung: Steht die Sonne hinter dem Tuch, glüht es warm (tiefe Sonne mehr als hohe)
      const m = s.material as unknown as { emissive?: Color; color: Color };
      if (m.emissive && env.sunDir) {
        const sd = env.sunDir;
        const hl = Math.hypot(sd.x, sd.z) || 1;
        const facing = Math.abs((sd.x * fx + sd.z * fz) / hl);
        const sss = (env.sunVis ?? 0) * (0.1 + 0.42 * facing) * (1.15 - Math.min(1, Math.abs(sd.y)) * 0.6);
        m.emissive.copy(m.color).multiplyScalar(sss).lerp(_sc.setRGB(1, 0.62, 0.3), 0.18 * sss);
      }
    }
    // Deck: Gischt bei Fahrt in rauer See und Regen machen die Planken dunkel und nass
    this.spray = Math.max(0, Math.min(1, this.spray + frameDt * (Math.min(1, this.speed / 12) * (0.1 + env.windStrength * 0.7) - 0.06)));
    const wet = Math.max(this.spray, wetShared.uWet.value * 0.9);
    const dm = this.model.deckMat as unknown as { color: Color };
    dm.color.copy(this.model.deckBase).multiplyScalar(1 - 0.4 * wet);
    // Laternen: warmes Punktlicht bei Dämmerung und Nacht, leicht flackernd
    for (let i = 0; i < this.model.lights.length; i++) {
      const l = this.model.lights[i];
      const nightK = Math.max(0, Math.min(1, (night - 0.15) / 0.6));
      l.intensity = nightK * (28 + 7 * Math.sin(env.time * 7.3 + i * 2.1) * Math.sin(env.time * 3.1 + i)) * (this.cls.L / 20);
    }
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
    // Flamme tagsüber gedämpft (sonst brennt sie in der Mittagssonne weiß aus und blüht im Bloom), nachts voll
    CABIN_WINDOW.color.setRGB(0.8, 0.95, 1.2).multiplyScalar(1 - 0.94 * Math.min(1, night * 1.5));
    GLOW_LAMP.color.setRGB(4, 2.4, 0.9).multiplyScalar(0.28 + 0.72 * Math.min(1, night * 1.6));
    for (const w of this.model.windows) w.visible = night > 0.25;
  }

  /** Schiff aus der Szene nehmen und seinen Grafikspeicher freigeben */
  dispose() { glowHub.removeOwner(this); disposeObject(this.model.group); }
}

export const SHIP_WOOD = toon('#6A4426');
