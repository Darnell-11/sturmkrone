import { MathUtils, Vector3 } from 'three';
import type { AnimRole } from '../data/animations';
import { randomLook, type NpcRole } from '../data/characterParts';
import { inBox, type IslandGround, type WalkIsland } from '../world/islandGround';
import type { CharacterAssets } from './character/assets';
import { Character } from './character/character';
import { NPC_LIFE } from '../data/characterRig';
import { mintEntityId, type EntityId } from '../sim/entityId';

type Mood = 'wander' | 'idle' | 'sit' | 'work' | 'cheer';

/** Einfacher Inselbewohner mit Tagesablauf-Ansatz: schlendern, stehen, sitzen, arbeiten, grüßen. */
export class Npc {
  readonly char: Character;
  /** 4.6J: Kennung für die Ziel-Erfassung (Hafen-Bewohner sind anwählbar) */
  readonly entityId: EntityId = mintEntityId('npc');
  x = 0;
  z = 0;
  yaw = 0;
  private mood: Mood = 'idle';
  private timer = 0;
  private target = new Vector3();
  private greeted = 0;
  private acc = 0;
  /** Eigenes Gehtempo (jeder geht etwas anders) und aktuelle Geschwindigkeit (für sanftes Anlaufen) */
  private pace: number;
  private stepV = 0.6;
  private vel = 0;
  private stuckT = 0;

  constructor(assets: CharacterAssets, private home: WalkIsland, private ground: IslandGround, readonly role: NpcRole, private rng: () => number, outline: boolean) {
    this.char = new Character(assets, randomLook(rng, role), outline);
    this.char.walkVariant = 'Walking_B';
    // 4.6F: Haltung, Grund-Ausdruck und Atemtempo nach Rolle; Füße folgen dem Gelände
    const life = NPC_LIFE[role];
    this.char.presence({ stance: life.stance, face: life.face, breath: life.breath });
    this.char.setGround((x, z) => this.ground.height(x, z));
    // Stadtleute laufen leiser
    this.char.stepVol = 0.3;
    // Startplatz: auf einer Straße der Stadt (falls es welche gibt), sonst irgendwo frei; nie in einem Haus, Zaun oder Stapel
    let placed = false;
    for (let i = 0; i < 40 && !placed; i++) {
      const p = home.walkways?.length ? this.streetPoint() : null;
      let x: number, z: number;
      if (p) { x = p.x; z = p.z; } else { const a = rng() * Math.PI * 2, r = home.r * (0.2 + rng() * 0.55); x = home.x + Math.cos(a) * r; z = home.z + Math.sin(a) * r; }
      if (this.blocked(x, z, 0.9) || this.crowded(x, z, 1.6)) continue;
      this.x = x; this.z = z; placed = true;
    }
    if (!placed) { this.x = home.x; this.z = home.z; }
    this.yaw = rng() * Math.PI * 2;
    this.pace = 1.05 + rng() * 0.4;
    Npc.all.add(this);
    this.pick();
  }

  /** Alle Bewohner: halten Abstand zueinander (nie ineinander stehen) */
  private static all = new Set<Npc>();
  dispose() { Npc.all.delete(this); }

  /** Liegt der Punkt in einem Hindernis (Quader mit Rand oder Kreis)? */
  private blocked(x: number, z: number, m: number): boolean {
    for (const b of this.home.blockers) {
      if (b.hw !== undefined) { if (inBox(b, x, z, m)) return true; }
      else if (Math.hypot(x - b.x, z - b.z) < b.r + m) return true;
    }
    return false;
  }
  private crowded(x: number, z: number, d: number): boolean {
    for (const o of Npc.all) if (o !== this && Math.hypot(o.x - x, o.z - z) < d) return true;
    return false;
  }
  /** Gerade Strecke frei von Hindernissen? (Probe alle 1 m) */
  private pathClear(x0: number, z0: number, x1: number, z1: number): boolean {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0)));
    for (let i = 1; i < n; i++) if (this.blocked(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, 0.45)) return false;
    return true;
  }
  /** Zufälliger Punkt auf einer Straße (in der Mitte, etwas seitlich versetzt) */
  private streetPoint(): { x: number; z: number } | null {
    const ways = this.home.walkways;
    if (!ways?.length) return null;
    const st = ways[Math.floor(this.rng() * ways.length)];
    let total = 0;
    for (let i = 0; i < st.pts.length - 1; i++) total += Math.hypot(st.pts[i + 1][0] - st.pts[i][0], st.pts[i + 1][1] - st.pts[i][1]);
    let sd = this.rng() * total;
    for (let i = 0; i < st.pts.length - 1; i++) {
      const [ax, az] = st.pts[i], [bx, bz] = st.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      if (sd <= len || i === st.pts.length - 2) {
        const t = Math.min(1, sd / len), nx = -(bz - az) / len, nz = (bx - ax) / len, off = (this.rng() - 0.5) * (st.w - 1.6);
        return { x: ax + (bx - ax) * t + nx * off, z: az + (bz - az) * t + nz * off };
      }
      sd -= len;
    }
    return null;
  }

  /** Ziel in der Nähe: auf einer Straße, mit freiem Weg dorthin; sonst ein freier Punkt der Insel */
  private freeSpot(): boolean {
    for (let i = 0; i < 14; i++) {
      let x: number, z: number;
      const sp = this.home.walkways?.length ? this.streetPoint() : null;
      if (sp) { x = sp.x; z = sp.z; const d = Math.hypot(x - this.x, z - this.z); if (d < 4 || d > 20) continue; }
      else {
        const a = this.rng() * Math.PI * 2, rr = this.home.r * (0.15 + this.rng() * 0.6);
        x = this.home.x + Math.cos(a) * rr; z = this.home.z + Math.sin(a) * rr;
        // nicht quer über die halbe Insel: lieber kurze Spaziergänge
        if (Math.hypot(x - this.x, z - this.z) > this.home.r * 0.9) continue;
      }
      if (this.blocked(x, z, 1.2) || !this.pathClear(this.x, this.z, x, z)) continue;
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
    // Steht der Platz in einem Hindernis (Haus, Stand), an den nächsten freien Punkt rücken
    let px = x, pz = z;
    for (let r = 0; r <= 6 && this.blocked(px, pz, 0.6); r += 0.5) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
        if (!this.blocked(tx, tz, 0.6)) { px = tx; pz = tz; r = 99; break; }
      }
    }
    this.station = { x: px, z: pz, yaw };
    this.x = px; this.z = pz; this.yaw = yaw;
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
        // geglättet: kleine Schwankungen der echten Bewegung (Ausweichen, Hindernisse) ließen die Beine sonst zucken
        this.stepV += (Math.max(0.6, moved) - this.stepV) * Math.min(1, dt * 5);
        this.char.setLocoSpeed(this.stepV);
        // hängt an einer Wand fest: stehen bleiben und etwas anderes tun
        this.stuckT = moved < this.vel * 0.4 && this.vel > 0.3 ? this.stuckT + dt : 0;
        if (this.stuckT > 0.8) this.timer = 0;
      }
    } else this.vel = 0;
    // Abstand halten: wer in einen anderen Bewohner hineinsteht, wird sanft weggeschoben
    if (!this.station) {
      for (const o of Npc.all) {
        if (o === this) continue;
        const ox = this.x - o.x, oz = this.z - o.z, od = Math.hypot(ox, oz);
        if (od < 0.85) {
          const k = od > 1e-3 ? (0.85 - od) * Math.min(1, dt * 4) * (o.station ? 1 : 0.5) / od : 0.01;
          const nx = this.x + (od > 1e-3 ? ox * k : k), nz = this.z + (od > 1e-3 ? oz * k : 0);
          if (!this.blocked(nx, nz, 0.3)) { this.x = nx; this.z = nz; }
        }
      }
    }
    if (this.timer <= 0) this.pick();
    // 4.6F: der Spielfigur nachschauen (Kopf und Augen zuerst, der Körper dreht sich erst nah heran)
    if (player && pd < NPC_LIFE[this.role].watch && this.mood !== 'sit') this.char.lookAt(player.x, player.y + 1.5, player.z);
    else this.char.lookAt(null);

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
