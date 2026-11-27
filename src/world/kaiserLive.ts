// Die Kaiser-Schlacht in der offenen Welt (Phase 4.5D): setzt die reinen Regeln (data/kaiserBattle.ts) um, sobald man einer Kaiser-Zitadelle nahe kommt.
// Auf See: Wachflotte aus Stufe-5-Kriegsschiffen (NavalSystem.spawnGuard: Rammsporn, Drehbassen), zwei Ketten-Bastionen im Wasser (Ziele für die
// Kanonenkugeln über `NavalSystem.raidTargets`, sie feuern zurück) und die Hafenkette dazwischen (Schiffs-Kollider über `IslandGround.shipBlockers`).
// An Land: die Verbände der beiden Festungsringe als Horde (instanziert), Elite-Offiziere und der Kaiser als Einzelgegner im Kampfsystem.
// Je Bild ohne neue Objekte (feste Listen, Arbeitsvektoren); Meshes entstehen nur beim Aufziehen und verschwinden beim Fortsegeln.
import { BoxGeometry, Color, CylinderGeometry, DoubleSide, Group, InstancedMesh, Mesh, Object3D, PlaneGeometry, TorusGeometry, Vector3, type Scene } from 'three';
import type { CombatSystem } from '../combat/combat';
import type { NavalSystem, BallTarget } from '../naval/naval';
import type { IslandDef } from '../data/regions';
import type { Faction } from '../core/save/types';
import type { AmmoId } from '../data/ships';
import { factionShipLook } from '../data/ships';
import { FACTIONS } from '../data/factions';
import type { Ship } from '../entities/ship/ship';
import type { Enemy } from '../entities/enemy';
import type { TroopFoe } from '../entities/troops/squad';
import type { BossMech, EnemyDef } from '../data/combat';
import { groupElites, groupScale } from '../data/balanceConfig';
import type { ParticleSystem } from './particles';
import type { SmokeSystem } from './smoke';
import { boxBlocker, type Blocker, type IslandGround, type WalkIsland } from './islandGround';
import { toon } from '../render/toon';
import { disposeObject } from '../render/dispose';
import { audio } from '../audio/audio';
import { Horde, hordePalette, HORDE_DMG, type HordeMember } from '../raid/horde';
import {
  KAISER_IDS, KAISER_LEVEL, KAISER_SPEC_BY_ID, kaiserBlockade, kaiserRingPosts, kaiserThrone, type KaiserBlockade, type KaiserId, type KaiserIslandSpec, type KaiserRingPosts,
} from '../data/kaiserIslands';
import {
  KAISER, bossAppeared, bossDefeated, bossPhase, bossShouldAppear, canLand, clearRing, damageBastion, enterRing, guardDown, kaiserBossDef, kaiserCooldownLeft,
  kaiserFromSave, kaiserOfficerDef, kaiserToSave, newKaiserBattle, retreatRings, tickKaiser, type KaiserBattleState, type KaiserSaveState,
} from '../data/kaiserBattle';

/** Was die Welt der Kaiser-Schlacht zur Verfügung stellt (SeaWorld baut es aus ihren Teilen) */
export interface KaiserHost {
  /** Talente (4.6E, Belagerung & Kriegsführung): Faktor auf den Schaden gegen die Bastionen der Seesperre (fehlt er, gilt 1) */
  bastionK?: () => number;
  scene: Scene;
  ground: IslandGround;
  naval: NavalSystem;
  combat: CombatSystem;
  smoke: SmokeSystem;
  sparks: ParticleSystem;
  playerShip: Ship;
  defs(): readonly IslandDef[];
  /** Spielfigur zu Fuß an Land (nicht an Deck): Position, sonst null */
  footOnIsland(): { x: number; y: number; z: number } | null;
  clock(): number;
  /** Lager der Verteidiger aus Sicht des Spielers (Beute, Entern) */
  align(): Faction;
  message(text: string): void;
  banner(title: string, sub: string): void;
  cutin(text: string): void;
  /** Der Kaiser ist gefallen: Lohn vergibt das Spiel */
  victory(id: KaiserId, first: boolean): void;
  /** 4.8B: anwesende Gruppenmitglieder samt Spieler (1 … 5) – Leben, Haltung und Elite-Wellen wachsen mit (fehlt es, gilt 1) */
  groupSize?(): number;
}

interface BastionLive { x: number; z: number; r: number; tower: Group; ruin: Mesh; reload: number; blocker: Blocker; down: boolean }

interface ActiveKaiser {
  id: KaiserId;
  spec: KaiserIslandSpec;
  def: IslandDef;
  cx: number; cz: number;
  /** Seesperre in Weltkoordinaten */
  bl: KaiserBlockade;
  group: Group;
  bastions: BastionLive[];
  chain: InstancedMesh | null;
  chainBlockers: Blocker[];
  /** Absinken der Kette (s seit dem Fall der zweiten Bastion; -1 = steht) */
  sinkT: number;
  guardIds: string[];
  counted: Set<string>;
}

interface LandKaiser {
  id: KaiserId;
  isl: WalkIsland;
  horde: Horde;
  posts: [KaiserRingPosts, KaiserRingPosts];
  ringMembers: [HordeMember[], HordeMember[]];
  boss: Enemy | null;
  sealedMsgT: number;
  time: number;
  /** 4.8B: Gruppengröße beim Auftritt des Kaisers (Verstärkung der zweiten Phase) */
  group: number;
}

/** 4.8B: Gegner-Werte für eine Gruppe – Leben und Haltungsleiste mal Faktor (immer eine eigene Kopie, nie die gemeinsamen Daten) */
export function scaleDef(d: EnemyDef, k: number): EnemyDef {
  if (k === 1) return d;
  return { ...d, hp: Math.round(d.hp * k), poise: Math.round(d.poise * k) };
}

const CHAIN_LINK = 1.25;
const _from = new Vector3();
const _o = new Object3D();
const _shotColor = new Color();

/** Kaiser-Zitadellen: Seesperre, Festungsringe und Kaiser in der offenen Welt */
export class KaiserLive implements BallTarget {
  private states = new Map<KaiserId, KaiserBattleState>();
  private active: ActiveKaiser | null = null;
  private land: LandKaiser | null = null;
  private readonly shipTargets: Ship[] = [];
  private readonly foes: TroopFoe[] = [];
  private readonly playerFoe: TroopFoe;
  private scanT = 0;

  constructor(private host: KaiserHost) {
    const cb = host.combat;
    this.playerFoe = { get x() { return cb.player?.x ?? 0; }, get z() { return cb.player?.z ?? 0; }, radius: 0.55, get alive() { return !!cb.player?.active; } };
  }

  // ---------- Zustand und Spielstand ----------

  state(id: KaiserId): KaiserBattleState {
    let st = this.states.get(id);
    if (!st) { st = newKaiserBattle(id); this.states.set(id, st); }
    return st;
  }

  /** Für Karte und Inselinfo: Phase, gefallene Wachschiffe, Bastionen, Ruhezeit (s), Siege */
  info(id: KaiserId): { phase: KaiserBattleState['phase']; guardsDown: number; bastionsDown: number; cooldown: number; wins: number } {
    const st = this.state(id);
    return { phase: st.phase, guardsDown: st.guardsDown, bastionsDown: st.bastions.filter((h) => h <= 0).length, cooldown: kaiserCooldownLeft(st, this.host.clock()), wins: st.wins };
  }

  snapshot(): KaiserSaveState { return kaiserToSave(this.states.values(), this.host.clock()); }

  setState(saved: KaiserSaveState | null | undefined) {
    this.leaveIsland();
    this.deactivate();
    this.states.clear();
    for (const st of kaiserFromSave(saved, this.host.clock())) this.states.set(st.id, st);
  }

  /** Darf man an dieser Insel anlanden? (Kaiser: erst, wenn die Hafenkette gefallen ist) */
  canLand(def: IslandDef | null | undefined): boolean {
    if (!def?.kaiser || !(KAISER_IDS as readonly string[]).includes(def.id)) return true;
    return canLand(this.state(def.id as KaiserId));
  }

  landReason(def: IslandDef): string {
    const st = this.state(def.id as KaiserId);
    const left = st.bastions.filter((h) => h > 0).length;
    return `Die Kaiserliche Seesperre hält: ${left} Ketten-Bastion${left === 1 ? '' : 'en'} sperr${left === 1 ? 't' : 'en'} die Bucht. Zerschieße sie mit Breitseiten, dann sinkt die Hafenkette.`;
  }

  // ---------- Schleife ----------

  update(dt: number) {
    const h = this.host, now = h.clock();
    for (const st of this.states.values()) if (tickKaiser(st, now) && this.active?.id === st.id) { this.deactivate(); h.message(`${KAISER_SPEC_BY_ID[st.id].name}: Die Kaiserliche Seesperre steht wieder.`); }
    // Seesperre auf- und abbauen: nächste Kaiser-Zitadelle in Reichweite (alle halbe Sekunde prüfen)
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.5;
      const s = h.playerShip, fp = h.footOnIsland();
      const px = fp?.x ?? s.x, pz = fp?.z ?? s.z;
      if (this.active) {
        if (Math.hypot(px - this.active.cx, pz - this.active.cz) > KAISER.sleepDist) this.deactivate();
      } else {
        for (const d of h.defs()) {
          if (!d.kaiser || Math.hypot(px - d.x, pz - d.z) > KAISER.wakeDist) continue;
          this.activate(d);
          break;
        }
      }
    }
    const a = this.active;
    if (a) {
      const st = this.state(a.id);
      this.trackGuards(a, st);
      if (st.phase === 'seesperre') this.fireBastions(a, dt);
      if (a.sinkT >= 0) this.sinkChain(a, dt);
    }
    this.updateLand(dt);
  }

  // ---------- Seesperre ----------

  private activate(def: IslandDef) {
    const id = def.id as KaiserId, spec = KAISER_SPEC_BY_ID[id];
    if (!spec) return;
    const st = this.state(id);
    const h = this.host;
    const L = kaiserBlockade(spec);
    const w = (p: { x: number; z: number }) => ({ x: def.x + p.x, z: def.z + p.z });
    const bl: KaiserBlockade = {
      bastions: L.bastions.map((b) => ({ ...w(b), r: b.r })),
      chain: { ax: def.x + L.chain.ax, az: def.z + L.chain.az, bx: def.x + L.chain.bx, bz: def.z + L.chain.bz },
      guards: L.guards.map((g) => ({ ...w(g), heading: g.heading })),
      approach: w(L.approach),
    };
    const group = new Group();
    group.name = `kaiser-${id}`;
    const a: ActiveKaiser = { id, spec, def, cx: def.x, cz: def.z, bl, group, bastions: [], chain: null, chainBlockers: [], sinkT: -1, guardIds: [], counted: new Set() };
    const color = FACTIONS[spec.power].color;
    bl.bastions.forEach((b, i) => {
      const live = this.buildBastion(b.x, b.z, b.r, color);
      group.add(live.tower, live.ruin);
      live.down = st.bastions[i] <= 0;
      live.tower.visible = !live.down; live.ruin.visible = live.down;
      h.ground.shipBlockers.push(live.blocker);
      a.bastions.push(live);
    });
    if (st.chainUp) this.buildChain(a);
    h.scene.add(group);
    // Wachflotte: nur in Phase 1 und nur die Schiffe, die noch nicht gefallen sind
    if (st.phase === 'seesperre') {
      const look = factionShipLook(spec.power);
      const tiers = [5, 4, 6, 4, 5, 6];
      const n = Math.max(0, KAISER.guards - st.guardsDown);
      for (let i = 0; i < n; i++) {
        const g = bl.guards[i % bl.guards.length];
        const gid = `kaiser:${id}:${i}`;
        h.naval.spawnGuard({ guardId: gid, tier: tiers[i % tiers.length], x: g.x, z: g.z, heading: g.heading, hull: 2.2, sail: 1.5, crew: 1.4, name: spec.fleet[i % spec.fleet.length] }, { ...look }, KAISER_LEVEL, spec.power);
        a.guardIds.push(gid);
      }
      h.naval.raidTargets = this;
      h.banner(spec.name, `Kaiserliche Seesperre · ${n} Wachschiffe · zwei Ketten-Bastionen`);
      h.message(`${spec.name}: Eine Hafenkette zwischen zwei Bastionen sperrt die Bucht, die Wachflotte des Kaisers läuft aus! Zerschieße die Ketten-Bastionen, um anlanden zu können.`);
      audio.play('horn', 0.8);
    } else if (st.phase === 'besiegt') {
      const min = Math.ceil(kaiserCooldownLeft(st, h.clock()) / 60);
      h.message(`${spec.name} liegt still – der Kaiser ist besiegt. In etwa ${min} Minuten stehen Flotte und Garde wieder.`);
    }
    this.active = a;
  }

  /** Seesperre abbauen (fortgesegelt, Raid, Laden): Wachschiffe, Bastionen, Kette und Kollider verschwinden; der Zustand bleibt */
  deactivate() {
    const a = this.active;
    if (!a) return;
    const h = this.host;
    h.naval.clearGuards(`kaiser:${a.id}:`);
    if (h.naval.raidTargets === this) h.naval.raidTargets = null;
    const sb = h.ground.shipBlockers;
    for (const b of a.bastions) { const i = sb.indexOf(b.blocker); if (i >= 0) sb.splice(i, 1); }
    this.dropChainBlockers(a);
    a.group.removeFromParent();
    disposeObject(a.group);
    this.active = null;
  }

  private buildBastion(x: number, z: number, r: number, color: string): BastionLive {
    const stone = toon({ color: '#A8A296', flatShading: true });
    const dark = toon({ color: '#5A5650', flatShading: true });
    const iron = toon({ color: '#2A2A2E', spec: 0.6, metalness: 0.5, roughness: 0.5 });
    const tower = new Group();
    tower.position.set(x, 0, z);
    const base = new Mesh(new CylinderGeometry(r * 0.92, r * 1.12, 24, 20), stone);
    base.position.y = 6;
    const ring = new Mesh(new CylinderGeometry(r * 1.0, r * 0.95, 2.2, 20), dark);
    ring.position.y = 18.6;
    tower.add(base, ring);
    // Zinnen rundum
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const m = new Mesh(new BoxGeometry(2.2, 2, 1.2), stone);
      m.position.set(Math.cos(a) * r * 0.95, 20.6, Math.sin(a) * r * 0.95);
      m.rotation.y = -a;
      tower.add(m);
    }
    // Kettenwinde und zwei Geschütze
    const winch = new Mesh(new CylinderGeometry(1.4, 1.4, 5, 12), iron);
    winch.rotation.z = Math.PI / 2;
    winch.position.set(0, 21, 0);
    tower.add(winch);
    for (const s of [-1, 1]) {
      const gun = new Mesh(new CylinderGeometry(0.45, 0.6, 5.5, 10), iron);
      gun.rotation.x = Math.PI / 2;
      gun.position.set(s * r * 0.45, 20.8, r * 0.7);
      tower.add(gun);
    }
    // Fahne der Macht
    const pole = new Mesh(new CylinderGeometry(0.12, 0.16, 12, 6), iron);
    pole.position.set(0, 26, -r * 0.4);
    const flag = new Mesh(new PlaneGeometry(4.2, 2.6), toon({ color, side: DoubleSide }));
    flag.position.set(2.2, 30.4, -r * 0.4);
    tower.add(pole, flag);
    // Trümmer nach dem Fall
    const ruin = new Mesh(new CylinderGeometry(r * 0.78, r * 1.15, 9, 11, 1), dark);
    ruin.position.set(x, 1.2, z);
    ruin.rotation.set(0.08, 0.6, -0.05);
    ruin.visible = false;
    return { x, z, r, tower, ruin, reload: Math.random() * KAISER.battery.reload, blocker: { x, z, r: r + 2 }, down: false };
  }

  /** Hafenkette: Glieder (instanziert) in flachem Bogen knapp über dem Wasser, dazu Schiffs-Kollider in 20-m-Stücken */
  private buildChain(a: ActiveKaiser) {
    const c = a.bl.chain;
    const len = Math.hypot(c.bx - c.ax, c.bz - c.az);
    const n = Math.max(2, Math.floor(len / CHAIN_LINK));
    const mesh = new InstancedMesh(new TorusGeometry(0.62, 0.16, 5, 10), toon({ color: '#2B2826', spec: 0.5, metalness: 0.55, roughness: 0.5 }), n);
    const yaw = Math.atan2(c.bx - c.ax, c.bz - c.az);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      _o.position.set(c.ax + (c.bx - c.ax) * t, 2.2 - 2.6 * 4 * t * (1 - t) + 0.25, c.az + (c.bz - c.az) * t);
      _o.rotation.set(0, yaw, i % 2 ? Math.PI / 2 : 0);
      _o.updateMatrix();
      mesh.setMatrixAt(i, _o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    a.group.add(mesh);
    a.chain = mesh;
    const segs = Math.max(1, Math.ceil(len / 20));
    const sb = this.host.ground.shipBlockers;
    for (let k = 0; k < segs; k++) {
      const t = (k + 0.5) / segs;
      const b = boxBlocker(c.ax + (c.bx - c.ax) * t, c.az + (c.bz - c.az) * t, 3, len / segs + 1, yaw);
      a.chainBlockers.push(b);
      sb.push(b);
    }
  }

  private dropChainBlockers(a: ActiveKaiser) {
    const sb = this.host.ground.shipBlockers;
    for (const b of a.chainBlockers) { const i = sb.indexOf(b); if (i >= 0) sb.splice(i, 1); }
    a.chainBlockers.length = 0;
  }

  /** Kette sinkt nach dem Fall der zweiten Bastion in vier Sekunden unter Wasser */
  private sinkChain(a: ActiveKaiser, dt: number) {
    a.sinkT += dt;
    const m = a.chain;
    if (!m) { a.sinkT = -1; return; }
    m.position.y = -a.sinkT * 1.6;
    if (a.sinkT > 4) { m.removeFromParent(); m.geometry.dispose(); a.chain = null; a.sinkT = -1; }
  }

  /** Kanonenkugel des Spielers oder seiner Flotte: trifft sie eine stehende Ketten-Bastion? */
  hitBall(p: Vector3, dmg: number, ammo: AmmoId): boolean {
    void ammo;
    const a = this.active;
    if (!a) return false;
    const st = this.state(a.id);
    if (st.phase !== 'seesperre') return false;
    for (let i = 0; i < a.bastions.length; i++) {
      const b = a.bastions[i];
      if (b.down || p.y > 26 || p.y < -2) continue;
      const dx = p.x - b.x, dz = p.z - b.z;
      if (dx * dx + dz * dz > (b.r + 1.5) * (b.r + 1.5)) continue;
      const res = damageBastion(st, i as 0 | 1, dmg * (this.host.bastionK?.() ?? 1));
      this.host.sparks.emit(8, p.x, p.y, p.z, { speed: 6, up: 2, life: 0.6, color: _shotColor.set(1, 0.7, 0.4).multiplyScalar(2), gravity: -9, spread: 1 });
      if (Math.random() < 0.35) this.host.smoke.puff(p.x, p.y, p.z, { size: 2.2, grow: 6, life: 3, tone: 0.3, vy: 1.5, alpha: 0.5 });
      if (res.destroyed) this.bastionDown(a, i);
      if (res.opened) this.chainFalls(a);
      return true;
    }
    return false;
  }

  private bastionDown(a: ActiveKaiser, i: number) {
    const b = a.bastions[i], h = this.host;
    b.down = true;
    b.tower.visible = false;
    b.ruin.visible = true;
    for (let k = 0; k < 6; k++) h.smoke.puff(b.x + (Math.random() - 0.5) * b.r, 6 + Math.random() * 8, b.z + (Math.random() - 0.5) * b.r, { size: 6, grow: 18, life: 9, tone: 0.25, vy: 3, alpha: 0.7, glow: 0.4 });
    h.sparks.emit(40, b.x, 12, b.z, { speed: 14, up: 8, life: 1.4, color: _shotColor.set(1, 0.55, 0.2).multiplyScalar(3), gravity: -9, spread: 6 });
    audio.play('crack', 1, { x: b.x, y: 8, z: b.z });
    h.message(`Ketten-Bastion ${i === 0 ? 'Backbord' : 'Steuerbord'} ist gefallen!`);
  }

  private chainFalls(a: ActiveKaiser) {
    const h = this.host;
    this.dropChainBlockers(a);
    a.sinkT = 0;
    if (h.naval.raidTargets === this) h.naval.raidTargets = null;
    audio.play('sink', 1, { x: (a.bl.chain.ax + a.bl.chain.bx) / 2, z: (a.bl.chain.az + a.bl.chain.bz) / 2 });
    h.banner('Die Hafenkette sinkt!', `${a.spec.name}: Die Bucht ist offen – lande an und stürme die Festungsringe`);
    h.message('Phase 2: Doppelter Festungsring. Große Wachverbände und Elite-Offiziere halten die Tore beider Ringe.');
  }

  /** Bastionen feuern auf das eigene Schiff und die Begleitschiffe in Reichweite */
  private fireBastions(a: ActiveKaiser, dt: number) {
    const h = this.host, t = this.shipTargets;
    t.length = 0;
    const ps = h.playerShip;
    if (ps.alive && !ps.sinking) t.push(ps);
    for (const e of h.naval.enemies) if (e.companion && e.ship.alive && !e.ship.sinking) t.push(e.ship);
    if (!t.length) return;
    for (const b of a.bastions) {
      if (b.down) continue;
      b.reload -= dt;
      if (b.reload > 0) continue;
      let best: Ship | null = null, bd: number = KAISER.battery.range;
      for (const s of t) { const d = Math.hypot(s.x - b.x, s.z - b.z); if (d < bd) { bd = d; best = s; } }
      if (!best) { b.reload = 0.7; continue; }
      b.reload = KAISER.battery.reload * (0.9 + Math.random() * 0.2);
      h.naval.fireBattery(_from.set(b.x, 21, b.z), best, KAISER.battery.dmg);
    }
  }

  /**
   * Gesunkene oder eroberte Wachschiffe einmal zählen. Verschwindet ein Wachschiff, das zuletzt noch heil war, aus der Liste (Seegefecht abgeräumt,
   * eigenes Schiff gesunken, Teleport), zählt es nicht als gefallen: es kreuzt beim nächsten Aufziehen der Seesperre wieder vor der Bucht.
   */
  private trackGuards(a: ActiveKaiser, st: KaiserBattleState) {
    if (!a.guardIds.length) return;
    const list = this.host.naval.enemies;
    let n = 0;
    for (const gid of a.guardIds) {
      let found = false, down = false;
      for (const e of list) if (e.guardId === gid) { found = true; down = !e.ship.alive || !!e.captured || e.ship.sinking > 0; break; }
      // verschwunden: schon gezählt oder heil abgeräumt – in beiden Fällen nicht mehr verfolgen
      if (!found) continue;
      a.guardIds[n++] = gid;
      if (!down || a.counted.has(gid)) continue;
      a.counted.add(gid);
      guardDown(st);
      this.host.message(`Ein Wachschiff des Kaisers ist gefallen (${st.guardsDown}/${KAISER.guards}).`);
    }
    a.guardIds.length = n;
  }

  // ---------- An Land: Festungsringe und Kaiser ----------

  /** Landgang auf einer Kaiser-Insel (nach dem Fall der Hafenkette) */
  onAshore(isl: WalkIsland, def: IslandDef) {
    const id = def.id as KaiserId, spec = KAISER_SPEC_BY_ID[id];
    if (!spec) return;
    const st = this.state(id), h = this.host;
    h.combat.beginEvent(isl);
    if (st.phase === 'besiegt') {
      h.message(`${spec.name}: Die Garde ist geschlagen, der Thronsaal leer. In etwa ${Math.ceil(kaiserCooldownLeft(st, h.clock()) / 60)} Minuten kehrt der Kaiser zurück.`);
      return;
    }
    if (!this.land || this.land.id !== id) {
      this.leaveIsland();
      const horde = new Horde(h.scene, hordePalette(spec.power), {
        ground: h.ground,
        nav: () => h.combat.nav,
        targets: () => this.targets(),
        hit: (t, dmg, dx, dz, heavy) => this.hordeHit(t, dmg, dx, dz, heavy),
        shot: (x, y, z, tx, tz) => {
          const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz) || 1;
          h.sparks.emit(7, x + (dx / d) * 0.9, y, z + (dz / d) * 0.9, { speed: 3, up: 0.6, life: 0.35, color: _shotColor.set(1.0, 0.82, 0.5).multiplyScalar(3), gravity: -0.5, spread: 0.5 });
          audio.play('swing', 0.3, { x, y, z });
        },
        text: () => {},
      }, KAISER_LEVEL, `kaiser-${id}`);
      this.land = { id, isl, horde, posts: [kaiserRingPosts(spec, 0), kaiserRingPosts(spec, 1)], ringMembers: [[], []], boss: null, sealedMsgT: 0, time: 0, group: 1 };
    }
    h.combat.mass = this.land.horde.squads;
    h.combat.onBossPhase = (e, phase) => this.onBossPhase(e, phase);
    h.combat.onSummon = (e, mech) => this.summon(e, mech);
    h.banner(spec.name, st.phase === 'thron' ? 'Phase 3: Der Kaiser erwartet dich im Thronsaal' : 'Phase 2: Doppelter Festungsring');
    h.message(`${spec.name}: Hinter dem Hafen liegt das erste Kaiser-Tor. Breite Brücken führen über die Gräben – dahinter warten die Wachverbände der Kaisergarde.`);
  }

  /** Zurück an Bord oder Insel verlassen: Verbände abziehen, nicht geräumte Ringe stehen beim nächsten Landgang wieder */
  leaveIsland() {
    const l = this.land;
    if (!l) return;
    const st = this.states.get(l.id);
    if (st) retreatRings(st);
    const c = this.host.combat;
    if (c.mass === l.horde.squads) c.mass = [];
    c.onBossPhase = null;
    c.onSummon = null;
    l.horde.dispose();
    this.land = null;
  }

  private targets(): readonly TroopFoe[] {
    const b = this.foes;
    b.length = 0;
    if (this.playerFoe.alive) b.push(this.playerFoe);
    for (const a of this.host.combat.allies) if (a.alive) b.push(a);
    return b;
  }

  private hordeHit(t: TroopFoe, dmg: number, dx: number, dz: number, heavy: boolean) {
    if (t === this.playerFoe) this.host.combat.strikePlayer(dmg * HORDE_DMG.player, dx, dz, heavy);
    else (t as unknown as { receive(d: number, x: number, z: number): void }).receive(dmg * HORDE_DMG.crew, dx, dz);
  }

  private updateLand(dt: number) {
    const l = this.land;
    if (!l) return;
    const h = this.host, fp = h.footOnIsland();
    l.time += dt;
    const spec = KAISER_SPEC_BY_ID[l.id], st = this.state(l.id);
    const def = h.defs().find((d) => d.id === l.id);
    if (!def) return;
    const sp = h.playerShip;
    l.horde.update(dt, l.time, { x: fp?.x ?? sp.x, z: fp?.z ?? sp.z, yaw: 0 }, fp?.x ?? sp.x, fp?.z ?? sp.z);
    l.horde.collectCredit();
    if (!fp) return;
    const ox = def.x, oz = def.z;
    const align = h.align();
    // 1. Festungsringe: betritt man die Weckzone eines Tors, ziehen die Verbände des Rings auf (dazu zwei Elite-Offiziere)
    for (let r = 0 as 0 | 1; r < 2; r = (r + 1) as 0 | 1) {
      if (st.rings[r] !== 'ruhig') continue;
      const P = l.posts[r];
      let near = false;
      for (const w of P.wake) if (Math.hypot(fp.x - (ox + w.x), fp.z - (oz + w.z)) < w.r) { near = true; break; }
      if (!near || !enterRing(st, r)) continue;
      const origin = r === 0 ? 'ring1' as const : 'ring2' as const;
      l.ringMembers[r].length = 0;
      P.squads.forEach((q, i) => l.ringMembers[r].push(l.horde.spawn({ squadId: `${l.id}-r${r}-${i}`, typ: q.typ, heads: q.heads, x: 0, z: 0, yaw: q.yaw }, ox + q.x, oz + q.z, origin, 1, 26)));
      const lv = KAISER_LEVEL + KAISER.lvl.officer + r;
      // 4.8B: in der Gruppe sind die Offiziere zäher, ab drei Kapitänen kommen weitere Elite-Offiziere dazu
      const grp = h.groupSize?.() ?? 1, gk = groupScale(grp);
      const officers = P.officers.length ? [...P.officers, ...Array.from({ length: groupElites(grp) }, (_, i) => P.officers[i % P.officers.length])] : [];
      officers.forEach((o, i) => {
        const d = scaleDef(kaiserOfficerDef(l.id, (r * 2 + i) % 4), gk);
        const off = i >= P.officers.length ? 5 : 0;
        h.combat.spawnWave(['hauptmann'], lv, align, `kaiser:${l.id}:ring${r}`, { x: ox + o.x + off, z: oz + o.z + off }, 0, { power: spec.power, name: d.label, def: d });
      });
      const heads = P.squads.reduce((n, q) => n + q.heads, 0);
      h.banner(r === 0 ? 'Äußerer Festungsring' : 'Innerer Festungsring', `${heads} Gardisten und ${P.officers.length} Elite-Offiziere halten die Tore (Stufe ${KAISER_LEVEL + (r === 0 ? KAISER.lvl.ring1 : KAISER.lvl.ring2)})`);
      audio.play('horn', 0.9);
    }
    // 2. Geräumte Ringe: alle Verbände und Offiziere gefallen
    for (let r = 0 as 0 | 1; r < 2; r = (r + 1) as 0 | 1) {
      if (st.rings[r] !== 'aktiv') continue;
      let left = h.combat.tagLeft(`kaiser:${l.id}:ring${r}`);
      for (const m of l.ringMembers[r]) if (m.q.alive) left++;
      if (left > 0) continue;
      clearRing(st, r);
      if (st.phase === 'thron') { h.banner('Der Thronsaal ist offen!', `Phase 3: ${spec.boss.name} erwartet dich im Hof der Thron-Zitadelle`); audio.play('fanfareEpic'); }
      else h.banner(`${r === 0 ? 'Äußerer' : 'Innerer'} Festungsring geräumt`, st.rings[1 - r] === 'geraeumt' ? '' : `Noch hält der ${r === 0 ? 'innere' : 'äußere'} Ring`);
    }
    // 3. Thron-Zitadelle: der Kaiser erscheint erst nach beiden Ringen
    const T = kaiserThrone(spec);
    const inThrone = Math.hypot(fp.x - ox, fp.z - oz) < T.wake;
    l.sealedMsgT -= dt;
    if (inThrone && st.phase === 'festungsringe' && l.sealedMsgT <= 0) { l.sealedMsgT = 12; h.message('Der Thronsaal ist versiegelt: Erst wenn beide Festungsringe gefallen sind, stellt sich der Kaiser.'); }
    if (inThrone && bossShouldAppear(st)) {
      // 4.8B: Leben und Haltungsleiste wachsen mit der Gruppe (1,0× solo bis 3,6× bei fünf Kapitänen)
      const grp = h.groupSize?.() ?? 1;
      const d = scaleDef(kaiserBossDef(l.id), groupScale(grp));
      l.group = grp;
      if (grp > 1) h.message(`Gruppen-Stärke: ${spec.boss.name} stellt sich ${grp} Kapitänen (×${groupScale(grp).toFixed(2).replace('.', ',')} Leben und Haltung)`);
      const list = h.combat.spawnWave(['legende'], KAISER_LEVEL + KAISER.lvl.boss, align, `kaiser:${l.id}:thron`, { x: ox + T.x, z: oz + T.z }, 0, { power: spec.power, name: d.label, def: d });
      l.boss = list[0] ?? null;
      bossAppeared(st);
      h.cutin(spec.boss.name);
      h.banner(spec.boss.name, `${spec.boss.title} – ${spec.boss.intro}`);
      audio.play('roar', 1);
    }
    // 4. Sieg über den Kaiser
    const b = l.boss;
    if (b && !b.alive && st.boss.state === 'kampf') {
      l.boss = null;
      const first = bossDefeated(st, h.clock());
      h.victory(l.id, first);
    }
  }

  /** Phasenwechsel des Kaisers (bei 50 %): Verstärkungswelle und zwei weitere Offiziere mit Aura */
  private onBossPhase(e: Enemy, phase: number) {
    const l = this.land;
    if (!l || e !== l.boss) return;
    const st = this.state(l.id), h = this.host, spec = KAISER_SPEC_BY_ID[l.id];
    if (!bossPhase(st, phase)) return;
    h.banner(spec.boss.name, spec.boss.phase2);
    const toT = Math.atan2((h.combat.player?.x ?? e.x) - e.x, (h.combat.player?.z ?? e.z + 1) - e.z);
    const lx = Math.cos(toT), lz = -Math.sin(toT);
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
      const g = h.ground.constrain(e.x + lx * side * (9 + row * 6), e.z + lz * side * (9 + row * 6), 1.4);
      const m = l.horde.spawn({ squadId: `${l.id}-ruf-${i}`, typ: i < 2 ? 'schwert' : 'musketier', heads: 10, x: 0, z: 0, yaw: toT }, g.x, g.z, 'thron', 1, 45);
      m.q.alertT = 10;
    }
    // 4.8B: die Garde der zweiten Phase wächst mit der Gruppe wie die Ringe
    const grp = l.group, gk = groupScale(grp), guards = 2 + groupElites(grp);
    for (let i = 0; i < guards; i++) {
      const d = scaleDef(kaiserOfficerDef(l.id, 2 + (i % 2)), gk);
      const side = i % 2 ? 6 : -6, row = Math.floor(i / 2) * 4;
      h.combat.spawnWave(['hauptmann'], KAISER_LEVEL + KAISER.lvl.officer + 1, h.align(), `kaiser:${l.id}:garde`, { x: e.x + side, z: e.z + row }, 0, { power: spec.power, name: d.label, def: d });
    }
    h.message(`Verstärkungswelle: Die Kaisergarde stürmt in den Hof!`);
  }

  /** Verstärkung, die der Kaiser mit einem Angriff ruft (Boss-Mechanik `summon`): Verbände neben ihm, höchstens 70 zusätzliche Köpfe */
  private summon(boss: Enemy, mech: Extract<BossMech, { kind: 'summon' }>) {
    const l = this.land;
    if (!l || boss !== l.boss || l.horde.addHeads > 70) return;
    const n = Math.max(1, mech.n ?? 2), typ = mech.typ ?? 'schwert', heads = mech.heads ?? 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const g = this.host.ground.constrain(boss.x + Math.cos(a) * 10, boss.z + Math.sin(a) * 10, 1.4);
      const m = l.horde.spawn({ squadId: `${l.id}-add-${Math.round(l.time * 10)}-${i}`, typ, heads, x: 0, z: 0, yaw: a }, g.x, g.z, 'add', 1, 45);
      m.q.alertT = 10;
    }
    this.host.message(`${mech.label ?? 'Verstärkung'}: ${boss.name ?? 'Der Kaiser'} ruft ${n} Verbände herbei!`);
  }

  dispose() {
    this.leaveIsland();
    this.deactivate();
  }
}
