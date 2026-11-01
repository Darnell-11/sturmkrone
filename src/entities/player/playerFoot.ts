import { MathUtils } from 'three';
import type { Input } from '../../core/input/input';
import { STYLE_ANIMS, type StyleId } from '../../data/animations';
import type { IslandGround } from '../../world/islandGround';
import type { Character } from '../character/character';

const WALK = 2.4;
const RUN = 6.2;
const ROLL_SPEED = 9;
const ROLL_TIME = 0.42;

type FootState = 'move' | 'roll' | 'attack';

/** Steuerung zu Fuß: laufen, rennen, Rolle, Angriffskombos (Treffer folgen in Meilenstein 3). */
export class PlayerFoot {
  x = 0;
  z = 0;
  y = 0;
  yaw = 0;
  prev = { x: 0, z: 0, y: 0, yaw: 0 };
  state: FootState = 'move';
  /** Für Kamera und Effekte: aktuelle Geschwindigkeit */
  speed = 0;
  private rollT = 0;
  private rollDir = { x: 0, z: 1 };
  private combo = 0;
  private comboQueued = false;
  private comboWindow = 0;
  private locomotion = '';

  constructor(private char: Character, public style: StyleId) {}

  place(x: number, z: number, yaw: number, ground: IslandGround) {
    this.x = x; this.z = z; this.yaw = yaw;
    const h = ground.height(x, z);
    this.y = Number.isFinite(h) ? h : 0;
    this.prev = { x, z, y: this.y, yaw };
    this.state = 'move';
    this.locomotion = '';
  }

  update(dt: number, input: Input, camYaw: number, ground: IslandGround) {
    this.prev = { x: this.x, z: this.z, y: this.y, yaw: this.yaw };
    const mv = input.move();
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    // Kamerarelativ: vorwärts = Blickrichtung der Kamera
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    let dx = fx * mv.y + rx * mv.x;
    let dz = fz * mv.y + rz * mv.x;
    const dl = Math.hypot(dx, dz);
    if (dl > 0.001) { dx /= dl; dz /= dl; }

    this.comboWindow -= dt;
    const anims = STYLE_ANIMS[this.style];

    if (input.pressed('dodge') && this.state !== 'roll') {
      this.state = 'roll';
      this.rollT = ROLL_TIME;
      this.rollDir = dl > 0.001 ? { x: dx, z: dz } : { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
      this.yaw = Math.atan2(this.rollDir.x, this.rollDir.z);
      this.char.play('roll', { fade: 0.08, restart: true });
      this.locomotion = '';
    }
    if (input.pressed('attack') && this.state !== 'roll') {
      if (this.state === 'attack') this.comboQueued = true;
      else this.startAttack(dl > 0.001 ? Math.atan2(dx, dz) : this.yaw);
    }
    if (input.pressed('heavy') && this.state === 'move') {
      this.state = 'attack';
      this.combo = 0;
      this.char.playClip(anims.heavy.clip, { loop: false, speed: anims.heavy.speed, fade: 0.1, restart: true, onDone: () => this.endAttack() });
      this.locomotion = '';
    }

    let vx = 0, vz = 0;
    if (this.state === 'roll') {
      this.rollT -= dt;
      const k = Math.max(0.3, this.rollT / ROLL_TIME);
      vx = this.rollDir.x * ROLL_SPEED * k;
      vz = this.rollDir.z * ROLL_SPEED * k;
      if (this.rollT <= 0) { this.state = 'move'; this.locomotion = ''; }
    } else if (this.state === 'attack') {
      // Kleiner Schritt nach vorn in den ersten Momenten eines Schlags
      const p = this.char.progress;
      if (p < 0.35) { vx = Math.sin(this.yaw) * 2.2; vz = Math.cos(this.yaw) * 2.2; }
    } else if (mag > 0.05) {
      const sp = mag > 0.7 ? RUN : WALK * (mag / 0.7) + 0.6;
      vx = dx * sp;
      vz = dz * sp;
      const want = Math.atan2(dx, dz);
      const diff = MathUtils.euclideanModulo(want - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
      this.yaw += diff * Math.min(1, dt * 12);
    }
    this.speed = Math.hypot(vx, vz);
    const c = ground.constrain(this.x + vx * dt, this.z + vz * dt);
    this.x = c.x;
    this.z = c.z;
    const h = ground.height(this.x, this.z);
    const targetY = Number.isFinite(h) ? h : this.y;
    this.y += (targetY - this.y) * Math.min(1, dt * 15);

    if (this.state === 'move') {
      const want = this.speed < 0.1 ? 'idle' : this.speed > 4 ? 'run' : 'walk';
      if (want !== this.locomotion) {
        this.locomotion = want;
        if (want === 'idle') this.char.playClip(anims.idle.clip, { loop: true, fade: 0.25 });
        else this.char.play(want === 'run' ? 'run' : 'walk', { fade: 0.2 });
      }
    }
  }

  private startAttack(dirYaw: number) {
    const anims = STYLE_ANIMS[this.style];
    if (this.comboWindow <= 0) this.combo = 0;
    const step = anims.combo[this.combo % anims.combo.length];
    this.state = 'attack';
    this.yaw = dirYaw;
    this.comboQueued = false;
    this.locomotion = '';
    this.char.playClip(step.clip, { loop: false, speed: step.speed, fade: 0.08, restart: true, onDone: () => this.endAttack() });
    this.combo++;
  }

  private endAttack() {
    this.comboWindow = 0.5;
    this.state = 'move';
    if (this.comboQueued) this.startAttack(this.yaw);
  }
}
