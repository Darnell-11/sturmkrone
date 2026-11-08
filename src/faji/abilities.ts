import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';
import type { CombatFx } from '../combat/fx';
import { actAt, ELEMENT_COLORS, type ActiveDef, type Element, type Passives, type SkillDef, type Status } from '../data/skills';
import type { ParticleSystem } from '../world/particles';
import { ElementFx, zigzagGeometry } from './elementFx';
import { keepIf } from '../core/arrays';

/** Etwas, das von Fähigkeiten getroffen werden kann (Gegner, Übungspuppe) */
export interface AbilityTarget {
  x: number;
  y: number;
  z: number;
  radius: number;
  alive: boolean;
  hit(dmg: number, status: Status | undefined, dur: number, dirX: number, dirZ: number, el: Element): void;
  /** Für Sog: Position direkt verschieben */
  shove?(dx: number, dz: number): void;
}

export interface AbilityContext {
  scene: Scene;
  fx: CombatFx;
  particles: ParticleSystem;
  caster: { x: number; y: number; z: number; yaw: number };
  moveCaster(x: number, z: number, yaw?: number): void;
  targets(): AbilityTarget[];
  ground(x: number, z: number): number;
  /** Grundschaden: Angriffswert × Fähigkeitsbonus */
  power: number;
  shake(a: number): void;
  hitstop(t: number): void;
  cutin(text: string, color: string): void;
  speedlines(s: number): void;
  buff(b: NonNullable<ActiveDef['buff']>, dur: number, el: Element): void;
  heal(frac: number): void;
}

interface Running { t: number; done: boolean; update(dt: number): void }

const HSL = { h: 0, s: 0, l: 0 };
/** Elementfarbe, hell genug fürs Leuchten, aber mit vollem Farbton (sonst brennt Additives auf hellem Grund weiß aus) */
const COL = new Color();
/** Achtung: liefert einen wiederverwendeten Farbwert – Empfänger kopieren ihn (Materialien, Partikel) */
const col = (el: Element, k = 1) => {
  const c = COL.set(ELEMENT_COLORS[el]);
  c.getHSL(HSL);
  if (HSL.s > 0.15) c.setHSL(HSL.h, Math.min(1, HSL.s * 1.2 + 0.15), Math.min(0.55, HSL.l));
  return c.multiplyScalar(k * 0.8);
};
const dist2 = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const angleTo = (fx: number, fz: number, yaw: number, tx: number, tz: number) =>
  Math.abs(((Math.atan2(tx - fx, tz - fz) - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

/** Blitz-Band zwischen zwei Punkten */
const UP = new Vector3(0, 1, 0);
/** Wiederverwendeter Punkt für Effekte, die die Position sofort kopieren (Partikel, Treffer, Spuren) */
const PV = new Vector3();
const pv = (x: number, y: number, z: number) => PV.set(x, y, z);
const BOLT_COL = new Color();
function boltMesh(a: Vector3, b: Vector3, color: Color, width = 0.35): Mesh {
  const g = zigzagGeometry(a, b, 8, 1.2, 1.2, 1.2, width, UP, null);
  return new Mesh(g, new MeshBasicMaterial({ color: BOLT_COL.copy(color).multiplyScalar(3), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
}

/** Führt Fähigkeiten aus – im Spiel und in der Vorschau des Skillbaums. */
export class AbilityRunner {
  private running: Running[] = [];
  /** Eigene Effektsprache je Element (Flammen, Eissplitter, Blitze, Felsen …) */
  private efx: ElementFx;

  constructor(readonly ctx: AbilityContext) {
    this.efx = new ElementFx(ctx.scene, ctx.fx, ctx.particles, { shake: (a) => ctx.shake(a), hitstop: (t) => ctx.hitstop(t), speedlines: (v) => ctx.speedlines(v) });
  }

  get busy() { return this.running.some((r) => !r.done && r.t < 0.6); }

  cast(s: SkillDef, level: number) {
    const a = actAt(s, level);
    if (!a) return;
    const c = this.ctx;
    const dmg = c.power * a.dmg(level);
    const color = ELEMENT_COLORS[a.el];
    if (a.ult) { c.cutin(`${s.n}!`, color); c.speedlines(1); }
    switch (a.shape) {
      case 'nova': return this.nova(a, dmg);
      case 'cone': return this.cone(a, dmg);
      case 'line': return this.line(a, dmg);
      case 'bolt': return this.bolts(a, dmg);
      case 'chain': return this.chain(a, dmg);
      case 'dash': return this.dash(a, dmg);
      case 'blink': return this.blink(a, dmg);
      case 'rain': return this.rain(a, dmg);
      case 'pull': return this.pull(a, dmg);
      case 'cloud': return this.cloud(a, dmg);
      case 'spikes': return this.spikes(a, dmg);
      case 'barrage': return this.barrage(a, dmg);
      case 'buff': {
        c.buff(a.buff ?? {}, a.dur ?? 5, a.el);
        if (a.heal) c.heal(a.heal);
        this.aura(a.el, a.dur ?? 5);
        c.fx.shockwave(this.feet(), 4, color);
        this.efx.impact(this.feet(), a.el, a.ult ? 2.2 : 1);
        return;
      }
      case 'heal': {
        c.heal(a.heal ?? 0.3);
        this.aura('licht', 1.2);
        c.fx.shockwave(this.feet(), 6, color);
        this.efx.impact(this.feet(), 'licht', a.ult ? 2 : 1);
        return;
      }
    }
  }

  private feet() { const c = this.ctx.caster; return new Vector3(c.x, c.y, c.z); }
  private fwd() { const y = this.ctx.caster.yaw; return { x: Math.sin(y), z: Math.cos(y) }; }

  private hitTarget(t: AbilityTarget, dmg: number, a: ActiveDef, fromX: number, fromZ: number) {
    const d = dist2(t.x, t.z, fromX, fromZ) || 1;
    t.hit(dmg, a.status, a.dur ?? 1.5, (t.x - fromX) / d, (t.z - fromZ) / d, a.el);
    this.ctx.fx.hit(pv(t.x, t.y + 1.2, t.z), a.el === 'klinge' ? 'slash' : 'magic', ELEMENT_COLORS[a.el], dmg > this.ctx.power * 2);
    // kleine Elementwirkung an jedem getroffenen Ziel
    this.efx.impact(new Vector3(t.x, t.y, t.z), a.el, dmg > this.ctx.power * 2 ? 0.7 : 0.4);
  }

  /** Elementpartikel an einer Stelle */
  private burst(p: Vector3, el: Element, n: number, speed = 5, up = 5) {
    const gravity = el === 'feuer' || el === 'meteor' ? -2 : el === 'gift' || el === 'schatten' ? -0.5 : 8;
    this.ctx.particles.emit(n, p.x, p.y, p.z, { speed, up, life: 0.8, color: col(el, 2.2), gravity, spread: 0.6 });
  }

  private aura(el: Element, dur: number) {
    const r: Running = { t: 0, done: false, update: (dt) => {
      r.t += dt;
      const c = this.ctx.caster;
      if (Math.random() < dt * 40) this.ctx.particles.emit(2, c.x + (Math.random() - 0.5) * 1.2, c.y + Math.random() * 0.4, c.z + (Math.random() - 0.5) * 1.2, { speed: 0.5, up: 3.5, life: 0.9, color: col(el, 2.5), gravity: -1, spread: 0.2 });
      if (r.t > dur) r.done = true;
    } };
    this.running.push(r);
  }

  private later(delay: number, fn: () => void) {
    const r: Running = { t: 0, done: false, update: (dt) => { r.t += dt; if (r.t >= delay) { r.done = true; fn(); } } };
    this.running.push(r);
  }

  private nova(a: ActiveDef, dmg: number) {
    const c = this.ctx;
    const pulses = a.count ?? 1;
    const radius = a.radius ?? 5;
    for (let i = 0; i < pulses; i++) {
      this.later(0.12 + i * (pulses > 1 ? 0.25 : 0), () => {
        const p = this.feet();
        c.fx.shockwave(p, radius, ELEMENT_COLORS[a.el]);
        this.efx.impact(p, a.el, Math.min(2.6, (a.ult ? 1.6 : 0.9) * Math.max(0.8, radius / 5)) * (pulses > 1 ? 0.7 : 1));
        if (a.el === 'koerper' || a.el === 'meteor' || a.el === 'erde') c.fx.crack(p, radius * 1.1);
        if (a.el === 'klinge') c.fx.smear(pv(p.x, p.y + 1, p.z), c.caster.yaw + i * 2.1, 0.05, radius * 0.8, Math.PI * 1.9, ELEMENT_COLORS[a.el]);
        this.burst(pv(p.x, p.y + 0.6, p.z), a.el, 30, radius * 1.6, 3);
        for (const t of c.targets()) if (t.alive && dist2(t.x, t.z, p.x, p.z) < radius + t.radius) this.hitTarget(t, dmg, a, p.x, p.z);
        c.shake(pulses > 1 ? 0.15 : 0.5);
        if (pulses === 1) c.hitstop(0.08);
      });
    }
  }

  private cone(a: ActiveDef, dmg: number) {
    const c = this.ctx;
    const range = a.range ?? 8;
    const n = a.count ?? 1;
    for (let i = 0; i < n; i++) {
      this.later(0.15 + i * 0.18, () => {
        const p = this.feet();
        const f = this.fwd();
        c.fx.smear(pv(p.x, p.y + 1, p.z), c.caster.yaw, i % 2 ? 0.9 : -0.9 + (n === 1 ? 0.9 : 0), range * 0.8, 1.6, ELEMENT_COLORS[a.el], i % 2 === 1);
        this.efx.impact(new Vector3(p.x + f.x * range * 0.6, p.y, p.z + f.z * range * 0.6), a.el, a.ult ? 1.8 : 1);
        for (let k = 0; k < 6; k++) {
          const d = 1.5 + (k / 6) * range;
          this.burst(pv(p.x + f.x * d, p.y + 0.8, p.z + f.z * d), a.el, 6, 2 + d * 0.3, 2);
        }
        for (const t of c.targets()) {
          if (!t.alive) continue;
          const d = dist2(t.x, t.z, p.x, p.z);
          if (d < range + t.radius && angleTo(p.x, p.z, c.caster.yaw, t.x, t.z) < 0.75) this.hitTarget(t, dmg, a, p.x, p.z);
        }
        c.shake(0.35);
        c.hitstop(0.06);
      });
    }
  }

  /** Durchschlagende Welle (Sichelwind, Mondsichel, Himmelsspalter): fliegende Sichel mit Nachbildern */
  private line(a: ActiveDef, dmg: number) {
    const c = this.ctx;
    const passes = a.count ?? 1;
    const range = a.range ?? 16;
    const width = a.radius ?? 1.4;
    const start = this.feet();
    const f = this.fwd();
    const ult = !!a.ult;
    // Sichel: Bogen nach vorn gewölbt, waagrecht – beim Himmelsspalter steht sie senkrecht und ist riesig
    const R = ult ? width * 2.2 : width * 1.5;
    const geo = new RingGeometry(R * 0.72, R, 40, 1, Math.PI * 0.12, Math.PI * 0.76).rotateX(Math.PI / 2);
    const mat = new MeshBasicMaterial({ color: col(a.el, 3.2), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const mesh = new Mesh(geo, mat);
    const core = new Mesh(new RingGeometry(R * 0.86, R * 0.94, 40, 1, Math.PI * 0.18, Math.PI * 0.64).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: new Color(2.4, 2.4, 2.4), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    mesh.add(core);
    c.scene.add(mesh);
    const roll = ult ? Math.PI / 2 : (Math.random() - 0.5) * 0.5;
    const place = (m: Mesh, x: number, y: number, z: number, dir: number) => {
      m.position.set(x, y, z);
      m.lookAt(x + f.x * dir, y, z + f.z * dir);
      m.rotateZ(roll);
    };
    if (ult) { c.hitstop(0.12); c.shake(0.7); this.efx.impact(start, a.el, 1.2); }
    const ghosts: { m: Mesh; t: number }[] = [];
    const hit = new Set<AbilityTarget>();
    let t = 0, ghostT = 0, scarT = 0;
    const speed = ult ? 36 : 30;
    const leg = range / speed;
    const total = leg * passes;
    const y0 = start.y + (ult ? R * 0.15 + 0.6 : 1.1);
    const r: Running = { t: 0, done: false, update: (dt) => {
      t += dt;
      r.t = t;
      const phase = t / leg;
      const back = passes > 1 && phase > 1;
      const along = back ? range * Math.max(0, 2 - phase) : Math.min(range, t * speed);
      const x = start.x + f.x * along, z = start.z + f.z * along;
      place(mesh, x, y0, z, back ? -1 : 1);
      mesh.scale.setScalar(0.6 + Math.min(1, t * 6) * 0.4);
      // Nachbilder: kurz stehenbleibende, verblassende Kopien – der Hieb zieht eine Spur
      ghostT -= dt;
      if (ghostT <= 0) {
        ghostT = 0.03;
        const g = new Mesh(geo, new MeshBasicMaterial({ color: col(a.el, 1.8), transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
        place(g, x, y0, z, back ? -1 : 1);
        g.scale.copy(mesh.scale);
        c.scene.add(g);
        ghosts.push({ m: g, t: 0 });
      }
      for (const gh of ghosts) {
        gh.t += dt;
        (gh.m.material as MeshBasicMaterial).opacity = Math.max(0, 0.55 - gh.t * 2.6);
        if (gh.t > 0.22) { gh.m.removeFromParent(); (gh.m.material as MeshBasicMaterial).dispose(); }
      }
      // Bodenspur: Staub, beim Ultimate ein Riss durch den Boden
      scarT -= dt;
      if (scarT <= 0) {
        scarT = ult ? 0.05 : 0.08;
        this.burst(pv(x, start.y + 0.2, z), a.el, ult ? 6 : 3, 2, 2);
        if (ult) c.fx.crack(pv(x, start.y, z), 1.6);
      }
      if (passes > 1 && phase > 1 && hit.size && Math.floor(phase) !== Math.floor(phase - dt / leg)) hit.clear();
      for (const tg of c.targets()) {
        if (!tg.alive || hit.has(tg)) continue;
        if (dist2(tg.x, tg.z, x, z) < width * (ult ? 1.6 : 1.1) + tg.radius) {
          hit.add(tg);
          this.hitTarget(tg, dmg, a, x - f.x, z - f.z);
          c.hitstop(ult ? 0.06 : 0.035);
        }
      }
      if (t >= total) {
        r.done = true;
        mesh.removeFromParent(); mat.dispose(); (core.material as MeshBasicMaterial).dispose(); core.geometry.dispose();
        for (const gh of ghosts) { gh.m.removeFromParent(); (gh.m.material as MeshBasicMaterial).dispose(); }
        // Geometrie erst freigeben, wenn kein Nachbild sie mehr nutzt
        this.later(0.3, () => geo.dispose());
        if (ult) this.efx.impact(new Vector3(x, start.y, z), a.el, 1.8);
      }
    } };
    this.running.push(r);
    c.shake(ult ? 0.6 : 0.3);
  }

  private bolts(a: ActiveDef, dmg: number) {
    const c = this.ctx;
    const n = a.count ?? 1;
    const range = a.range ?? 18;
    const p0 = this.feet();
    const targets = c.targets().filter((t) => t.alive && dist2(t.x, t.z, p0.x, p0.z) < range).sort((x, y) => dist2(x.x, x.z, p0.x, p0.z) - dist2(y.x, y.z, p0.x, p0.z));
    for (let i = 0; i < n; i++) {
      const spread = n > 1 ? (i / (n - 1) - 0.5) * 0.9 : 0;
      const yaw = n === 1 && targets[0] ? Math.atan2(targets[0].x - p0.x, targets[0].z - p0.z) : c.caster.yaw + spread;
      const dir = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const geo: BufferGeometry = a.el === 'eis' ? new ConeGeometry(0.18, 1.2, 6).rotateX(Math.PI / 2) : new SphereGeometry(0.35, 10, 8);
      const m = new Mesh(geo, new MeshBasicMaterial({ color: col(a.el, 3), transparent: true, blending: AdditiveBlending, depthWrite: false }));
      if (a.el === 'eis') m.lookAt(dir);
      m.position.set(p0.x, p0.y + 1.2, p0.z).addScaledVector(dir, 0.8);
      c.scene.add(m);
      let t = 0;
      const r: Running = { t: 0, done: false, update: (dt) => {
        t += dt; r.t = t;
        m.position.addScaledVector(dir, 26 * dt);
        if (Math.random() < dt * 30) this.burst(m.position, a.el, 1, 0.5, 0.5);
        for (const tg of c.targets()) {
          if (tg.alive && dist2(tg.x, tg.z, m.position.x, m.position.z) < tg.radius + 0.5) { this.hitTarget(tg, dmg, a, m.position.x - dir.x, m.position.z - dir.z); t = 99; break; }
        }
        if (t > range / 26) { r.done = true; m.removeFromParent(); m.geometry.dispose(); }
      } };
      this.running.push(r);
    }
  }

  private chain(a: ActiveDef, dmg: number) {
    const c = this.ctx;
    const n = a.count ?? 4;
    let from = this.feet().setY(this.ctx.caster.y + 1.4);
    const hit = new Set<AbilityTarget>();
    let range = a.range ?? 14;
    for (let i = 0; i < n; i++) {
      const cand = c.targets().filter((t) => t.alive && !hit.has(t) && dist2(t.x, t.z, from.x, from.z) < range)
        .sort((x, y) => dist2(x.x, x.z, from.x, from.z) - dist2(y.x, y.z, from.x, from.z))[0];
      if (!cand) {
        if (i === 0) {
          // Kein Ziel: Blitz in den Boden vor dir
          const f = this.fwd();
          const to = this.feet().add(new Vector3(f.x * 6, 0, f.z * 6));
          this.flashBolt(from, to, a.el);
        }
        break;
      }
      hit.add(cand);
      const to = new Vector3(cand.x, cand.y + 1.2, cand.z);
      const f0 = from.clone();
      this.later(i * 0.08, () => { this.flashBolt(f0, to, a.el); this.hitTarget(cand, dmg * (1 - i * 0.08), a, f0.x, f0.z); c.shake(0.15); });
      from = to;
      range = 8;
    }
  }

  private flashBolt(from: Vector3, to: Vector3, el: Element) {
    const m = boltMesh(from, to, col(el), 0.18);
    this.ctx.scene.add(m);
    this.burst(to, el, 10, 4, 3);
    this.later(0.18, () => { m.removeFromParent(); m.geometry.dispose(); });
  }

  private dash(a: ActiveDef, dmg: number) {
    const c = this.ctx;
    const range = a.range ?? 10;
    const f = this.fwd();
    const start = this.feet();
    const hit = new Set<AbilityTarget>();
    const dur = 0.22;
    c.speedlines(0.8);
    let t = 0;
    const r: Running = { t: 0, done: false, update: (dt) => {
      t += dt; r.t = t;
      const k = Math.min(1, t / dur);
      const x = start.x + f.x * range * k, z = start.z + f.z * range * k;
      c.moveCaster(x, z);
      this.burst(pv(c.caster.x, c.caster.y + 0.9, c.caster.z), a.el, 4, 1, 1);
      for (const tg of c.targets()) {
        if (!tg.alive || hit.has(tg)) continue;
        if (dist2(tg.x, tg.z, c.caster.x, c.caster.z) < 2 + tg.radius) { hit.add(tg); this.hitTarget(tg, dmg, a, c.caster.x - f.x, c.caster.z - f.z); }
      }
      if (k >= 1) {
        r.done = true;
        if ((a.count ?? 1) > 1) for (let i = 1; i < (a.count ?? 1); i++) this.later(i * 0.12, () => hit.forEach((tg) => tg.alive && this.hitTarget(tg, dmg * 0.6, a, start.x, start.z)));
        c.fx.smear(this.feet().setY(c.caster.y + 1), c.caster.yaw + Math.PI, 0.2, 3, 2, ELEMENT_COLORS[a.el]);
        this.efx.impact(this.feet(), a.el, a.ult ? 1.8 : 0.9);
        c.hitstop(0.07);
        // leuchtende Spur entlang des Weges, die langsam verglimmt
        const end = this.feet();
        const len = Math.hypot(end.x - start.x, end.z - start.z);
        if (len > 1) {
          const streak = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ color: col(a.el, 2.6), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
          const w = a.el === 'klinge' ? 0.12 : 0.35;
          const nx = -f.z * w, nz = f.x * w, y = start.y + 1;
          streak.geometry.setAttribute('position', new BufferAttribute(new Float32Array([
            start.x - nx, y, start.z - nz, start.x + nx, y, start.z + nz, end.x + nx, y, end.z + nz,
            start.x - nx, y, start.z - nz, end.x + nx, y, end.z + nz, end.x - nx, y, end.z - nz,
          ]), 3));
          c.scene.add(streak);
          let st = 0;
          const sr: Running = { t: 0, done: false, update: (dt2) => {
            st += dt2; sr.t = st;
            (streak.material as MeshBasicMaterial).opacity = Math.max(0, 1 - st / 0.45);
            streak.scale.y = 1;
            if (st > 0.45) { sr.done = true; streak.removeFromParent(); streak.geometry.dispose(); (streak.material as MeshBasicMaterial).dispose(); }
          } };
          this.running.push(sr);
        }
        // Klinge: der Schnitt „kommt erst an“, nachdem du vorbei bist – kurze Stille, dann reißen die Treffer auf
        if (a.el === 'klinge' && hit.size) this.later(0.18, () => {
          c.hitstop(0.09);
          c.shake(0.35);
          hit.forEach((tg) => { if (!tg.alive) return; c.fx.smear(pv(tg.x, tg.y + 1.1, tg.z), c.caster.yaw + Math.PI * 0.25, 0.9, 2.2, 1.2, ELEMENT_COLORS[a.el]); this.efx.impact(new Vector3(tg.x, tg.y, tg.z), 'klinge', 0.8); });
        });
      }
    } };
    this.running.push(r);
  }

  private blink(a: ActiveDef, dmg: number) {
    const c = this.ctx;
    const n = a.count ?? 1;
    const used = new Set<AbilityTarget>();
    for (let i = 0; i < n; i++) {
      this.later(i * 0.28, () => {
        const p = this.feet();
        const t = c.targets().filter((x) => x.alive && !used.has(x) && dist2(x.x, x.z, p.x, p.z) < 16).sort((x, y) => dist2(x.x, x.z, p.x, p.z) - dist2(y.x, y.z, p.x, p.z))[0];
        if (!t) return;
        used.add(t);
        this.burst(pv(p.x, p.y + 1, p.z), a.el, 20, 2, 2);
        const dx = t.x - p.x, dz = t.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        c.moveCaster(t.x + (dx / d) * (t.radius + 1), t.z + (dz / d) * (t.radius + 1), Math.atan2(-dx, -dz));
        this.burst(pv(c.caster.x, c.caster.y + 1, c.caster.z), a.el, 20, 2, 2);
        this.hitTarget(t, dmg, a, c.caster.x, c.caster.z);
        c.fx.smear(this.feet().setY(c.caster.y + 1), c.caster.yaw, 0.5, 2.5, 2.2, ELEMENT_COLORS[a.el]);
        c.hitstop(0.1);
        c.shake(0.3);
      });
    }
  }

  private rain(a: ActiveDef, dmg: number) {
    const c = this.ctx;
    const n = a.count ?? 6;
    const radius = a.radius ?? 12;
    const center = this.feet();
    const tg = c.targets().filter((t) => t.alive && dist2(t.x, t.z, center.x, center.z) < radius);
    for (let i = 0; i < n; i++) {
      const t = tg[i % Math.max(1, tg.length)];
      const ang = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * (radius - 3);
      const x = t && Math.random() < 0.75 ? t.x + (Math.random() - 0.5) * 2 : center.x + Math.cos(ang) * r;
      const z = t && Math.random() < 0.75 ? t.z + (Math.random() - 0.5) * 2 : center.z + Math.sin(ang) * r;
      const y = c.ground(x, z);
      const delay = 0.25 + i * 0.16;
      const p = new Vector3(x, y, z);
      c.fx.telegraph(p, 2.4, delay + 0.35, ELEMENT_COLORS[a.el]);
      if (a.el === 'meteor' || a.el === 'feuer') {
        // Fallender Meteor
        const m = new Mesh(new SphereGeometry(a.el === 'meteor' ? 0.9 : 0.5, 10, 8), new MeshBasicMaterial({ color: col(a.el, 3), transparent: true, blending: AdditiveBlending, depthWrite: false }));
        const sx = x - 14, sy = y + 40, sz = z - 6;
        m.position.set(sx, sy, sz);
        c.scene.add(m);
        let t2 = 0;
        const fall = delay + 0.35;
        this.running.push({ t: 0, done: false, update(this: Running, dt: number) {
          t2 += dt; this.t = t2;
          const k = Math.min(1, t2 / fall);
          m.position.set(sx + (x - sx) * k, sy + (y - sy) * k, sz + (z - sz) * k);
          if (k >= 1) { this.done = true; m.removeFromParent(); m.geometry.dispose(); }
        } } as Running);
      }
      this.later(delay + 0.35, () => {
        if (a.el === 'blitz') this.flashBolt(p.clone().setY(y + 30), p.clone().setY(y + 0.2), a.el);
        c.fx.shockwave(p, 3, ELEMENT_COLORS[a.el]);
        this.efx.impact(p, a.el, a.el === 'meteor' ? 1.7 : a.ult ? 1.4 : 1);
        if (a.el === 'meteor') c.fx.crack(p, 4);
        this.burst(pv(p.x, y + 0.5, p.z), a.el, 18, 4, 6);
        for (const tgt of c.targets()) if (tgt.alive && dist2(tgt.x, tgt.z, x, z) < 2.6 + tgt.radius) this.hitTarget(tgt, dmg, a, x, z);
        c.shake(0.3);
      });
    }
  }

  private pull(a: ActiveDef, dmg: number) {
    const c = this.ctx;
    const f = this.fwd();
    const radius = a.radius ?? 10;
    const cx = c.caster.x + f.x * 5, cz = c.caster.z + f.z * 5;
    const cy = c.ground(cx, cz);
    const core = new Mesh(new SphereGeometry(0.9, 16, 12), new MeshBasicMaterial({ color: new Color(0.05, 0, 0.1) }));
    const halo = new Mesh(new RingGeometry(1, 1.6, 32), new MeshBasicMaterial({ color: col(a.el, 2.5), transparent: true, blending: AdditiveBlending, side: DoubleSide, depthWrite: false }));
    core.position.set(cx, cy + 1.5, cz);
    halo.position.copy(core.position);
    c.scene.add(core, halo);
    let t = 0;
    const dur = 1.1;
    const r: Running = { t: 0, done: false, update: (dt) => {
      t += dt; r.t = t;
      halo.lookAt(c.caster.x, c.caster.y + 1.5, c.caster.z);
      halo.scale.setScalar(1 + Math.sin(t * 20) * 0.1);
      for (let i = 0; i < 3; i++) {
        const ang = Math.random() * Math.PI * 2;
        c.particles.emit(1, cx + Math.cos(ang) * radius * 0.6, cy + 0.5 + Math.random() * 2, cz + Math.sin(ang) * radius * 0.6, { speed: 0.2, up: 0.5, life: 0.5, color: col(a.el, 2.5), gravity: 0, spread: 0.1 });
      }
      for (const tg of c.targets()) {
        if (!tg.alive) continue;
        const d = dist2(tg.x, tg.z, cx, cz);
        if (d < radius && d > 0.8 && tg.shove) tg.shove(((cx - tg.x) / d) * 9 * dt, ((cz - tg.z) / d) * 9 * dt);
      }
      if (t >= dur) {
        r.done = true;
        core.removeFromParent(); halo.removeFromParent();
        c.fx.shockwave(pv(cx, cy, cz), radius * 0.6, ELEMENT_COLORS[a.el]);
        this.efx.impact(new Vector3(cx, cy, cz), a.el, a.ult ? 2.2 : 1.6);
        for (const tg of c.targets()) if (tg.alive && dist2(tg.x, tg.z, cx, cz) < radius * 0.5) this.hitTarget(tg, dmg, a, cx, cz);
        c.shake(0.5); c.hitstop(0.1);
      }
    } };
    this.running.push(r);
  }

  private cloud(a: ActiveDef, dmg: number) {
    const c = this.ctx;
    const follow = a.el === 'klinge';
    const f = this.fwd();
    const radius = a.radius ?? 4;
    let x = c.caster.x + (follow ? 0 : f.x * 5), z = c.caster.z + (follow ? 0 : f.z * 5);
    const dur = a.dur ?? 5;
    let t = 0, tick = 0;
    const r: Running = { t: 0, done: false, update: (dt) => {
      t += dt; r.t = t; tick -= dt;
      if (follow) { x = c.caster.x; z = c.caster.z; }
      const y = c.ground(x, z);
      for (let i = 0; i < 3; i++) {
        const ang = Math.random() * Math.PI * 2, rr = Math.random() * radius;
        c.particles.emit(1, x + Math.cos(ang) * rr, y + 0.3 + Math.random() * 1.5, z + Math.sin(ang) * rr, { speed: follow ? 3 : 0.4, up: 0.4, life: 0.8, color: col(a.el, 2), gravity: -0.3, spread: 0.2 });
      }
      if (tick <= 0) {
        tick = 0.5;
        if (follow) c.fx.smear(pv(x, y + 1, z), t * 9, 0.05, radius, Math.PI * 1.9, ELEMENT_COLORS[a.el]);
        for (const tg of c.targets()) if (tg.alive && dist2(tg.x, tg.z, x, z) < radius + tg.radius) this.hitTarget(tg, dmg, a, x, z);
      }
      if (t >= dur) r.done = true;
    } };
    this.running.push(r);
  }

  private spikes(a: ActiveDef, dmg: number) {
    const c = this.ctx;
    const f = this.fwd();
    const range = a.range ?? 12;
    const start = this.feet();
    const hit = new Set<AbilityTarget>();
    const steps = Math.round(range / 1.4);
    const color = a.el === 'eis' ? 0x9fe8ff : 0x8a6a4a;
    for (let i = 1; i <= steps; i++) {
      this.later(i * 0.045, () => {
        const x = start.x + f.x * i * 1.4 + (Math.random() - 0.5) * 0.6;
        const z = start.z + f.z * i * 1.4 + (Math.random() - 0.5) * 0.6;
        const y = c.ground(x, z);
        const spike = new Mesh(new ConeGeometry(0.45, 2.2, 5), new MeshBasicMaterial({ color }));
        spike.position.set(x, y - 1.2, z);
        spike.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
        c.scene.add(spike);
        let t = 0;
        this.running.push({ t: 0, done: false, update(this: Running, dt: number) {
          t += dt; this.t = t;
          spike.position.y = y - 1.2 + Math.min(1, t * 12) * 1.5 - Math.max(0, t - 0.8) * 3;
          if (t > 1.2) { this.done = true; spike.removeFromParent(); spike.geometry.dispose(); }
        } } as Running);
        this.burst(pv(x, y + 0.3, z), a.el, 6, 2, 4);
        if (i % 3 === 0) this.efx.impact(new Vector3(x, y, z), a.el, 0.6);
        for (const tg of c.targets()) if (tg.alive && !hit.has(tg) && dist2(tg.x, tg.z, x, z) < 1.4 + tg.radius) { hit.add(tg); this.hitTarget(tg, dmg, a, x - f.x, z - f.z); }
        if (i === 1) c.shake(0.4);
      });
    }
  }

  private barrage(a: ActiveDef, dmg: number) {
    const c = this.ctx;
    const n = a.count ?? 10;
    const range = a.range ?? 3;
    for (let i = 0; i < n; i++) {
      this.later(i * 0.06, () => {
        const f = this.fwd();
        const p = new Vector3(c.caster.x + f.x * 1.6 + (Math.random() - 0.5) * 1.4, c.caster.y + 0.8 + Math.random() * 0.9, c.caster.z + f.z * 1.6 + (Math.random() - 0.5) * 1.4);
        c.fx.hit(p, 'punch', ELEMENT_COLORS[a.el]);
        for (const tg of c.targets()) {
          if (!tg.alive) continue;
          if (dist2(tg.x, tg.z, c.caster.x, c.caster.z) < range + tg.radius && angleTo(c.caster.x, c.caster.z, c.caster.yaw, tg.x, tg.z) < 0.9) this.hitTarget(tg, dmg, a, c.caster.x, c.caster.z);
        }
        if (i % 3 === 0) c.shake(0.12);
        if (i === n - 1) this.efx.impact(new Vector3(c.caster.x + this.fwd().x * 2, c.caster.y, c.caster.z + this.fwd().z * 2), a.el, 1.2);
      });
    }
  }

  update(dt: number) {
    this.efx.update(dt);
    for (const r of this.running) if (!r.done) r.update(dt);
    keepIf(this.running, (r) => !r.done);
  }
}

/** Animation passend zur Form der Fähigkeit */
export function castClip(s: SkillDef): { clip: string; speed: number } {
  const a = s.act!;
  if (a.shape === 'barrage') return { clip: 'Melee_Unarmed_Attack_Punch_A', speed: 2.2 };
  if (a.shape === 'dash' || a.shape === 'blink') return { clip: 'Melee_1H_Attack_Stab', speed: 1.8 };
  if (a.shape === 'nova' && (a.el === 'koerper' || a.el === 'meteor')) return { clip: 'Melee_1H_Attack_Jump_Chop', speed: 1.5 };
  if (a.shape === 'nova' && a.el === 'klinge') return { clip: 'Melee_2H_Attack_Spin', speed: 1.5 };
  if (a.shape === 'line' || a.shape === 'cone' && a.el === 'klinge') return { clip: 'Melee_2H_Attack_Slice', speed: 1.5 };
  if (a.shape === 'buff' || a.shape === 'heal' || a.ult) return { clip: 'Ranged_Magic_Raise', speed: 1.5 };
  if (a.shape === 'rain' || a.shape === 'pull' || a.shape === 'cloud') return { clip: 'Ranged_Magic_Summon', speed: 2.2 };
  return { clip: 'Ranged_Magic_Shoot', speed: 1.5 };
}

export type { Passives };
