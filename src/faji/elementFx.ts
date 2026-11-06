import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
  type Object3D,
  type Scene,
} from 'three';
import type { CombatFx } from '../combat/fx';
import { ELEMENT_COLORS, type Element } from '../data/skills';
import { toon } from '../render/toon';
import type { ParticleSystem } from '../world/particles';
import type { SmokeSystem } from '../world/smoke';

/** Rauch der Welt (setzt die Seewelt); in der Skillbaum-Vorschau gibt es keinen */
let worldSmoke: SmokeSystem | null = null;
export function setElementSmoke(s: SmokeSystem | null) { worldSmoke = s; }

interface Live { obj: Object3D; t: number; max: number; step(k: number, o: Object3D): void }

/** Elementfarbe mit voller Sättigung – helle Effekte sollen ihren Farbton behalten statt weiß auszubrennen */
const HSL = { h: 0, s: 0, l: 0 };
function vivid(el: Element, k: number): Color {
  const c = new Color(ELEMENT_COLORS[el]);
  c.getHSL(HSL);
  if (HSL.s > 0.15) c.setHSL(HSL.h, Math.min(1, HSL.s * 1.2 + 0.15), Math.min(0.5, HSL.l));
  return c.multiplyScalar(k);
}
const glowMat = (el: Element, k = 2.6, opacity = 1) => new MeshBasicMaterial({ color: vivid(el, k * 0.7), transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
/** Deckende Farbschicht (nicht additiv) – gibt Flammen, Gift und Schatten Körper auf hellem Grund */
const bodyMat = (el: Element, opacity = 0.85) => new MeshBasicMaterial({ color: vivid(el, 1.15), transparent: true, opacity, depthWrite: false, side: DoubleSide });

/** Gezackter Blitz als Band */
function jagged(a: Vector3, b: Vector3, color: Color, width: number): Mesh {
  const pts: Vector3[] = [a.clone()];
  for (let i = 1; i < 10; i++) {
    const p = a.clone().lerp(b, i / 10);
    p.x += (Math.random() - 0.5) * 1.6; p.z += (Math.random() - 0.5) * 1.6; p.y += (Math.random() - 0.5) * 0.8;
    pts.push(p);
  }
  pts.push(b.clone());
  const pos: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const side = new Vector3().subVectors(p1, p0).cross(new Vector3(1, 0, 0)).normalize().multiplyScalar(width);
    const side2 = new Vector3().subVectors(p1, p0).cross(new Vector3(0, 0, 1)).normalize().multiplyScalar(width);
    for (const off of [side, side2]) {
      pos.push(...p0.clone().sub(off).toArray(), ...p0.clone().add(off).toArray(), ...p1.clone().sub(off).toArray());
      pos.push(...p0.clone().add(off).toArray(), ...p1.clone().add(off).toArray(), ...p1.clone().sub(off).toArray());
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  return new Mesh(g, new MeshBasicMaterial({ color: color.clone().multiplyScalar(4), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
}

/**
 * Eigene Effektsprache je Element (Form, Farbe, Bewegung) – zusätzlich zu Partikeln und Druckwelle.
 * k = Wucht: 0,4 bei einem einzelnen Treffer, bis 2,5 bei Ultimates.
 */
export class ElementFx {
  private live: Live[] = [];

  constructor(private scene: Scene, private fx: CombatFx, private particles: ParticleSystem, private hooks: { shake(a: number): void; hitstop(t: number): void; speedlines(s: number): void }) {}

  private add(obj: Object3D, max: number, step: Live['step']) {
    this.scene.add(obj);
    this.live.push({ obj, t: 0, max, step });
    step(0, obj);
  }

  private smoke(p: Vector3, opts: Parameters<SmokeSystem['puff']>[3]) {
    if (worldSmoke && worldSmoke.mesh.parent === this.scene) worldSmoke.puff(p.x, p.y, p.z, opts);
  }

  private sparks(p: Vector3, el: Element, n: number, speed: number, up: number, gravity = 6, life = 0.9) {
    this.particles.emit(n, p.x, p.y, p.z, { speed, up, life, color: vivid(el, 1.9), gravity, spread: 0.6 });
  }

  impact(p: Vector3, el: Element, k: number) {
    const s = Math.max(0.4, k);
    const ground = p.clone();
    const c = new Color(ELEMENT_COLORS[el]);
    switch (el) {
      case 'feuer': {
        for (let i = 0; i < Math.round(4 + s * 3); i++) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * 1.2 * s;
          const h = (1.2 + Math.random() * 1.6) * s;
          // Flammenzunge: tieforange Hülle + heißer gelber Kern
          const flame = new Mesh(new ConeGeometry(0.38 * s, h, 7, 1, true), bodyMat('feuer', 0.8));
          const core = new Mesh(new ConeGeometry(0.2 * s, h * 0.7, 6, 1, true), new MeshBasicMaterial({ color: new Color(2.2, 1.5, 0.35), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
          core.position.y = -h * 0.12;
          flame.add(core);
          flame.position.set(p.x + Math.cos(a) * d, p.y + h / 2, p.z + Math.sin(a) * d);
          this.add(flame, 0.55 + Math.random() * 0.3, (t, o) => {
            o.scale.set(1 - t * 0.6, 0.3 + Math.sin(Math.min(1, t * 2) * Math.PI * 0.5) * (1 - t * 0.5), 1 - t * 0.6);
            o.rotation.y += 0.15;
            ((o as Mesh).material as MeshBasicMaterial).opacity = 0.8 * (1 - t);
            ((core as Mesh).material as MeshBasicMaterial).opacity = 1 - t;
            o.position.y += 0.02;
          });
        }
        this.sparks(p.clone().setY(p.y + 0.5), 'feuer', Math.round(18 * s), 3 * s, 7, -3, 1.2);
        this.smoke(p.clone().setY(p.y + 1), { n: Math.round(2 + s * 2), size: 0.8 * s, grow: 4 * s, life: 2.5, tone: 0.2, vy: 2.5, spread: 0.8, rise: 1.2, alpha: 0.6, glow: 0.9 });
        if (s > 1) this.fx.crack(ground, 3 * s);
        break;
      }
      case 'eis': {
        for (let i = 0; i < Math.round(5 + s * 4); i++) {
          const a = (i / (5 + s * 4)) * Math.PI * 2 + Math.random() * 0.4, d = (0.6 + Math.random() * 1.6) * s;
          const h = (1 + Math.random() * 1.8) * s;
          const shard = new Mesh(new ConeGeometry(0.3 * s, h, 5), new MeshBasicMaterial({ color: new Color(0.75, 1.4, 1.8) }));
          shard.position.set(p.x + Math.cos(a) * d, p.y, p.z + Math.sin(a) * d);
          shard.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
          const y0 = p.y - h * 0.5;
          this.add(shard, 1.3, (t, o) => { o.position.y = y0 + Math.min(1, t * 10) * h * 0.55 - Math.max(0, t - 0.75) * h * 2; });
        }
        this.sparks(p.clone().setY(p.y + 0.6), 'eis', Math.round(20 * s), 3.5 * s, 4, 4);
        this.smoke(p.clone().setY(p.y + 0.4), { n: Math.round(2 + s * 2), size: 1 * s, grow: 4.5 * s, life: 2, tone: 1.1, spread: 1.2, rise: 0.1, alpha: 0.45 });
        this.fx.shockwave(ground, 2.5 * s, '#CFF6FF');
        break;
      }
      case 'blitz': {
        for (let i = 0; i < Math.round(1 + s * 1.5); i++) {
          const off = new Vector3((Math.random() - 0.5) * 2 * s, 0, (Math.random() - 0.5) * 2 * s);
          const bolt = jagged(p.clone().add(off).setY(p.y + 22), p.clone().add(off.multiplyScalar(0.3)), c, 0.12 + 0.06 * s);
          this.add(bolt, 0.22, (t, o) => { ((o as Mesh).material as MeshBasicMaterial).opacity = t < 0.5 ? 1 : (1 - t) * 2; });
        }
        const flash = new Mesh(new SphereGeometry(1.4 * s, 12, 10), glowMat('blitz', 4));
        flash.position.copy(p).setY(p.y + 0.8);
        this.add(flash, 0.18, (t, o) => { o.scale.setScalar(0.4 + t * 1.4); ((o as Mesh).material as MeshBasicMaterial).opacity = 1 - t; });
        this.sparks(p.clone().setY(p.y + 0.5), 'blitz', Math.round(24 * s), 8 * s, 4, 10, 0.4);
        this.fx.shockwave(ground, 2 * s, '#F8F8B0');
        break;
      }
      case 'erde': {
        const stone = toon({ color: '#7A6448', flatShading: true });
        for (let i = 0; i < Math.round(4 + s * 3); i++) {
          const a = Math.random() * Math.PI * 2, d = (0.8 + Math.random() * 1.8) * s;
          const r = (0.35 + Math.random() * 0.45) * s;
          const rock = new Mesh(new DodecahedronGeometry(r, 0), stone);
          const y0 = p.y - r;
          rock.position.set(p.x + Math.cos(a) * d, y0, p.z + Math.sin(a) * d);
          rock.rotation.set(Math.random(), Math.random(), Math.random());
          rock.scale.y = 1.6;
          this.add(rock, 1.4, (t, o) => { o.position.y = y0 + Math.min(1, t * 9) * r * 1.6 - Math.max(0, t - 0.8) * r * 4; });
        }
        this.fx.crack(ground, 3.5 * s);
        this.smoke(p.clone().setY(p.y + 0.5), { n: Math.round(3 + s * 2), size: 1 * s, grow: 5 * s, life: 2.2, tone: new Color(0.62, 0.52, 0.38), vy: 1, spread: 2, rise: 0.2, alpha: 0.6 });
        this.sparks(p.clone().setY(p.y + 0.3), 'erde', Math.round(14 * s), 4 * s, 6, 14);
        break;
      }
      case 'sturm': {
        for (let i = 0; i < 3; i++) {
          const ring = new Mesh(new TorusGeometry(1.2 * s, 0.08 * s, 6, 32), glowMat('sturm', 2.2));
          ring.rotation.x = Math.PI / 2;
          ring.position.copy(p);
          const delay = i * 0.12;
          this.add(ring, 0.9, (t, o) => { const q = Math.max(0, t - delay); o.position.y = p.y + q * 5 * s; o.scale.setScalar(0.4 + q * 1.6); o.rotation.z += 0.3; ((o as Mesh).material as MeshBasicMaterial).opacity = (1 - t) * (q > 0 ? 1 : 0); });
        }
        this.smoke(p.clone().setY(p.y + 0.5), { n: Math.round(2 + s), size: 0.6 * s, grow: 3.5 * s, life: 1.2, tone: 1, vx: 0, vy: 3, spread: 3, rise: 1, alpha: 0.35 });
        this.sparks(p.clone().setY(p.y + 1), 'sturm', Math.round(16 * s), 6 * s, 3, 1, 0.8);
        break;
      }
      case 'schatten': case 'schwerkraft': {
        const core = new Mesh(new SphereGeometry(0.8 * s, 16, 12), new MeshBasicMaterial({ color: new Color(0.05, 0.0, 0.1) }));
        core.position.copy(p).setY(p.y + 1);
        this.add(core, 0.7, (t, o) => { o.scale.setScalar(t < 0.6 ? 0.3 + t * 1.6 : (1 - t) * 3.2); });
        const ring = new Mesh(new RingGeometry(0.85, 1, 48), glowMat(el, 2.8));
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(ground).setY(ground.y + 0.1);
        // nach innen stürzender Ring (Sog)
        this.add(ring, 0.6, (t, o) => { o.scale.setScalar((1 - t) * 4 * s + 0.2); ((o as Mesh).material as MeshBasicMaterial).opacity = 0.4 + t * 0.6; });
        this.smoke(p.clone().setY(p.y + 0.8), { n: Math.round(3 + s * 2), size: 0.8 * s, grow: 4 * s, life: 1.8, tone: new Color(0.3, 0.18, 0.42), spread: 1.4, rise: 0.4, alpha: 0.7, glow: 0.3 });
        break;
      }
      case 'licht': case 'geist': {
        const pillar = new Mesh(new CylinderGeometry(0.9 * s, 1.1 * s, 26, 16, 1, true), glowMat(el, 3, 0.9));
        pillar.position.copy(p).setY(p.y + 13);
        this.add(pillar, 0.6, (t, o) => { o.scale.set(Math.max(0.05, 1 - t) * (t < 0.15 ? t / 0.15 : 1), 1, Math.max(0.05, 1 - t) * (t < 0.15 ? t / 0.15 : 1)); ((o as Mesh).material as MeshBasicMaterial).opacity = (1 - t) * 0.9; });
        for (let i = 0; i < 2; i++) {
          const ring = new Mesh(new RingGeometry(0.9, 1, 48), glowMat(el, 3));
          ring.rotation.x = -Math.PI / 2;
          ring.position.copy(ground).setY(ground.y + 0.1 + i * 0.6);
          this.add(ring, 0.7, (t, o) => { o.scale.setScalar(0.5 + t * 4 * s); o.position.y += 0.03; ((o as Mesh).material as MeshBasicMaterial).opacity = 1 - t; });
        }
        this.sparks(p.clone().setY(p.y + 1.5), el, Math.round(24 * s), 2.5 * s, 6, -1, 1.4);
        break;
      }
      case 'gift': {
        this.smoke(p.clone().setY(p.y + 0.6), { n: Math.round(4 + s * 3), size: 1 * s, grow: 4.5 * s, life: 3, tone: new Color(0.5, 0.9, 0.3), spread: 1.6, rise: 0.15, alpha: 0.55, glow: 0.2 });
        for (let i = 0; i < Math.round(6 * s); i++) {
          const bub = new Mesh(new SphereGeometry(0.15 + Math.random() * 0.15, 8, 6), bodyMat('gift', 0.8));
          const a = Math.random() * Math.PI * 2, d = Math.random() * 1.6 * s;
          bub.position.set(p.x + Math.cos(a) * d, p.y + 0.2, p.z + Math.sin(a) * d);
          this.add(bub, 1 + Math.random() * 0.6, (t, o) => { o.position.y += 0.02; o.scale.setScalar(0.5 + t); ((o as Mesh).material as MeshBasicMaterial).opacity = (1 - t) * 0.8; });
        }
        break;
      }
      case 'flut': {
        const col = new Mesh(new CylinderGeometry(0.8 * s, 1.4 * s, 6 * s, 16, 1, true), new MeshBasicMaterial({ color: new Color(0.7, 1.1, 1.6), transparent: true, opacity: 0.6, depthWrite: false, side: DoubleSide }));
        col.position.copy(p).setY(p.y + 3 * s);
        this.add(col, 0.8, (t, o) => { o.scale.set(1 + t * 0.6, Math.sin(Math.min(1, t * 2.5) * Math.PI * 0.5) * (1 - t * 0.7), 1 + t * 0.6); ((o as Mesh).material as MeshBasicMaterial).opacity = (1 - t) * 0.6; });
        this.particles.emit(Math.round(30 * s), p.x, p.y + 0.5, p.z, { speed: 4 * s, up: 9 * s, life: 1.2, color: new Color(0.9, 1, 1.1), gravity: 14, spread: 0.8 });
        this.fx.shockwave(ground, 3.5 * s, '#9FD8FF');
        break;
      }
      case 'meteor': case 'koerper': {
        const fire = el === 'meteor';
        const dome = new Mesh(new SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), glowMat(el, fire ? 3.2 : 2.2, 0.9));
        dome.position.copy(ground);
        this.add(dome, fire ? 0.6 : 0.35, (t, o) => { o.scale.setScalar((0.5 + t * 3.2) * s); ((o as Mesh).material as MeshBasicMaterial).opacity = (1 - t) * 0.9; });
        this.fx.crack(ground, (fire ? 5 : 3.5) * s);
        if (fire) {
          this.smoke(p.clone().setY(p.y + 1.2), { n: Math.round(4 + s * 3), size: 1.4 * s, grow: 7 * s, life: 4, tone: 0.18, vy: 4, spread: 2, rise: 1.4, alpha: 0.7, glow: 1 });
          this.sparks(p.clone().setY(p.y + 0.6), 'meteor', Math.round(40 * s), 7 * s, 9, 8, 1.3);
        } else {
          this.smoke(p.clone().setY(p.y + 0.3), { n: Math.round(2 + s * 2), size: 0.8 * s, grow: 4 * s, life: 1.6, tone: 0.75, spread: 2.5, rise: 0.2, alpha: 0.5 });
          this.sparks(p.clone().setY(p.y + 0.5), 'koerper', Math.round(18 * s), 6 * s, 4);
        }
        break;
      }
      case 'klinge': {
        for (let i = 0; i < 2; i++) this.fx.smear(p.clone().setY(p.y + 1.1), Math.random() * Math.PI * 2, 0.6 + i * 0.6, 2.2 * s, 1.4, ELEMENT_COLORS.klinge, i === 1);
        const star = new Mesh(new OctahedronGeometry(0.6 * s, 0), glowMat('klinge', 3.5));
        star.position.copy(p).setY(p.y + 1.1);
        this.add(star, 0.25, (t, o) => { o.scale.set(0.2 + t * 3, 0.2 + t * 0.4, 0.2 + t * 0.4); o.rotation.y += 0.4; ((o as Mesh).material as MeshBasicMaterial).opacity = 1 - t; });
        break;
      }
    }
    // Wucht: Kamera, Trefferpause, Speedlines – je stärker die Fähigkeit, desto mehr
    if (k >= 1) this.hooks.shake(Math.min(1, 0.2 + k * 0.25));
    if (k >= 1.6) { this.hooks.hitstop(0.06 + k * 0.03); this.hooks.speedlines(Math.min(1, k * 0.4)); }
  }

  update(dt: number) {
    for (const l of this.live) {
      l.t += dt;
      const k = Math.min(1, l.t / l.max);
      l.step(k, l.obj);
      if (l.t >= l.max) {
        l.obj.removeFromParent();
        l.obj.traverse((o) => {
          const m = o as Mesh;
          m.geometry?.dispose();
          const mat = m.material as Material | undefined;
          if (mat && !(mat as Material & { userData: { toon?: boolean } }).userData?.toon) mat.dispose();
        });
      }
    }
    this.live = this.live.filter((l) => l.t < l.max);
  }
}
