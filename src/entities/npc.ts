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
  /** Eigenes Gehtempo (jeder geht etwas anders) und aktuelle Geschwindigkeit (für sanftes Anlaufen) */
  private pace: number;
  private vel = 0;
  private stuckT = 0;

  constructor(assets: CharacterAssets, private home: WalkIsland, private ground: IslandGround, readonly role: NpcRole, private rng: () => number, outline: boolean) {
    this.char = new Character(assets, randomLook(rng, role), outline);
    const a = rng() * Math.PI * 2;
    const r = home.r * (0.2 + rng() * 0.55);
    this.x = home.x + Math.cos(a) * r;
    this.z = home.z + Math.sin(a) * r;
    this.yaw = rng() * Math.PI * 2;
    this.pace = 1.05 + rng() * 0.4;
    this.pick();
  }

  /** Ziel auf der Insel, das nicht in einem Haus, Baum oder Fels liegt */
  private freeSpot(): boolean {
    for (let i = 0; i < 8; i++) {
      const a = this.rng() * Math.PI * 2;
      const rr = this.home.r * (0.15 + this.rng() * 0.6);
      const x = this.home.x + Math.cos(a) * rr, z = this.home.z + Math.sin(a) * rr;
      if (this.home.blockers.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 1.2)) continue;
      // nicht quer über die halbe Insel: lieber kurze Spaziergänge
      if (Math.hypot(x - this.x, z - this.z) > this.home.r * 0.9) continue;
      this.target.set(x, 0, z);
      return true;
    }
    return false;
  }

  /** Daten der Stadtbewohnerin/des Stadtbewohners (Name, Laden, Sprüche) */
  townDef: import('../data/quests').TownNpcDef | null = null;
  /** Feste Person (Ladenbesitzer): bleibt an ihrem Platz */
  station: { x: number; z: number; yaw: number } | null = null;
  pin(x: number, z: number, yaw: number) {
    this.station = { x, z, yaw };
    this.x = x; this.z = z; this.yaw = yaw;
    this.mood = 'idle';
    this.char.play(this.role === 'schmied' ? 'hammer' : 'idle', { fade: 0.3 });
  }

  private pick() {
    if (this.station) { this.mood = 'idle'; this.timer = 6; this.char.play(this.role === 'schmied' ? 'hammer' : 'idle', { fade: 0.4 }); return; }
    const r = this.rng();
    const favour: Mood = this.role === 'schmied' ? 'work' : this.role === 'fischer' ? 'sit' : 'wander';
    this.mood = r < 0.25 ? favour : r < 0.55 ? 'wander' : r < 0.88 ? 'idle' : 'sit';
    this.timer = 4 + this.rng() * 8;
    if (this.mood === 'wander') {
      if (this.freeSpot()) this.timer = 30; // bis zum Ziel gehen, nicht mittendrin stehen bleiben
      else this.mood = 'idle';
    }
    this.stuckT = 0;
    const anim: Record<Mood, AnimRole> = { wander: 'walk', idle: 'idle', sit: 'sitFloor', work: 'hammer', cheer: 'cheer' };
    this.char.play(anim[this.mood], { fade: 0.45 });
    if (this.mood === 'wander') this.char.setLocoSpeed(0.6);
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
      const want = Math.atan2(dx, dz);
      const diff = MathUtils.euclideanModulo(want - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
      // erst in Gehrichtung drehen, dann losgehen; vor dem Ziel abbremsen
      this.yaw += diff * Math.min(1, dt * 4);
      const facing = Math.max(0, Math.cos(diff));
      const goal = d < 0.5 ? 0 : this.pace * facing * Math.min(1, d / 1.2);
      this.vel += (goal - this.vel) * Math.min(1, dt * 3);
      if (d < 0.5 && this.vel < 0.15) this.timer = 0;
      else {
        const bx = this.x, bz = this.z;
        this.x += Math.sin(this.yaw) * this.vel * dt;
        this.z += Math.cos(this.yaw) * this.vel * dt;
        const c = this.ground.constrain(this.x, this.z);
        this.x = c.x; this.z = c.z;
        // Schritte im Takt der echten Bewegung
        const moved = Math.hypot(this.x - bx, this.z - bz) / Math.max(dt, 1e-4);
        this.char.setLocoSpeed(Math.max(0.6, moved));
        // hängt an einer Wand fest: stehen bleiben und etwas anderes tun
        this.stuckT = moved < this.vel * 0.4 && this.vel > 0.3 ? this.stuckT + dt : 0;
        if (this.stuckT > 0.8) this.timer = 0;
      }
    } else this.vel = 0;
    if (this.timer <= 0) this.pick();

    const y = this.ground.height(this.x, this.z);
    this.char.place(this.x, Number.isFinite(y) ? y : 0, this.z, this.yaw);
    // Weit entfernte Figuren seltener animieren (nah immer flüssig)
    this.acc += dt;
    if (camDist < 90 || (camDist < 200 && this.acc >= 0.05) || this.acc >= 0.12) {
      this.char.update(this.acc);
      this.acc = 0;
    }
  }
}
