// Seewelt-Seite des Mächte-Ökosystems (Phase 4.5A): macht aus den Armadas der FactionWarEngine in Spielernähe echte Schiffe, aus ihren Großschlachten
// echte Seeschlachten und aus Belagerungen echte Truppen an Land – und schreibt Lage, Rumpf, Untergang und Verluste zurück. Entschieden wird in der
// Engine (world/factionWarEngine.ts); hier wird nur dargestellt und gemeldet.
//
// Übergang: ab `LIVE_IN` (1 500 m) entstehen die Schiffe in Teilschritten (höchstens `BUILD_MS` je Logikschritt, ein Schiff zugleich, wie die
// Ereignis-Schiffe des lebendigen Meeres), jenseits von `LIVE_OUT` (2 300 m) werden sie wieder zu Daten. Eine Großschlacht erscheint immer mit beiden
// Seiten; erst wenn beide Armadas echt fahren, rechnet die Seewelt (die Engine wartet so lange). Wie viele Schiffe je Armada echt fahren, bestimmt die
// Grafikstufe (`NavalSystem.detail`); die übrigen bleiben Reserve in den Daten und rücken nach, wenn eines sinkt.
import type { Object3D, Scene } from 'three';
import { factionShipLook, SHIP_CLASSES } from '../data/ships';
import { ROLE_LABEL } from '../data/nations';
import { seaLevelAt } from '../data/regions';
import type { FactionId } from '../data/factions';
import type { EnemyShip, EventShipLink, NavalSystem, SpawnYield } from '../naval/naval';
import type { Ship } from '../entities/ship/ship';
import type { ShipEvolution, EvoTier } from '../data/shipEvolution';
import { TroopSquad, type TroopFoe, type TroopWorld } from '../entities/troops/squad';
import { TroopRenderer, type TroopView } from '../entities/troops/troopRender';
import { hordePalette } from '../raid/horde';
import type { NavGrid } from '../ai/navGrid';
import type { WalkIsland } from './islandGround';
import { shipHp, type ArmadaShip, type ArmadaState, type FactionWarEngine } from './factionWarEngine';

const LIVE_IN = 1500;
const LIVE_OUT = 2300;
const SYNC_EVERY = 0.25;
/** Truppen an Land erscheinen unter diesem Abstand zur Insel (und nur, wenn sie als ACTIVE_HIGH steht) */
const TROOPS_IN = 650;
const TROOPS_OUT = 950;

/** Was die Live-Schicht von der Seewelt braucht */
export interface WarLiveHost {
  scene: Scene;
  naval: NavalSystem;
  ship: Ship;
  /** Lage der Spielfigur bzw. des Schiffs (Interessenpunkt) */
  focus(): { x: number; z: number };
  /** Shader eines neuen Schiffs parallel vorübersetzen */
  warm(o: Object3D): void;
  /** Begehbare Insel samt Begehbarkeits-Netz, wenn sie gerade als ACTIVE_HIGH steht (sonst null) */
  islandWalk(id: string): { walk: WalkIsland; nav: NavGrid | null } | null;
  /** Grundlage der Truppenwelt (Boden, Salvenblitze, Verlustzahlen) */
  troopBase(): TroopWorld;
  /** Kennung der Spielfigur (Besitzer der Trupps, nie verbündet mit dem Spieler) */
  playerId: string;
}

interface BuildJob { armadaId: string; shipId: string; it: Generator<SpawnYield, EnemyShip> }

/** Echte Truppen einer Belagerung: Landungskorps gegen Garnison, beide als Massentrupps (ein InstancedMesh je Typ und Seite) */
class SiegeTroops {
  readonly sides: TroopSquad[][] = [[], []];
  private readonly views: TroopView[][] = [[], []];
  private readonly renderers: TroopRenderer[];
  private readonly worlds: TroopWorld[];
  private readonly soft: { x: number; z: number; radius: number; owner?: object }[] = [];
  readonly heads0: [number, number] = [0, 0];
  readonly units0: [number, number];
  private disposed = false;

  constructor(scene: Scene, readonly siegeId: string, attacker: FactionId, defender: FactionId, base: TroopWorld, nav: NavGrid | null, isl: WalkIsland,
    from: { x: number; z: number }, troops: number, garrison: number, level: number, ownerId: string) {
    this.renderers = [new TroopRenderer(scene, true, { palette: hordePalette(attacker), cap: 60 }), new TroopRenderer(scene, true, { palette: hordePalette(defender), cap: 60 })];
    this.units0 = [troops, garrison];
    const foes = (side: 0 | 1): readonly TroopFoe[] => this.sides[1 - side];
    this.worlds = [0, 1].map((side) => ({
      ...base,
      enemies: () => foes(side as 0 | 1),
      hit: (e: TroopFoe, dmg: number, dx: number, dz: number) => { (e as TroopSquad).receive(dmg, dx, dz); },
      nav: () => nav,
    }));
    // Landeplatz: Strand auf der Seite der Flotte, Verteidigung auf halbem Weg zur Inselmitte
    const ang = Math.atan2(from.x - isl.x, from.z - isl.z);
    const beachR = isl.r * 0.82, holdR = isl.r * 0.42;
    const spot = { x: 0, z: 0 };
    const place = (r: number, off: number) => {
      const a = ang + off;
      let x = isl.x + Math.sin(a) * r, z = isl.z + Math.cos(a) * r;
      if (nav) { nav.snap(x, z, 1.2, spot); x = spot.x; z = spot.z; }
      return { x, z };
    };
    const attackers = Math.max(2, Math.min(6, Math.round(troops / 22)));
    const defenders = Math.max(1, Math.min(6, Math.round(garrison / 22)));
    for (let k = 0; k < attackers; k++) {
      const p = place(beachR, (k - (attackers - 1) / 2) * 0.12);
      const q = new TroopSquad(k % 2 ? 'musketier' : 'schwert', 4, level, ownerId);
      q.hostile = true; q.aggroR = 70;
      q.place(p.x, p.z, ang + Math.PI, base.ground);
      // vorrücken bis zur Verteidigungslinie
      const g = place(holdR * 0.8, (k - (attackers - 1) / 2) * 0.08);
      q.holdX = g.x; q.holdZ = g.z;
      q.startLanding({ fromX: from.x + Math.sin(ang) * 10, fromZ: from.z + Math.cos(ang) * 10, fromY: 0.6, delay: 1 + k * 1.4, total: 9, boat: true });
      this.sides[0].push(q);
    }
    for (let k = 0; k < defenders; k++) {
      const p = place(holdR, (k - (defenders - 1) / 2) * 0.22);
      const q = new TroopSquad(k % 2 ? 'schwert' : 'musketier', 4, level, ownerId);
      q.hostile = true; q.aggroR = 55;
      q.place(p.x, p.z, ang, base.ground);
      q.holdX = p.x; q.holdZ = p.z;
      this.sides[1].push(q);
    }
    for (const side of [0, 1] as const) {
      let h = 0;
      for (const q of this.sides[side]) { h += q.heads; this.views[side].push({ typ: q.typ, heads: q.heads, x: q.x, y: q.y, z: q.z, yaw: q.yaw, move: 0, pulse: 0, seed: q.seed, compact: 1 }); }
      this.heads0[side] = h;
    }
  }

  /** Köpfe einer Seite (lebende Trupps, auch noch im Boot) */
  heads(side: 0 | 1): number {
    let h = 0;
    for (const q of this.sides[side]) h += q.heads;
    return h;
  }

  update(dt: number, t: number, ref: { x: number; z: number; yaw: number }) {
    if (this.disposed) return;
    const soft = this.soft;
    soft.length = 0;
    for (const list of this.sides) for (const q of list) if (q.alive) soft.push({ x: q.x, z: q.z, radius: q.sepRadius(), owner: q });
    for (const side of [0, 1] as const) {
      const list = this.sides[side], views = this.views[side];
      for (let i = 0; i < list.length; i++) {
        const q = list[i], v = views[i];
        q.update(dt, ref, this.worlds[side], soft);
        for (const b of soft) if (b.owner === q) { b.x = q.x; b.z = q.z; }
        v.heads = q.heads; v.typ = q.typ; v.seed = q.seed; v.move = q.move; v.pulse = q.pulse;
        const lp = q.landingPose();
        if (lp) { v.x = lp.x; v.y = lp.y; v.z = lp.z; } else { v.x = q.x; v.y = q.y; v.z = q.z; }
        v.yaw = q.yaw; v.compact = q.compact * q.squeeze;
        if (q.lostHeads > 0) { this.renderers[side].fall(v, q.lostHeads); q.lostHeads = 0; }
      }
      this.renderers[side].update(views, t, dt);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const r of this.renderers) r.dispose();
    this.sides[0].length = 0; this.sides[1].length = 0;
  }
}

export class FactionWarLive {
  /** Echte Schiffe je Schiffs-Kennung der Engine */
  private readonly ships = new Map<string, EnemyShip>();
  private readonly armadaOf = new Map<string, string>();
  private queue: { armadaId: string; shipId: string }[] = [];
  private job: BuildJob | null = null;
  /** Großschlacht der Engine → Nummer der Seeschlacht im Seesystem */
  private readonly navBattle = new Map<string, number>();
  private siege: SiegeTroops | null = null;
  private syncT = 0;
  private clock = 0;
  /** Ruht (Raid, Titelbild): keine echten Schiffe, keine Truppen */
  paused = false;

  constructor(private readonly host: WarLiveHost, readonly engine: FactionWarEngine) {
    const nav = host.naval;
    const prev = nav.onEventHit;
    // Treffer des Spielers auf ein Armada-Schiff: die ganze Armada wehrt sich (Opt-In); andere Ereignis-Schiffe gehören dem lebendigen Meer
    nav.onEventHit = (e) => { if (e.ev && this.ships.get(e.ev.recId) === e) this.onHit(e); else prev?.(e); };
  }

  /** Zeitbudget je Logikschritt für den Bau neuer Armada-Schiffe (ms) */
  static readonly BUILD_MS = 3;

  /** Wie viele Schiffe einer Armada echt fahren (Grafikstufe) */
  private cap(): number {
    const d = this.host.naval.detail;
    return d >= 1 ? 8 : d >= 0.5 ? 5 : 3;
  }

  update(dt: number) {
    if (this.paused) return;
    this.clock += dt;
    this.syncT -= dt;
    if (this.syncT <= 0) { this.syncT = SYNC_EVERY; this.sync(); this.stream(); this.battles(); this.siegeTroops(); }
    this.pumpSpawn();
    const s = this.siege;
    if (s) { const f = this.host.focus(); s.update(dt, this.clock, { x: f.x, z: f.z, yaw: 0 }); }
  }

  // ---------- Rückschreiben ----------

  /** Lage, Rumpf und Untergang der echten Schiffe sofort in die Engine schreiben (Speichern) */
  flush() { this.sync(); }

  private sync() {
    const nav = this.host.naval, eng = this.engine;
    const leaderSeen = new Set<string>();
    for (const [shipId, e] of this.ships) {
      const aid = this.armadaOf.get(shipId)!;
      const a = eng.armadaById(aid);
      if (!a || !nav.enemies.includes(e)) {
        this.ships.delete(shipId); this.armadaOf.delete(shipId);
        if (a && !nav.enemies.includes(e) && !this.anyShip(aid)) eng.setLive(aid, false);
        continue;
      }
      const s = e.ship;
      const down = !s.alive || s.sinking > 0 || s.disabled || !!e.captured;
      eng.syncShip(aid, shipId, s.maxHull > 0 ? s.hull / s.maxHull : 0, s.sail, down);
      if (!down && !leaderSeen.has(aid)) {
        const rec = a.ships.find((x) => x.id === shipId);
        if (rec && (rec.slot === 0 || !this.leaderAlive(a))) { eng.syncArmada(aid, s.x, s.z, s.heading); leaderSeen.add(aid); }
      }
    }
  }

  private leaderAlive(a: ArmadaState): boolean {
    const l = a.ships.find((x) => x.slot === 0);
    return !!l && !l.down && this.ships.has(l.id);
  }

  private anyShip(armadaId: string): boolean {
    for (const v of this.armadaOf.values()) if (v === armadaId) return true;
    return false;
  }

  // ---------- Nähe ----------

  /** Echte Schiffe in Reichweite anlegen, in der Ferne wieder zu Daten machen; Großschlachten immer mit beiden Seiten */
  private stream() {
    const eng = this.engine, f = this.host.focus();
    for (const a of eng.state.armadas) {
      const bt = eng.battleById(a.battleId);
      const px = bt ? bt.x : a.x, pz = bt ? bt.z : a.z;
      const d = Math.hypot(px - f.x, pz - f.z);
      const gone = a.status === 'aufgeloest';
      if (!a.live && !gone && d < LIVE_IN) this.materialize(a);
      else if (a.live && (gone || (d > LIVE_OUT && !this.engaged(a.id)))) this.release(a.id);
      // nachrücken: die Reserve füllt die echten Plätze wieder auf
      if (a.live && !gone) this.refill(a);
    }
    // Schlacht: die Gegenseite erscheint mit
    for (const bt of eng.state.battles) {
      if (bt.ended) continue;
      const A = eng.armadaById(bt.a), B = eng.armadaById(bt.b);
      if (A && B && A.live !== B.live) { if (!A.live) this.materialize(A); if (!B.live) this.materialize(B); }
    }
  }

  private materialize(a: ArmadaState) {
    this.engine.setLive(a.id, true);
    this.refill(a);
  }

  private refill(a: ArmadaState) {
    let live = 0;
    for (const sh of a.ships) if (!sh.down && (this.ships.has(sh.id) || this.queued(sh.id))) live++;
    const cap = this.cap();
    for (const sh of a.ships) {
      if (live >= cap) break;
      if (sh.down || this.ships.has(sh.id) || this.queued(sh.id)) continue;
      this.queue.push({ armadaId: a.id, shipId: sh.id });
      live++;
    }
  }

  private queued(shipId: string): boolean {
    if (this.job?.shipId === shipId) return true;
    for (const q of this.queue) if (q.shipId === shipId) return true;
    return false;
  }

  /** Kämpft ein Schiff dieser Armada gerade mit dem Spieler (dann wird nichts abgebaut, auch nicht in der Ferne)? */
  private engaged(armadaId: string): boolean {
    const p = this.host.ship;
    for (const [shipId, e] of this.ships) {
      if (this.armadaOf.get(shipId) !== armadaId) continue;
      if (e.provoked && e.state === 'engage' && Math.hypot(e.ship.x - p.x, e.ship.z - p.z) < 1200) return true;
    }
    return false;
  }

  /** Echte Schiffe einer Armada abbauen (ihre Daten bleiben) */
  release(armadaId: string) {
    const nav = this.host.naval;
    this.sync();
    for (const [shipId, e] of [...this.ships]) {
      if (this.armadaOf.get(shipId) !== armadaId) continue;
      // ein kampfunfähiges Schiff, das man zurücklässt, ist erledigt; brennende Wracks bleiben stehen, bis das Seesystem sie abräumt
      if (e.ship.disabled || e.ship.sinking > 0) { if (e.ev) e.ev.owner = ''; e.battle = undefined; }
      else nav.removeEventShip(e);
      this.ships.delete(shipId); this.armadaOf.delete(shipId);
    }
    this.queue = this.queue.filter((q) => q.armadaId !== armadaId);
    if (this.job?.armadaId === armadaId) { this.job.it.return(undefined as unknown as EnemyShip); this.job = null; }
    this.engine.setLive(armadaId, false);
  }

  /** Alles abbauen (Laden, Raid, Titelbild) */
  releaseAll() {
    for (const a of this.engine.state.armadas) if (a.live) this.release(a.id);
    for (const id of this.navBattle.values()) this.host.naval.closeWarBattle(id);
    this.navBattle.clear();
    if (this.siege) { this.engine.setSiegeLive(this.siege.siegeId, false); this.siege.dispose(); this.siege = null; }
  }

  // ---------- Bau ----------

  private pumpSpawn() {
    if (!this.job) {
      if (!this.queue.length) return;
      // gerecht bauen: zuerst die Armada mit den wenigsten echten Schiffen (in einer Schlacht stehen so beide Seiten früh auf dem Wasser)
      let pick = 0, fewest = Infinity;
      for (let k = 0; k < this.queue.length; k++) {
        let n = 0;
        for (const v of this.armadaOf.values()) if (v === this.queue[k].armadaId) n++;
        if (n < fewest) { fewest = n; pick = k; }
      }
      const next = this.queue.splice(pick, 1)[0];
      this.job = this.startJob(next.armadaId, next.shipId);
      if (!this.job) return;
    }
    const job = this.job;
    const a = this.engine.armadaById(job.armadaId);
    const rec = a?.ships.find((x) => x.id === job.shipId);
    if (!a || !a.live || !rec || rec.down) { job.it.return(undefined as unknown as EnemyShip); this.job = null; return; }
    const t0 = performance.now();
    for (;;) {
      const r = job.it.next();
      if (r.done) { this.adopt(r.value, a, rec); this.job = null; return; }
      if (r.value === 'gpu' || r.value === 'wait' || performance.now() - t0 >= FactionWarLive.BUILD_MS) return;
    }
  }

  /** Lage eines Schiffs in der Formation der Armada (Daten): Kommandoschiff vorn, die anderen beiderseits dahinter */
  private slotPos(a: ArmadaState, slot: number, out: { x: number; z: number }) {
    const side = slot === 0 ? 0 : slot % 2 ? 1 : -1, back = slot === 0 ? 0 : 50 + 24 * Math.floor((slot - 1) / 2);
    out.x = a.x + Math.cos(a.heading) * side * 46 - Math.sin(a.heading) * back;
    out.z = a.z - Math.sin(a.heading) * side * 46 - Math.cos(a.heading) * back;
    return out;
  }

  private startJob(armadaId: string, shipId: string): BuildJob | null {
    const a = this.engine.armadaById(armadaId);
    const rec = a?.ships.find((x) => x.id === shipId);
    if (!a || !rec || rec.down || this.ships.has(shipId)) return null;
    const def = this.engine.registry.get(a.nation);
    const power = def?.heraldry ?? 'marine';
    const look = factionShipLook(power);
    const p = this.slotPos(a, rec.slot, { x: 0, z: 0 });
    const level = Math.max(4, seaLevelAt(a.x, a.z) + (rec.role === 'kommando' ? 3 : 1));
    const evo: ShipEvolution = { hullTier: rec.hullTier as EvoTier, sailTier: rec.sailTier as EvoTier, cannonTier: rec.cannonTier as EvoTier };
    const link: EventShipLink = {
      owner: a.id, recId: rec.id, role: rec.slot === 0 ? 'galeone' : 'eskorte', leadId: null, route: a.route, leg: a.leg, zone: null, preyId: null, bossId: null, slot: rec.slot,
    };
    const it = this.host.naval.spawnEventShipSteps({
      x: p.x, z: p.z, heading: a.heading, classTier: rec.cls, level, look, role: 'patrouille', power, name: `${def?.name ?? 'Unbekannt'}: ${ROLE_LABEL[rec.role]}`,
      // dieselben Trefferpunkte wie in der Engine (`shipHp`): eine Schlacht dauert in 3D so lange wie in den Daten
      evo, hullFrac: rec.hull, sailFrac: rec.sail, link, maxHull: Math.round(shipHp(rec)),
    });
    return { armadaId, shipId, it };
  }

  private adopt(e: EnemyShip, a: ArmadaState, rec: ArmadaShip) {
    const p = this.slotPos(a, rec.slot, { x: 0, z: 0 });
    e.ship.x = p.x; e.ship.z = p.z; e.ship.heading = a.heading;
    e.ship.prev = { x: p.x, z: p.z, heading: a.heading };
    this.ships.set(rec.id, e);
    this.armadaOf.set(rec.id, a.id);
    this.host.warm(e.ship.model.group);
    this.linkRoles(a);
  }

  /**
   * Rollen der echten Schiffe nach dem Zustand der Armada: unterwegs folgt das Kommandoschiff der Route und die anderen halten Formation (Ereignis-KI);
   * vor der belagerten Insel kreuzen alle als Belagerungsring; in einer Großschlacht kämpfen sie wie in einer Seeschlacht (`EnemyShip.battle`).
   */
  private linkRoles(a: ArmadaState) {
    let leadId: string | null = null;
    for (const sh of a.ships) { const e = this.ships.get(sh.id); if (e && !sh.down && (sh.slot === 0 || !leadId)) { leadId = e.ship.entityId; if (sh.slot === 0) break; } }
    const siege = a.status === 'belagerung';
    const w = siege ? this.engine.island(a.target) : null;
    for (const sh of a.ships) {
      const e = this.ships.get(sh.id);
      if (!e?.ev) continue;
      const L = e.ev;
      L.route = a.route; L.leg = a.leg;
      if (siege && w) {
        L.role = 'wache';
        // Ring vor der Küste: jedes Schiff an seinem Platz auf der Seite der Flotte
        const ang = Math.atan2(a.x - w.x, a.z - w.z) + (sh.slot - a.ships.length / 2) * 0.09;
        const r = w.r * 1.45 + 120;
        e.wander.x = w.x + Math.sin(ang) * r; e.wander.z = w.z + Math.cos(ang) * r;
      } else {
        const lead = e.ship.entityId === leadId;
        L.role = lead ? 'galeone' : 'eskorte';
        L.leadId = lead ? null : leadId;
      }
    }
  }

  // ---------- Großschlachten ----------

  /** Stehen von dieser Armada genug echte Schiffe für den Beginn der Schlacht (zwei, oder alle, die noch schwimmen)? Der Rest stößt dazu, sobald er gebaut ist */
  private ready(a: ArmadaState | null): boolean {
    if (!a || !a.live) return false;
    let n = 0, alive = 0;
    for (const sh of a.ships) {
      if (sh.down) continue;
      alive++;
      if (this.ships.has(sh.id)) n++;
    }
    return n > 0 && n >= Math.min(2, alive);
  }

  /** Seeschlachten im Seesystem öffnen und schließen, Seiten setzen, Rollen nachführen */
  private battles() {
    const eng = this.engine, nav = this.host.naval;
    // eine Großschlacht übernimmt die Seewelt erst, wenn beide Seiten vollständig als echte Schiffe stehen; bis dahin rechnet die Engine
    for (const bt of eng.state.battles) {
      if (bt.ended) continue;
      const both = this.ready(eng.armadaById(bt.a)) && this.ready(eng.armadaById(bt.b));
      if (both !== bt.live) eng.setBattleLive(bt.id, both);
    }
    for (const a of eng.state.armadas) {
      if (!a.live) continue;
      const bt = eng.battleById(a.battleId);
      const fight = !!bt && !bt.ended && bt.live;
      let id = 0;
      if (fight) {
        id = this.navBattle.get(bt!.id) ?? 0;
        if (!id) {
          const A = eng.registry.get(bt!.nationA)?.heraldry ?? 'marine', B = eng.registry.get(bt!.nationB)?.heraldry ?? 'marine';
          id = nav.openWarBattle(bt!.id, A, B, bt!.x, bt!.z);
          this.navBattle.set(bt!.id, id);
        }
      }
      const side: 0 | 1 = bt && bt.a === a.id ? 0 : 1;
      for (const sh of a.ships) {
        const e = this.ships.get(sh.id);
        if (!e) continue;
        if (fight) { if (!e.battle || e.battle.id !== id) { e.battle = { id, side }; e.state = 'engage'; } }
        else if (e.battle) { e.battle = undefined; e.state = 'patrol'; }
      }
      if (!fight) this.linkRoles(a);
    }
    // beendete Schlachten im Seesystem schließen
    for (const [warId, id] of [...this.navBattle]) {
      const bt = eng.battleById(warId);
      if (bt && !bt.ended && bt.live) continue;
      nav.closeWarBattle(id);
      this.navBattle.delete(warId);
    }
  }

  /** Der Spieler hat ein Schiff der Armada getroffen: die ganze Armada wehrt sich */
  private onHit(e: EnemyShip) {
    const aid = e.ev ? this.armadaOf.get(e.ev.recId) : undefined;
    if (!aid) return;
    for (const [shipId, o] of this.ships) if (this.armadaOf.get(shipId) === aid) { o.provoked = true; o.state = 'engage'; }
  }

  // ---------- Truppen an Land ----------

  /** Echte Belagerungstruppen an der nächsten belagerten Insel in Spielernähe (ACTIVE_HIGH), Verluste zurück an die Engine */
  private siegeTroops() {
    const eng = this.engine, f = this.host.focus();
    let cur = this.siege ? eng.siegeById(this.siege.siegeId) : null;
    if (this.siege) {
      const w = cur ? eng.island(cur.islandId) : undefined;
      const far = !w || Math.hypot(w.x - f.x, w.z - f.z) - w.r > TROOPS_OUT;
      if (!cur || cur.ended || cur.paused || far || !this.host.islandWalk(cur.islandId)) {
        eng.setSiegeLive(this.siege.siegeId, false);
        this.siege.dispose(); this.siege = null; cur = null;
      } else {
        // Verluste umrechnen: Köpfe → Truppen der Engine
        const s = this.siege;
        const ka = s.heads0[0] > 0 ? s.heads(0) / s.heads0[0] : 1, kd = s.heads0[1] > 0 ? s.heads(1) / s.heads0[1] : 1;
        eng.syncSiege(s.siegeId, s.units0[0] * ka, s.units0[1] * kd);
        return;
      }
    }
    for (const sg of eng.state.sieges) {
      if (sg.ended || sg.paused || !sg.defender) continue;
      const w = eng.island(sg.islandId);
      if (!w || Math.hypot(w.x - f.x, w.z - f.z) - w.r > TROOPS_IN) continue;
      const ground = this.host.islandWalk(sg.islandId);
      const a = eng.armadaById(sg.armadaId);
      if (!ground || !a) continue;
      const atk = eng.registry.get(sg.attacker)?.heraldry ?? 'marine', def = eng.registry.get(sg.defender)?.heraldry ?? 'marine';
      const level = Math.max(4, seaLevelAt(w.x, w.z) + 1);
      this.siege = new SiegeTroops(this.host.scene, sg.id, atk, def, this.host.troopBase(), ground.nav, ground.walk, { x: a.x, z: a.z }, sg.troops, sg.garrison, level, this.host.playerId);
      eng.setSiegeLive(sg.id, true);
      return;
    }
  }

  /** Lebende Belagerungstrupps (Prüfungen, Anzeige) */
  get siegeView(): { siegeId: string; attackers: number; defenders: number } | null {
    const s = this.siege;
    return s ? { siegeId: s.siegeId, attackers: s.heads(0), defenders: s.heads(1) } : null;
  }

  /** Zahl der echten Schiffe (Prüfungen, Anzeige) */
  get liveShips(): number { return this.ships.size; }
  get building(): boolean { return !!this.job || this.queue.length > 0; }
}

/** Klassen-Name für Meldungen („Linienschiff“) */
export const className = (cls: number): string => SHIP_CLASSES[Math.max(0, Math.min(6, cls))].n;
