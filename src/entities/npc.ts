import { MathUtils, Vector3 } from 'three';
import type { AnimRole } from '../data/animations';
import { randomLook, type NpcRole } from '../data/characterParts';
import type { IslandGround, WalkIsland } from '../world/islandGround';
import type { CharacterAssets } from './character/assets';
import { Character } from './character/character';

type Mood = 'wander' | 'idle' | 'sit' | 'work' | 'cheer';

/** Einfacher Inselbewohner mit Tagesablauf-Ansatz: schlendern, stehen, sitzen, arbeiten, grüßen. */
export class Npc {
  readonly char: Character;
  x: number;
  z: number;
  yaw = 0;
  private mood: Mood = 'idle';
  private timer = 0;
  private target = new Vector3();
  private greeted = 0;
  private acc = 0;

  constructor(assets: CharacterAssets, private home: WalkIsland, private ground: IslandGround, readonly role: NpcRole, private rng: () => number, outline: boolean) {
    this.char = new Character(assets, randomLook(rng, role), outline);
    const a = rng() * Math.PI * 2;
    const r = home.r * (0.2 + rng() * 0.55);
    this.x = home.x + Math.cos(a) * r;
    this.z = home.z + Math.sin(a) * r;
    this.yaw = rng() * Math.PI * 2;
    this.pick();
  }

  private pick() {
    const r = this.rng();
    const favour: Mood = this.role === 'schmied' ? 'work' : this.role === 'fischer' ? 'sit' : 'wander';
    this.mood = r < 0.35 ? favour : r < 0.6 ? 'wander' : r < 0.85 ? 'idle' : 'sit';
    this.timer = 4 + this.rng() * 8;
    if (this.mood === 'wander') {
      const a = this.rng() * Math.PI * 2;
      const rr = this.home.r * (0.15 + this.rng() * 0.6);
      this.target.set(this.home.x + Math.cos(a) * rr, 0, this.home.z + Math.sin(a) * rr);
    }
    const anim: Record<Mood, AnimRole> = { wander: 'walk', idle: 'idle', sit: 'sitFloor', work: 'hammer', cheer: 'cheer' };
    this.char.play(anim[this.mood], { fade: 0.4 });
  }

  update(dt: number, player: Vector3 | null, camDist: number) {
    this.timer -= dt;
    const pd = player ? Math.hypot(player.x - this.x, player.z - this.z) : 999;
    // Spieler kommt näher: hinschauen und winken
    if (pd < 4.5 && this.greeted <= 0 && this.mood !== 'sit') {
      this.greeted = 25;
      this.char.play('wave', { fade: 0.25, onDone: () => this.pick() });
      this.mood = 'idle';
      this.timer = 3;
    }
    this.greeted -= dt;
    if (pd < 6 && player && this.mood !== 'wander') {
      const want = Math.atan2(player.x - this.x, player.z - this.z);
      const diff = MathUtils.euclideanModulo(want - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
      this.yaw += diff * Math.min(1, dt * 4);
    }
    if (this.mood === 'wander') {
      const dx = this.target.x - this.x, dz = this.target.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6) this.timer = 0;
      else {
        const sp = 1.3;
        this.x += (dx / d) * sp * dt;
        this.z += (dz / d) * sp * dt;
        const want = Math.atan2(dx, dz);
        const diff = MathUtils.euclideanModulo(want - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
        this.yaw += diff * Math.min(1, dt * 5);
        const c = this.ground.constrain(this.x, this.z);
        this.x = c.x; this.z = c.z;
      }
    }
    if (this.timer <= 0) this.pick();

    const y = this.ground.height(this.x, this.z);
    this.char.holder.position.set(this.x, Number.isFinite(y) ? y : 0, this.z);
    this.char.holder.rotation.y = this.yaw;
    // Weit entfernte Figuren seltener animieren
    this.acc += dt;
    if (camDist < 60 || this.acc >= 0.1) {
      this.char.update(this.acc);
      this.acc = 0;
    }
  }
}
