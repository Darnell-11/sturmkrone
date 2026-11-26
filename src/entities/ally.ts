import { mintEntityId, type EntityId } from '../sim/entityId';
import { MathUtils, Vector3 } from 'three';
import { genderOf, randomLook, sanitizeLook } from '../data/characterParts';
import type { StyleId } from '../data/animations';
import type { CrewDef } from '../data/crew';
import { formationSlot } from '../data/crewTiers';
import type { CommandState } from '../data/troops';
import type { CharacterAssets } from './character/assets';
import { Character } from './character/character';
import { weaponsFor } from './character/weapons';
import type { Enemy } from './enemy';
import type { Ground } from '../world/islandGround';
import { seeded } from '../world/waves';
import { routeDone, stepRoute, type Route } from '../world/docking';
import { NavAgent, unstick, type NavGrid } from '../ai/navGrid';
import type { ExpressionId } from '../data/characterRig';

const STEER = { x: 0, z: 0 };
const STEER2 = { x: 0, z: 0 };

/** Ziel, das Gegner statt der Spielfigur angreifen können */
export interface AllyTarget {
  /** Kennung (Bedrohungstabelle der Hauptmänner und Bosse); Offiziere und Trupps haben eine */
  readonly entityId?: EntityId;
  x: number; y: number; z: number; radius: number;
  readonly alive: boolean;
  /** Name für Anzeigen (z. B. wer das Ziel eines Bosses ist) */
  readonly label?: string;
  /** Zieht Gegner besonders an (Tanks) */
  readonly taunt: boolean;
  receive(dmg: number, dirX: number, dirZ: number): void;
}

/** Was eine Verbündete/ein Verbündeter vom Kampfsystem braucht */
export interface AllyWorld {
  enemies(): Enemy[];
  hit(e: Enemy, dmg: number, dirX: number, dirZ: number, color: string, heavy: boolean, srcId?: EntityId): void;
  status(e: Enemy, s: 'stun' | 'slow' | 'burn' | 'freeze', dur: number): void;
  healPlayer(frac: number): void;
  reviveCrew(): void;
  shockwave(p: Vector3, r: number, color: string): void;
  sparks(p: Vector3, color: string, n: number): void;
  text(p: Vector3, t: string): void;
  ground: Ground;
  /** Begehbarkeits-Netz der Insel, auf der die Crew gerade steht (null an Deck) */
  nav(): NavGrid | null;
  /** Reicht der Hieb (Angriffsvolumen vor der Figur) bis in eine Trefferzone des Gegners? */
  reach(x: number, y: number, z: number, yaw: number, range: number, e: Enemy): boolean;
}

const ATTACKS: Record<StyleId, { clips: string[]; range: number; cd: number; hitAt: number }> = {
  faust: { clips: ['Melee_Unarmed_Attack_Punch_A', 'Melee_Unarmed_Attack_Kick'], range: 1.4, cd: 0.8, hitAt: 0.22 },
  saebel: { clips: ['Melee_1H_Attack_Slice_Diagonal', 'Melee_1H_Attack_Slice_Horizontal', 'Melee_1H_Attack_Stab'], range: 1.7, cd: 1, hitAt: 0.28 },
  langklinge: { clips: ['Melee_1H_Attack_Stab', 'Melee_1H_Attack_Slice_Horizontal'], range: 2, cd: 1, hitAt: 0.28 },
  zweihaender: { clips: ['Melee_2H_Attack_Chop', 'Melee_2H_Attack_Slice'], range: 2.1, cd: 1.5, hitAt: 0.42 },
  doppel: { clips: ['Melee_Dualwield_Attack_Slice', 'Melee_Dualwield_Attack_Chop'], range: 1.7, cd: 0.85, hitAt: 0.25 },
  effekt: { clips: ['Ranged_Magic_Shoot', 'Ranged_Magic_Spellcasting'], range: 9, cd: 1.6, hitAt: 0.4 },
};

/** Crewmitglied, das an Land und beim Entern an deiner Seite kämpft. */
export class Ally implements AllyTarget {
  readonly char: Character;
  x = 0; y = 0; z = 0; yaw = 0;
  readonly radius = 0.45;
  /** Kennung dieser Crew-Figur */
  readonly entityId: EntityId = mintEntityId('ally');
  hp: number;
  maxHp: number;
  private dmg: number;
  private style: StyleId;
  private atkT = Math.random();
  private skillT = 4 + Math.random() * 4;
  private pending: { t: number; e: Enemy; heavy: boolean } | null = null;
  private koT = 0;
  private anim = '';
  private hurtT = 0;
  private lineT = 3 + Math.random() * 6;
  /** Pfadfindung um Häuser, Felsen und Bäume */
  private agent = new NavAgent();
  /** Rundumschlag der Fähigkeit: Treffer folgt in Spielzeit (steht in der Pause still, fällt bei K.O. weg) */
  private sweep: { t: number; foes: Enemy[]; w: AllyWorld } | null = null;
  /** Wie lange die aktuelle Animation schon läuft (Wächter gegen hängende Angriffe) */
  private animT = 0;
  private animWas = '';
  /** Schadensbonus durch das Schlachtlied */
  buff = 0;
  buffMult = 1;
  /** Befehl: Sturmangriff (wie bisher: nächster Gegner), Folgen (nur Gegner nahe bei dir), Position halten (Haltepunkt) */
  commandState: CommandState = 'sturm';
  holdX = 0; holdZ = 0;
  /** Rig (4.6F): Boden des letzten Schritts, Ausdruck */
  private groundRef: AllyWorld['ground'] | null = null;
  private groundSet = false;
  private readonly groundFn = (x: number, z: number, y: number) => (this.groundRef ? this.groundRef.height(x, z, y) : NaN);
  private moodShown: ExpressionId | '' = '';
  /** 4.6H: laufender Kombo-Assist (Clip, Blickziel, optionaler Sturmlauf); solange er läuft, ruht die eigene Kampf-KI */
  private act: { t: number; dur: number; fx: number; fz: number; ax: number; az: number; bx: number; bz: number; d0: number; d1: number } | null = null;
  /** Laufweg über Gangway, Planke oder Leiter (null = frei); `homeBound`: geht zurück an Bord und wird dort entfernt */
  route: Route | null = null;
  homeBound = false;
  arrivedHome = false;

  constructor(assets: CharacterAssets, readonly def: CrewDef, readonly level: number, loyalty: number, private slot: number, outline: boolean) {
    const look = sanitizeLook({ ...randomLook(seeded(def.id.length * 977 + def.name.charCodeAt(0)), 'pirat'), ...(def.look ?? {}), gender: genderOf(def.look) }, 'pirat');
    look.gloves = def.style === 'faust';
    this.char = new Character(assets, look, outline);
    const big = def.big ?? 1;
    this.char.holder.scale.setScalar(big);
    this.style = def.style ?? 'saebel';
    const w = weaponsFor(this.style, { blade: def.col });
    this.char.hold('r', w.right);
    this.char.hold('l', w.left);
    const loyal = loyalty >= 100 ? 1.3 : 1;
    const tank = def.role === 'tank' ? 1.7 : def.role === 'heiler' ? 1.1 : 1;
    this.maxHp = Math.round((70 + level * 14) * tank * (def.id === 'tomo' ? 2.5 / 1.7 : 1) * loyal);
    this.hp = this.maxHp;
    this.dmg = (5 + level * 1.6) * (def.role === 'schaden' ? 1.35 : def.role === 'tank' ? 1.1 : 0.7) * loyal;
  }

  get alive() { return this.koT <= 0 && !this.homeBound; }

  /**
   * 4.6H: Kombo-Assist ausführen (Sperrfeuer, Orkan-Schildstoß, Sturmhorn): Clip abspielen und zum Punkt (faceX, faceZ) blicken; mit `dash` stürmt
   * der Offizier zwischen d0 und d1 Sekunden von (ax, az) nach (bx, bz) (am Boden entlang, Wände halten ihn auf). Läuft in Spielzeit.
   */
  performAssist(clip: string, dur: number, faceX: number, faceZ: number, dash: { ax: number; az: number; bx: number; bz: number; d0: number; d1: number } | null = null, speed = 1) {
    if (!this.alive) return;
    this.pending = null;
    this.sweep = null;
    this.act = { t: 0, dur, fx: faceX, fz: faceZ, ax: dash?.ax ?? this.x, az: dash?.az ?? this.z, bx: dash?.bx ?? this.x, bz: dash?.bz ?? this.z, d0: dash?.d0 ?? 0, d1: dash?.d1 ?? 0 };
    if (dash) { this.x = dash.ax; this.z = dash.az; }
    this.char.playClip(clip, { loop: false, fade: 0.08, restart: true, speed });
    this.anim = 'attack';
  }
  /** Führt der Offizier gerade einen Kombo-Assist aus? */
  get assisting() { return !!this.act; }

  /** Laufweg beginnen; der Offizier kämpft erst wieder, wenn er drüben ist (oder wird beim Heimweg an Bord entfernt) */
  startRoute(r: Route, homeBound = false) { this.route = r; this.homeBound = homeBound; this.arrivedHome = false; this.anim = ''; }
  get taunt() { return this.def.role === 'tank'; }
  get label() { return this.def.name; }

  /** Rückhalt der Truppen: mehr Trefferpunkte (Lebenspunkte werden voll aufgefüllt) */
  scaleHp(k: number) {
    this.maxHp = Math.round(this.maxHp * k);
    this.hp = this.maxHp;
  }

  /** Befehl erteilen; „Position halten“ merkt sich den aktuellen Ort */
  command(c: CommandState) {
    this.commandState = c;
    if (c === 'halten') { this.holdX = this.x; this.holdZ = this.z; }
  }

  place(x: number, z: number, yaw: number, ground: Ground) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.holdX = x; this.holdZ = z;
    const h = ground.height(x, z);
    this.y = Number.isFinite(h) ? h : 0;
    this.koT = 0;
    this.hp = this.maxHp;
    this.act = null;
    this.play('idle');
    this.sync();
  }

  receive(dmg: number, dirX: number, dirZ: number) {
    if (!this.alive) return;
    this.char.hitFlash('#FF7A5A');
    this.hp -= dmg * (this.def.role === 'tank' ? 0.75 : 1);
    this.x += dirX * 0.4; this.z += dirZ * 0.4;
    if (this.hp <= 0) {
      this.hp = 0;
      this.koT = 12;
      this.pending = null;
      this.sweep = null;
      this.act = null;
      this.char.playClip('Death_A', { loop: false, fade: 0.15, restart: true });
      this.anim = 'ko';
    } else if (this.hurtT <= 0) {
      this.hurtT = 0.6;
      this.char.play('hit', { fade: 0.08, restart: true });
      this.anim = 'hit';
    }
  }

  /** Wieder aufstehen (Ärztin, Kampfende) */
  revive(frac = 0.5) {
    if (this.koT <= 0) { this.hp = Math.max(this.hp, this.maxHp * frac); return; }
    this.koT = 0;
    this.hp = this.maxHp * frac;
    this.char.play('spawn', { fade: 0.2, restart: true });
    this.anim = 'spawn';
    this.hurtT = 1;
  }

  private play(a: 'idle' | 'walk' | 'run' | 'cheer') {
    if (this.anim === a) return;
    this.anim = a;
    this.char.play(a, { fade: 0.25 });
  }

  /** Sprechblase-Text für den Kampf (oder null) */
  update(dt: number, player: { x: number; z: number; yaw: number }, w: AllyWorld, cleared: boolean): string | null {
    this.hurtT -= dt;
    this.buff -= dt;
    // Softlock-Wächter: endet ein Angriff nicht (Abschluss-Ereignis der Animation ging verloren), nach 3 s freigeben
    if (this.anim !== this.animWas) { this.animWas = this.anim; this.animT = 0; } else this.animT += dt;
    if ((this.anim === 'attack' || this.anim === 'spawn') && this.animT > 3) this.anim = '';
    if (this.sweep) {
      this.sweep.t -= dt;
      if (this.sweep.t <= 0) { const s = this.sweep; this.sweep = null; if (this.koT <= 0) this.sweepHit(s.foes, s.w); }
    }
    if (this.koT > 0) {
      this.koT -= dt;
      if (this.koT <= 0) this.revive(0.4);
      this.sync(); this.char.update(dt);
      return null;
    }
    // 4.6H Kombo-Assist: Clip läuft, Blick zum Ziel, Sturmlauf am Boden entlang (easeOutCubic); die Kampf-KI ruht so lange
    if (this.act) {
      const a = this.act;
      a.t += dt;
      if (a.d1 > a.d0 && a.t > a.d0) {
        const k = Math.min(1, (a.t - a.d0) / (a.d1 - a.d0)), e = 1 - (1 - k) * (1 - k) * (1 - k);
        const c = w.ground.constrain(a.ax + (a.bx - a.ax) * e, a.az + (a.bz - a.az) * e, this.radius, this.y);
        this.x = c.x; this.z = c.z;
      }
      this.face(Math.atan2(a.fx - this.x, a.fz - this.z), dt * 1.6);
      const gh = w.ground.height(this.x, this.z, this.y);
      if (Number.isFinite(gh)) this.y += (gh - this.y) * Math.min(1, dt * 14);
      if (a.t >= a.dur) { this.act = null; this.anim = ''; }
      this.sync(); this.char.update(dt);
      return null;
    }
    // Laufweg über eine Brücke: erst ankommen, dann kämpfen (Nachrück-Wächter in `stepRoute` löst Hänger an schmalen Kanten)
    if (this.route) {
      if (routeDone(this.route)) { this.route = null; this.holdX = this.x; this.holdZ = this.z; if (this.homeBound) this.arrivedHome = true; }
      else {
        const st = stepRoute(this, this.route, dt, 4.6, w.ground, 1.5);
        if (st.moving) this.face(st.heading, dt);
        this.play(st.climbing ? 'walk' : 'run');
        this.char.setLocoSpeed((st.climbing ? 1.4 : 4.6) / (this.def.big ?? 1));
        this.sync(); this.char.update(dt);
        return null;
      }
    }
    // Gegner im Blick: Sturmangriff = alle, Folgen = nur nahe bei dir oder bei ihr/ihm, Halten = nur nahe am Haltepunkt
    const cmd = this.commandState;
    const foes = w.enemies().filter((e) => {
      if (!e.alive) return false;
      if (cmd === 'folgen') return Math.hypot(e.x - player.x, e.z - player.z) < 9 || Math.hypot(e.x - this.x, e.z - this.z) < 5;
      if (cmd === 'halten') return Math.hypot(e.x - this.holdX, e.z - this.holdZ) < 6;
      return true;
    });
    let say: string | null = null;
    let moveTo: { x: number; z: number } | null = null;
    let speed = 4.6;
    const pd = Math.hypot(player.x - this.x, player.z - this.z);
    let lookE: Enemy | null = null;
    if (!foes.length) {
      // Folgen in Formation hinter der Spielfigur (Plätze aus data/crewTiers.ts: bis zu 5 Offiziere)
      const { side, back } = formationSlot(this.slot);
      const fx = cmd === 'halten' ? this.holdX : player.x - Math.sin(player.yaw) * back + Math.cos(player.yaw) * side * 1.5;
      const fz = cmd === 'halten' ? this.holdZ : player.z - Math.cos(player.yaw) * back - Math.sin(player.yaw) * side * 1.5;
      if (Math.hypot(fx - this.x, fz - this.z) > 0.8) moveTo = { x: fx, z: fz };
      speed = pd > 8 && cmd !== 'halten' ? 7 : 4.2;
      this.lineT -= dt;
      if (cleared && this.lineT <= 0) { this.lineT = 14 + Math.random() * 10; say = this.def.lines[Math.floor(Math.random() * this.def.lines.length)]; }
    } else {
      const atk = ATTACKS[this.style];
      const role = this.def.role;
      // Fähigkeit
      this.skillT -= dt;
      if (this.skillT <= 0) { this.skillT = role === 'heiler' ? 7 : 10 + Math.random() * 3; say = this.skill(foes, w); }
      // Ziel: Tanks nehmen Gegner nahe der Spielfigur, Angreifer den nächsten
      let target: Enemy | null = null, bd = Infinity;
      for (const e of foes) {
        const d = Math.hypot(e.x - this.x, e.z - this.z) + (role === 'tank' ? Math.hypot(e.x - player.x, e.z - player.z) * 0.8 : 0);
        if (d < bd) { bd = d; target = e; }
      }
      const keepNear = role === 'heiler' || role === 'unterstuetzung';
      lookE = target;
      if (target) {
        const d = Math.hypot(target.x - this.x, target.z - this.z);
        const reach = atk.range + target.radius;
        if (keepNear && pd > 4.5 && d > reach) moveTo = { x: player.x, z: player.z };
        else if (cmd === 'halten' && d > reach * 0.92) moveTo = Math.hypot(this.x - this.holdX, this.z - this.holdZ) > 0.8 ? { x: this.holdX, z: this.holdZ } : null;
        else if (d > reach * 0.92) moveTo = { x: target.x, z: target.z };
        else {
          this.face(Math.atan2(target.x - this.x, target.z - this.z), dt);
          this.atkT -= dt;
          if (this.atkT <= 0 && !this.pending && this.hurtT <= 0) {
            this.atkT = atk.cd * (0.85 + Math.random() * 0.3);
            const clip = atk.clips[Math.floor(Math.random() * atk.clips.length)];
            this.char.playClip(clip, { loop: false, fade: 0.15, restart: true, speed: 1.1, onDone: () => { this.anim = ''; } });
            this.anim = 'attack';
            this.pending = { t: atk.hitAt, e: target, heavy: this.style === 'zweihaender' };
          }
        }
      }
    }
    // Treffer verzögert zur Animation
    this.char.setTrail(!!this.pending && this.pending.t < 0.35, this.def.col);
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) {
        const e = this.pending.e;
        this.pending = null;
        if (e.alive) {
          const dx = e.x - this.x, dz = e.z - this.z, d = Math.hypot(dx, dz) || 1;
          const mult = (1 + (this.buff > 0 ? 0.3 : 0)) * this.buffMult;
          const range = ATTACKS[this.style].range;
          if (range > 4 ? d < range + e.radius + 0.6 : w.reach(this.x, this.y, this.z, Math.atan2(dx, dz), range + 0.3, e)) w.hit(e, this.dmg * mult * (0.85 + Math.random() * 0.3), dx / d, dz / d, this.def.col, this.style === 'zweihaender', this.entityId);
        }
      }
    }
    // Bewegung
    if (moveTo && this.anim !== 'attack' && this.hurtT <= 0) {
      const d = this.agent.steer(w.nav(), this.x, this.z, moveTo.x, moveTo.z, this.radius, dt, STEER);
      if (d > 0.05) {
        const step = Math.min(d, speed * dt);
        this.x += STEER.x * step; this.z += STEER.z * step;
        this.face(Math.atan2(STEER.x, STEER.z), dt);
        const c = w.ground.constrain(this.x, this.z, this.radius, this.y);
        this.x = c.x; this.z = c.z;
        // verkeilt (Treppe, Planke, enge Lücke, Mast)? Nach 2,5 s ein Stück zum Ziel hin versetzen
        if (this.agent.wedged) { const u = unstick(w.ground, this.x, this.z, moveTo.x, moveTo.z, this.radius, this.y, STEER2); if (u) { this.x = u.x; this.z = u.z; } this.agent.clearWedge(); }
      }
      this.play(speed > 5 ? 'run' : 'walk');
      this.char.setLocoSpeed(speed / (this.def.big ?? 1));
    } else if (this.anim !== 'attack' && this.anim !== 'hit' && this.anim !== 'spawn' && this.hurtT <= 0) this.play(cleared && foes.length === 0 && pd < 6 && this.lineT > 12 ? 'cheer' : 'idle');
    const h = w.ground.height(this.x, this.z, this.y);
    if (Number.isFinite(h)) this.y += (h - this.y) * Math.min(1, dt * 12);
    // 4.6F: Blick zum Gegner (sonst zur Spielfigur, wenn sie nah ist), Ausdruck, Bereitschaft, Füße auf dem Boden
    this.groundRef = w.ground;
    if (!this.groundSet) { this.char.setGround(this.groundFn); this.groundSet = true; }
    const ch = this.char;
    if (lookE) ch.lookAt(lookE.x, lookE.y + 1.5 * lookE.def.scale, lookE.z);
    else if (pd < 7) ch.lookAt(player.x, this.y + 1.5, player.z);
    else ch.lookAt(null);
    ch.setReady(foes.length ? 1 : 0);
    const mood: ExpressionId = foes.length ? 'kampf' : this.anim === 'cheer' ? 'jubel' : 'hafen';
    if (mood !== this.moodShown) { this.moodShown = mood; ch.setMood(mood); }
    this.sync();
    this.char.update(dt);
    return say;
  }

  /** Kampffähigkeit je Crewmitglied; liefert den Ruf */
  private skill(foes: Enemy[], w: AllyWorld): string | null {
    const p = new Vector3(this.x, this.y + 1, this.z);
    const near = foes.filter((e) => Math.hypot(e.x - this.x, e.z - this.z) < 4.5);
    const col = this.def.col;
    const n = this.def.skill?.n ?? null;
    switch (this.def.role) {
      case 'heiler':
        w.healPlayer(this.def.id === 'arzt' ? 0.14 : 0.1);
        if (this.def.id === 'arzt') w.reviveCrew();
        w.sparks(p, '#7CFF9A', 30);
        return n;
      case 'unterstuetzung':
        if (this.def.id === 'esra') { for (const e of near) w.status(e, 'slow', 4); w.shockwave(p, 4.5, col); }
        else { this.buff = 6; w.shockwave(p, 6, '#FFD166'); w.sparks(p, '#FFD166', 24); }
        return n;
      default:
        if (!near.length) { this.skillT = 2; return null; }
        this.char.playClip(this.style === 'faust' ? 'Melee_2H_Attack_Spinning' : this.style === 'effekt' ? 'Ranged_Magic_Raise' : 'Melee_2H_Attack_Spin', { loop: false, fade: 0.08, restart: true, onDone: () => { this.anim = ''; } });
        this.anim = 'attack';
        this.sweep = { t: 0.38, foes, w };
        return n;
    }
  }

  /** Rundumschlag trifft (Gegner, die inzwischen besiegt oder entfernt sind, werden übersprungen) */
  private sweepHit(foes: Enemy[], w: AllyWorld) {
    const col = this.def.col;
    w.shockwave(new Vector3(this.x, this.y + 0.2, this.z), this.def.id === 'tomo' ? 6 : 4, col);
    const alive = new Set(w.enemies());
    for (const e of foes) {
      if (!e.alive || !alive.has(e)) continue;
      const dx = e.x - this.x, dz = e.z - this.z, d = Math.hypot(dx, dz) || 1;
      if (d > (this.def.id === 'tomo' ? 6 : 4.2)) continue;
      w.hit(e, this.dmg * 2.2 * this.buffMult, dx / d, dz / d, col, true, this.entityId);
      if (this.def.role === 'tank') w.status(e, 'stun', this.def.id === 'tomo' ? 2 : 1.2);
      if (this.def.id === 'lehrer') w.status(e, 'burn', 3);
    }
  }

  private face(target: number, dt: number) {
    const diff = MathUtils.euclideanModulo(target - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
    this.yaw += diff * Math.min(1, dt * 10);
  }

  private sync() {
    this.char.place(this.x, this.y, this.z, this.yaw);
  }

  dispose() { this.sweep = null; this.pending = null; this.char.dispose(); }

}
