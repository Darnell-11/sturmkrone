// Massentruppen im Gefecht: ein Trupp ist EINE Entität mit wenigen Zahlen (Köpfe, Lebenspunkte, Ort, Befehl), keine Figur je Kopf.
// Reine Simulation ohne three.js (testbar, serialisierbar). Die Darstellung (`troopRender.ts`) liest nur den Zustand.
// Gestaffelte KI: jeder Trupp denkt nur alle ~0,25 s (versetzt), Bewegung und Angriffstakt laufen jedes Bild.
// Verbündete blockieren die Spielfigur nie: es gibt keine Kollision mit ihr, nur weiche Trennung der Trupps und Offiziere untereinander.
import { NavAgent, unstick, type NavGrid } from '../../ai/navGrid';
import type { CommandState, TroopType } from '../../data/troops';
import { TROOPS, troopHeadStats } from '../../data/troops';
import { mintEntityId, type EntityId } from '../../sim/entityId';
import { routeDone, stepRoute, type Route } from '../../world/docking';
import type { AllyTarget } from '../ally';
import { wrapAngle } from '../../core/mathUtil';

/** Serialisierbarer Zustand eines Trupps (Speichern, später Server/Mehrspieler) */
export interface SquadState {
  squadId: EntityId;
  /** Spieler (Entität), dem der Trupp gehört */
  ownerPlayerId: EntityId;
  typ: TroopType;
  level: number;
  heads: number;
  hp: number;
  x: number;
  z: number;
  yaw: number;
  commandState: CommandState;
}

/** Was die KI von der Welt sieht: Gegner (nur Lage und Größe), Treffer und Boden */
export interface TroopFoe { x: number; z: number; radius: number; readonly alive: boolean }

export interface TroopWorld {
  enemies(): readonly TroopFoe[];
  hit(e: TroopFoe, dmg: number, dirX: number, dirZ: number, color: string, heavy: boolean, srcId?: EntityId): void;
  ground: { height(x: number, z: number, y?: number): number; constrain(x: number, z: number, r?: number, y?: number): { x: number; z: number }; ladderAt?(id: string, t: number, out: { x: number; y: number; z: number }): boolean; ladderLength?(id: string): number };
  /** Begehbarkeits-Netz der Insel (null an Deck) */
  nav(): NavGrid | null;
  /** Feuerblitz einer Salve (Musketiere) */
  shot?(x: number, y: number, z: number, tx: number, tz: number): void;
  /** Kurzer Text über dem Trupp (Verluste) */
  text?(x: number, y: number, z: number, t: string): void;
}

/** Ein Hindernis, dem Trupps weich ausweichen (andere Trupps, Offiziere) – nie die Spielfigur */
export interface SoftBody { x: number; z: number; radius: number; /** der Trupp selbst (wird übersprungen) */ owner?: object }

/** Ankunft: Übersetzen im Beiboot vom Schiff zum Strand (Küste ohne Steg). Über Gangway, Planken und Leitern geht der Trupp zu Fuß (`route`). */
export interface Landing {
  /** Wartezeit bis zum Start, Dauer und Fortschritt (s) */
  delay: number;
  t: number;
  total: number;
  fromX: number; fromZ: number; fromY: number;
  /** Der Trupp sitzt im Boot, das über das Wasser zum Strand fährt */
  boat: boolean;
}

const _steer = { x: 0, z: 0 };
const _unstuck = { x: 0, z: 0 };
const _slot = { x: 0, z: 0 };

/** Platz eines Trupps in der Aufstellung hinter der Spielfigur: Reihen zu je zwei Trupps (links/rechts), jede Reihe weiter hinten; hält Abstand von der Spielfigur */
export function followSlotPos(slot: number, player: { x: number; z: number; yaw: number }, out: { x: number; z: number } = { x: 0, z: 0 }) {
  const row = Math.floor(slot / 2), side = slot % 2 === 0 ? -1 : 1;
  const back = 5.4 + row * 3.8, lateral = 3.5 + (slot > 1 ? 0.8 : 0);
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
  out.x = player.x - s * back + c * side * lateral;
  out.z = player.z - c * back - s * side * lateral;
  return out;
}
/** Dichte der Aufstellung beim Übersetzen im Boot */
export const BOAT_COMPACT = 0.45;

export class TroopSquad implements AllyTarget {
  readonly squadId: EntityId = mintEntityId('squad');
  ownerPlayerId: EntityId;
  readonly typ: TroopType;
  readonly level: number;
  readonly maxHeads: number;
  heads: number;
  hp: number;
  x = 0; y = 0; z = 0; yaw = 0;
  commandState: CommandState = 'sturm';
  /** Haltepunkt für „Position halten“ */
  holdX = 0; holdZ = 0;
  /** Platz in der Aufstellung hinter der Spielfigur (0 = vorderster Trupp) */
  slot = 0;
  /** Zufallswert für Darstellung und Staffelung */
  readonly seed: number;
  /** 0 … 1: Lauftempo (für die Darstellung), Angriffsimpuls 1 → 0, Zeit seit dem Tod */
  move = 0;
  pulse = 0;
  deadT = 0;
  /** Übersetzen im Beiboot (null = an Land oder an Deck) */
  landing: Landing | null = null;
  /** Laufweg über Gangway, Planken oder Leitern (null = frei); `homeBound`: geht zurück an Bord und verschwindet dort (zählt nicht mehr als Ziel) */
  route: Route | null = null;
  homeBound = false;
  /** Heimweg beendet: der Trupp kann entfernt werden */
  arrivedHome = false;
  readonly radius = 0.6;
  /** Enge der Aufstellung 0,5 … 1: auf schmalem Boden (Steg, Deck an der Reling) rücken die Köpfe zusammen, statt ins Wasser zu ragen */
  squeeze = 1;
  private squeezeTo = 1;
  /** Köpfe, die seit der letzten Darstellung gefallen sind (die Darstellung holt sie ab) */
  lostHeads = 0;
  private casualtyText = 0;
  private textT = 0;
  private readonly hpHead: number;
  private readonly dmgHead: number;
  private atkT: number;
  private thinkT: number;
  private target: TroopFoe | null = null;
  private goalX = 0; private goalZ = 0;
  private hasGoal = false;
  private agent = new NavAgent();

  constructor(typ: TroopType, heads: number, level: number, ownerPlayerId: EntityId, seed = Math.random()) {
    this.typ = typ;
    this.level = Math.max(1, Math.round(level));
    this.ownerPlayerId = ownerPlayerId;
    this.seed = seed;
    const s = troopHeadStats(typ, this.level);
    this.hpHead = s.hp;
    this.dmgHead = s.dmg;
    this.maxHeads = Math.max(1, Math.round(heads));
    this.heads = this.maxHeads;
    this.hp = this.heads * this.hpHead;
    this.atkT = 0.3 + seed * TROOPS[typ].cd;
    this.thinkT = seed * 0.25;
  }

  /** Lebt der Trupp und steht an Land/Deck (nicht mehr im Boot)? Nur dann können Gegner ihn treffen. */
  get alive() { return this.heads > 0 && !this.landing && !this.homeBound; }
  /** Sind noch Köpfe da (auch im Boot)? */
  get present() { return this.heads > 0; }
  get taunt() { return false; }
  get label() { return `Trupp ${this.def.label}`; }
  /** Kennung für die Bedrohungstabelle der Hauptmänner und Bosse */
  get entityId(): EntityId { return this.squadId; }

  // ---------- Verteidiger und Wachen (Raid, Besatzung) ----------
  /** Verband der Verteidiger: steht auf Posten, rückt vor, wenn jemand näher als `aggroR` kommt, und kehrt danach zurück */
  hostile = false;
  /** Aggro-Radius in Metern (0 = klassische Befehle): Verteidiger und Wachen wählen Ziele nur in diesem Umkreis */
  aggroR = 0;
  /** Wie weit sich der Verband vom Posten entfernen darf (m) */
  leashR = 60;
  /** Alarm: nach einem Treffer verdoppelt sich der Radius für einige Sekunden */
  alertT = 0;
  /** Wachgang: Wegpunkte, die der Trupp der Reihe nach abschreitet (Besatzung); null = steht auf Posten */
  patrol: { x: number; z: number }[] | null = null;
  private patrolI = 0;
  private patrolWait = 0;
  /** Aura eines Hauptmanns: Schadensfaktor, Faktor auf erlittenen Schaden, Tempo */
  auraDmg = 1;
  auraTaken = 1;
  auraSpeed = 1;
  /**
   * 4.6H: Sturmhorn eines Offiziers (eigene Trupps): Restzeit der Stärkung; solange sie läuft, gelten die Faktoren `auraDmg/auraTaken/auraSpeed`
   * (feindliche Verbände setzt `CombatSystem.applyAuras` je Bild selbst, eigene nur hier)
   */
  rallyT = 0;

  /** 4.6H: Stärkung durch das Sturmhorn (Schaden, erlittener Schaden, Tempo) für `dur` Sekunden; heilt Verwundete um `heal` des Höchstwerts */
  rally(dur: number, dmg: number, taken: number, speed: number, heal = 0) {
    if (this.heads <= 0 || this.hostile) return;
    this.rallyT = Math.max(this.rallyT, dur);
    this.auraDmg = Math.max(this.auraDmg, dmg);
    this.auraTaken = Math.min(this.auraTaken, taken);
    this.auraSpeed = Math.max(this.auraSpeed, speed);
    if (heal > 0) this.hp = Math.min(this.heads * this.hpHead, this.hp + this.heads * this.hpHead * heal);
  }
  /** Hat der Verband gerade ein Ziel? */
  get engaged() { return !!this.target && this.target.alive; }
  /** Ziel des Verbandes (Anzeige, Prüfung) */
  get focus(): TroopFoe | null { return this.target; }
  get def() { return TROOPS[this.typ]; }
  /** Dichte der Aufstellung 0 … 1 (im Boot eng) */
  get compact() { return this.landing && this.landing.boat && this.landing.delay <= 0 ? BOAT_COMPACT : 1; }

  place(x: number, z: number, yaw: number, ground: TroopWorld['ground']) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.holdX = x; this.holdZ = z;
    const h = ground.height(x, z);
    this.y = Number.isFinite(h) ? h : 0;
  }

  /** Serialisierbarer Zustand (Speichern, später Server) */
  get state(): SquadState {
    return { squadId: this.squadId, ownerPlayerId: this.ownerPlayerId, typ: this.typ, level: this.level, heads: this.heads, hp: this.hp, x: this.x, z: this.z, yaw: this.yaw, commandState: this.commandState };
  }

  /** Aus einem gespeicherten Zustand wiederherstellen */
  static fromState(st: SquadState): TroopSquad {
    const q = new TroopSquad(st.typ, Math.max(1, st.heads), st.level, st.ownerPlayerId);
    q.heads = Math.max(0, Math.min(q.maxHeads, Math.round(st.heads)));
    q.hp = Math.max(0, Math.min(q.maxHeads * q.hpHead, st.hp));
    q.x = st.x; q.z = st.z; q.yaw = st.yaw; q.holdX = st.x; q.holdZ = st.z;
    q.commandState = st.commandState;
    return q;
  }

  /** Befehl erteilen; „Position halten“ merkt sich den aktuellen Ort */
  command(c: CommandState) {
    if (this.commandState === c && c !== 'halten') return;
    this.commandState = c;
    if (c === 'halten') { this.holdX = this.x; this.holdZ = this.z; }
    this.target = null;
    this.thinkT = 0;
  }

  /** Wegschleudern (Flächen-Finisher, 4.6A): Richtung und Wucht für die fallenden Köpfe (die Darstellung holt sie ab) */
  flingX = 0;
  flingZ = 0;
  flingP = 0;
  /** Stoß der ganzen Aufstellung (m/s, klingt ab) */
  private shoveX = 0;
  private shoveZ = 0;

  /** Wucht eines Flächen-Finishers: die Aufstellung wird zurückgestoßen, gefallene Köpfe fliegen davon */
  fling(dirX: number, dirZ: number, power: number) {
    if (this.heads <= 0 || this.landing || !(power > 0)) return;
    this.flingX = dirX; this.flingZ = dirZ; this.flingP = Math.max(this.flingP, power);
    const k = Math.min(1, 6 / Math.max(6, this.heads));
    this.shoveX += dirX * power * 0.55 * k;
    this.shoveZ += dirZ * power * 0.55 * k;
  }

  /** Gegner trifft den Trupp: Lebenspunkte sinken, Köpfe fallen (Schaden bleibt nicht an Köpfen hängen, sondern am Pool) */
  receive(dmg: number, dirX: number, dirZ: number) {
    void dirX; void dirZ;
    if (this.heads <= 0 || this.landing) return;
    if (this.hostile) this.alertT = 7;
    this.hp = Math.max(0, this.hp - dmg * this.auraTaken);
    const left = Math.ceil(this.hp / this.hpHead - 1e-6);
    const lost = this.heads - left;
    if (lost > 0) { this.heads = left; this.lostHeads += lost; this.casualtyText += lost; }
    if (this.heads <= 0) { this.heads = 0; this.hp = 0; }
  }

  /** Übersetzen beginnen (vom Schiff): `delay` staffelt die Trupps */
  startLanding(l: { fromX: number; fromZ: number; fromY: number; delay: number; total: number; boat: boolean }) {
    this.landing = { delay: l.delay, t: 0, total: Math.max(0.3, l.total), fromX: l.fromX, fromZ: l.fromZ, fromY: l.fromY, boat: l.boat };
    this.holdX = this.x; this.holdZ = this.z;
  }

  /** Laufweg beginnen (z. B. über die Gangway); die Aufstellung rückt auf der Brücke eng zusammen */
  startRoute(r: Route, homeBound = false) { this.route = r; this.homeBound = homeBound; this.arrivedHome = false; this.target = null; this.hasGoal = false; }

  /** Ort des Trupps im Boot (0 … 1 Fortschritt); null, wenn der Trupp schon an Land ist */
  landingPose(): { x: number; z: number; y: number; waiting: boolean } | null {
    const L = this.landing;
    if (!L) return null;
    if (L.delay > 0) return { x: L.fromX, z: L.fromZ, y: L.fromY, waiting: true };
    const u = Math.min(1, L.t / L.total);
    const e = u * u * (3 - 2 * u);
    const x = L.fromX + (this.x - L.fromX) * e, z = L.fromZ + (this.z - L.fromZ) * e;
    // Beiboot: auf dem Wasser (fromY ist die Wasserlinie), erst kurz vor dem Strand steigt es an Land
    const y = L.fromY + (this.y - L.fromY) * Math.max(0, (u - 0.85) / 0.15);
    return { x, z, y, waiting: false };
  }

  private finish() { this.landing = null; this.holdX = this.x; this.holdZ = this.z; }

  /**
   * Ein Bild vorrücken. `player` = Spielfigur (nur Ziel der Aufstellung, wird nie verschoben), `soft` = andere Trupps und Offiziere
   * (weiche Trennung), `cleared` = keine Gegner mehr im Gebiet.
   */
  update(dt: number, player: { x: number; z: number; yaw: number }, w: TroopWorld, soft: readonly SoftBody[], speedMult = 1) {
    this.pulse = Math.max(0, this.pulse - dt * 2.2);
    this.alertT = Math.max(0, this.alertT - dt);
    if (this.rallyT > 0) { this.rallyT -= dt; if (this.rallyT <= 0) { this.rallyT = 0; this.auraDmg = 1; this.auraTaken = 1; this.auraSpeed = 1; } }
    if (this.heads <= 0) { this.deadT += dt; this.move = 0; return; }
    if (this.landing) {
      const L = this.landing;
      if (L.delay > 0) { L.delay -= dt; this.move = 0; return; }
      L.t += dt;
      this.move = 0.5;
      if (L.t >= L.total) this.finish();
      return;
    }
    // Laufweg (Gangway, Planke, Leiter): marschiert in enger Aufstellung, ohne zu kämpfen; hängt er an der Kante, rückt er nach (Wächter in `stepRoute`)
    if (this.route) {
      if (routeDone(this.route)) { this.route = null; if (this.homeBound) this.arrivedHome = true; this.holdX = this.x; this.holdZ = this.z; }
      else {
        const st = stepRoute(this, this.route, dt, this.def.speed * 1.2, w.ground, 1.5);
        if (st.moving) this.faceTo(st.heading, dt);
        this.move = st.moving ? 0.6 : 0;
        this.squeeze += (0.45 - this.squeeze) * Math.min(1, dt * 6);
        return;
      }
    }
    const d = this.def;
    // Verluste melden (gesammelt, nicht bei jedem Treffer)
    this.textT -= dt;
    if (this.casualtyText > 0 && this.textT <= 0) { this.textT = 0.6; w.text?.(this.x, this.y + 2.4, this.z, `−${this.casualtyText}`); this.casualtyText = 0; }

    // --- Denken: gestaffelt ---
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.22 + this.seed * 0.08; this.think(player, w); this.measure(w); }
    this.squeeze += (this.squeezeTo - this.squeeze) * Math.min(1, dt * 3);
    // Ziel verloren (besiegt)?
    if (this.target && !this.target.alive) { this.target = null; this.thinkT = Math.min(this.thinkT, 0.05); }

    // --- Bewegen ---
    let speed = 0;
    const tg = this.target;
    let reach = 0;
    if (tg) {
      const dx = tg.x - this.x, dz = tg.z - this.z, dist = Math.hypot(dx, dz) || 1;
      reach = d.ranged ? d.range * 0.85 : d.range * 0.85 + tg.radius;
      this.faceTo(Math.atan2(dx, dz), dt);
      if (d.ranged && dist < 4.5) { this.goalX = this.x - (dx / dist) * 3; this.goalZ = this.z - (dz / dist) * 3; this.hasGoal = true; speed = d.speed * 0.8; }
      else if (dist > reach) { this.goalX = tg.x - (dx / dist) * Math.max(0.5, reach * 0.8); this.goalZ = tg.z - (dz / dist) * Math.max(0.5, reach * 0.8); this.hasGoal = true; speed = d.speed; }
      else { this.hasGoal = false; this.attack(dt, tg, dx / dist, dz / dist, w); }
    }
    if (!tg) {
      if (this.patrol && this.patrol.length) this.patrolGoal(dt);
      else if (this.commandState === 'halten' || this.hostile) { this.goalX = this.holdX; this.goalZ = this.holdZ; }
      else this.followGoal(player);
      const gd = Math.hypot(this.goalX - this.x, this.goalZ - this.z);
      this.hasGoal = gd > (this.commandState === 'halten' || this.hostile || this.patrol ? 0.7 : 1.2);
      if (this.hasGoal) speed = this.patrol ? d.speed * 0.45 : gd > 9 ? d.speed * 1.7 : d.speed;
    }
    if (this.hasGoal && speed > 0) {
      const dist = this.agent.steer(w.nav(), this.x, this.z, this.goalX, this.goalZ, this.radius, dt, _steer);
      if (dist > 0.05) {
        const step = Math.min(dist, speed * speedMult * this.auraSpeed * dt);
        let nx = this.x + _steer.x * step, nz = this.z + _steer.z * step;
        const c = w.ground.constrain(nx, nz, this.radius, this.y);
        nx = c.x; nz = c.z;
        this.x = nx; this.z = nz;
        // verkeilt (Treppe, Planke, enge Lücke)? Nach 2,5 s ein Stück zum Ziel hin versetzen
        if (this.agent.wedged) { const u = unstick(w.ground, this.x, this.z, this.goalX, this.goalZ, this.radius, this.y, _unstuck); if (u) { this.x = u.x; this.z = u.z; } this.agent.clearWedge(); }
        if (!tg) this.faceTo(Math.atan2(_steer.x, _steer.z), dt);
        this.move = Math.min(1, speed / (d.speed * 1.7));
      } else this.move = 0;
    } else this.move = Math.max(0, this.move - dt * 4);

    // --- Stoß eines Flächen-Finishers: die Aufstellung rutscht zurück und fängt sich ---
    if (this.shoveX !== 0 || this.shoveZ !== 0) {
      const c = w.ground.constrain(this.x + this.shoveX * dt, this.z + this.shoveZ * dt, this.radius, this.y);
      this.x = c.x; this.z = c.z;
      const k = Math.pow(0.03, dt);
      this.shoveX *= k; this.shoveZ *= k;
      if (Math.abs(this.shoveX) + Math.abs(this.shoveZ) < 0.05) { this.shoveX = 0; this.shoveZ = 0; }
    }

    // --- Weiche Trennung (nie die Spielfigur) ---
    for (const o of soft) {
      if (o.owner === this) continue;
      const dx = this.x - o.x, dz = this.z - o.z, min = this.sepRadius() + o.radius;
      const dd = dx * dx + dz * dz;
      if (dd < min * min && dd > 1e-6) {
        const dist = Math.sqrt(dd);
        // sanft: höchstens 3 m/s, nur ein Teil der Überlappung je Bild
        const push = Math.min((min - dist) * 0.5, 3 * dt);
        const c = w.ground.constrain(this.x + (dx / dist) * push, this.z + (dz / dist) * push, this.radius, this.y);
        this.x = c.x; this.z = c.z;
      } else if (dd <= 1e-6) { this.x += (this.seed - 0.5) * 0.02; this.z += 0.01; }
    }
    const h = w.ground.height(this.x, this.z, this.y);
    if (Number.isFinite(h)) this.y += (h - this.y) * Math.min(1, dt * 12);
  }

  /** Wachgang: zum nächsten Wegpunkt, dort kurz warten */
  private patrolGoal(dt: number) {
    const p = this.patrol!;
    const wp = p[this.patrolI % p.length];
    if (Math.hypot(wp.x - this.x, wp.z - this.z) < 2.4) {
      this.patrolWait -= dt;
      if (this.patrolWait <= 0) { this.patrolI = (this.patrolI + 1) % p.length; this.patrolWait = 1.2 + this.seed * 2.5; }
    }
    const t = p[this.patrolI % p.length];
    this.goalX = t.x; this.goalZ = t.z;
    this.holdX = this.x; this.holdZ = this.z;
  }

  /** Platzbedarf des Trupps für die Trennung (wächst mit den Köpfen) */
  sepRadius() { return 0.9 + Math.sqrt(this.heads) * this.def.spacing * 0.3; }

  private faceTo(target: number, dt: number) {
    let diff = target - this.yaw;
    diff = wrapAngle(diff);
    this.yaw += diff * Math.min(1, dt * 8);
  }

  /** Aufstellung hinter der Spielfigur (siehe `followSlotPos`) */
  private followGoal(player: { x: number; z: number; yaw: number }) {
    followSlotPos(this.slot, player, _slot);
    this.goalX = _slot.x; this.goalZ = _slot.z;
  }

  /** Wie viel Platz ist rund um den Trupp? Vier Tastpunkte am Rand der Aufstellung; ragt einer über den Boden hinaus, rücken die Köpfe zusammen */
  private measure(w: TroopWorld) {
    const r = Math.min(3, 0.5 + Math.sqrt(this.heads) * this.def.spacing * 0.45);
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    let m = 0;
    for (let i = 0; i < 4; i++) {
      const a = (i < 2 ? 1 : 0) * (i % 2 ? -1 : 1) * r, b = (i < 2 ? 0 : 1) * (i % 2 ? -1 : 1) * r;
      const px = this.x + a * c + b * s, pz = this.z - a * s + b * c;
      const q = w.ground.constrain(px, pz, 0.3, this.y);
      m = Math.max(m, Math.hypot(q.x - px, q.z - pz));
    }
    this.squeezeTo = m > 0.9 ? 0.45 : m > 0.35 ? 0.7 : 1;
  }

  /** Ziel wählen (gestaffelt aufgerufen) */
  private think(player: { x: number; z: number }, w: TroopWorld) {
    const foes = w.enemies();
    const d = this.def;
    if (this.aggroR > 0) {
      // Verteidiger und Wachen: nächstes Ziel im Aggro-Radius (nach einem Treffer doppelt so weit), nie weiter als `leashR` vom Posten
      const lim = (this.target?.alive ? 1.5 : 1) * this.aggroR * (this.alertT > 0 ? 2.2 : 1);
      let near: TroopFoe | null = null, nd = lim;
      for (let i = 0; i < foes.length; i++) {
        const e = foes[i];
        if (!e.alive) continue;
        const dist = Math.hypot(e.x - this.x, e.z - this.z);
        if (dist < nd && Math.hypot(e.x - this.holdX, e.z - this.holdZ) < this.leashR + this.aggroR) { nd = dist; near = e; }
      }
      this.target = near;
      return;
    }
    // Reichweite, in der Gegner überhaupt in Betracht kommen: Sturm = weit, Folgen = nah am Trupp/Spielfigur, Halten = nah am Haltepunkt
    let best: TroopFoe | null = null, bd = Infinity;
    for (let i = 0; i < foes.length; i++) {
      const e = foes[i];
      if (!e.alive) continue;
      const dist = Math.hypot(e.x - this.x, e.z - this.z);
      if (this.commandState === 'sturm') { if (dist > 150) continue; }
      else if (this.commandState === 'folgen') { if (dist > (d.ranged ? 11 : 6.5) || Math.hypot(e.x - player.x, e.z - player.z) > 13) continue; }
      else if (Math.hypot(e.x - this.holdX, e.z - this.holdZ) > (d.ranged ? d.range : 5)) continue;
      if (dist < bd) { bd = dist; best = e; }
    }
    this.target = best;
  }

  /** Angriffstakt: der Trupp schlägt oder schießt gemeinsam; Schaden = Köpfe × Wert je Kopf (Nahkampf: etwa die Hälfte steht an der Front) */
  private attack(dt: number, tg: TroopFoe, dx: number, dz: number, w: TroopWorld) {
    const d = this.def;
    this.atkT -= dt;
    if (this.atkT > 0) return;
    this.atkT = d.cd * (0.9 + this.seed * 0.2);
    this.pulse = 1;
    const dmg = this.heads * this.dmgHead * (d.ranged ? 0.8 : 0.5) * (0.9 + Math.random() * 0.2) * this.auraDmg;
    if (d.ranged) w.shot?.(this.x, this.y + 1.4, this.z, tg.x, tg.z);
    w.hit(tg, dmg, dx, dz, d.ranged ? '#FFD08A' : d.cloth, this.typ === 'schlaeger', this.squadId);
  }
}
